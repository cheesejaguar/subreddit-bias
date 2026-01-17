/**
 * Upstash Redis Cache Integration
 * Provides caching layer for classification results and rate limiting
 */

import type { TaskType, FrameworkType } from './types';

// Redis configuration
export interface RedisConfig {
  url: string;
  token: string;
}

// Cache key builder
export interface CacheKey {
  commentId: string;
  editedUtc: number | null;
  taskType: TaskType;
  framework: FrameworkType | null;
  model: string;
  promptVersion: string;
}

// Cached classification result
export interface CachedClassification {
  result: object;
  cachedAt: number;
  expiresAt: number;
}

// Rate limit info
export interface RateLimitInfo {
  remaining: number;
  limit: number;
  resetAt: number;
}

/**
 * Build a cache key string from components
 */
export function buildCacheKey(key: CacheKey): string {
  return `classification:${key.taskType}:${key.framework ?? 'none'}:${key.model}:${key.promptVersion}:${key.commentId}:${key.editedUtc ?? 0}`;
}

/**
 * Parse a cache key string back to components
 */
export function parseCacheKey(keyStr: string): CacheKey | null {
  const parts = keyStr.split(':');
  if (parts.length !== 7 || parts[0] !== 'classification') {
    return null;
  }

  return {
    taskType: parts[1] as TaskType,
    framework: parts[2] === 'none' ? null : (parts[2] as FrameworkType),
    model: parts[3],
    promptVersion: parts[4],
    commentId: parts[5],
    editedUtc: parts[6] === '0' ? null : parseInt(parts[6], 10),
  };
}

/**
 * Redis cache client using Upstash REST API
 */
export class UpstashRedisClient {
  private config: RedisConfig;

  constructor(config: RedisConfig) {
    this.config = config;
  }

  /**
   * Make a request to Upstash REST API
   */
  private async request(command: string[]): Promise<{ result: unknown }> {
    const response = await fetch(this.config.url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(command),
    });

    if (!response.ok) {
      throw new RedisError(`Redis request failed: ${response.status}`);
    }

    return await response.json();
  }

  /**
   * Get a cached classification
   */
  async getClassification(key: CacheKey): Promise<CachedClassification | null> {
    const cacheKey = buildCacheKey(key);
    const { result } = await this.request(['GET', cacheKey]);

    if (!result) {
      return null;
    }

    try {
      const cached = JSON.parse(result as string) as CachedClassification;

      // Check expiration
      if (cached.expiresAt && cached.expiresAt < Date.now()) {
        await this.delete(cacheKey);
        return null;
      }

      return cached;
    } catch {
      return null;
    }
  }

  /**
   * Set a cached classification
   */
  async setClassification(
    key: CacheKey,
    result: object,
    ttlSeconds: number = 86400 * 7 // 7 days default
  ): Promise<void> {
    const cacheKey = buildCacheKey(key);
    const now = Date.now();

    const cached: CachedClassification = {
      result,
      cachedAt: now,
      expiresAt: now + ttlSeconds * 1000,
    };

    await this.request(['SET', cacheKey, JSON.stringify(cached), 'EX', ttlSeconds.toString()]);
  }

  /**
   * Delete a cache entry
   */
  async delete(key: string): Promise<void> {
    await this.request(['DEL', key]);
  }

  /**
   * Get multiple cached classifications
   */
  async getMultipleClassifications(keys: CacheKey[]): Promise<Map<string, CachedClassification | null>> {
    const results = new Map<string, CachedClassification | null>();

    // Batch get using MGET
    if (keys.length === 0) {
      return results;
    }

    const cacheKeys = keys.map(buildCacheKey);
    const { result } = await this.request(['MGET', ...cacheKeys]);

    const values = result as (string | null)[];
    const now = Date.now();

    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const value = values[i];

      if (!value) {
        results.set(key.commentId, null);
        continue;
      }

      try {
        const cached = JSON.parse(value) as CachedClassification;

        if (cached.expiresAt && cached.expiresAt < now) {
          results.set(key.commentId, null);
        } else {
          results.set(key.commentId, cached);
        }
      } catch {
        results.set(key.commentId, null);
      }
    }

    return results;
  }

  /**
   * Check rate limit for OpenRouter API
   */
  async checkRateLimit(identifier: string, limit: number, windowSeconds: number): Promise<RateLimitInfo> {
    const key = `ratelimit:${identifier}`;
    const now = Date.now();
    const windowMs = windowSeconds * 1000;

    // Get current count
    const { result: currentStr } = await this.request(['GET', key]);
    const current = currentStr ? parseInt(currentStr as string, 10) : 0;

    // Get TTL
    const { result: ttlResult } = await this.request(['TTL', key]);
    const ttl = ttlResult as number;

    const resetAt = ttl > 0 ? now + ttl * 1000 : now + windowMs;

    return {
      remaining: Math.max(0, limit - current),
      limit,
      resetAt,
    };
  }

  /**
   * Increment rate limit counter
   */
  async incrementRateLimit(identifier: string, windowSeconds: number): Promise<number> {
    const key = `ratelimit:${identifier}`;

    // INCR and set expiry if new
    const { result } = await this.request(['INCR', key]);
    const count = result as number;

    if (count === 1) {
      await this.request(['EXPIRE', key, windowSeconds.toString()]);
    }

    return count;
  }

  /**
   * Add item to a queue
   */
  async enqueue(queueName: string, item: object): Promise<void> {
    const key = `queue:${queueName}`;
    await this.request(['RPUSH', key, JSON.stringify(item)]);
  }

  /**
   * Get item from a queue
   */
  async dequeue(queueName: string): Promise<object | null> {
    const key = `queue:${queueName}`;
    const { result } = await this.request(['LPOP', key]);

    if (!result) {
      return null;
    }

    try {
      return JSON.parse(result as string);
    } catch {
      return null;
    }
  }

  /**
   * Get queue length
   */
  async queueLength(queueName: string): Promise<number> {
    const key = `queue:${queueName}`;
    const { result } = await this.request(['LLEN', key]);
    return result as number;
  }

  /**
   * Ping the Redis server
   */
  async ping(): Promise<boolean> {
    try {
      const { result } = await this.request(['PING']);
      return result === 'PONG';
    } catch {
      return false;
    }
  }
}

