import { describe, test, expect, mock } from 'bun:test';
import {
  executePipeline,
  createEmptyPipelineResult,
  validatePipelineConfig,
  DEFAULT_PIPELINE_CONFIG,
  type PipelineConfig,
  type PipelineProgress,
} from './pipeline';
import { MockRedditClient } from './reddit';
import type { ReportConfig } from '@subreddit-bias/db';
import type { RedditPost, RedditComment, SamplingConfig } from './sampling';

describe('executePipeline', () => {
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
    const mockClient = new MockRedditClient();
    const posts = createMockPosts(5);

    mockClient.setMockPosts('test', 'top', posts);
    for (const post of posts) {
      mockClient.setMockComments(post.id, createMockComments(post.id, 10));
    }

    const config = createTestConfig();
    const result = await executePipeline(config, { redditClient: mockClient });

    expect(result.success).toBe(true);
    expect(result.communitySentiment).not.toBeNull();
    expect(result.error).toBeUndefined();
  });

  test('tracks progress during execution', async () => {
    const mockClient = new MockRedditClient();
    const posts = createMockPosts(2);

    mockClient.setMockPosts('test', 'top', posts);
    for (const post of posts) {
      mockClient.setMockComments(post.id, createMockComments(post.id, 5));
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
      redditClient: mockClient,
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
    expect(phaseChanges).toContain('completed');

    // Progress should increase
    const progressValues = progressUpdates.map(p => p.progress);
    for (let i = 1; i < progressValues.length; i++) {
      expect(progressValues[i]).toBeGreaterThanOrEqual(progressValues[i - 1]);
    }
  });

  test('handles empty subreddit', async () => {
    const mockClient = new MockRedditClient();
    mockClient.setMockPosts('empty', 'top', []);

    const config = createTestConfig({ subreddit: 'empty' });
    const result = await executePipeline(config, { redditClient: mockClient });

    expect(result.success).toBe(true);
    expect(result.sentimentClassifications).toHaveLength(0);
  });

  test('runs target group analysis when enabled', async () => {
    const mockClient = new MockRedditClient();
    const posts = createMockPosts(2);

    mockClient.setMockPosts('test', 'top', posts);
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
      mockClient.setMockComments(post.id, comments);
    }

    const config = createTestConfig({
      enableTargetGroupAnalysis: true,
      targetGroups: ['jewish'],
      frameworks: ['nexus', 'jda'],
    });

    const result = await executePipeline(config, { redditClient: mockClient });

    expect(result.success).toBe(true);
    expect(result.targetGroupClassifications.length).toBeGreaterThan(0);
  });

  test('separates moderator and community classifications', async () => {
    const mockClient = new MockRedditClient();
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

    mockClient.setMockPosts('test', 'top', posts);
    mockClient.setMockComments(posts[0].id, comments);

    const config = createTestConfig();
    const result = await executePipeline(config, { redditClient: mockClient });

    expect(result.success).toBe(true);
    expect(result.communitySentiment).not.toBeNull();
    expect(result.moderatorSentiment).not.toBeNull();
    expect(result.communitySentiment!.sampleSize).toBe(1);
    expect(result.moderatorSentiment!.sampleSize).toBe(1);
  });

  test('respects maxCommentsTotal budget', async () => {
    const mockClient = new MockRedditClient();
    const posts = createMockPosts(10);

    mockClient.setMockPosts('test', 'top', posts);
    for (const post of posts) {
      mockClient.setMockComments(post.id, createMockComments(post.id, 100));
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
      redditClient: mockClient,
      maxCommentsTotal: 50,
    });

    expect(result.success).toBe(true);
    expect(result.sentimentClassifications.length).toBeLessThanOrEqual(50);
  });

  test('estimates tokens and cost', async () => {
    const mockClient = new MockRedditClient();
    const posts = createMockPosts(2);

    mockClient.setMockPosts('test', 'top', posts);
    for (const post of posts) {
      mockClient.setMockComments(post.id, createMockComments(post.id, 10));
    }

    const config = createTestConfig();
    const result = await executePipeline(config, { redditClient: mockClient });

    expect(result.totalTokensUsed).toBeGreaterThanOrEqual(0);
    expect(result.estimatedCost).toBeGreaterThanOrEqual(0);
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
