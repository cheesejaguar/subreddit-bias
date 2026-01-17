/**
 * Reddit API Client
 * Fetches posts and comments from Reddit's public JSON API
 */

import type { RedditPost, RedditComment } from './sampling';

// Reddit API response types
interface RedditListingResponse<T> {
  kind: 'Listing';
  data: {
    children: { kind: string; data: T }[];
    after: string | null;
    before: string | null;
  };
}

interface RedditPostData {
  id: string;
  subreddit: string;
  title: string;
  permalink: string;
  created_utc: number;
  score: number;
  num_comments: number;
  removed_by_category?: string | null;
  author: string;
}

interface RedditCommentData {
  id: string;
  link_id: string; // Post ID prefixed with t3_
  parent_id: string;
  subreddit: string;
  permalink: string;
  author: string;
  author_fullname?: string;
  body: string;
  created_utc: number;
  edited: number | boolean;
  score: number;
  depth: number;
  removed?: boolean;
  collapsed?: boolean;
  distinguished?: string | null;
}

// Reddit API configuration
export interface RedditApiConfig {
  userAgent: string;
  rateLimit?: number; // Requests per minute
  timeout?: number; // Request timeout in ms
}

// Rate limiter state
interface RateLimiterState {
  tokens: number;
  lastRefill: number;
  maxTokens: number;
  refillRate: number; // Tokens per ms
}

/**
 * Reddit API Client
 * Uses Reddit's public JSON API (no authentication required)
 */
export class RedditClient {
  private config: RedditApiConfig;
  private rateLimiter: RateLimiterState;

  constructor(config: RedditApiConfig) {
    this.config = {
      userAgent: config.userAgent,
      rateLimit: config.rateLimit ?? 60, // Default 60 requests per minute
      timeout: config.timeout ?? 10000, // Default 10s timeout
    };

    // Initialize token bucket rate limiter
    const maxTokens = this.config.rateLimit!;
    this.rateLimiter = {
      tokens: maxTokens,
      lastRefill: Date.now(),
      maxTokens,
      refillRate: maxTokens / 60000, // Tokens per ms
    };
  }

  /**
   * Consume a rate limit token, waiting if necessary
   */
  private async consumeToken(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.rateLimiter.lastRefill;

    // Refill tokens based on elapsed time
    this.rateLimiter.tokens = Math.min(
      this.rateLimiter.maxTokens,
      this.rateLimiter.tokens + elapsed * this.rateLimiter.refillRate
    );
    this.rateLimiter.lastRefill = now;

    // If no tokens available, wait
    if (this.rateLimiter.tokens < 1) {
      const waitTime = Math.ceil((1 - this.rateLimiter.tokens) / this.rateLimiter.refillRate);
      await new Promise((resolve) => setTimeout(resolve, waitTime));
      this.rateLimiter.tokens = 1;
    }

    this.rateLimiter.tokens -= 1;
  }

  /**
   * Make a request to Reddit's JSON API
   */
  private async fetch<T>(url: string): Promise<T> {
    await this.consumeToken();

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': this.config.userAgent,
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        if (response.status === 429) {
          throw new RedditRateLimitError('Rate limited by Reddit');
        }
        if (response.status === 404) {
          throw new RedditNotFoundError('Resource not found');
        }
        throw new RedditApiError(`Reddit API error: ${response.status}`);
      }

      return await response.json();
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Get posts from a subreddit by sort type
   */
  async getPosts(
    subreddit: string,
    sort: 'top' | 'new' | 'controversial',
    options: {
      limit?: number;
      timeframe?: 'hour' | 'day' | 'week' | 'month' | 'year' | 'all';
      after?: string;
    } = {}
  ): Promise<{ posts: RedditPost[]; after: string | null }> {
    const { limit = 25, timeframe = 'week', after } = options;

    let url = `https://www.reddit.com/r/${subreddit}/${sort}.json?limit=${limit}`;
    if (sort === 'top' || sort === 'controversial') {
      url += `&t=${timeframe}`;
    }
    if (after) {
      url += `&after=${after}`;
    }

    const response = await this.fetch<RedditListingResponse<RedditPostData>>(url);

    const posts: RedditPost[] = response.data.children.map((child) => ({
      id: child.data.id,
      subreddit: child.data.subreddit,
      title: child.data.title,
      permalink: child.data.permalink,
      createdUtc: child.data.created_utc,
      score: child.data.score,
      numComments: child.data.num_comments,
      isRemoved: !!child.data.removed_by_category,
    }));

    return { posts, after: response.data.after };
  }

  /**
   * Get all posts from a subreddit (with pagination)
   */
  async getAllPosts(
    subreddit: string,
    sort: 'top' | 'new' | 'controversial',
    options: {
      maxPosts?: number;
      timeframe?: 'hour' | 'day' | 'week' | 'month' | 'year' | 'all';
    } = {}
  ): Promise<RedditPost[]> {
    const { maxPosts = 100, timeframe = 'week' } = options;
    const allPosts: RedditPost[] = [];
    let after: string | null = null;

    while (allPosts.length < maxPosts) {
      const remaining = maxPosts - allPosts.length;
      const limit = Math.min(remaining, 100);

      const result = await this.getPosts(subreddit, sort, { limit, timeframe, after });
      allPosts.push(...result.posts);

      if (!result.after || result.posts.length === 0) {
        break;
      }
      after = result.after;
    }

    return allPosts.slice(0, maxPosts);
  }

