/**
 * Budget and Cost Cap Enforcement
 * RALPH.md Section 8: Cost minimization (hard requirements)
 */

// Budget configuration
export interface BudgetConfig {
  // Maximum comments sent to OpenRouter per depth level
  maxCommentsPerDepth: Record<number, number>;

  // Maximum LLM calls per task type
  maxLLMCallsPerTask: {
    communitySentiment: number;
    targetGroupDetection: number;
    moderatorSentiment: number;
  };

  // Maximum total cost in USD
  maxTotalCostUsd: number;

  // Token limits
  maxTokensPerRequest: number;
  maxTotalTokens: number;
}

// Budget usage tracking
export interface BudgetUsage {
  commentsProcessed: Record<number, number>; // By depth
  llmCallsMade: {
    communitySentiment: number;
    targetGroupDetection: number;
    moderatorSentiment: number;
  };
  tokensUsed: number;
  estimatedCost: number;
}

// Budget check result
export interface BudgetCheckResult {
  withinBudget: boolean;
  warnings: string[];
  violations: string[];
  usage: BudgetUsage;
  remainingBudget: {
    llmCalls: {
      communitySentiment: number;
      targetGroupDetection: number;
      moderatorSentiment: number;
    };
    tokens: number;
    costUsd: number;
  };
}

// Default budget configuration
export const DEFAULT_BUDGET_CONFIG: BudgetConfig = {
  maxCommentsPerDepth: {
    0: 500,  // Top-level comments
    1: 300,  // First-level replies
    2: 100,  // Second-level replies
  },
  maxLLMCallsPerTask: {
    communitySentiment: 500,
    targetGroupDetection: 300,
    moderatorSentiment: 100,
  },
  maxTotalCostUsd: 5.0,
  maxTokensPerRequest: 4000,
  maxTotalTokens: 500000,
};

// Pricing per 1000 tokens (approximate, varies by model)
export const TOKEN_PRICING = {
  'gpt-4-turbo': { input: 0.01, output: 0.03 },
  'gpt-4': { input: 0.03, output: 0.06 },
  'gpt-3.5-turbo': { input: 0.0005, output: 0.0015 },
  'claude-3-opus': { input: 0.015, output: 0.075 },
  'claude-3-sonnet': { input: 0.003, output: 0.015 },
  'claude-3-haiku': { input: 0.00025, output: 0.00125 },
  'default': { input: 0.001, output: 0.002 },
} as const;

/**
 * Create initial budget usage tracker
 */
export function createBudgetUsage(): BudgetUsage {
  return {
    commentsProcessed: {},
    llmCallsMade: {
      communitySentiment: 0,
      targetGroupDetection: 0,
      moderatorSentiment: 0,
    },
    tokensUsed: 0,
    estimatedCost: 0,
  };
}

/**
 * Check if an operation is within budget
 */
export function checkBudget(
  usage: BudgetUsage,
  config: BudgetConfig = DEFAULT_BUDGET_CONFIG
): BudgetCheckResult {
  const warnings: string[] = [];
  const violations: string[] = [];

  // Check LLM calls per task
  for (const [task, limit] of Object.entries(config.maxLLMCallsPerTask)) {
    const used = usage.llmCallsMade[task as keyof typeof usage.llmCallsMade];
    const remaining = limit - used;

    if (remaining <= 0) {
      violations.push(`LLM call limit exceeded for ${task}: ${used}/${limit}`);
    } else if (remaining < limit * 0.1) {
      warnings.push(`LLM calls for ${task} approaching limit: ${used}/${limit}`);
    }
  }

  // Check comments per depth
  for (const [depth, limit] of Object.entries(config.maxCommentsPerDepth)) {
    const used = usage.commentsProcessed[parseInt(depth, 10)] ?? 0;
    if (used > limit) {
      violations.push(`Comment limit exceeded for depth ${depth}: ${used}/${limit}`);
    }
  }

  // Check total tokens
  if (usage.tokensUsed > config.maxTotalTokens) {
    violations.push(`Total token limit exceeded: ${usage.tokensUsed}/${config.maxTotalTokens}`);
  } else if (usage.tokensUsed > config.maxTotalTokens * 0.9) {
    warnings.push(`Token usage approaching limit: ${usage.tokensUsed}/${config.maxTotalTokens}`);
  }

  // Check cost
  if (usage.estimatedCost > config.maxTotalCostUsd) {
    violations.push(`Cost limit exceeded: $${usage.estimatedCost.toFixed(2)}/$${config.maxTotalCostUsd.toFixed(2)}`);
  } else if (usage.estimatedCost > config.maxTotalCostUsd * 0.8) {
    warnings.push(`Cost approaching limit: $${usage.estimatedCost.toFixed(2)}/$${config.maxTotalCostUsd.toFixed(2)}`);
  }

  return {
    withinBudget: violations.length === 0,
    warnings,
    violations,
    usage,
    remainingBudget: {
      llmCalls: {
        communitySentiment: Math.max(0, config.maxLLMCallsPerTask.communitySentiment - usage.llmCallsMade.communitySentiment),
        targetGroupDetection: Math.max(0, config.maxLLMCallsPerTask.targetGroupDetection - usage.llmCallsMade.targetGroupDetection),
        moderatorSentiment: Math.max(0, config.maxLLMCallsPerTask.moderatorSentiment - usage.llmCallsMade.moderatorSentiment),
      },
      tokens: Math.max(0, config.maxTotalTokens - usage.tokensUsed),
      costUsd: Math.max(0, config.maxTotalCostUsd - usage.estimatedCost),
    },
  };
}