// Custom error
export class RedisError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RedisError';
  }
}

/**
 * Parse a Redis URL into components
 * Supports: redis://user:password@host:port/db
 */
export function parseRedisUrl(url: string): { host: string; port: number; password?: string; user?: string } | null {
  try {
    const parsed = new URL(url);
    return {
      host: parsed.hostname,
      port: parseInt(parsed.port || '6379', 10),
      password: parsed.password || undefined,
      user: parsed.username || undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Create a Redis client from environment variables
 * Supports Vercel KV / Upstash REST API format
 */
export function createRedisClient(): UpstashRedisClient | null {
  // Check for Vercel KV / Upstash REST API format
  // Priority: KV_REST_API_URL > UPSTASH_REDIS_REST_URL
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

  if (url && token) {
    return new UpstashRedisClient({ url, token });
  }

  return null;
}

/**
 * Check if Redis is configured
 */
export function isRedisConfigured(): boolean {
  return !!(
    (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) ||
    (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN)
  );
}

/**
 * In-memory Redis mock for testing
 */
export class MockRedisClient {
  private storage: Map<string, { value: string; expiresAt?: number }> = new Map();
  private queues: Map<string, string[]> = new Map();

  async getClassification(key: CacheKey): Promise<CachedClassification | null> {
    const cacheKey = buildCacheKey(key);
    const entry = this.storage.get(cacheKey);

    if (!entry) {
      return null;
    }

    if (entry.expiresAt && entry.expiresAt < Date.now()) {
      this.storage.delete(cacheKey);
      return null;
    }

    try {
      return JSON.parse(entry.value);
    } catch {
      return null;
    }
  }

  async setClassification(key: CacheKey, result: object, ttlSeconds: number = 86400 * 7): Promise<void> {
    const cacheKey = buildCacheKey(key);
    const now = Date.now();

    const cached: CachedClassification = {
      result,
      cachedAt: now,
      expiresAt: now + ttlSeconds * 1000,
    };

    this.storage.set(cacheKey, {
      value: JSON.stringify(cached),
      expiresAt: cached.expiresAt,
    });
  }

  async delete(key: string): Promise<void> {
    this.storage.delete(key);
  }

  async getMultipleClassifications(keys: CacheKey[]): Promise<Map<string, CachedClassification | null>> {
    const results = new Map<string, CachedClassification | null>();

    for (const key of keys) {
      const cached = await this.getClassification(key);
      results.set(key.commentId, cached);
    }

    return results;
  }

  async checkRateLimit(identifier: string, limit: number, windowSeconds: number): Promise<RateLimitInfo> {
    const key = `ratelimit:${identifier}`;
    const entry = this.storage.get(key);

    const now = Date.now();
    const windowMs = windowSeconds * 1000;

    if (!entry || (entry.expiresAt && entry.expiresAt < now)) {
      return {
        remaining: limit,
        limit,
        resetAt: now + windowMs,
      };
    }

    const current = parseInt(entry.value, 10);
    return {
      remaining: Math.max(0, limit - current),
      limit,
      resetAt: entry.expiresAt ?? now + windowMs,
    };
  }

  async incrementRateLimit(identifier: string, windowSeconds: number): Promise<number> {
    const key = `ratelimit:${identifier}`;
    const now = Date.now();
    const entry = this.storage.get(key);

    let count: number;

    if (!entry || (entry.expiresAt && entry.expiresAt < now)) {
      count = 1;
      this.storage.set(key, {
        value: '1',
        expiresAt: now + windowSeconds * 1000,
      });
    } else {
      count = parseInt(entry.value, 10) + 1;
      entry.value = count.toString();
    }

    return count;
  }

  async enqueue(queueName: string, item: object): Promise<void> {
    const key = `queue:${queueName}`;
    const queue = this.queues.get(key) ?? [];
    queue.push(JSON.stringify(item));
    this.queues.set(key, queue);
  }

  async dequeue(queueName: string): Promise<object | null> {
    const key = `queue:${queueName}`;
    const queue = this.queues.get(key);

    if (!queue || queue.length === 0) {
      return null;
    }

    const item = queue.shift()!;
    return JSON.parse(item);
  }

  async queueLength(queueName: string): Promise<number> {
    const key = `queue:${queueName}`;
    return this.queues.get(key)?.length ?? 0;
  }

  async ping(): Promise<boolean> {
    return true;
  }

  clear(): void {
    this.storage.clear();
    this.queues.clear();
  }
}
