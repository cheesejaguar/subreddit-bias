import { describe, test, expect, beforeEach, beforeAll, afterAll, afterEach } from 'bun:test';
import {
  buildCacheKey,
  parseCacheKey,
  parseRedisUrl,
  createRedisClient,
  isRedisConfigured,
  UpstashRedisClient,
  RedisError,
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

/**
 * Minimal local stand-in for the Upstash Redis REST API (a hosted third-party
 * service). It speaks the same wire protocol -- POST a JSON command array,
 * receive {"result": ...} -- so UpstashRedisClient runs unmodified over HTTP.
 */
class FakeUpstash {
  readonly strings = new Map<string, { value: string; expiresAt?: number }>();
  readonly lists = new Map<string, string[]>();
  readonly commands: string[][] = [];
  authHeaders: (string | null)[] = [];
  failWith: number | null = null;
  private server!: ReturnType<typeof Bun.serve>;

  get url(): string {
    return `http://localhost:${this.server.port}`;
  }

  start(): void {
    this.server = Bun.serve({
      port: 0,
      fetch: async (req) => {
        this.authHeaders.push(req.headers.get('authorization'));
        if (this.failWith) return new Response('error', { status: this.failWith });
        const cmd = (await req.json()) as string[];
        this.commands.push(cmd);
        return Response.json({ result: this.exec(cmd) });
      },
    });
  }

  stop(): void {
    this.server.stop(true);
  }

  reset(): void {
    this.strings.clear();
    this.lists.clear();
    this.commands.length = 0;
    this.authHeaders = [];
    this.failWith = null;
  }

  private get(key: string): string | null {
    const entry = this.strings.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== undefined && entry.expiresAt <= Date.now()) {
      this.strings.delete(key);
      return null;
    }
    return entry.value;
  }

  private exec([name, ...args]: string[]): unknown {
    switch (name) {
      case 'PING':
        return 'PONG';
      case 'GET':
        return this.get(args[0]);
      case 'MGET':
        return args.map(k => this.get(k));
      case 'SET': {
        const exIdx = args.indexOf('EX');
        const expiresAt = exIdx >= 0 ? Date.now() + Number(args[exIdx + 1]) * 1000 : undefined;
        this.strings.set(args[0], { value: args[1], expiresAt });
        return 'OK';
      }
      case 'DEL':
        return this.strings.delete(args[0]) ? 1 : 0;
      case 'INCR': {
        const entry = this.strings.get(args[0]);
        const next = Number(this.get(args[0]) ?? 0) + 1;
        this.strings.set(args[0], { value: String(next), expiresAt: entry?.expiresAt });
        return next;
      }
      case 'EXPIRE': {
        const entry = this.strings.get(args[0]);
        if (!entry) return 0;
        entry.expiresAt = Date.now() + Number(args[1]) * 1000;
        return 1;
      }
      case 'TTL': {
        const entry = this.strings.get(args[0]);
        if (!entry) return -2;
        if (entry.expiresAt === undefined) return -1;
        return Math.ceil((entry.expiresAt - Date.now()) / 1000);
      }
      case 'RPUSH': {
        const list = this.lists.get(args[0]) ?? [];
        list.push(...args.slice(1));
        this.lists.set(args[0], list);
        return list.length;
      }
      case 'LPOP':
        return this.lists.get(args[0])?.shift() ?? null;
      case 'LLEN':
        return this.lists.get(args[0])?.length ?? 0;
      default:
        throw new Error(`FakeUpstash: unsupported command ${name}`);
    }
  }
}