/**
 * Record LLM call usage
 */
export function recordLLMCall(
  usage: BudgetUsage,
  task: 'communitySentiment' | 'targetGroupDetection' | 'moderatorSentiment',
  tokens: number,
  model: string = 'default'
): BudgetUsage {
  usage.llmCallsMade[task]++;
  usage.tokensUsed += tokens;
  usage.estimatedCost += estimateCost(tokens, model);
  return usage;
}

/**
 * Record comments processed at a specific depth
 */
export function recordCommentsProcessed(
  usage: BudgetUsage,
  depth: number,
  count: number
): BudgetUsage {
  usage.commentsProcessed[depth] = (usage.commentsProcessed[depth] ?? 0) + count;
  return usage;
}

/**
 * Estimate cost for token usage
 */
export function estimateCost(tokens: number, model: string = 'default'): number {
  const pricing = TOKEN_PRICING[model as keyof typeof TOKEN_PRICING] ?? TOKEN_PRICING.default;
  // Assume 80% input, 20% output ratio
  const inputTokens = tokens * 0.8;
  const outputTokens = tokens * 0.2;
  return (inputTokens * pricing.input + outputTokens * pricing.output) / 1000;
}

/**
 * Calculate how many more comments can be processed within budget
 */
export function getRemainingCapacity(
  usage: BudgetUsage,
  config: BudgetConfig = DEFAULT_BUDGET_CONFIG,
  averageTokensPerComment: number = 200
): {
  communitySentiment: number;
  targetGroupDetection: number;
  moderatorSentiment: number;
} {
  const check = checkBudget(usage, config);

  // Calculate based on remaining LLM calls AND remaining cost
  const costPerComment = estimateCost(averageTokensPerComment);
  const commentsByCost = Math.floor(check.remainingBudget.costUsd / costPerComment);

  return {
    communitySentiment: Math.min(
      check.remainingBudget.llmCalls.communitySentiment,
      commentsByCost
    ),
    targetGroupDetection: Math.min(
      check.remainingBudget.llmCalls.targetGroupDetection,
      commentsByCost
    ),
    moderatorSentiment: Math.min(
      check.remainingBudget.llmCalls.moderatorSentiment,
      commentsByCost
    ),
  };
}

/**
 * Validate budget configuration
 */
export function validateBudgetConfig(config: Partial<BudgetConfig>): string[] {
  const errors: string[] = [];

  if (config.maxTotalCostUsd !== undefined && config.maxTotalCostUsd < 0) {
    errors.push('maxTotalCostUsd cannot be negative');
  }

  if (config.maxTotalTokens !== undefined && config.maxTotalTokens < 1000) {
    errors.push('maxTotalTokens must be at least 1000');
  }

  if (config.maxTokensPerRequest !== undefined && config.maxTokensPerRequest < 100) {
    errors.push('maxTokensPerRequest must be at least 100');
  }

  if (config.maxLLMCallsPerTask) {
    for (const [task, limit] of Object.entries(config.maxLLMCallsPerTask)) {
      if (limit < 0) {
        errors.push(`maxLLMCallsPerTask.${task} cannot be negative`);
      }
    }
  }

  return errors;
}

/**
 * Format budget check result for display
 */
export function formatBudgetCheck(result: BudgetCheckResult): string {
  const lines: string[] = [];

  lines.push(`Budget Status: ${result.withinBudget ? 'Within Budget' : 'OVER BUDGET'}`);
  lines.push('');

  lines.push('Usage:');
  lines.push(`  Tokens: ${result.usage.tokensUsed.toLocaleString()}`);
  lines.push(`  Estimated Cost: $${result.usage.estimatedCost.toFixed(4)}`);
  lines.push(`  LLM Calls:`);
  lines.push(`    - Community Sentiment: ${result.usage.llmCallsMade.communitySentiment}`);
  lines.push(`    - Target Group Detection: ${result.usage.llmCallsMade.targetGroupDetection}`);
  lines.push(`    - Moderator Sentiment: ${result.usage.llmCallsMade.moderatorSentiment}`);
  lines.push('');

  lines.push('Remaining Budget:');
  lines.push(`  Tokens: ${result.remainingBudget.tokens.toLocaleString()}`);
  lines.push(`  Cost: $${result.remainingBudget.costUsd.toFixed(4)}`);
  lines.push('');

  if (result.warnings.length > 0) {
    lines.push('Warnings:');
    for (const warning of result.warnings) {
      lines.push(`  ⚠️ ${warning}`);
    }
    lines.push('');
  }

  if (result.violations.length > 0) {
    lines.push('Violations:');
    for (const violation of result.violations) {
      lines.push(`  ❌ ${violation}`);
    }
  }

  return lines.join('\n');
}
