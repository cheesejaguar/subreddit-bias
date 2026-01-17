/**
 * OpenRouter client for LLM API calls
 * Provides OpenAI-compatible interface with rate limiting and error handling
 */

// OpenRouter API types
export interface OpenRouterMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface OpenRouterRequest {
  model: string;
  messages: OpenRouterMessage[];
  temperature?: number;
  max_tokens?: number;
  response_format?: { type: 'json_object' };
}

export interface OpenRouterResponse {
  id: string;
  choices: Array<{
    message: {
      role: 'assistant';
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  model: string;
}

export interface OpenRouterError {
  error: {
    message: string;
    type: string;
    code: string;
  };
}

// Client configuration
export interface OpenRouterClientConfig {
  apiKey: string;
  baseUrl?: string;
  defaultModel?: string;
  timeout?: number;
  maxRetries?: number;
  retryDelay?: number;
}

// Rate limit tracking
export interface RateLimitInfo {
  limit: number;
  remaining: number;
  reset: number;
}

// Request result
export interface RequestResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  tokensUsed: number;
  rateLimitInfo?: RateLimitInfo;
  retryAfter?: number;
}

// Default configuration
const DEFAULT_CONFIG = {
  baseUrl: 'https://openrouter.ai/api/v1',
  defaultModel: 'openai/gpt-4o-mini',
  timeout: 60000,
  maxRetries: 3,
  retryDelay: 1000,
};

// Model pricing (per 1M tokens)
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'openai/gpt-4o-mini': { input: 0.15, output: 0.6 },
  'openai/gpt-4o': { input: 2.5, output: 10 },
  'openai/gpt-3.5-turbo': { input: 0.5, output: 1.5 },
  'anthropic/claude-3-haiku': { input: 0.25, output: 1.25 },
  'anthropic/claude-3-sonnet': { input: 3, output: 15 },
};

/**
 * OpenRouter API client
 */
export class OpenRouterClient {
  private config: Required<OpenRouterClientConfig>;
  private rateLimitInfo: RateLimitInfo | null = null;
  private requestCount: number = 0;
  private totalTokensUsed: number = 0;

  constructor(config: OpenRouterClientConfig) {
    this.config = {
      apiKey: config.apiKey,
      baseUrl: config.baseUrl ?? DEFAULT_CONFIG.baseUrl,
      defaultModel: config.defaultModel ?? DEFAULT_CONFIG.defaultModel,
      timeout: config.timeout ?? DEFAULT_CONFIG.timeout,
      maxRetries: config.maxRetries ?? DEFAULT_CONFIG.maxRetries,
      retryDelay: config.retryDelay ?? DEFAULT_CONFIG.retryDelay,
    };
  }

  /**
   * Make a chat completion request
   */
  async chatCompletion(
    messages: OpenRouterMessage[],
    options?: {
      model?: string;
      temperature?: number;
      maxTokens?: number;
      jsonMode?: boolean;
    }
  ): Promise<RequestResult<OpenRouterResponse>> {
    const model = options?.model ?? this.config.defaultModel;
    const request: OpenRouterRequest = {
      model,
      messages,
      temperature: options?.temperature ?? 0.1,
      max_tokens: options?.maxTokens ?? 4096,
    };

    if (options?.jsonMode) {
      request.response_format = { type: 'json_object' };
    }

    return this.makeRequest<OpenRouterResponse>(request);
  }

  /**
   * Make a request with retry logic
   */
  private async makeRequest<T>(request: OpenRouterRequest): Promise<RequestResult<T>> {
    let lastError: string = 'Unknown error';
    let tokensUsed = 0;

    for (let attempt = 0; attempt < this.config.maxRetries; attempt++) {
      try {
        const response = await this.executeRequest(request);

        if (response.ok) {
          const data = (await response.json()) as OpenRouterResponse;
          tokensUsed = data.usage?.total_tokens ?? 0;
          this.totalTokensUsed += tokensUsed;
          this.requestCount++;

          // Parse rate limit headers
          this.updateRateLimitInfo(response.headers);

          return {
            success: true,
            data: data as T,
            tokensUsed,
            rateLimitInfo: this.rateLimitInfo ?? undefined,
          };
        }

        // Handle error responses
        const errorData = (await response.json()) as OpenRouterError;
        lastError = errorData.error?.message ?? `HTTP ${response.status}`;

        // Check for rate limiting
        if (response.status === 429) {
          const retryAfter = parseInt(response.headers.get('retry-after') ?? '60', 10);
          if (attempt < this.config.maxRetries - 1) {
            await this.sleep(retryAfter * 1000);
            continue;
          }
          return {
            success: false,
            error: lastError,
            tokensUsed: 0,
            retryAfter,
          };
        }

        // Don't retry client errors (except rate limits)
        if (response.status >= 400 && response.status < 500) {
          return {
            success: false,
            error: lastError,
            tokensUsed: 0,
          };
        }

        // Retry server errors
        if (attempt < this.config.maxRetries - 1) {
          await this.sleep(this.config.retryDelay * Math.pow(2, attempt));
        }
      } catch (error) {
        lastError = error instanceof Error ? error.message : 'Network error';
        if (attempt < this.config.maxRetries - 1) {
          await this.sleep(this.config.retryDelay * Math.pow(2, attempt));
        }
      }
    }

    return {
      success: false,
      error: lastError,
      tokensUsed: 0,
    };
  }

