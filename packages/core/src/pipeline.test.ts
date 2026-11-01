import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import {
  executePipeline,
  createEmptyPipelineResult,
  validatePipelineConfig,
  DEFAULT_PIPELINE_CONFIG,
  type PipelineConfig,
  type PipelineProgress,
} from './pipeline';
import { createRedditClient } from './reddit';
import type { ReportConfig } from '@subreddit-bias/db';
import type { RedditPost, RedditComment } from './sampling';

/**
 * Stand-in for Reddit's public JSON API (the only external boundary here).
 * The pipeline runs against the real RedditClient; only `fetch` is replaced,
 * returning Reddit-shaped listings built from the given posts and comments.
 */
class FakeRedditApi {
  private posts = new Map<string, RedditPost[]>();
  private comments = new Map<string, RedditComment[]>();
  private failingPosts = new Set<string>();
  readonly requests: string[] = [];

  setPosts(subreddit: string, sort: string, posts: RedditPost[]): void {
    this.posts.set(`${subreddit}:${sort}`, posts);
  }

  setComments(postId: string, comments: RedditComment[]): void {
    this.comments.set(postId, comments);
  }

  failCommentsFor(postId: string): void {
    this.failingPosts.add(postId);
  }

  readonly fetch = async (input: string | URL | Request): Promise<Response> => {
    const url = new URL(typeof input === 'string' ? input : input.toString());
    this.requests.push(url.toString());

    const commentsMatch = url.pathname.match(/^\/r\/([^/]+)\/comments\/([^/]+)\.json$/);
    if (commentsMatch) {
      const postId = commentsMatch[2];
      if (this.failingPosts.has(postId)) {
        return new Response('', { status: 429 });
      }
      const children = (this.comments.get(postId) ?? []).map(c => ({
        kind: 't1',
        data: {
          id: c.id,
          link_id: `t3_${c.postId}`,
          parent_id: c.parentId ? `t1_${c.parentId}` : `t3_${c.postId}`,
          subreddit: c.subreddit,
          permalink: c.permalink,
          author: c.authorId,
          body: c.body,
          created_utc: c.createdUtc,
          edited: c.editedUtc ?? false,
          score: c.score,
          depth: c.depth,
          removed: c.isRemoved,
          distinguished: c.isModerator ? 'moderator' : null,
          replies: '',
        },
      }));
      return Response.json([
        { kind: 'Listing', data: { children: [], after: null, before: null } },
        { kind: 'Listing', data: { children, after: null, before: null } },
      ]);
    }

    const listingMatch = url.pathname.match(/^\/r\/([^/]+)\/(top|new|controversial)\.json$/);
    if (listingMatch) {
      const posts = this.posts.get(`${listingMatch[1]}:${listingMatch[2]}`) ?? [];
      const limit = Number(url.searchParams.get('limit') ?? 25);
      const children = posts.slice(0, limit).map(p => ({
        kind: 't3',
        data: {
          id: p.id,
          subreddit: p.subreddit,
          title: p.title,
          permalink: p.permalink,
          created_utc: p.createdUtc,
          score: p.score,
          num_comments: p.numComments,
          removed_by_category: p.isRemoved ? 'moderator' : null,
          author: 'author',
        },
      }));
      return Response.json({ kind: 'Listing', data: { children, after: null, before: null } });
    }

    return new Response('', { status: 404 });
  };
}

