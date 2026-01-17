import { describe, test, expect, beforeEach } from 'bun:test';
import {
  buildCacheKey,
  parseCacheKey,
  MockRedisClient,
  type CacheKey,
} from './redis';

describe('buildCacheKey', () => {
  test('builds key with all components', () => {
    const key: CacheKey = {
      commentId: 'abc123',
      editedUtc: 1704067200,
      taskType: 'sentiment',
      framework: 'nexus',
      model: 'gpt-4',
      promptVersion: '1.0.0',
    };

    const result = buildCacheKey(key);
    expect(result).toBe('classification:sentiment:nexus:gpt-4:1.0.0:abc123:1704067200');
  });

  test('handles null framework', () => {
    const key: CacheKey = {
      commentId: 'abc123',
      editedUtc: null,
      taskType: 'sentiment',
      framework: null,
      model: 'gpt-4',
      promptVersion: '1.0.0',
    };

    const result = buildCacheKey(key);
    expect(result).toBe('classification:sentiment:none:gpt-4:1.0.0:abc123:0');
  });

  test('handles null editedUtc', () => {
    const key: CacheKey = {
      commentId: 'xyz789',
      editedUtc: null,
      taskType: 'target_group',
      framework: 'jda',
      model: 'claude-3',
      promptVersion: '2.1.0',
    };

    const result = buildCacheKey(key);
    expect(result).toBe('classification:target_group:jda:claude-3:2.1.0:xyz789:0');
  });
});

describe('parseCacheKey', () => {
  test('parses valid key', () => {
    const keyStr = 'classification:sentiment:nexus:gpt-4:1.0.0:abc123:1704067200';
    const result = parseCacheKey(keyStr);

    expect(result).not.toBeNull();
    expect(result!.taskType).toBe('sentiment');
    expect(result!.framework).toBe('nexus');
    expect(result!.model).toBe('gpt-4');
    expect(result!.promptVersion).toBe('1.0.0');
    expect(result!.commentId).toBe('abc123');
    expect(result!.editedUtc).toBe(1704067200);
  });

  test('handles none framework', () => {
    const keyStr = 'classification:sentiment:none:gpt-4:1.0.0:abc123:0';
    const result = parseCacheKey(keyStr);

    expect(result).not.toBeNull();
    expect(result!.framework).toBeNull();
  });

  test('handles zero editedUtc', () => {
    const keyStr = 'classification:target_group:jda:claude-3:2.1.0:xyz789:0';
    const result = parseCacheKey(keyStr);

    expect(result).not.toBeNull();
    expect(result!.editedUtc).toBeNull();
  });

  test('returns null for invalid key', () => {
    expect(parseCacheKey('invalid:key')).toBeNull();
    expect(parseCacheKey('')).toBeNull();
    expect(parseCacheKey('prefix:a:b:c:d:e:f:g')).toBeNull(); // Wrong prefix
  });

  test('roundtrips correctly', () => {
    const original: CacheKey = {
      commentId: 'test123',
      editedUtc: 1704067200,
      taskType: 'target_group',
      framework: 'ihra',
      model: 'gpt-4-turbo',
      promptVersion: '3.0.0',
    };

    const keyStr = buildCacheKey(original);
    const parsed = parseCacheKey(keyStr);

    expect(parsed).toEqual(original);
  });
});

