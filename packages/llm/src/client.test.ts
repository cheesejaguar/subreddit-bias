import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import {
  OpenRouterClient,
  createOpenRouterClient,
  type OpenRouterResponse,
} from './client';

/**
 * Local HTTP stand-in for the OpenRouter API (a paid third-party LLM provider).
 * The real client code runs end to end over real HTTP; each test queues the
 * responses the "provider" should return and inspects the requests it received.
 */
interface RecordedRequest {
  method: string;
  path: string;
  headers: Headers;
  body: any;
}

let server: ReturnType<typeof Bun.serve>;
let baseUrl: string;
let requests: RecordedRequest[] = [];
let replies: Array<() => Response> = [];

const completion = (content: string, totalTokens = 30): OpenRouterResponse => ({
  id: 'gen-1',
  choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }],
  usage: { prompt_tokens: totalTokens - 10, completion_tokens: 10, total_tokens: totalTokens },
  model: 'openai/gpt-4o-mini',
});

beforeAll(() => {
  server = Bun.serve({
    port: 0,
    async fetch(req) {
      const url = new URL(req.url);
      requests.push({
        method: req.method,
        path: url.pathname,
        headers: req.headers,
        body: await req.json().catch(() => null),
      });
      const next = replies.shift();
      return next ? next() : Response.json(completion('[]'));
    },
  });
  baseUrl = `http://localhost:${server.port}/api/v1`;
});

afterAll(() => {
  server.stop(true);
});

beforeEach(() => {
  requests = [];
  replies = [];
});

const testClient = (overrides: Partial<ConstructorParameters<typeof OpenRouterClient>[0]> = {}) =>
  new OpenRouterClient({ apiKey: 'test-key', baseUrl, retryDelay: 1, ...overrides });