  /**
   * Execute the actual HTTP request
   */
  private async executeRequest(request: OpenRouterRequest): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      return await fetch(`${this.config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`,
          'HTTP-Referer': 'https://subreddit-bias.vercel.app',
          'X-Title': 'Subreddit Bias Analyzer',
        },
        body: JSON.stringify(request),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Update rate limit info from response headers
   */
  private updateRateLimitInfo(headers: Headers): void {
    const limit = headers.get('x-ratelimit-limit');
    const remaining = headers.get('x-ratelimit-remaining');
    const reset = headers.get('x-ratelimit-reset');

    if (limit && remaining && reset) {
      this.rateLimitInfo = {
        limit: parseInt(limit, 10),
        remaining: parseInt(remaining, 10),
        reset: parseInt(reset, 10),
      };
    }
  }

  /**
   * Sleep for a given duration
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Calculate cost for a request
   */
  calculateCost(model: string, inputTokens: number, outputTokens: number): number {
    const pricing = MODEL_PRICING[model] ?? MODEL_PRICING['openai/gpt-4o-mini'];
    return (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000;
  }

  /**
   * Get statistics
   */
  getStats(): {
    requestCount: number;
    totalTokensUsed: number;
    rateLimitInfo: RateLimitInfo | null;
  } {
    return {
      requestCount: this.requestCount,
      totalTokensUsed: this.totalTokensUsed,
      rateLimitInfo: this.rateLimitInfo,
    };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.requestCount = 0;
    this.totalTokensUsed = 0;
  }

  /**
   * Check if rate limited
   */
  isRateLimited(): boolean {
    return this.rateLimitInfo !== null && this.rateLimitInfo.remaining === 0;
  }

  /**
   * Get remaining rate limit
   */
  getRemainingRequests(): number {
    return this.rateLimitInfo?.remaining ?? Infinity;
  }
}

/**
 * Create OpenRouter client from environment
 */
export function createOpenRouterClient(apiKey?: string): OpenRouterClient {
  const key = apiKey ?? process.env.OPENROUTER_API_KEY;
  if (!key) {
    throw new Error('OpenRouter API key is required');
  }
  return new OpenRouterClient({ apiKey: key });
}

/**
 * Mock client for testing
 */
export class MockOpenRouterClient extends OpenRouterClient {
  private mockResponses: Map<string, OpenRouterResponse> = new Map();

  constructor() {
    super({ apiKey: 'mock-key' });
  }

  setMockResponse(prompt: string, response: OpenRouterResponse): void {
    this.mockResponses.set(prompt, response);
  }

  override async chatCompletion(
    messages: OpenRouterMessage[],
    _options?: {
      model?: string;
      temperature?: number;
      maxTokens?: number;
      jsonMode?: boolean;
    }
  ): Promise<RequestResult<OpenRouterResponse>> {
    const lastMessage = messages[messages.length - 1];
    const mockResponse = this.mockResponses.get(lastMessage.content);

    if (mockResponse) {
      return {
        success: true,
        data: mockResponse,
        tokensUsed: mockResponse.usage?.total_tokens ?? 100,
      };
    }

    // Default mock response
    return {
      success: true,
      data: {
        id: 'mock-id',
        choices: [
          {
            message: {
              role: 'assistant',
              content: '[]',
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 50,
          completion_tokens: 50,
          total_tokens: 100,
        },
        model: 'mock-model',
      },
      tokensUsed: 100,
    };
  }
}