describe('UpstashRedisClient', () => {
  const upstash = new FakeUpstash();
  let client: UpstashRedisClient;

  const sentimentKey = (commentId: string): CacheKey => ({
    commentId,
    editedUtc: null,
    taskType: 'sentiment',
    framework: null,
    model: 'test',
    promptVersion: '1.0.0',
  });

  beforeAll(() => upstash.start());
  afterAll(() => upstash.stop());

  beforeEach(() => {
    upstash.reset();
    client = new UpstashRedisClient({ url: upstash.url, token: 'secret-token' });
  });

  describe('classification cache', () => {
    test('sets and gets classification', async () => {
      const key = sentimentKey('c1');
      const result = { sentiment: 'positive', confidence: 0.9 };
      const before = Date.now();

      await client.setClassification(key, result, 60);

      // Stored under the canonical key with a server-side TTL
      const setCmd = upstash.commands[0];
      expect(setCmd[0]).toBe('SET');
      expect(setCmd[1]).toBe(buildCacheKey(key));
      expect(setCmd.slice(3)).toEqual(['EX', '60']);
      expect(upstash.authHeaders[0]).toBe('Bearer secret-token');

      const cached = await client.getClassification(key);

      expect(cached).not.toBeNull();
      expect(cached!.result).toEqual(result);
      expect(cached!.cachedAt).toBeGreaterThanOrEqual(before);
      expect(cached!.expiresAt - cached!.cachedAt).toBe(60_000);
    });

    test('returns null for non-existent key', async () => {
      const cached = await client.getClassification(sentimentKey('nonexistent'));
      expect(cached).toBeNull();
    });

    test('treats an expired payload as a miss and deletes it', async () => {
      const key = sentimentKey('c1');
      const cacheKey = buildCacheKey(key);
      upstash.strings.set(cacheKey, {
        value: JSON.stringify({ result: { sentiment: 'positive' }, cachedAt: 0, expiresAt: Date.now() - 1000 }),
      });

      expect(await client.getClassification(key)).toBeNull();
      expect(upstash.commands).toContainEqual(['DEL', cacheKey]);
      expect(upstash.strings.has(cacheKey)).toBe(false);
    });

    test('treats a corrupt payload as a miss', async () => {
      const key = sentimentKey('c1');
      upstash.strings.set(buildCacheKey(key), { value: 'not json' });

      expect(await client.getClassification(key)).toBeNull();
    });

    test('deletes cache entry', async () => {
      const key = sentimentKey('c1');

      await client.setClassification(key, { sentiment: 'positive' });
      await client.delete(buildCacheKey(key));

      const cached = await client.getClassification(key);
      expect(cached).toBeNull();
    });

    test('gets multiple classifications in one MGET', async () => {
      const keys = [sentimentKey('c1'), sentimentKey('c2'), sentimentKey('c3'), sentimentKey('c4')];

      await client.setClassification(keys[0], { sentiment: 'positive' });
      await client.setClassification(keys[2], { sentiment: 'negative' });
      upstash.strings.set(buildCacheKey(keys[3]), {
        value: JSON.stringify({ result: {}, cachedAt: 0, expiresAt: Date.now() - 1 }),
      });
      upstash.commands.length = 0;

      const results = await client.getMultipleClassifications(keys);

      expect(upstash.commands).toEqual([['MGET', ...keys.map(buildCacheKey)]]);
      expect(results.size).toBe(4);
      expect(results.get('c1')!.result).toEqual({ sentiment: 'positive' });
      expect(results.get('c2')).toBeNull();
      expect(results.get('c3')!.result).toEqual({ sentiment: 'negative' });
      expect(results.get('c4')).toBeNull(); // expired
    });

    test('makes no request for an empty key list', async () => {
      const results = await client.getMultipleClassifications([]);
      expect(results.size).toBe(0);
      expect(upstash.commands).toHaveLength(0);
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
      expect(initial.limit).toBe(limit);

      // First increment sets the window expiry
      expect(await client.incrementRateLimit(identifier, windowSeconds)).toBe(1);
      expect(upstash.commands).toContainEqual(['EXPIRE', 'ratelimit:openrouter:user1', '60']);
      const after = await client.checkRateLimit(identifier, limit, windowSeconds);
      expect(after.remaining).toBe(limit - 1);

      // Increment more
      for (let i = 0; i < 5; i++) {
        await client.incrementRateLimit(identifier, windowSeconds);
      }
      const final = await client.checkRateLimit(identifier, limit, windowSeconds);
      expect(final.remaining).toBe(limit - 6);
      expect(upstash.commands.filter(c => c[0] === 'EXPIRE')).toHaveLength(1);
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

    test('derives resetAt from the key TTL', async () => {
      await client.incrementRateLimit('ttl', 30);
      const now = Date.now();

      const info = await client.checkRateLimit('ttl', 5, 30);

      expect(info.resetAt).toBeGreaterThanOrEqual(now + 29_000);
      expect(info.resetAt).toBeLessThanOrEqual(now + 31_000);
    });
  });

  describe('queues', () => {
    test('enqueues and dequeues items', async () => {
      const queueName = 'jobs';

      await client.enqueue(queueName, { id: 1, task: 'a' });
      await client.enqueue(queueName, { id: 2, task: 'b' });
      await client.enqueue(queueName, { id: 3, task: 'c' });

      expect(upstash.commands[0]).toEqual(['RPUSH', 'queue:jobs', '{"id":1,"task":"a"}']);
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
    test('returns true when the server answers PONG', async () => {
      expect(await client.ping()).toBe(true);
    });

    test('returns false when the server errors', async () => {
      upstash.failWith = 503;
      expect(await client.ping()).toBe(false);
    });
  });

  describe('errors', () => {
    test('throws RedisError with the HTTP status on failed requests', async () => {
      upstash.failWith = 401;

      const pending = client.getClassification(sentimentKey('c1'));
      await expect(pending).rejects.toBeInstanceOf(RedisError);
      await expect(client.queueLength('jobs')).rejects.toThrow('Redis request failed: 401');
    });
  });
});

describe('parseRedisUrl', () => {
  test('parses credentials, host and port', () => {
    expect(parseRedisUrl('redis://user:pass@cache.example.com:6380/0')).toEqual({
      host: 'cache.example.com',
      port: 6380,
      password: 'pass',
      user: 'user',
    });
  });

  test('defaults port to 6379 and omits missing credentials', () => {
    expect(parseRedisUrl('redis://localhost')).toEqual({
      host: 'localhost',
      port: 6379,
      password: undefined,
      user: undefined,
    });
  });

  test('returns null for an unparseable URL', () => {
    expect(parseRedisUrl('not a url')).toBeNull();
  });
});

describe('createRedisClient / isRedisConfigured', () => {
  const ENV_KEYS = ['KV_REST_API_URL', 'KV_REST_API_TOKEN', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN'];
  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    saved = Object.fromEntries(ENV_KEYS.map(k => [k, process.env[k]]));
    for (const k of ENV_KEYS) delete process.env[k];
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  test('returns null when no REST credentials are set', () => {
    expect(isRedisConfigured()).toBe(false);
    expect(createRedisClient()).toBeNull();
  });

  test('requires both URL and token', () => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://example.upstash.io';
    expect(isRedisConfigured()).toBe(false);
    expect(createRedisClient()).toBeNull();
  });

  test('prefers Vercel KV variables over Upstash ones', async () => {
    const upstash = new FakeUpstash();
    upstash.start();
    try {
      process.env.KV_REST_API_URL = upstash.url;
      process.env.KV_REST_API_TOKEN = 'kv-token';
      process.env.UPSTASH_REDIS_REST_URL = 'http://127.0.0.1:1';
      process.env.UPSTASH_REDIS_REST_TOKEN = 'upstash-token';

      expect(isRedisConfigured()).toBe(true);
      const client = createRedisClient();
      expect(client).toBeInstanceOf(UpstashRedisClient);

      expect(await client!.ping()).toBe(true);
      expect(upstash.authHeaders).toEqual(['Bearer kv-token']);
    } finally {
      upstash.stop();
    }
  });
});
