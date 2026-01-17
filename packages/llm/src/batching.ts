/**
 * Batching module for efficient LLM API usage
 * Handles comment batching, caching, and cost optimization
 */

import type { FrameworkType, TaskType, CacheEntry, CreateCacheEntry } from '@subreddit-bias/db';
import type { RedditComment } from '@subreddit-bias/core';
import type { OpenRouterClient, RequestResult, OpenRouterResponse } from './client.js';
import {
  buildSentimentPrompt,
  buildTargetGroupPrompt,
  PROMPT_VERSION,
  type CommentInput,
} from './prompts.js';
import {
  parseSentimentBatchResponse,
  parseTargetGroupBatchResponse,
  type LLMSentimentResponse,
  type LLMTargetGroupResponse,
} from '@subreddit-bias/core';

// Batch configuration
export interface BatchConfig {
  batchSize: number;
  maxTokensPerBatch: number;
  model: string;
  promptVersion: string;
}

// Default batch config
export const DEFAULT_BATCH_CONFIG: BatchConfig = {
  batchSize: 10,
  maxTokensPerBatch: 4000,
  model: 'openai/gpt-4o-mini',
  promptVersion: PROMPT_VERSION,
};

// Batch result
export interface BatchResult<T> {
  results: T[];
  tokensUsed: number;
  fromCache: number;
  fromLLM: number;
  errors: string[];
}

// Cache interface for dependency injection
export interface CacheProvider {
  get(
    commentId: string,
    editedUtc: number | null,
    taskType: TaskType,
    framework: FrameworkType | null,
    model: string,
    promptVersion: string
  ): Promise<CacheEntry | null>;

  set(entry: CreateCacheEntry): Promise<void>;
}

// In-memory cache implementation
export class InMemoryCache implements CacheProvider {
  private cache = new Map<string, CacheEntry>();

  private makeKey(
    commentId: string,
    editedUtc: number | null,
    taskType: TaskType,
    framework: FrameworkType | null,
    model: string,
    promptVersion: string
  ): string {
    return `${commentId}:${editedUtc}:${taskType}:${framework}:${model}:${promptVersion}`;
  }

  async get(
    commentId: string,
    editedUtc: number | null,
    taskType: TaskType,
    framework: FrameworkType | null,
    model: string,
    promptVersion: string
  ): Promise<CacheEntry | null> {
    const key = this.makeKey(commentId, editedUtc, taskType, framework, model, promptVersion);
    const entry = this.cache.get(key);

    if (entry && entry.expiresAt && entry.expiresAt < new Date()) {
      this.cache.delete(key);
      return null;
    }

    return entry ?? null;
  }

  async set(entry: CreateCacheEntry): Promise<void> {
    const key = this.makeKey(
      entry.commentId,
      entry.editedUtc,
      entry.taskType,
      entry.framework,
      entry.model,
      entry.promptVersion
    );

    this.cache.set(key, {
      id: crypto.randomUUID(),
      ...entry,
      createdAt: new Date(),
    });
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }
}

/**
 * Estimate token count for text (rough approximation)
 */
export function estimateTokens(text: string): number {
  // Rough estimate: ~4 characters per token
  return Math.ceil(text.length / 4);
}

/**
 * Split comments into batches based on token limits
 */
export function createBatches(
  comments: CommentInput[],
  config: BatchConfig
): CommentInput[][] {
  const batches: CommentInput[][] = [];
  let currentBatch: CommentInput[] = [];
  let currentTokens = 0;

  for (const comment of comments) {
    const commentTokens = estimateTokens(comment.body);

    // If adding this comment would exceed limits, start new batch
    if (
      (currentBatch.length >= config.batchSize ||
        currentTokens + commentTokens > config.maxTokensPerBatch) &&
      currentBatch.length > 0
    ) {
      batches.push(currentBatch);
      currentBatch = [];
      currentTokens = 0;
    }

    currentBatch.push(comment);
    currentTokens += commentTokens;
  }

  // Don't forget the last batch
  if (currentBatch.length > 0) {
    batches.push(currentBatch);
  }

  return batches;
}

/**
 * Process sentiment analysis in batches
 */
export async function processSentimentBatches(
  comments: RedditComment[],
  client: OpenRouterClient,
  cache: CacheProvider,
  config: BatchConfig = DEFAULT_BATCH_CONFIG
): Promise<BatchResult<LLMSentimentResponse>> {
  const results: LLMSentimentResponse[] = [];
  const errors: string[] = [];
  let tokensUsed = 0;
  let fromCache = 0;
  let fromLLM = 0;

  // Check cache first
  const uncachedComments: RedditComment[] = [];

  for (const comment of comments) {
    const cached = await cache.get(
      comment.id,
      comment.editedUtc,
      'sentiment',
      null,
      config.model,
      config.promptVersion
    );

    if (cached) {
      results.push(cached.response as LLMSentimentResponse);
      fromCache++;
    } else {
      uncachedComments.push(comment);
    }
  }

  // Process uncached comments in batches
  const commentInputs: CommentInput[] = uncachedComments.map(c => ({
    id: c.id,
    body: c.body,
  }));

  const batches = createBatches(commentInputs, config);

  for (const batch of batches) {
    const prompt = buildSentimentPrompt(batch);

    const response = await client.chatCompletion(
      [
        { role: 'system', content: prompt.system },
        { role: 'user', content: prompt.user },
      ],
      {
        model: config.model,
        jsonMode: true,
      }
    );

    tokensUsed += response.tokensUsed;

    if (response.success && response.data) {
      try {
        const content = response.data.choices[0]?.message?.content ?? '[]';
        const parsed = JSON.parse(content);
        const { valid, invalid } = parseSentimentBatchResponse(parsed);

        results.push(...valid);
        fromLLM += valid.length;

        if (invalid > 0) {
          errors.push(`${invalid} invalid responses in batch`);
        }

        // Cache valid results
        for (const result of valid) {
          const originalComment = uncachedComments.find(c => c.id === result.id);
          if (originalComment) {
            await cache.set({
              commentId: result.id,
              editedUtc: originalComment.editedUtc,
              taskType: 'sentiment',
              framework: null,
              model: config.model,
              promptVersion: config.promptVersion,
              response: result,
              tokensUsed: Math.ceil(tokensUsed / batches.length / batch.length),
              expiresAt: null,
            });
          }
        }
      } catch (e) {
        errors.push(`Failed to parse batch response: ${e instanceof Error ? e.message : 'Unknown error'}`);
      }
    } else {
      errors.push(response.error ?? 'Unknown error');
    }
  }

  return { results, tokensUsed, fromCache, fromLLM, errors };
}

