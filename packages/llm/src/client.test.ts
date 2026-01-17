import { describe, test, expect } from 'bun:test';
import {
  OpenRouterClient,
  createOpenRouterClient,
  MockOpenRouterClient,
} from './client';

describe('OpenRouterClient', () => {
  test('can be instantiated with config', () => {
    const client = new OpenRouterClient({
      apiKey: 'test-key',
      baseUrl: 'https://test.api',
      defaultModel: 'test-model',
    });

    expect(client).toBeInstanceOf(OpenRouterClient);
  });

  test('uses default values when not provided', () => {
    const client = new OpenRouterClient({
      apiKey: 'test-key',
    });

    expect(client).toBeInstanceOf(OpenRouterClient);
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
    test('resets statistics', () => {
      const client = new OpenRouterClient({ apiKey: 'test-key' });
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

describe('MockOpenRouterClient', () => {
  test('can be instantiated', () => {
    const client = new MockOpenRouterClient();
    expect(client).toBeInstanceOf(MockOpenRouterClient);
  });

  test('returns default mock response', async () => {
    const client = new MockOpenRouterClient();
    const result = await client.chatCompletion([
      { role: 'user', content: 'Test message' },
    ]);

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data?.choices[0].message.content).toBe('[]');
    expect(result.tokensUsed).toBe(100);
  });

  test('can set custom mock response', async () => {
    const client = new MockOpenRouterClient();

    const mockResponse = {
      id: 'mock-123',
      choices: [
        {
          message: {
            role: 'assistant' as const,
            content: '{"result": "custom"}',
          },
          finish_reason: 'stop',
        },
      ],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 20,
        total_tokens: 30,
      },
      model: 'mock-model',
    };

    client.setMockResponse('Custom prompt', mockResponse);

    const result = await client.chatCompletion([
      { role: 'user', content: 'Custom prompt' },
    ]);

    expect(result.success).toBe(true);
    expect(result.data?.choices[0].message.content).toBe('{"result": "custom"}');
    expect(result.tokensUsed).toBe(30);
  });
});
