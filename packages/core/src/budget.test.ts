import { describe, test, expect } from 'bun:test';
import {
  createBudgetUsage,
  checkBudget,
  recordLLMCall,
  recordCommentsProcessed,
  estimateCost,
  getRemainingCapacity,
  validateBudgetConfig,
  formatBudgetCheck,
  DEFAULT_BUDGET_CONFIG,
  TOKEN_PRICING,
  type BudgetConfig,
  type BudgetUsage,
} from './budget';

describe('DEFAULT_BUDGET_CONFIG', () => {
  test('has sensible defaults', () => {
    expect(DEFAULT_BUDGET_CONFIG.maxTotalCostUsd).toBe(5.0);
    expect(DEFAULT_BUDGET_CONFIG.maxTotalTokens).toBe(500000);
    expect(DEFAULT_BUDGET_CONFIG.maxLLMCallsPerTask.communitySentiment).toBe(500);
    expect(DEFAULT_BUDGET_CONFIG.maxCommentsPerDepth[0]).toBe(500);
  });
});

describe('createBudgetUsage', () => {
  test('creates empty usage tracker', () => {
    const usage = createBudgetUsage();

    expect(usage.tokensUsed).toBe(0);
    expect(usage.estimatedCost).toBe(0);
    expect(usage.llmCallsMade.communitySentiment).toBe(0);
    expect(usage.llmCallsMade.targetGroupDetection).toBe(0);
    expect(usage.llmCallsMade.moderatorSentiment).toBe(0);
    expect(Object.keys(usage.commentsProcessed).length).toBe(0);
  });
});

describe('recordLLMCall', () => {
  test('increments call count and tokens', () => {
    let usage = createBudgetUsage();

    usage = recordLLMCall(usage, 'communitySentiment', 1000, 'default');

    expect(usage.llmCallsMade.communitySentiment).toBe(1);
    expect(usage.tokensUsed).toBe(1000);
    expect(usage.estimatedCost).toBeGreaterThan(0);
  });

  test('accumulates multiple calls', () => {
    let usage = createBudgetUsage();

    usage = recordLLMCall(usage, 'communitySentiment', 500, 'default');
    usage = recordLLMCall(usage, 'communitySentiment', 500, 'default');
    usage = recordLLMCall(usage, 'targetGroupDetection', 300, 'default');

    expect(usage.llmCallsMade.communitySentiment).toBe(2);
    expect(usage.llmCallsMade.targetGroupDetection).toBe(1);
    expect(usage.tokensUsed).toBe(1300);
  });
});

describe('recordCommentsProcessed', () => {
  test('records comments by depth', () => {
    let usage = createBudgetUsage();

    usage = recordCommentsProcessed(usage, 0, 100);
    usage = recordCommentsProcessed(usage, 1, 50);
    usage = recordCommentsProcessed(usage, 0, 50);

    expect(usage.commentsProcessed[0]).toBe(150);
    expect(usage.commentsProcessed[1]).toBe(50);
  });

  test('handles new depths', () => {
    let usage = createBudgetUsage();

    usage = recordCommentsProcessed(usage, 5, 10);

    expect(usage.commentsProcessed[5]).toBe(10);
  });
});

describe('estimateCost', () => {
  test('estimates cost for default model', () => {
    const cost = estimateCost(1000, 'default');
    expect(cost).toBeGreaterThan(0);
  });

  test('estimates higher cost for expensive models', () => {
    const defaultCost = estimateCost(1000, 'default');
    const gpt4Cost = estimateCost(1000, 'gpt-4');

    expect(gpt4Cost).toBeGreaterThan(defaultCost);
  });

  test('scales linearly with tokens', () => {
    const cost1000 = estimateCost(1000, 'default');
    const cost2000 = estimateCost(2000, 'default');

    expect(cost2000).toBeCloseTo(cost1000 * 2, 10);
  });
});