describe('OpenRouterClient', () => {
  describe('chatCompletion', () => {
    test('sends an authenticated request with default model and parameters', async () => {
      const client = testClient();
      await client.chatCompletion([{ role: 'user', content: 'Hello' }]);

      expect(requests).toHaveLength(1);
      const req = requests[0];
      expect(req.method).toBe('POST');
      expect(req.path).toBe('/api/v1/chat/completions');
      expect(req.headers.get('authorization')).toBe('Bearer test-key');
      expect(req.headers.get('content-type')).toBe('application/json');
      expect(req.headers.get('x-title')).toBe('Subreddit Bias Analyzer');
      expect(req.body).toEqual({
        model: 'openai/gpt-4o-mini',
        messages: [{ role: 'user', content: 'Hello' }],
        temperature: 0.1,
        max_tokens: 4096,
      });
    });

    test('uses configured default model and per-call options', async () => {
      const client = testClient({ defaultModel: 'test-model' });

      await client.chatCompletion([{ role: 'user', content: 'a' }]);
      await client.chatCompletion([{ role: 'user', content: 'b' }], {
        model: 'openai/gpt-4o',
        temperature: 0.7,
        maxTokens: 100,
        jsonMode: true,
      });

      expect(requests[0].body.model).toBe('test-model');
      expect(requests[0].body.response_format).toBeUndefined();
      expect(requests[1].body).toMatchObject({
        model: 'openai/gpt-4o',
        temperature: 0.7,
        max_tokens: 100,
        response_format: { type: 'json_object' },
      });
    });

    test('returns parsed data, tracks tokens and reads rate limit headers', async () => {
      replies.push(() =>
        Response.json(completion('{"ok":true}', 42), {
          headers: {
            'x-ratelimit-limit': '100',
            'x-ratelimit-remaining': '0',
            'x-ratelimit-reset': '1700000000',
          },
        })
      );
      const client = testClient();

      const result = await client.chatCompletion([{ role: 'user', content: 'Hi' }]);

      expect(result.success).toBe(true);
      expect(result.data?.choices[0].message.content).toBe('{"ok":true}');
      expect(result.tokensUsed).toBe(42);
      expect(result.rateLimitInfo).toEqual({ limit: 100, remaining: 0, reset: 1700000000 });
      expect(client.getStats()).toEqual({
        requestCount: 1,
        totalTokensUsed: 42,
        rateLimitInfo: { limit: 100, remaining: 0, reset: 1700000000 },
      });
      expect(client.isRateLimited()).toBe(true);
      expect(client.getRemainingRequests()).toBe(0);
    });

    test('does not retry client errors and surfaces the API message', async () => {
      replies.push(() =>
        Response.json({ error: { message: 'Invalid API key', type: 'auth', code: '401' } }, { status: 401 })
      );
      const client = testClient();

      const result = await client.chatCompletion([{ role: 'user', content: 'Hi' }]);

      expect(result).toEqual({ success: false, error: 'Invalid API key', tokensUsed: 0 });
      expect(requests).toHaveLength(1);
      expect(client.getStats().requestCount).toBe(0);
    });

    test('retries server errors and succeeds on a later attempt', async () => {
      replies.push(() => Response.json({ error: { message: 'Upstream down' } }, { status: 502 }));
      replies.push(() => Response.json(completion('[]', 10)));
      const client = testClient();

      const result = await client.chatCompletion([{ role: 'user', content: 'Hi' }]);

      expect(result.success).toBe(true);
      expect(result.tokensUsed).toBe(10);
      expect(requests).toHaveLength(2);
    });

    test('gives up after maxRetries server errors', async () => {
      for (let i = 0; i < 3; i++) {
        replies.push(() => Response.json({ error: { message: 'Upstream down' } }, { status: 500 }));
      }
      const client = testClient({ maxRetries: 3 });

      const result = await client.chatCompletion([{ role: 'user', content: 'Hi' }]);

      expect(result).toEqual({ success: false, error: 'Upstream down', tokensUsed: 0 });
      expect(requests).toHaveLength(3);
    });

    test('retries after a 429 and reports retryAfter when attempts run out', async () => {
      const rateLimited = () =>
        Response.json({ error: { message: 'Rate limited' } }, { status: 429, headers: { 'retry-after': '0' } });
      replies.push(rateLimited, rateLimited);
      const client = testClient({ maxRetries: 2 });

      const result = await client.chatCompletion([{ role: 'user', content: 'Hi' }]);

      expect(result).toEqual({ success: false, error: 'Rate limited', tokensUsed: 0, retryAfter: 0 });
      expect(requests).toHaveLength(2);
    });

    test('reports network errors after retrying', async () => {
      // Nothing listens on this port once the probe server is stopped
      const probe = Bun.serve({ port: 0, fetch: () => new Response('') });
      const deadUrl = `http://localhost:${probe.port}`;
      probe.stop(true);

      const client = testClient({ baseUrl: deadUrl, maxRetries: 2 });
      const result = await client.chatCompletion([{ role: 'user', content: 'Hi' }]);

      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
      expect(result.tokensUsed).toBe(0);
    });
  });

  describe('getStats', () => {
    test('returns initial stats', () => {
      const client = new OpenRouterClient({ apiKey: 'test-key' });
      const stats = client.getStats();

      expect(stats.requestCount).toBe(0);
      expect(stats.totalTokensUsed).toBe(0);
      expect(stats.rateLimitInfo).toBeNull();
    });
  });

  describe('resetStats', () => {
    test('resets request and token counters after use', async () => {
      replies.push(() => Response.json(completion('[]', 25)));
      const client = testClient();
      await client.chatCompletion([{ role: 'user', content: 'Hi' }]);
      expect(client.getStats().totalTokensUsed).toBe(25);

      client.resetStats();
      const stats = client.getStats();

      expect(stats.requestCount).toBe(0);
      expect(stats.totalTokensUsed).toBe(0);
    });
  });

  describe('isRateLimited', () => {
    test('returns false initially', () => {
      const client = new OpenRouterClient({ apiKey: 'test-key' });
      expect(client.isRateLimited()).toBe(false);
    });
  });

  describe('getRemainingRequests', () => {
    test('returns Infinity initially', () => {
      const client = new OpenRouterClient({ apiKey: 'test-key' });
      expect(client.getRemainingRequests()).toBe(Infinity);
    });
  });

  describe('calculateCost', () => {
    test('calculates cost for gpt-4o-mini', () => {
      const client = new OpenRouterClient({ apiKey: 'test-key' });
      const cost = client.calculateCost('openai/gpt-4o-mini', 1000, 500);

      // 1000 * 0.15/1M + 500 * 0.6/1M = 0.00015 + 0.0003 = 0.00045
      expect(cost).toBeCloseTo(0.00045, 5);
    });

    test('calculates cost for gpt-4o', () => {
      const client = new OpenRouterClient({ apiKey: 'test-key' });
      const cost = client.calculateCost('openai/gpt-4o', 1000, 500);

      // 1000 * 2.5/1M + 500 * 10/1M = 0.0025 + 0.005 = 0.0075
      expect(cost).toBeCloseTo(0.0075, 5);
    });

    test('uses default pricing for unknown models', () => {
      const client = new OpenRouterClient({ apiKey: 'test-key' });
      const cost = client.calculateCost('unknown/model', 1000, 500);

      // Uses gpt-4o-mini pricing
      expect(cost).toBeCloseTo(0.00045, 5);
    });
  });
});

describe('createOpenRouterClient', () => {
  test('creates client with provided API key', () => {
    const client = createOpenRouterClient('test-api-key');
    expect(client).toBeInstanceOf(OpenRouterClient);
  });

  test('throws error when no API key provided', () => {
    // Save original env value
    const originalKey = process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_API_KEY;

    expect(() => createOpenRouterClient()).toThrow('OpenRouter API key is required');

    // Restore original env value
    if (originalKey) {
      process.env.OPENROUTER_API_KEY = originalKey;
    }
  });
});