/**
 * Process target group analysis in batches
 */
export async function processTargetGroupBatches(
  comments: RedditComment[],
  targetGroup: string,
  framework: FrameworkType,
  client: OpenRouterClient,
  cache: CacheProvider,
  config: BatchConfig = DEFAULT_BATCH_CONFIG
): Promise<BatchResult<LLMTargetGroupResponse>> {
  const results: LLMTargetGroupResponse[] = [];
  const errors: string[] = [];
  let tokensUsed = 0;
  let fromCache = 0;
  let fromLLM = 0;

  // Check cache first
  const uncachedComments: RedditComment[] = [];

  for (const comment of comments) {
    const cached = await cache.get(
      comment.id,
      comment.editedUtc,
      'target_group',
      framework,
      config.model,
      config.promptVersion
    );

    if (cached) {
      results.push(cached.response as LLMTargetGroupResponse);
      fromCache++;
    } else {
      uncachedComments.push(comment);
    }
  }

  // Process uncached comments in batches
  const commentInputs: CommentInput[] = uncachedComments.map(c => ({
    id: c.id,
    body: c.body,
  }));

  const batches = createBatches(commentInputs, config);

  for (const batch of batches) {
    const prompt = buildTargetGroupPrompt(batch, targetGroup, framework);

    const response = await client.chatCompletion(
      [
        { role: 'system', content: prompt.system },
        { role: 'user', content: prompt.user },
      ],
      {
        model: config.model,
        jsonMode: true,
      }
    );

    tokensUsed += response.tokensUsed;

    if (response.success && response.data) {
      try {
        const content = response.data.choices[0]?.message?.content ?? '[]';
        const parsed = JSON.parse(content);
        const { valid, invalid } = parseTargetGroupBatchResponse(parsed);

        results.push(...valid);
        fromLLM += valid.length;

        if (invalid > 0) {
          errors.push(`${invalid} invalid responses in batch`);
        }

        // Cache valid results
        for (const result of valid) {
          const originalComment = uncachedComments.find(c => c.id === result.id);
          if (originalComment) {
            await cache.set({
              commentId: result.id,
              editedUtc: originalComment.editedUtc,
              taskType: 'target_group',
              framework,
              model: config.model,
              promptVersion: config.promptVersion,
              response: result,
              tokensUsed: Math.ceil(tokensUsed / batches.length / batch.length),
              expiresAt: null,
            });
          }
        }
      } catch (e) {
        errors.push(`Failed to parse batch response: ${e instanceof Error ? e.message : 'Unknown error'}`);
      }
    } else {
      errors.push(response.error ?? 'Unknown error');
    }
  }

  return { results, tokensUsed, fromCache, fromLLM, errors };
}

/**
 * Calculate estimated cost for batch processing
 */
export function estimateBatchCost(
  commentCount: number,
  config: BatchConfig,
  includeTargetGroup: boolean = false
): number {
  // Rough estimates based on typical prompt/response sizes
  const avgInputTokensPerComment = 100;
  const avgOutputTokensPerComment = 50;

  const sentimentCost = calculateCost(
    commentCount * avgInputTokensPerComment,
    commentCount * avgOutputTokensPerComment,
    config.model
  );

  if (!includeTargetGroup) {
    return sentimentCost;
  }

  // Target group analysis uses longer prompts
  const targetGroupCost = calculateCost(
    commentCount * avgInputTokensPerComment * 1.5,
    commentCount * avgOutputTokensPerComment * 1.5,
    config.model
  );

  return sentimentCost + targetGroupCost;
}

/**
 * Calculate cost based on model pricing
 */
function calculateCost(inputTokens: number, outputTokens: number, model: string): number {
  // Pricing per 1M tokens
  const pricing: Record<string, { input: number; output: number }> = {
    'openai/gpt-4o-mini': { input: 0.15, output: 0.6 },
    'openai/gpt-4o': { input: 2.5, output: 10 },
    'openai/gpt-3.5-turbo': { input: 0.5, output: 1.5 },
  };

  const modelPricing = pricing[model] ?? pricing['openai/gpt-4o-mini'];
  return (inputTokens * modelPricing.input + outputTokens * modelPricing.output) / 1_000_000;
}