describe('MockRedisClient', () => {
  let client: MockRedisClient;

  beforeEach(() => {
    client = new MockRedisClient();
    client.clear();
  });

  describe('classification cache', () => {
    test('sets and gets classification', async () => {
      const key: CacheKey = {
        commentId: 'c1',
        editedUtc: null,
        taskType: 'sentiment',
        framework: null,
        model: 'test',
        promptVersion: '1.0.0',
      };

      const result = { sentiment: 'positive', confidence: 0.9 };
      await client.setClassification(key, result);

      const cached = await client.getClassification(key);

      expect(cached).not.toBeNull();
      expect(cached!.result).toEqual(result);
    });

    test('returns null for non-existent key', async () => {
      const key: CacheKey = {
        commentId: 'nonexistent',
        editedUtc: null,
        taskType: 'sentiment',
        framework: null,
        model: 'test',
        promptVersion: '1.0.0',
      };

      const cached = await client.getClassification(key);
      expect(cached).toBeNull();
    });

    test('deletes cache entry', async () => {
      const key: CacheKey = {
        commentId: 'c1',
        editedUtc: null,
        taskType: 'sentiment',
        framework: null,
        model: 'test',
        promptVersion: '1.0.0',
      };

      await client.setClassification(key, { sentiment: 'positive' });
      await client.delete(buildCacheKey(key));

      const cached = await client.getClassification(key);
      expect(cached).toBeNull();
    });

    test('gets multiple classifications', async () => {
      const keys: CacheKey[] = [
        { commentId: 'c1', editedUtc: null, taskType: 'sentiment', framework: null, model: 'test', promptVersion: '1.0.0' },
        { commentId: 'c2', editedUtc: null, taskType: 'sentiment', framework: null, model: 'test', promptVersion: '1.0.0' },
        { commentId: 'c3', editedUtc: null, taskType: 'sentiment', framework: null, model: 'test', promptVersion: '1.0.0' },
      ];

      await client.setClassification(keys[0], { sentiment: 'positive' });
      await client.setClassification(keys[2], { sentiment: 'negative' });

      const results = await client.getMultipleClassifications(keys);

      expect(results.size).toBe(3);
      expect(results.get('c1')).not.toBeNull();
      expect(results.get('c2')).toBeNull();
      expect(results.get('c3')).not.toBeNull();
    });
  });

  describe('rate limiting', () => {
    test('tracks rate limit', async () => {
      const identifier = 'openrouter:user1';
      const limit = 10;
      const windowSeconds = 60;

      // Initial state
      const initial = await client.checkRateLimit(identifier, limit, windowSeconds);
      expect(initial.remaining).toBe(limit);

      // Increment
      await client.incrementRateLimit(identifier, windowSeconds);
      const after = await client.checkRateLimit(identifier, limit, windowSeconds);
      expect(after.remaining).toBe(limit - 1);

      // Increment more
      for (let i = 0; i < 5; i++) {
        await client.incrementRateLimit(identifier, windowSeconds);
      }
      const final = await client.checkRateLimit(identifier, limit, windowSeconds);
      expect(final.remaining).toBe(limit - 6);
    });

    test('returns zero remaining when limit exceeded', async () => {
      const identifier = 'test:limit';
      const limit = 3;

      for (let i = 0; i < 5; i++) {
        await client.incrementRateLimit(identifier, 60);
      }

      const info = await client.checkRateLimit(identifier, limit, 60);
      expect(info.remaining).toBe(0);
    });
  });

  describe('queues', () => {
    test('enqueues and dequeues items', async () => {
      const queueName = 'jobs';

      await client.enqueue(queueName, { id: 1, task: 'a' });
      await client.enqueue(queueName, { id: 2, task: 'b' });
      await client.enqueue(queueName, { id: 3, task: 'c' });

      expect(await client.queueLength(queueName)).toBe(3);

      const item1 = await client.dequeue(queueName);
      expect(item1).toEqual({ id: 1, task: 'a' });

      const item2 = await client.dequeue(queueName);
      expect(item2).toEqual({ id: 2, task: 'b' });

      expect(await client.queueLength(queueName)).toBe(1);
    });

    test('returns null for empty queue', async () => {
      const item = await client.dequeue('empty');
      expect(item).toBeNull();
    });

    test('returns zero length for non-existent queue', async () => {
      const length = await client.queueLength('nonexistent');
      expect(length).toBe(0);
    });
  });

  describe('ping', () => {
    test('returns true', async () => {
      const result = await client.ping();
      expect(result).toBe(true);
    });
  });

  describe('clear', () => {
    test('clears all storage', async () => {
      const key: CacheKey = {
        commentId: 'c1',
        editedUtc: null,
        taskType: 'sentiment',
        framework: null,
        model: 'test',
        promptVersion: '1.0.0',
      };

      await client.setClassification(key, { sentiment: 'positive' });
      await client.enqueue('jobs', { id: 1 });
      await client.incrementRateLimit('test', 60);

      client.clear();

      expect(await client.getClassification(key)).toBeNull();
      expect(await client.queueLength('jobs')).toBe(0);
    });
  });
});
