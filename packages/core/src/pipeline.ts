/**
 * Job Execution Pipeline
 * Orchestrates the complete report generation workflow
 */

import type {
  Report,
  Job,
  ReportConfig,
  SentimentClassification,
  TargetGroupClassification,
  SentimentStats,
  TargetGroupStats,
  FrameworkType,
  CreateSampledComment,
} from '@subreddit-bias/db';

import {
  type RedditPost,
  type RedditComment,
  type SamplingConfig,
  createSampler,
  samplePosts,
  sampleComments,
  toSampledComments,
} from './sampling';

import {
  runSentimentHeuristics,
  runTargetGroupHeuristics,
  needsLLMAnalysis,
} from './heuristics';

import {
  createHeuristicSentimentClassification,
  createHeuristicTargetGroupClassification,
} from './scoring';

import {
  calculateSentimentStats,
  aggregateTargetGroupStats,
} from './aggregation';

import {
  RedditClient,
  createRedditClient,
  RedditApiError,
} from './reddit';

// Pipeline configuration
export interface PipelineConfig {
  // Budget limits
  maxCommentsTotal: number;
  maxLLMCallsPerPhase: number;
  maxCostUsd: number;

  // Timeouts
  redditTimeoutMs: number;
  llmTimeoutMs: number;

  // Callbacks for progress updates
  onProgress?: (progress: PipelineProgress) => void | Promise<void>;
  onPhaseChange?: (phase: string) => void | Promise<void>;

  // External clients (for dependency injection)
  redditClient?: RedditClient;
}

// Pipeline progress state
export interface PipelineProgress {
  phase: string;
  progress: number; // 0-100
  commentsProcessed: number;
  commentsTotal: number;
  tokensUsed: number;
  estimatedCost: number;
  rateLimitEvents: number;
}

// Pipeline result
export interface PipelineResult {
  success: boolean;
  communitySentiment: SentimentStats | null;
  moderatorSentiment: SentimentStats | null;
  targetGroupStats: TargetGroupStats[];
  sampledComments: CreateSampledComment[];
  sentimentClassifications: SentimentClassification[];
  targetGroupClassifications: TargetGroupClassification[];
  totalTokensUsed: number;
  estimatedCost: number;
  error?: string;
}

// Default pipeline configuration
export const DEFAULT_PIPELINE_CONFIG: PipelineConfig = {
  maxCommentsTotal: 5000,
  maxLLMCallsPerPhase: 500,
  maxCostUsd: 5.0,
  redditTimeoutMs: 30000,
  llmTimeoutMs: 60000,
};

/**
 * Execute the complete analysis pipeline for a report
 */