describe('executePipeline', () => {
  let originalFetch: typeof globalThis.fetch;
  let reddit: FakeRedditApi;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    reddit = new FakeRedditApi();
    globalThis.fetch = reddit.fetch as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // Real RedditClient talking to the fake API above
  const redditClient = () => createRedditClient('PipelineTest/1.0');

  // ceil(body.length / 4) + 100, as estimated per uncertain comment
  const expectedTokens = (bodies: string[]) =>
    bodies.reduce((sum, b) => sum + Math.ceil(b.length / 4) + 100, 0);
  const createTestConfig = (overrides?: Partial<ReportConfig>): ReportConfig => ({
    subreddit: 'test',
    timeframeStart: new Date('2024-01-01'),
    timeframeEnd: new Date('2024-01-07'),
    sampling: {
      strategies: ['top'],
      postsPerStrategy: 5,
      commentsPerPost: 10,
      maxDepth: 2,
      seed: 12345,
    },
    frameworks: ['nexus'],
    enableTargetGroupAnalysis: false,
    targetGroups: [],
    peerSubreddits: [],
    methodologyVersion: '1.0.0',
    ...overrides,
  });

  const createMockPosts = (count: number): RedditPost[] =>
    Array.from({ length: count }, (_, i) => ({
      id: `post${i}`,
      subreddit: 'test',
      title: `Test Post ${i}`,
      permalink: `/r/test/post${i}`,
      createdUtc: Date.now() / 1000,
      score: 100,
      numComments: 50,
      isRemoved: false,
    }));

  const createMockComments = (postId: string, count: number): RedditComment[] =>
    Array.from({ length: count }, (_, i) => ({
      id: `${postId}_comment${i}`,
      postId,
      parentId: null,
      subreddit: 'test',
      permalink: `/r/test/comments/${postId}/c${i}`,
      authorId: `user${i}`,
      body: i % 3 === 0 ? 'This is great!' : i % 3 === 1 ? 'This is terrible!' : 'Just a normal comment',
      createdUtc: Date.now() / 1000,
      editedUtc: null,
      score: 10,
      depth: 0,
      isRemoved: false,
      isDeleted: false,
      isModerator: i === 0,
    }));

  test('executes pipeline successfully with mock data', async () => {
    const posts = createMockPosts(5);

    reddit.setPosts('test', 'top', posts);
    for (const post of posts) {
      reddit.setComments(post.id, createMockComments(post.id, 10));
    }

    const config = createTestConfig();
    const result = await executePipeline(config, { redditClient: redditClient() });

    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();

    // Posts are fetched with 2x headroom, then comments for each of the 5 posts
    expect(reddit.requests[0]).toBe('https://www.reddit.com/r/test/top.json?limit=10&t=week');
    expect(reddit.requests).toHaveLength(6);
    expect(reddit.requests[1]).toContain('/r/test/comments/post');
    expect(reddit.requests[1]).toContain('limit=10&depth=2');

    // 5 posts x 10 comments; comment 0 of each post is a moderator.
    // None of these short bodies is confidently classified by the heuristics,
    // so all fall back to neutral.
    expect(result.sentimentClassifications).toHaveLength(50);
    expect(result.sampledComments).toHaveLength(50);
    expect(result.sampledComments.every(c => c.samplingStrategy === 'top')).toBe(true);
    expect(result.communitySentiment!.sampleSize).toBe(45);
    expect(result.communitySentiment!.distribution).toEqual({ positive: 0, neutral: 45, negative: 0, total: 45 });
    expect(result.moderatorSentiment!.sampleSize).toBe(5);
    expect(result.targetGroupStats).toEqual([]);
  });

  test('continues past comment fetch failures for individual posts', async () => {
    const posts = createMockPosts(2);

    reddit.setPosts('test', 'top', posts);
    reddit.setComments(posts[0].id, createMockComments(posts[0].id, 4));
    reddit.failCommentsFor(posts[1].id);

    const progressUpdates: PipelineProgress[] = [];
    const result = await executePipeline(createTestConfig(), {
      redditClient: redditClient(),
      onProgress: (progress) => {
        progressUpdates.push({ ...progress });
      },
    });

    expect(result.success).toBe(true);
    expect(result.sentimentClassifications).toHaveLength(4);
    expect(progressUpdates[progressUpdates.length - 1].rateLimitEvents).toBe(1);
  });

  test('reports failure when the subreddit listing cannot be fetched', async () => {
    const phases: string[] = [];
    // No listing registered for this path shape -> fake API returns 404
    globalThis.fetch = (async () => new Response('', { status: 404 })) as unknown as typeof fetch;

    const result = await executePipeline(createTestConfig(), {
      redditClient: redditClient(),
      onPhaseChange: (phase) => {
        phases.push(phase);
      },
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Resource not found');
    expect(result.communitySentiment).toBeNull();
    expect(phases[phases.length - 1]).toBe('failed');
  });

  test('tracks progress during execution', async () => {
    const posts = createMockPosts(2);

    reddit.setPosts('test', 'top', posts);
    for (const post of posts) {
      reddit.setComments(post.id, createMockComments(post.id, 5));
    }

    const progressUpdates: PipelineProgress[] = [];
    const phaseChanges: string[] = [];

    const config = createTestConfig({
      sampling: {
        strategies: ['top'],
        postsPerStrategy: 2,
        commentsPerPost: 5,
        maxDepth: 1,
        seed: 12345,
      },
    });

    await executePipeline(config, {
      redditClient: redditClient(),
      onProgress: (progress) => {
        progressUpdates.push({ ...progress });
      },
      onPhaseChange: (phase) => {
        phaseChanges.push(phase);
      },
    });

    expect(progressUpdates.length).toBeGreaterThan(0);
    expect(phaseChanges).toContain('fetching_posts');
    expect(phaseChanges).toContain('sampling_posts');
    expect(phaseChanges).toContain('sentiment_analysis');
    expect(phaseChanges).toEqual([
      'fetching_posts',
      'sampling_posts',
      'fetching_comments',
      'sampling_comments',
      'sentiment_analysis',
      'target_group_analysis',
      'aggregating',
      'completed',
    ]);
    expect(progressUpdates[progressUpdates.length - 1].progress).toBe(100);
    expect(progressUpdates[progressUpdates.length - 1].commentsTotal).toBe(10);

    // Progress should increase
    const progressValues = progressUpdates.map(p => p.progress);
    for (let i = 1; i < progressValues.length; i++) {
      expect(progressValues[i]).toBeGreaterThanOrEqual(progressValues[i - 1]);
    }
  });

  test('handles empty subreddit', async () => {
    reddit.setPosts('empty', 'top', []);

    const config = createTestConfig({ subreddit: 'empty' });
    const result = await executePipeline(config, { redditClient: redditClient() });

    expect(result.success).toBe(true);
    expect(result.sentimentClassifications).toHaveLength(0);
    expect(result.communitySentiment!.sampleSize).toBe(0);
    expect(result.moderatorSentiment!.sampleSize).toBe(0);
    expect(result.totalTokensUsed).toBe(0);
  });

  test('runs target group analysis when enabled', async () => {
    const posts = createMockPosts(2);

    reddit.setPosts('test', 'top', posts);
    for (const post of posts) {
      const comments = createMockComments(post.id, 5);
      // Add a comment mentioning a target group
      comments.push({
        id: `${post.id}_tg_comment`,
        postId: post.id,
        parentId: null,
        subreddit: 'test',
        permalink: `/r/test/comments/${post.id}/tg`,
        authorId: 'user',
        body: 'The Jewish community organized an event.',
        createdUtc: Date.now() / 1000,
        editedUtc: null,
        score: 5,
        depth: 0,
        isRemoved: false,
        isDeleted: false,
        isModerator: false,
      });
      reddit.setComments(post.id, comments);
    }

    const config = createTestConfig({
      enableTargetGroupAnalysis: true,
      targetGroups: ['jewish'],
      frameworks: ['nexus', 'jda'],
    });

    const result = await executePipeline(config, { redditClient: redditClient() });

    expect(result.success).toBe(true);

    // Every comment gets one classification per framework: 2 posts x 6 comments x 2 frameworks
    expect(result.targetGroupClassifications).toHaveLength(24);

    // The comments naming the group are flagged as mentions under both frameworks
    const mentions = result.targetGroupClassifications.filter(c => c.mentionsGroup);
    expect(mentions).toHaveLength(4);
    expect(new Set(mentions.map(c => c.commentId))).toEqual(new Set(['post0_tg_comment', 'post1_tg_comment']));
    expect(new Set(mentions.map(c => c.framework))).toEqual(new Set(['nexus', 'jda']));
    expect(mentions.every(c => c.targetGroup === 'jewish')).toBe(true);

    const nexusStats = result.targetGroupStats.find(s => s.framework === 'nexus' && s.targetGroup === 'jewish');
    expect(nexusStats).toBeDefined();
    expect(nexusStats!.totalMentions).toBe(2);
  });

  test('separates moderator and community classifications', async () => {
    const posts = createMockPosts(1);

    const comments: RedditComment[] = [
      {
        id: 'mod_comment',
        postId: posts[0].id,
        parentId: null,
        subreddit: 'test',
        permalink: '/r/test/mod',
        authorId: 'mod',
        body: 'Official moderator statement here.',
        createdUtc: Date.now() / 1000,
        editedUtc: null,
        score: 100,
        depth: 0,
        isRemoved: false,
        isDeleted: false,
        isModerator: true,
      },
      {
        id: 'user_comment',
        postId: posts[0].id,
        parentId: null,
        subreddit: 'test',
        permalink: '/r/test/user',
        authorId: 'user',
        body: 'Regular user comment here.',
        createdUtc: Date.now() / 1000,
        editedUtc: null,
        score: 10,
        depth: 0,
        isRemoved: false,
        isDeleted: false,
        isModerator: false,
      },
    ];

    reddit.setPosts('test', 'top', posts);
    reddit.setComments(posts[0].id, comments);

    const config = createTestConfig();
    const result = await executePipeline(config, { redditClient: redditClient() });

    expect(result.success).toBe(true);
    expect(result.communitySentiment).not.toBeNull();
    expect(result.moderatorSentiment).not.toBeNull();
    expect(result.communitySentiment!.sampleSize).toBe(1);
    expect(result.moderatorSentiment!.sampleSize).toBe(1);
  });

  test('respects maxCommentsTotal budget', async () => {
    const posts = createMockPosts(10);

    reddit.setPosts('test', 'top', posts);
    for (const post of posts) {
      reddit.setComments(post.id, createMockComments(post.id, 100));
    }

    const config = createTestConfig({
      sampling: {
        strategies: ['top'],
        postsPerStrategy: 10,
        commentsPerPost: 100,
        maxDepth: 5,
        seed: 12345,
      },
    });

    const result = await executePipeline(config, {
      redditClient: redditClient(),
      maxCommentsTotal: 50,
    });

    expect(result.success).toBe(true);
    // 1000 comments are available, so the cap is what limits the result
    expect(result.sentimentClassifications).toHaveLength(50);
  });

  test('estimates tokens and cost', async () => {
    const posts = createMockPosts(2);

    reddit.setPosts('test', 'top', posts);
    for (const post of posts) {
      reddit.setComments(post.id, createMockComments(post.id, 10));
    }

    const config = createTestConfig();
    const result = await executePipeline(config, { redditClient: redditClient() });

    // All 20 comments need LLM analysis, so each contributes an estimate
    const bodies = posts.flatMap(p => createMockComments(p.id, 10).map(c => c.body));
    const tokens = expectedTokens(bodies);
    expect(tokens).toBe(2098);
    expect(result.totalTokensUsed).toBe(tokens);
    expect(result.estimatedCost).toBeCloseTo((tokens / 1000) * 0.01, 10);
  });
});

describe('createEmptyPipelineResult', () => {
  test('creates empty result object', () => {
    const result = createEmptyPipelineResult();

    expect(result.success).toBe(true);
    expect(result.communitySentiment).toBeNull();
    expect(result.moderatorSentiment).toBeNull();
    expect(result.targetGroupStats).toHaveLength(0);
    expect(result.sampledComments).toHaveLength(0);
    expect(result.sentimentClassifications).toHaveLength(0);
    expect(result.targetGroupClassifications).toHaveLength(0);
    expect(result.totalTokensUsed).toBe(0);
    expect(result.estimatedCost).toBe(0);
  });
});

describe('validatePipelineConfig', () => {
  test('returns no errors for valid config', () => {
    const errors = validatePipelineConfig(DEFAULT_PIPELINE_CONFIG);
    expect(errors).toHaveLength(0);
  });

  test('validates maxCommentsTotal', () => {
    const errors = validatePipelineConfig({ maxCommentsTotal: 0 });
    expect(errors).toContain('maxCommentsTotal must be at least 1');
  });

  test('validates maxLLMCallsPerPhase', () => {
    const errors = validatePipelineConfig({ maxLLMCallsPerPhase: -1 });
    expect(errors).toContain('maxLLMCallsPerPhase cannot be negative');
  });

  test('validates maxCostUsd', () => {
    const errors = validatePipelineConfig({ maxCostUsd: -5 });
    expect(errors).toContain('maxCostUsd cannot be negative');
  });

  test('validates redditTimeoutMs', () => {
    const errors = validatePipelineConfig({ redditTimeoutMs: 500 });
    expect(errors).toContain('redditTimeoutMs must be at least 1000ms');
  });

  test('validates llmTimeoutMs', () => {
    const errors = validatePipelineConfig({ llmTimeoutMs: 100 });
    expect(errors).toContain('llmTimeoutMs must be at least 1000ms');
  });

  test('returns multiple errors', () => {
    const errors = validatePipelineConfig({
      maxCommentsTotal: 0,
      maxCostUsd: -1,
    });
    expect(errors).toHaveLength(2);
  });
});

describe('DEFAULT_PIPELINE_CONFIG', () => {
  test('has sensible defaults', () => {
    expect(DEFAULT_PIPELINE_CONFIG.maxCommentsTotal).toBe(5000);
    expect(DEFAULT_PIPELINE_CONFIG.maxLLMCallsPerPhase).toBe(500);
    expect(DEFAULT_PIPELINE_CONFIG.maxCostUsd).toBe(5.0);
    expect(DEFAULT_PIPELINE_CONFIG.redditTimeoutMs).toBe(30000);
    expect(DEFAULT_PIPELINE_CONFIG.llmTimeoutMs).toBe(60000);
  });
});