  /**
   * Get comments for a post
   */
  async getPostComments(
    subreddit: string,
    postId: string,
    options: {
      limit?: number;
      depth?: number;
      sort?: 'confidence' | 'top' | 'new' | 'controversial' | 'old' | 'qa';
    } = {}
  ): Promise<RedditComment[]> {
    const { limit = 500, depth = 10, sort = 'top' } = options;

    const url = `https://www.reddit.com/r/${subreddit}/comments/${postId}.json?limit=${limit}&depth=${depth}&sort=${sort}`;
    const response = await this.fetch<[RedditListingResponse<RedditPostData>, RedditListingResponse<RedditCommentData>]>(url);

    const comments: RedditComment[] = [];
    this.extractComments(response[1].data.children, postId, comments);

    return comments;
  }

  /**
   * Recursively extract comments from nested structure
   */
  private extractComments(
    children: { kind: string; data: RedditCommentData & { replies?: RedditListingResponse<RedditCommentData> | '' } }[],
    postId: string,
    result: RedditComment[]
  ): void {
    for (const child of children) {
      if (child.kind !== 't1') continue; // Skip non-comments

      const data = child.data;
      const isDeleted = data.body === '[deleted]' || data.author === '[deleted]';
      const isRemoved = data.body === '[removed]' || !!data.removed;

      result.push({
        id: data.id,
        postId,
        parentId: data.parent_id.startsWith('t1_') ? data.parent_id.slice(3) : null,
        subreddit: data.subreddit,
        permalink: data.permalink,
        authorId: data.author_fullname ?? data.author,
        body: data.body,
        createdUtc: data.created_utc,
        editedUtc: typeof data.edited === 'number' ? data.edited : null,
        score: data.score,
        depth: data.depth,
        isRemoved,
        isDeleted,
        isModerator: data.distinguished === 'moderator',
      });

      // Recursively extract replies
      if (data.replies && typeof data.replies === 'object') {
        this.extractComments(data.replies.data.children, postId, result);
      }
    }
  }

  /**
   * Get moderators of a subreddit
   */
  async getModerators(subreddit: string): Promise<string[]> {
    const url = `https://www.reddit.com/r/${subreddit}/about/moderators.json`;

    try {
      const response = await this.fetch<{ data: { children: { name: string }[] } }>(url);
      return response.data.children.map((mod) => mod.name);
    } catch (error) {
      // Moderator list may be private
      if (error instanceof RedditNotFoundError) {
        return [];
      }
      throw error;
    }
  }

  /**
   * Check if a subreddit exists and is accessible
   */
  async subredditExists(subreddit: string): Promise<boolean> {
    try {
      const url = `https://www.reddit.com/r/${subreddit}/about.json`;
      await this.fetch(url);
      return true;
    } catch (error) {
      if (error instanceof RedditNotFoundError) {
        return false;
      }
      throw error;
    }
  }
}

// Custom error types
export class RedditApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RedditApiError';
  }
}

export class RedditRateLimitError extends RedditApiError {
  constructor(message: string) {
    super(message);
    this.name = 'RedditRateLimitError';
  }
}

export class RedditNotFoundError extends RedditApiError {
  constructor(message: string) {
    super(message);
    this.name = 'RedditNotFoundError';
  }
}

/**
 * Create a Reddit client with default configuration
 */
export function createRedditClient(userAgent?: string): RedditClient {
  return new RedditClient({
    userAgent: userAgent ?? 'SubredditBiasAnalyzer/1.0.0',
  });
}

/**
 * Mock Reddit client for testing
 */
export class MockRedditClient extends RedditClient {
  private mockPosts: Map<string, RedditPost[]> = new Map();
  private mockComments: Map<string, RedditComment[]> = new Map();

  constructor() {
    super({ userAgent: 'MockClient/1.0.0' });
  }

  setMockPosts(subreddit: string, sort: string, posts: RedditPost[]): void {
    this.mockPosts.set(`${subreddit}:${sort}`, posts);
  }

  setMockComments(postId: string, comments: RedditComment[]): void {
    this.mockComments.set(postId, comments);
  }

  override async getPosts(
    subreddit: string,
    sort: 'top' | 'new' | 'controversial'
  ): Promise<{ posts: RedditPost[]; after: string | null }> {
    const key = `${subreddit}:${sort}`;
    const posts = this.mockPosts.get(key) ?? [];
    return { posts, after: null };
  }

  override async getAllPosts(
    subreddit: string,
    sort: 'top' | 'new' | 'controversial'
  ): Promise<RedditPost[]> {
    const key = `${subreddit}:${sort}`;
    return this.mockPosts.get(key) ?? [];
  }

  override async getPostComments(
    _subreddit: string,
    postId: string
  ): Promise<RedditComment[]> {
    return this.mockComments.get(postId) ?? [];
  }

  override async getModerators(_subreddit: string): Promise<string[]> {
    return ['mod1', 'mod2'];
  }

  override async subredditExists(_subreddit: string): Promise<boolean> {
    return true;
  }
}