export async function executePipeline(
  reportConfig: ReportConfig,
  pipelineConfig: Partial<PipelineConfig> = {}
): Promise<PipelineResult> {
  const config = { ...DEFAULT_PIPELINE_CONFIG, ...pipelineConfig };
  const redditClient = config.redditClient ?? createRedditClient();

  const progress: PipelineProgress = {
    phase: 'initializing',
    progress: 0,
    commentsProcessed: 0,
    commentsTotal: 0,
    tokensUsed: 0,
    estimatedCost: 0,
    rateLimitEvents: 0,
  };

  const emitProgress = async (updates: Partial<PipelineProgress>) => {
    Object.assign(progress, updates);
    if (config.onProgress) {
      await config.onProgress(progress);
    }
  };

  const setPhase = async (phase: string) => {
    progress.phase = phase;
    if (config.onPhaseChange) {
      await config.onPhaseChange(phase);
    }
  };

  try {
    // Phase 1: Fetch posts from Reddit
    await setPhase('fetching_posts');
    await emitProgress({ progress: 5 });

    const postsByStrategy = await fetchPosts(
      redditClient,
      reportConfig.subreddit,
      reportConfig.sampling,
      reportConfig.timeframeStart,
      reportConfig.timeframeEnd
    );

    // Phase 2: Sample posts
    await setPhase('sampling_posts');
    await emitProgress({ progress: 15 });

    const rng = createSampler(reportConfig.sampling.seed);
    const sampledPosts = samplePosts(postsByStrategy, reportConfig.sampling, rng);

    // Phase 3: Fetch comments for sampled posts
    await setPhase('fetching_comments');
    await emitProgress({ progress: 25 });

    const allComments: RedditComment[] = [];
    const totalPosts = Array.from(sampledPosts.values()).flat().length;
    let processedPosts = 0;

    for (const [strategy, posts] of sampledPosts) {
      for (const post of posts) {
        try {
          const comments = await redditClient.getPostComments(
            reportConfig.subreddit,
            post.id,
            { limit: reportConfig.sampling.commentsPerPost, depth: reportConfig.sampling.maxDepth }
          );

          // Tag comments with their strategy
          allComments.push(...comments);

        } catch (error) {
          if (error instanceof RedditApiError) {
            progress.rateLimitEvents++;
          }
          // Continue with other posts on error
        }

        processedPosts++;
        await emitProgress({
          progress: 25 + Math.floor((processedPosts / totalPosts) * 20),
        });
      }
    }

    // Phase 4: Sample comments
    await setPhase('sampling_comments');
    await emitProgress({ progress: 50 });

    const sampledCommentList = sampleComments(allComments, reportConfig.sampling, rng);

    // Check budget limit
    if (sampledCommentList.length > config.maxCommentsTotal) {
      sampledCommentList.length = config.maxCommentsTotal;
    }

    progress.commentsTotal = sampledCommentList.length;
    await emitProgress({});

    // Phase 5: Run sentiment analysis
    await setPhase('sentiment_analysis');
    await emitProgress({ progress: 55 });

    const { communityClassifications, moderatorClassifications, tokensUsed: sentimentTokens } =
      await runSentimentAnalysis(
        sampledCommentList,
        config.maxLLMCallsPerPhase,
        async (processed) => {
          await emitProgress({
            commentsProcessed: processed,
            progress: 55 + Math.floor((processed / sampledCommentList.length) * 15),
          });
        }
      );

    progress.tokensUsed += sentimentTokens;
    progress.estimatedCost = estimateCost(progress.tokensUsed);

    // Phase 6: Run target group analysis (if enabled)
    await setPhase('target_group_analysis');
    await emitProgress({ progress: 75 });

    let targetGroupClassifications: TargetGroupClassification[] = [];

    if (reportConfig.enableTargetGroupAnalysis && reportConfig.targetGroups.length > 0) {
      const tgResult = await runTargetGroupAnalysis(
        sampledCommentList,
        reportConfig.targetGroups,
        reportConfig.frameworks as FrameworkType[],
        config.maxLLMCallsPerPhase,
        async (processed) => {
          await emitProgress({
            commentsProcessed: sampledCommentList.length + processed,
            progress: 75 + Math.floor((processed / sampledCommentList.length) * 15),
          });
        }
      );

      targetGroupClassifications = tgResult.classifications;
      progress.tokensUsed += tgResult.tokensUsed;
      progress.estimatedCost = estimateCost(progress.tokensUsed);
    }

    // Phase 7: Aggregate results
    await setPhase('aggregating');
    await emitProgress({ progress: 95 });

    const communitySentiment = calculateSentimentStats(communityClassifications);
    const moderatorSentiment = calculateSentimentStats(moderatorClassifications);

    const targetGroupStats = reportConfig.enableTargetGroupAnalysis
      ? aggregateTargetGroupStats(
          targetGroupClassifications,
          reportConfig.frameworks as FrameworkType[],
          reportConfig.targetGroups
        )
      : [];

    // Convert to database format
    const allClassifications = [...communityClassifications, ...moderatorClassifications];

    // Create sampled comment records
    const sampledCommentsForDb: CreateSampledComment[] = [];
    for (const [strategy, posts] of sampledPosts) {
      const postIds = new Set(posts.map(p => p.id));
      const strategyComments = sampledCommentList.filter(c => postIds.has(c.postId));
      sampledCommentsForDb.push(...toSampledComments(strategyComments, '', strategy));
    }

    await setPhase('completed');
    await emitProgress({ progress: 100 });

    return {
      success: true,
      communitySentiment,
      moderatorSentiment,
      targetGroupStats,
      sampledComments: sampledCommentsForDb,
      sentimentClassifications: allClassifications,
      targetGroupClassifications,
      totalTokensUsed: progress.tokensUsed,
      estimatedCost: progress.estimatedCost,
    };

  } catch (error) {
    await setPhase('failed');

    return {
      success: false,
      communitySentiment: null,
      moderatorSentiment: null,
      targetGroupStats: [],
      sampledComments: [],
      sentimentClassifications: [],
      targetGroupClassifications: [],
      totalTokensUsed: progress.tokensUsed,
      estimatedCost: progress.estimatedCost,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Fetch posts from Reddit for all sampling strategies
 */
async function fetchPosts(
  client: RedditClient,
  subreddit: string,
  sampling: SamplingConfig,
  _timeframeStart: Date,
  _timeframeEnd: Date
): Promise<Map<'top' | 'new' | 'controversial', RedditPost[]>> {
  const result = new Map<'top' | 'new' | 'controversial', RedditPost[]>();

  for (const strategy of sampling.strategies) {
    const posts = await client.getAllPosts(subreddit, strategy, {
      maxPosts: sampling.postsPerStrategy * 2, // Fetch extra for filtering
      timeframe: 'week', // Could be derived from timeframeStart/End
    });

    result.set(strategy, posts);
  }

  return result;
}

/**
 * Run sentiment analysis on comments
 */
async function runSentimentAnalysis(
  comments: RedditComment[],
  _maxLLMCalls: number,
  onProgress?: (processed: number) => Promise<void>
): Promise<{
  communityClassifications: SentimentClassification[];
  moderatorClassifications: SentimentClassification[];
  tokensUsed: number;
}> {
  const communityClassifications: SentimentClassification[] = [];
  const moderatorClassifications: SentimentClassification[] = [];
  let tokensUsed = 0;

  for (let i = 0; i < comments.length; i++) {
    const comment = comments[i];

    // Run heuristics first
    const heuristicResult = runSentimentHeuristics(comment.body);

    let classification: SentimentClassification;

    if (heuristicResult.confident) {
      // Use heuristic result
      classification = createHeuristicSentimentClassification(
        comment.id,
        heuristicResult.suggestion.sentiment!,
        0.5, // Default subjectivity
        heuristicResult.indicators
      );
    } else {
      // Would need LLM here - for now use heuristic with lower confidence
      classification = createHeuristicSentimentClassification(
        comment.id,
        heuristicResult.suggestion.sentiment ?? 'neutral',
        0.5,
        heuristicResult.indicators
      );
      classification.confidence = 0.5; // Lower confidence for uncertain cases

      // Estimate tokens if we were to call LLM
      tokensUsed += estimateTokensForComment(comment.body);
    }

    if (comment.isModerator) {
      moderatorClassifications.push(classification);
    } else {
      communityClassifications.push(classification);
    }

    if (onProgress && i % 100 === 0) {
      await onProgress(i + 1);
    }
  }

  if (onProgress) {
    await onProgress(comments.length);
  }

  return { communityClassifications, moderatorClassifications, tokensUsed };
}

/**
 * Run target group analysis on comments
 */
async function runTargetGroupAnalysis(
  comments: RedditComment[],
  targetGroups: string[],
  frameworks: FrameworkType[],
  _maxLLMCalls: number,
  onProgress?: (processed: number) => Promise<void>
): Promise<{
  classifications: TargetGroupClassification[];
  tokensUsed: number;
}> {
  const classifications: TargetGroupClassification[] = [];
  let tokensUsed = 0;

  for (let i = 0; i < comments.length; i++) {
    const comment = comments[i];

    for (const framework of frameworks) {
      // Run heuristics first
      const heuristicResult = runTargetGroupHeuristics(comment.body, targetGroups);

      if (heuristicResult.confident) {
        // Use heuristic result
        const classification = createHeuristicTargetGroupClassification(
          comment.id,
          framework,
          heuristicResult.suggestion.hasTargetGroupMention ? targetGroups[0] : null,
          heuristicResult.suggestion.hasTargetGroupMention ?? false,
          heuristicResult.suggestion.hostilityLevel ?? 'none',
          heuristicResult.indicators
        );
        classifications.push(classification);
      } else if (heuristicResult.suggestion.hasTargetGroupMention) {
        // Would need LLM - create placeholder
        const classification = createHeuristicTargetGroupClassification(
          comment.id,
          framework,
          targetGroups.find(g => heuristicResult.indicators.some(ind => ind.toLowerCase().includes(g))) ?? targetGroups[0],
          true,
          heuristicResult.suggestion.hostilityLevel ?? 'none',
          heuristicResult.indicators
        );
        classification.confidence = 0.5;
        classifications.push(classification);

        tokensUsed += estimateTokensForComment(comment.body);
      }
    }

    if (onProgress && i % 100 === 0) {
      await onProgress(i + 1);
    }
  }

  if (onProgress) {
    await onProgress(comments.length);
  }

  return { classifications, tokensUsed };
}

/**
 * Estimate tokens for a comment (rough approximation)
 */
function estimateTokensForComment(text: string): number {
  // Rough estimate: ~4 characters per token
  return Math.ceil(text.length / 4) + 100; // Add overhead for prompt
}

/**
 * Estimate cost based on token usage
 */
function estimateCost(tokens: number): number {
  // Rough estimate: $0.01 per 1000 tokens (varies by model)
  return (tokens / 1000) * 0.01;
}

/**
 * Create a minimal pipeline result for testing
 */
export function createEmptyPipelineResult(): PipelineResult {
  return {
    success: true,
    communitySentiment: null,
    moderatorSentiment: null,
    targetGroupStats: [],
    sampledComments: [],
    sentimentClassifications: [],
    targetGroupClassifications: [],
    totalTokensUsed: 0,
    estimatedCost: 0,
  };
}

/**
 * Validate pipeline configuration
 */
export function validatePipelineConfig(config: Partial<PipelineConfig>): string[] {
  const errors: string[] = [];

  if (config.maxCommentsTotal !== undefined && config.maxCommentsTotal < 1) {
    errors.push('maxCommentsTotal must be at least 1');
  }

  if (config.maxLLMCallsPerPhase !== undefined && config.maxLLMCallsPerPhase < 0) {
    errors.push('maxLLMCallsPerPhase cannot be negative');
  }

  if (config.maxCostUsd !== undefined && config.maxCostUsd < 0) {
    errors.push('maxCostUsd cannot be negative');
  }

  if (config.redditTimeoutMs !== undefined && config.redditTimeoutMs < 1000) {
    errors.push('redditTimeoutMs must be at least 1000ms');
  }

  if (config.llmTimeoutMs !== undefined && config.llmTimeoutMs < 1000) {
    errors.push('llmTimeoutMs must be at least 1000ms');
  }

  return errors;
}
