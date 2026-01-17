import { describe, test, expect } from 'bun:test';
import {
  SeededRandom,
  createSampler,
  generateSeed,
  samplePosts,
  sampleComments,
  toSampledComments,
  performSampling,
  validateSamplingConfig,
  createDefaultSamplingConfig,
  type RedditPost,
  type RedditComment,
  type SamplingConfig,
} from './sampling';

describe('SeededRandom', () => {
  test('produces deterministic results with same seed', () => {
    const rng1 = new SeededRandom(12345);
    const rng2 = new SeededRandom(12345);

    const values1 = Array.from({ length: 10 }, () => rng1.next());
    const values2 = Array.from({ length: 10 }, () => rng2.next());

    expect(values1).toEqual(values2);
  });

  test('produces different results with different seeds', () => {
    const rng1 = new SeededRandom(12345);
    const rng2 = new SeededRandom(54321);

    const values1 = Array.from({ length: 10 }, () => rng1.next());
    const values2 = Array.from({ length: 10 }, () => rng2.next());

    expect(values1).not.toEqual(values2);
  });

  test('next() returns values between 0 and 1', () => {
    const rng = new SeededRandom(12345);

    for (let i = 0; i < 100; i++) {
      const value = rng.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  test('nextInt() returns values in range', () => {
    const rng = new SeededRandom(12345);

    for (let i = 0; i < 100; i++) {
      const value = rng.nextInt(5, 10);
      expect(value).toBeGreaterThanOrEqual(5);
      expect(value).toBeLessThan(10);
    }
  });

  test('shuffle() returns shuffled array', () => {
    const rng = new SeededRandom(12345);
    const original = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const shuffled = rng.shuffle(original);

    expect(shuffled).toHaveLength(original.length);
    // Sorted shuffled should equal original
    expect([...shuffled].sort((a, b) => a - b)).toEqual(original);
    // For this seed, verify at least one element moved position
    const samePositionCount = shuffled.filter((v, i) => v === original[i]).length;
    expect(samePositionCount).toBeLessThan(original.length);
  });

  test('shuffle() is deterministic', () => {
    const rng1 = new SeededRandom(12345);
    const rng2 = new SeededRandom(12345);
    const array = [1, 2, 3, 4, 5];

    expect(rng1.shuffle(array)).toEqual(rng2.shuffle(array));
  });

  test('sample() returns correct number of items', () => {
    const rng = new SeededRandom(12345);
    const array = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

    expect(rng.sample(array, 3)).toHaveLength(3);
    expect(rng.sample(array, 5)).toHaveLength(5);
  });

  test('sample() returns all items if n >= length', () => {
    const rng = new SeededRandom(12345);
    const array = [1, 2, 3];

    expect(rng.sample(array, 5)).toHaveLength(3);
    expect(rng.sample(array, 3)).toHaveLength(3);
  });

  test('getSeed() returns the current seed', () => {
    const rng = new SeededRandom(12345);
    expect(rng.getSeed()).toBe(12345);
    rng.next();
    expect(rng.getSeed()).not.toBe(12345);
  });
});

describe('createSampler', () => {
  test('creates a SeededRandom instance', () => {
    const sampler = createSampler(12345);
    expect(sampler).toBeInstanceOf(SeededRandom);
  });
});

describe('generateSeed', () => {
  test('produces deterministic seeds', () => {
    const seed1 = generateSeed('test', new Date('2024-01-01'), new Date('2024-01-07'));
    const seed2 = generateSeed('test', new Date('2024-01-01'), new Date('2024-01-07'));

    expect(seed1).toBe(seed2);
  });

  test('produces different seeds for different inputs', () => {
    const seed1 = generateSeed('test1', new Date('2024-01-01'), new Date('2024-01-07'));
    const seed2 = generateSeed('test2', new Date('2024-01-01'), new Date('2024-01-07'));
    const seed3 = generateSeed('test1', new Date('2024-01-02'), new Date('2024-01-07'));

    expect(seed1).not.toBe(seed2);
    expect(seed1).not.toBe(seed3);
  });

  test('returns positive number', () => {
    const seed = generateSeed('test', new Date('2024-01-01'), new Date('2024-01-07'));
    expect(seed).toBeGreaterThanOrEqual(0);
  });
});

describe('samplePosts', () => {
  const createTestPost = (id: string): RedditPost => ({
    id,
    subreddit: 'test',
    title: `Post ${id}`,
    permalink: `/r/test/${id}`,
    createdUtc: Date.now() / 1000,
    score: 100,
    numComments: 50,
    isRemoved: false,
  });

  test('samples correct number of posts per strategy', () => {
    const posts = new Map<'top' | 'new' | 'controversial', RedditPost[]>([
      ['top', Array.from({ length: 50 }, (_, i) => createTestPost(`top${i}`))],
      ['new', Array.from({ length: 50 }, (_, i) => createTestPost(`new${i}`))],
    ]);

    const config: SamplingConfig = {
      strategies: ['top', 'new'],
      postsPerStrategy: 10,
      commentsPerPost: 50,
      maxDepth: 2,
      seed: 12345,
    };

    const rng = createSampler(config.seed);
    const sampled = samplePosts(posts, config, rng);

    expect(sampled.get('top')?.length).toBe(10);
    expect(sampled.get('new')?.length).toBe(10);
  });

  test('returns all posts if fewer than requested', () => {
    const posts = new Map<'top' | 'new' | 'controversial', RedditPost[]>([
      ['top', Array.from({ length: 5 }, (_, i) => createTestPost(`top${i}`))],
    ]);

    const config: SamplingConfig = {
      strategies: ['top'],
      postsPerStrategy: 10,
      commentsPerPost: 50,
      maxDepth: 2,
      seed: 12345,
    };

    const rng = createSampler(config.seed);
    const sampled = samplePosts(posts, config, rng);

    expect(sampled.get('top')?.length).toBe(5);
  });
});

describe('sampleComments', () => {
  const createTestComment = (id: string, depth: number, isRemoved = false, isDeleted = false): RedditComment => ({
    id,
    postId: 'post1',
    parentId: null,
    subreddit: 'test',
    permalink: `/r/test/comment/${id}`,
    authorId: 'user1',
    body: `Comment ${id}`,
    createdUtc: Date.now() / 1000,
    editedUtc: null,
    score: 10,
    depth,
    isRemoved,
    isDeleted,
    isModerator: false,
  });

  test('filters out removed comments', () => {
    const comments = [
      createTestComment('c1', 1, false, false),
      createTestComment('c2', 1, true, false),
      createTestComment('c3', 1, false, false),
    ];

    const config: SamplingConfig = {
      strategies: ['top'],
      postsPerStrategy: 10,
      commentsPerPost: 10,
      maxDepth: 5,
      seed: 12345,
    };

    const rng = createSampler(config.seed);
    const sampled = sampleComments(comments, config, rng);

    expect(sampled).toHaveLength(2);
    expect(sampled.every(c => !c.isRemoved)).toBe(true);
  });

  test('filters out deleted comments', () => {
    const comments = [
      createTestComment('c1', 1, false, false),
      createTestComment('c2', 1, false, true),
      createTestComment('c3', 1, false, false),
    ];

    const config: SamplingConfig = {
      strategies: ['top'],
      postsPerStrategy: 10,
      commentsPerPost: 10,
      maxDepth: 5,
      seed: 12345,
    };

    const rng = createSampler(config.seed);
    const sampled = sampleComments(comments, config, rng);

    expect(sampled).toHaveLength(2);
    expect(sampled.every(c => !c.isDeleted)).toBe(true);
  });

  test('respects max depth', () => {
    const comments = [
      createTestComment('c1', 1),
      createTestComment('c2', 2),
      createTestComment('c3', 3),
      createTestComment('c4', 4),
    ];

    const config: SamplingConfig = {
      strategies: ['top'],
      postsPerStrategy: 10,
      commentsPerPost: 10,
      maxDepth: 2,
      seed: 12345,
    };

    const rng = createSampler(config.seed);
    const sampled = sampleComments(comments, config, rng);

    expect(sampled.every(c => c.depth <= 2)).toBe(true);
  });
});

describe('toSampledComments', () => {
  test('converts RedditComments to CreateSampledComment format', () => {
    const comments: RedditComment[] = [
      {
        id: 'c1',
        postId: 'post1',
        parentId: null,
        subreddit: 'test',
        permalink: '/r/test/c1',
        authorId: 'user1',
        body: 'Comment 1',
        createdUtc: 1704067200,
        editedUtc: null,
        score: 10,
        depth: 1,
        isRemoved: false,
        isDeleted: false,
        isModerator: false,
      },
    ];

    const result = toSampledComments(comments, 'report123', 'top');

    expect(result).toHaveLength(1);
    expect(result[0].redditId).toBe('c1');
    expect(result[0].reportId).toBe('report123');
    expect(result[0].samplingStrategy).toBe('top');
    expect(result[0].isModeratorComment).toBe(false);
  });
});

describe('performSampling', () => {
  test('returns sampling result with metadata', () => {
    const posts = new Map<'top' | 'new' | 'controversial', RedditPost[]>([
      ['top', [{ id: 'p1', subreddit: 'test', title: 'Post', permalink: '/p1', createdUtc: 1, score: 1, numComments: 1, isRemoved: false }]],
    ]);

    const comments: RedditComment[] = [
      {
        id: 'c1',
        postId: 'p1',
        parentId: null,
        subreddit: 'test',
        permalink: '/c1',
        authorId: 'u1',
        body: 'Comment',
        createdUtc: 1,
        editedUtc: null,
        score: 1,
        depth: 1,
        isRemoved: false,
        isDeleted: false,
        isModerator: false,
      },
    ];

    const result = performSampling(posts, comments, {
      config: {
        strategies: ['top'],
        postsPerStrategy: 10,
        commentsPerPost: 10,
        maxDepth: 2,
        seed: 12345,
      },
      timeframeStart: new Date(),
      timeframeEnd: new Date(),
    });

    expect(result.posts).toHaveLength(1);
    expect(result.comments).toHaveLength(1);
    expect(result.metadata.seed).toBe(12345);
    expect(result.metadata.strategies).toContain('top');
  });
});

describe('validateSamplingConfig', () => {
  test('returns no errors for valid config', () => {
    const config: SamplingConfig = {
      strategies: ['top', 'new'],
      postsPerStrategy: 25,
      commentsPerPost: 50,
      maxDepth: 2,
      seed: 12345,
    };

    const errors = validateSamplingConfig(config);
    expect(errors).toHaveLength(0);
  });

  test('returns error for empty strategies', () => {
    const config: SamplingConfig = {
      strategies: [],
      postsPerStrategy: 25,
      commentsPerPost: 50,
      maxDepth: 2,
      seed: 12345,
    };

    const errors = validateSamplingConfig(config);
    expect(errors).toContain('At least one sampling strategy is required');
  });

  test('returns error for invalid postsPerStrategy', () => {
    const config1: SamplingConfig = {
      strategies: ['top'],
      postsPerStrategy: 0,
      commentsPerPost: 50,
      maxDepth: 2,
      seed: 12345,
    };

    const config2: SamplingConfig = {
      strategies: ['top'],
      postsPerStrategy: 101,
      commentsPerPost: 50,
      maxDepth: 2,
      seed: 12345,
    };

    expect(validateSamplingConfig(config1)).toContain('postsPerStrategy must be at least 1');
    expect(validateSamplingConfig(config2)).toContain('postsPerStrategy cannot exceed 100');
  });

  test('returns error for invalid commentsPerPost', () => {
    const config1: SamplingConfig = {
      strategies: ['top'],
      postsPerStrategy: 25,
      commentsPerPost: 0,
      maxDepth: 2,
      seed: 12345,
    };

    const config2: SamplingConfig = {
      strategies: ['top'],
      postsPerStrategy: 25,
      commentsPerPost: 501,
      maxDepth: 2,
      seed: 12345,
    };

    expect(validateSamplingConfig(config1)).toContain('commentsPerPost must be at least 1');
    expect(validateSamplingConfig(config2)).toContain('commentsPerPost cannot exceed 500');
  });

  test('returns error for invalid maxDepth', () => {
    const config1: SamplingConfig = {
      strategies: ['top'],
      postsPerStrategy: 25,
      commentsPerPost: 50,
      maxDepth: -1,
      seed: 12345,
    };

    const config2: SamplingConfig = {
      strategies: ['top'],
      postsPerStrategy: 25,
      commentsPerPost: 50,
      maxDepth: 11,
      seed: 12345,
    };

    expect(validateSamplingConfig(config1)).toContain('maxDepth must be non-negative');
    expect(validateSamplingConfig(config2)).toContain('maxDepth cannot exceed 10');
  });
});

describe('createDefaultSamplingConfig', () => {
  test('creates config with default values', () => {
    const config = createDefaultSamplingConfig();

    expect(config.strategies).toContain('top');
    expect(config.strategies).toContain('new');
    expect(config.postsPerStrategy).toBe(25);
    expect(config.commentsPerPost).toBe(50);
    expect(config.maxDepth).toBe(2);
    expect(config.seed).toBeDefined();
  });

  test('uses provided seed', () => {
    const config = createDefaultSamplingConfig(99999);
    expect(config.seed).toBe(99999);
  });
});
