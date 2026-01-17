/**
 * Sampling module for deterministic, reproducible content sampling
 * Implements the mixed sampling strategy from RALPH.md
 */

import type { SamplingConfig, SamplingStrategy, SampledComment, CreateSampledComment } from '@subreddit-bias/db';

// Seeded random number generator for reproducibility
export class SeededRandom {
  private seed: number;

  constructor(seed: number) {
    this.seed = seed;
  }

  // Simple mulberry32 PRNG
  next(): number {
    let t = (this.seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  // Get random integer in range [min, max)
  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min)) + min;
  }

  // Shuffle array in place using Fisher-Yates
  shuffle<T>(array: T[]): T[] {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
      const j = this.nextInt(0, i + 1);
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  // Sample n items from array without replacement
  sample<T>(array: T[], n: number): T[] {
    if (n >= array.length) return [...array];
    const shuffled = this.shuffle(array);
    return shuffled.slice(0, n);
  }

  // Get current seed (for logging/debugging)
  getSeed(): number {
    return this.seed;
  }
}

// Reddit post type (from API)
export interface RedditPost {
  id: string;
  subreddit: string;
  title: string;
  permalink: string;
  createdUtc: number;
  score: number;
  numComments: number;
  isRemoved: boolean;
}

// Reddit comment type (from API)
export interface RedditComment {
  id: string;
  postId: string;
  parentId: string | null;
  subreddit: string;
  permalink: string;
  authorId: string | null;
  body: string;
  createdUtc: number;
  editedUtc: number | null;
  score: number;
  depth: number;
  isRemoved: boolean;
  isDeleted: boolean;
  isModerator: boolean;
}

// Sampling result
export interface SamplingResult {
  posts: RedditPost[];
  comments: RedditComment[];
  metadata: {
    seed: number;
    strategies: SamplingStrategy[];
    postsPerStrategy: number;
    commentsPerPost: number;
    maxDepth: number;
    totalPostsSampled: number;
    totalCommentsSampled: number;
    removedCommentsExcluded: number;
    deletedCommentsExcluded: number;
  };
}

// Options for sampling
export interface SamplingOptions {
  config: SamplingConfig;
  timeframeStart: Date;
  timeframeEnd: Date;
}

/**
 * Create a deterministic sampler with the given seed
 */
export function createSampler(seed: number): SeededRandom {
  return new SeededRandom(seed);
}

/**
 * Generate a seed from parameters for reproducibility
 */
export function generateSeed(subreddit: string, timeframeStart: Date, timeframeEnd: Date): number {
  // Create a deterministic hash from the parameters
  const str = `${subreddit}-${timeframeStart.toISOString()}-${timeframeEnd.toISOString()}`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

/**
 * Sample posts from each strategy
 */
export function samplePosts(
  posts: Map<SamplingStrategy, RedditPost[]>,
  config: SamplingConfig,
  rng: SeededRandom
): Map<SamplingStrategy, RedditPost[]> {
  const result = new Map<SamplingStrategy, RedditPost[]>();

  for (const strategy of config.strategies) {
    const strategyPosts = posts.get(strategy) ?? [];
    const sampled = rng.sample(strategyPosts, config.postsPerStrategy);
    result.set(strategy, sampled);
  }

  return result;
}

/**
 * Sample comments from posts with depth and count limits
 */
export function sampleComments(
  comments: RedditComment[],
  config: SamplingConfig,
  rng: SeededRandom
): RedditComment[] {
  // Filter out removed and deleted comments
  const validComments = comments.filter(c => !c.isRemoved && !c.isDeleted);

  // Filter by max depth
  const depthFiltered = validComments.filter(c => c.depth <= config.maxDepth);

  // Group by post
  const byPost = new Map<string, RedditComment[]>();
  for (const comment of depthFiltered) {
    const existing = byPost.get(comment.postId) ?? [];
    existing.push(comment);
    byPost.set(comment.postId, existing);
  }

  // Sample from each post
  const sampled: RedditComment[] = [];
  for (const [_postId, postComments] of byPost) {
    const postSampled = rng.sample(postComments, config.commentsPerPost);
    sampled.push(...postSampled);
  }

  return sampled;
}

/**
 * Convert sampled comments to database format
 */
export function toSampledComments(
  comments: RedditComment[],
  reportId: string,
  strategy: SamplingStrategy
): CreateSampledComment[] {
  return comments.map(comment => ({
    redditId: comment.id,
    subreddit: comment.subreddit,
    postId: comment.postId,
    permalink: comment.permalink,
    authorId: comment.authorId,
    isModeratorComment: comment.isModerator,
    createdUtc: comment.createdUtc,
    editedUtc: comment.editedUtc,
    depth: comment.depth,
    samplingStrategy: strategy,
    reportId,
  }));
}

/**
 * Perform full sampling for a subreddit
 */
export function performSampling(
  allPosts: Map<SamplingStrategy, RedditPost[]>,
  allComments: RedditComment[],
  options: SamplingOptions
): SamplingResult {
  const { config } = options;
  const rng = createSampler(config.seed);

  // Sample posts
  const sampledPosts = samplePosts(allPosts, config, rng);

  // Get all sampled post IDs
  const sampledPostIds = new Set<string>();
  for (const posts of sampledPosts.values()) {
    for (const post of posts) {
      sampledPostIds.add(post.id);
    }
  }

  // Filter comments to sampled posts
  const relevantComments = allComments.filter(c => sampledPostIds.has(c.postId));

  // Track excluded counts
  const removedCount = relevantComments.filter(c => c.isRemoved).length;
  const deletedCount = relevantComments.filter(c => c.isDeleted).length;

  // Sample comments
  const sampledComments = sampleComments(relevantComments, config, rng);

  // Flatten posts for result
  const flatPosts: RedditPost[] = [];
  for (const posts of sampledPosts.values()) {
    flatPosts.push(...posts);
  }

  return {
    posts: flatPosts,
    comments: sampledComments,
    metadata: {
      seed: config.seed,
      strategies: config.strategies,
      postsPerStrategy: config.postsPerStrategy,
      commentsPerPost: config.commentsPerPost,
      maxDepth: config.maxDepth,
      totalPostsSampled: flatPosts.length,
      totalCommentsSampled: sampledComments.length,
      removedCommentsExcluded: removedCount,
      deletedCommentsExcluded: deletedCount,
    },
  };
}

/**
 * Validate sampling configuration
 */
export function validateSamplingConfig(config: SamplingConfig): string[] {
  const errors: string[] = [];

  if (config.strategies.length === 0) {
    errors.push('At least one sampling strategy is required');
  }

  if (config.postsPerStrategy < 1) {
    errors.push('postsPerStrategy must be at least 1');
  }

  if (config.postsPerStrategy > 100) {
    errors.push('postsPerStrategy cannot exceed 100');
  }

  if (config.commentsPerPost < 1) {
    errors.push('commentsPerPost must be at least 1');
  }

  if (config.commentsPerPost > 500) {
    errors.push('commentsPerPost cannot exceed 500');
  }

  if (config.maxDepth < 0) {
    errors.push('maxDepth must be non-negative');
  }

  if (config.maxDepth > 10) {
    errors.push('maxDepth cannot exceed 10');
  }

  return errors;
}

/**
 * Create default sampling configuration
 */
export function createDefaultSamplingConfig(seed?: number): SamplingConfig {
  return {
    strategies: ['top', 'new'],
    postsPerStrategy: 25,
    commentsPerPost: 50,
    maxDepth: 2,
    seed: seed ?? Math.floor(Math.random() * 2147483647),
  };
}
