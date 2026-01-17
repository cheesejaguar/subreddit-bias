import { describe, test, expect, beforeEach } from 'bun:test';
import {
  DEFAULT_BATCH_CONFIG,
  InMemoryCache,
  estimateTokens,
  createBatches,
  processSentimentBatches,
  processTargetGroupBatches,
  estimateBatchCost,
  type BatchConfig,
} from './batching';
import { MockOpenRouterClient } from './client';
import type { RedditComment } from '@subreddit-bias/core';

describe('DEFAULT_BATCH_CONFIG', () => {
  test('has correct default values', () => {
    expect(DEFAULT_BATCH_CONFIG.batchSize).toBe(10);
    expect(DEFAULT_BATCH_CONFIG.maxTokensPerBatch).toBe(4000);
    expect(DEFAULT_BATCH_CONFIG.model).toBe('openai/gpt-4o-mini');
    expect(DEFAULT_BATCH_CONFIG.promptVersion).toBeDefined();
  });
});

describe('InMemoryCache', () => {
  let cache: InMemoryCache;

  beforeEach(() => {
    cache = new InMemoryCache();
  });

  test('returns null for non-existent entry', async () => {
    const result = await cache.get('c1', null, 'sentiment', null, 'model', '1.0.0');
    expect(result).toBeNull();
  });

  test('stores and retrieves cache entry', async () => {
    await cache.set({
      commentId: 'c1',
      editedUtc: null,
      taskType: 'sentiment',
      framework: null,
      model: 'test-model',
      promptVersion: '1.0.0',
      response: { sentiment: 'positive' },
      tokensUsed: 100,
      expiresAt: null,
    });

    const result = await cache.get('c1', null, 'sentiment', null, 'test-model', '1.0.0');
    expect(result).not.toBeNull();
    expect(result?.response).toEqual({ sentiment: 'positive' });
  });

  test('returns null for different model', async () => {
    await cache.set({
      commentId: 'c1',
      editedUtc: null,
      taskType: 'sentiment',
      framework: null,
      model: 'model-a',
      promptVersion: '1.0.0',
      response: { sentiment: 'positive' },
      tokensUsed: 100,
      expiresAt: null,
    });

    const result = await cache.get('c1', null, 'sentiment', null, 'model-b', '1.0.0');
    expect(result).toBeNull();
  });

  test('returns null for expired entry', async () => {
    await cache.set({
      commentId: 'c1',
      editedUtc: null,
      taskType: 'sentiment',
      framework: null,
      model: 'test-model',
      promptVersion: '1.0.0',
      response: { sentiment: 'positive' },
      tokensUsed: 100,
      expiresAt: new Date(Date.now() - 1000), // Expired
    });

    const result = await cache.get('c1', null, 'sentiment', null, 'test-model', '1.0.0');
    expect(result).toBeNull();
  });

  test('clears all entries', async () => {
    await cache.set({
      commentId: 'c1',
      editedUtc: null,
      taskType: 'sentiment',
      framework: null,
      model: 'test',
      promptVersion: '1.0.0',
      response: {},
      tokensUsed: 0,
      expiresAt: null,
    });

    expect(cache.size()).toBe(1);
    cache.clear();
    expect(cache.size()).toBe(0);
  });

  test('handles target group cache entries', async () => {
    await cache.set({
      commentId: 'c1',
      editedUtc: null,
      taskType: 'target_group',
      framework: 'nexus',
      model: 'test',
      promptVersion: '1.0.0',
      response: { hostility_level: 'none' },
      tokensUsed: 50,
      expiresAt: null,
    });

    const result = await cache.get('c1', null, 'target_group', 'nexus', 'test', '1.0.0');
    expect(result).not.toBeNull();
    expect(result?.response).toEqual({ hostility_level: 'none' });

    // Different framework should not match
    const otherFramework = await cache.get('c1', null, 'target_group', 'jda', 'test', '1.0.0');
    expect(otherFramework).toBeNull();
  });
});

describe('estimateTokens', () => {
  test('estimates tokens based on character count', () => {
    // ~4 characters per token
    expect(estimateTokens('test')).toBe(1);
    expect(estimateTokens('hello world')).toBe(3);
    expect(estimateTokens('a'.repeat(100))).toBe(25);
  });

  test('handles empty string', () => {
    expect(estimateTokens('')).toBe(0);
  });
});

describe('createBatches', () => {
  test('creates batches respecting size limit', () => {
    const comments = Array.from({ length: 25 }, (_, i) => ({
      id: `c${i}`,
      body: 'Short comment',
    }));

    const config: BatchConfig = {
      batchSize: 10,
      maxTokensPerBatch: 10000,
      model: 'test',
      promptVersion: '1.0.0',
    };

    const batches = createBatches(comments, config);

    expect(batches).toHaveLength(3);
    expect(batches[0]).toHaveLength(10);
    expect(batches[1]).toHaveLength(10);
    expect(batches[2]).toHaveLength(5);
  });

  test('creates batches respecting token limit', () => {
    const comments = Array.from({ length: 5 }, (_, i) => ({
      id: `c${i}`,
      body: 'a'.repeat(1000), // ~250 tokens each
    }));

    const config: BatchConfig = {
      batchSize: 100, // High batch size
      maxTokensPerBatch: 500, // Low token limit
      model: 'test',
      promptVersion: '1.0.0',
    };

    const batches = createBatches(comments, config);

    // Each comment is ~250 tokens, so max 2 per batch with 500 token limit
    expect(batches.length).toBeGreaterThan(1);
  });

  test('handles empty array', () => {
    const batches = createBatches([], DEFAULT_BATCH_CONFIG);
    expect(batches).toHaveLength(0);
  });

  test('handles single comment', () => {
    const comments = [{ id: 'c1', body: 'Test' }];
    const batches = createBatches(comments, DEFAULT_BATCH_CONFIG);

    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(1);
  });
});