describe('checkBudget', () => {
  test('returns within budget for fresh usage', () => {
    const usage = createBudgetUsage();
    const result = checkBudget(usage);

    expect(result.withinBudget).toBe(true);
    expect(result.warnings).toHaveLength(0);
    expect(result.violations).toHaveLength(0);
  });

  test('detects LLM call limit exceeded', () => {
    const usage = createBudgetUsage();
    usage.llmCallsMade.communitySentiment = 600;

    const result = checkBudget(usage);

    expect(result.withinBudget).toBe(false);
    expect(result.violations.some(v => v.includes('communitySentiment'))).toBe(true);
  });

  test('detects cost limit exceeded', () => {
    const usage = createBudgetUsage();
    usage.estimatedCost = 10.0; // Exceeds default $5 limit

    const result = checkBudget(usage);

    expect(result.withinBudget).toBe(false);
    expect(result.violations.some(v => v.includes('Cost limit'))).toBe(true);
  });

  test('detects token limit exceeded', () => {
    const usage = createBudgetUsage();
    usage.tokensUsed = 600000; // Exceeds default 500000 limit

    const result = checkBudget(usage);

    expect(result.withinBudget).toBe(false);
    expect(result.violations.some(v => v.includes('token limit'))).toBe(true);
  });

  test('warns when approaching limits', () => {
    const usage = createBudgetUsage();
    usage.tokensUsed = 480000; // 96% of limit
    usage.estimatedCost = 4.5; // 90% of limit

    const result = checkBudget(usage);

    expect(result.withinBudget).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  test('calculates remaining budget', () => {
    const usage = createBudgetUsage();
    usage.llmCallsMade.communitySentiment = 100;
    usage.tokensUsed = 100000;
    usage.estimatedCost = 1.0;

    const result = checkBudget(usage);

    expect(result.remainingBudget.llmCalls.communitySentiment).toBe(400);
    expect(result.remainingBudget.tokens).toBe(400000);
    expect(result.remainingBudget.costUsd).toBeCloseTo(4.0, 5);
  });

  test('respects custom config', () => {
    const config: BudgetConfig = {
      ...DEFAULT_BUDGET_CONFIG,
      maxTotalCostUsd: 1.0,
    };

    const usage = createBudgetUsage();
    usage.estimatedCost = 1.5;

    const result = checkBudget(usage, config);

    expect(result.withinBudget).toBe(false);
    expect(result.violations.some(v => v.includes('Cost limit'))).toBe(true);
  });
});

describe('getRemainingCapacity', () => {
  test('returns full capacity for fresh usage', () => {
    const usage = createBudgetUsage();
    const capacity = getRemainingCapacity(usage);

    expect(capacity.communitySentiment).toBeGreaterThan(0);
    expect(capacity.targetGroupDetection).toBeGreaterThan(0);
    expect(capacity.moderatorSentiment).toBeGreaterThan(0);
  });

  test('decreases with usage', () => {
    const freshUsage = createBudgetUsage();
    const freshCapacity = getRemainingCapacity(freshUsage);

    let usage = createBudgetUsage();
    usage = recordLLMCall(usage, 'communitySentiment', 1000, 'default');
    const usedCapacity = getRemainingCapacity(usage);

    expect(usedCapacity.communitySentiment).toBeLessThan(freshCapacity.communitySentiment);
  });

  test('considers both call limits and cost limits', () => {
    const usage = createBudgetUsage();
    usage.estimatedCost = 4.99; // Almost at limit

    const capacity = getRemainingCapacity(usage);

    // Should be limited by cost, not calls
    expect(capacity.communitySentiment).toBeLessThan(500);
  });
});

describe('validateBudgetConfig', () => {
  test('returns no errors for valid config', () => {
    const errors = validateBudgetConfig(DEFAULT_BUDGET_CONFIG);
    expect(errors).toHaveLength(0);
  });

  test('validates maxTotalCostUsd', () => {
    const errors = validateBudgetConfig({ maxTotalCostUsd: -1 });
    expect(errors).toContain('maxTotalCostUsd cannot be negative');
  });

  test('validates maxTotalTokens', () => {
    const errors = validateBudgetConfig({ maxTotalTokens: 500 });
    expect(errors).toContain('maxTotalTokens must be at least 1000');
  });

  test('validates maxTokensPerRequest', () => {
    const errors = validateBudgetConfig({ maxTokensPerRequest: 50 });
    expect(errors).toContain('maxTokensPerRequest must be at least 100');
  });

  test('validates negative LLM call limits', () => {
    const errors = validateBudgetConfig({
      maxLLMCallsPerTask: {
        communitySentiment: -1,
        targetGroupDetection: 100,
        moderatorSentiment: 50,
      },
    });
    expect(errors.some(e => e.includes('communitySentiment'))).toBe(true);
  });
});

describe('formatBudgetCheck', () => {
  test('formats result as readable text', () => {
    const usage = createBudgetUsage();
    usage.tokensUsed = 10000;
    usage.estimatedCost = 0.5;
    usage.llmCallsMade.communitySentiment = 50;

    const result = checkBudget(usage);
    const formatted = formatBudgetCheck(result);

    expect(formatted).toContain('Budget Status: Within Budget');
    expect(formatted).toContain('Tokens: 10,000');
    expect(formatted).toContain('Community Sentiment: 50');
  });

  test('includes warnings when present', () => {
    const usage = createBudgetUsage();
    usage.estimatedCost = 4.5; // 90% of limit

    const result = checkBudget(usage);
    const formatted = formatBudgetCheck(result);

    expect(formatted).toContain('Warnings:');
    expect(formatted).toContain('approaching limit');
  });

  test('includes violations when present', () => {
    const usage = createBudgetUsage();
    usage.estimatedCost = 10.0; // Over limit

    const result = checkBudget(usage);
    const formatted = formatBudgetCheck(result);

    expect(formatted).toContain('OVER BUDGET');
    expect(formatted).toContain('Violations:');
  });
});

describe('TOKEN_PRICING', () => {
  test('has pricing for common models', () => {
    expect(TOKEN_PRICING['gpt-4']).toBeDefined();
    expect(TOKEN_PRICING['gpt-3.5-turbo']).toBeDefined();
    expect(TOKEN_PRICING['claude-3-opus']).toBeDefined();
    expect(TOKEN_PRICING['default']).toBeDefined();
  });

  test('default pricing is reasonable', () => {
    expect(TOKEN_PRICING.default.input).toBeGreaterThan(0);
    expect(TOKEN_PRICING.default.output).toBeGreaterThan(0);
  });
});