describe('processSentimentBatches', () => {
  const createTestComment = (id: string): RedditComment => ({
    id,
    postId: 'p1',
    parentId: null,
    subreddit: 'test',
    permalink: `/r/test/${id}`,
    authorId: 'u1',
    body: `Comment ${id}`,
    createdUtc: Date.now() / 1000,
    editedUtc: null,
    score: 1,
    depth: 1,
    isRemoved: false,
    isDeleted: false,
    isModerator: false,
  });

  test('processes comments and returns results', async () => {
    const client = new MockOpenRouterClient();
    const cache = new InMemoryCache();
    const comments = [createTestComment('c1'), createTestComment('c2')];

    // Set up mock response
    const mockResponse = {
      id: 'resp-1',
      choices: [
        {
          message: {
            role: 'assistant' as const,
            content: JSON.stringify([
              { id: 'c1', sentiment: 'positive', subjectivity: 0.5, confidence: 0.8 },
              { id: 'c2', sentiment: 'neutral', subjectivity: 0.3, confidence: 0.9 },
            ]),
          },
          finish_reason: 'stop',
        },
      ],
      usage: { prompt_tokens: 50, completion_tokens: 50, total_tokens: 100 },
      model: 'test',
    };

    // Mock the response for any prompt
    client.setMockResponse(comments.map(c => c.body).join(''), mockResponse);

    const result = await processSentimentBatches(comments, client, cache);

    expect(result.fromLLM).toBeGreaterThanOrEqual(0);
    expect(result.errors).toHaveLength(0);
  });

  test('uses cache when available', async () => {
    const client = new MockOpenRouterClient();
    const cache = new InMemoryCache();
    const comment = createTestComment('c1');

    // Pre-populate cache
    await cache.set({
      commentId: 'c1',
      editedUtc: null,
      taskType: 'sentiment',
      framework: null,
      model: DEFAULT_BATCH_CONFIG.model,
      promptVersion: DEFAULT_BATCH_CONFIG.promptVersion,
      response: { id: 'c1', sentiment: 'positive', subjectivity: 0.5, confidence: 0.8 },
      tokensUsed: 50,
      expiresAt: null,
    });

    const result = await processSentimentBatches([comment], client, cache);

    expect(result.fromCache).toBe(1);
    expect(result.fromLLM).toBe(0);
  });
});

describe('processTargetGroupBatches', () => {
  const createTestComment = (id: string): RedditComment => ({
    id,
    postId: 'p1',
    parentId: null,
    subreddit: 'test',
    permalink: `/r/test/${id}`,
    authorId: 'u1',
    body: `Comment ${id}`,
    createdUtc: Date.now() / 1000,
    editedUtc: null,
    score: 1,
    depth: 1,
    isRemoved: false,
    isDeleted: false,
    isModerator: false,
  });

  test('processes comments with target group analysis', async () => {
    const client = new MockOpenRouterClient();
    const cache = new InMemoryCache();
    const comments = [createTestComment('c1')];

    const result = await processTargetGroupBatches(
      comments,
      'jewish',
      'nexus',
      client,
      cache
    );

    expect(result).toHaveProperty('results');
    expect(result).toHaveProperty('tokensUsed');
    expect(result).toHaveProperty('fromCache');
    expect(result).toHaveProperty('fromLLM');
  });

  test('uses cache for target group analysis', async () => {
    const client = new MockOpenRouterClient();
    const cache = new InMemoryCache();
    const comment = createTestComment('c1');

    await cache.set({
      commentId: 'c1',
      editedUtc: null,
      taskType: 'target_group',
      framework: 'nexus',
      model: DEFAULT_BATCH_CONFIG.model,
      promptVersion: DEFAULT_BATCH_CONFIG.promptVersion,
      response: {
        id: 'c1',
        mentions_group: false,
        hostility_level: 'none',
        labels: [],
        confidence: 0.9,
        rationale: 'No mention',
      },
      tokensUsed: 50,
      expiresAt: null,
    });

    const result = await processTargetGroupBatches(
      [comment],
      'jewish',
      'nexus',
      client,
      cache
    );

    expect(result.fromCache).toBe(1);
    expect(result.fromLLM).toBe(0);
  });
});

describe('estimateBatchCost', () => {
  test('estimates cost for sentiment only', () => {
    const cost = estimateBatchCost(100, DEFAULT_BATCH_CONFIG, false);

    // 100 comments * 100 input tokens * 0.15/1M + 100 * 50 output * 0.6/1M
    // = 0.0015 + 0.003 = 0.0045
    expect(cost).toBeGreaterThan(0);
    expect(cost).toBeLessThan(1);
  });

  test('estimates higher cost with target group', () => {
    const sentimentOnly = estimateBatchCost(100, DEFAULT_BATCH_CONFIG, false);
    const withTargetGroup = estimateBatchCost(100, DEFAULT_BATCH_CONFIG, true);

    expect(withTargetGroup).toBeGreaterThan(sentimentOnly);
  });

  test('scales with comment count', () => {
    const cost50 = estimateBatchCost(50, DEFAULT_BATCH_CONFIG, false);
    const cost100 = estimateBatchCost(100, DEFAULT_BATCH_CONFIG, false);

    expect(cost100).toBeCloseTo(cost50 * 2, 5);
  });
});
