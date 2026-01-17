import { describe, test, expect } from 'bun:test';
import {
  PROMPT_VERSION,
  SENTIMENT_PROMPT,
  TARGET_GROUP_PROMPTS,
  formatCommentsForPrompt,
  buildSentimentPrompt,
  buildTargetGroupPrompt,
  getPromptTemplate,
  validatePromptOutput,
} from './prompts';

describe('PROMPT_VERSION', () => {
  test('is a valid semver string', () => {
    expect(PROMPT_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

describe('SENTIMENT_PROMPT', () => {
  test('has required properties', () => {
    expect(SENTIMENT_PROMPT.version).toBe(PROMPT_VERSION);
    expect(SENTIMENT_PROMPT.systemPrompt).toBeDefined();
    expect(SENTIMENT_PROMPT.userPromptTemplate).toBeDefined();
    expect(SENTIMENT_PROMPT.outputSchema).toBeDefined();
  });

  test('system prompt contains key instructions', () => {
    expect(SENTIMENT_PROMPT.systemPrompt).toContain('sentiment');
    expect(SENTIMENT_PROMPT.systemPrompt).toContain('positive');
    expect(SENTIMENT_PROMPT.systemPrompt).toContain('neutral');
    expect(SENTIMENT_PROMPT.systemPrompt).toContain('negative');
    expect(SENTIMENT_PROMPT.systemPrompt).toContain('JSON');
  });

  test('user prompt template contains placeholder', () => {
    expect(SENTIMENT_PROMPT.userPromptTemplate).toContain('{{comments}}');
  });

  test('output schema defines array of objects', () => {
    expect(SENTIMENT_PROMPT.outputSchema).toHaveProperty('type', 'array');
    expect(SENTIMENT_PROMPT.outputSchema).toHaveProperty('items');
  });
});

describe('TARGET_GROUP_PROMPTS', () => {
  test('has prompts for all frameworks', () => {
    expect(TARGET_GROUP_PROMPTS.nexus).toBeDefined();
    expect(TARGET_GROUP_PROMPTS.jda).toBeDefined();
    expect(TARGET_GROUP_PROMPTS.ihra).toBeDefined();
  });

  test('each framework prompt has required properties', () => {
    for (const [framework, prompt] of Object.entries(TARGET_GROUP_PROMPTS)) {
      expect(prompt.version).toBe(PROMPT_VERSION);
      expect(prompt.systemPrompt).toBeDefined();
      expect(prompt.userPromptTemplate).toBeDefined();
      expect(prompt.outputSchema).toBeDefined();
    }
  });

  test('nexus prompt mentions Nexus Document', () => {
    expect(TARGET_GROUP_PROMPTS.nexus.systemPrompt).toContain('Nexus Document');
  });

  test('jda prompt mentions Jerusalem Declaration', () => {
    expect(TARGET_GROUP_PROMPTS.jda.systemPrompt).toContain('Jerusalem Declaration');
  });

  test('ihra prompt mentions IHRA', () => {
    expect(TARGET_GROUP_PROMPTS.ihra.systemPrompt).toContain('IHRA');
  });

  test('all prompts contain hostility level instructions', () => {
    for (const prompt of Object.values(TARGET_GROUP_PROMPTS)) {
      expect(prompt.systemPrompt).toContain('none');
      expect(prompt.systemPrompt).toContain('low');
      expect(prompt.systemPrompt).toContain('medium');
      expect(prompt.systemPrompt).toContain('high');
    }
  });

  test('all prompts contain target group placeholder', () => {
    for (const prompt of Object.values(TARGET_GROUP_PROMPTS)) {
      expect(prompt.userPromptTemplate).toContain('{{target_group}}');
      expect(prompt.userPromptTemplate).toContain('{{comments}}');
    }
  });
});

describe('formatCommentsForPrompt', () => {
  test('formats single comment', () => {
    const comments = [{ id: 'c1', body: 'This is a comment' }];
    const result = formatCommentsForPrompt(comments);

    expect(result).toContain('[1] ID: c1');
    expect(result).toContain('This is a comment');
  });

  test('formats multiple comments with separators', () => {
    const comments = [
      { id: 'c1', body: 'First comment' },
      { id: 'c2', body: 'Second comment' },
    ];
    const result = formatCommentsForPrompt(comments);

    expect(result).toContain('[1] ID: c1');
    expect(result).toContain('First comment');
    expect(result).toContain('---');
    expect(result).toContain('[2] ID: c2');
    expect(result).toContain('Second comment');
  });

  test('handles empty array', () => {
    const result = formatCommentsForPrompt([]);
    expect(result).toBe('');
  });
});

describe('buildSentimentPrompt', () => {
  test('returns system and user prompts', () => {
    const comments = [{ id: 'c1', body: 'Test comment' }];
    const result = buildSentimentPrompt(comments);

    expect(result.system).toBe(SENTIMENT_PROMPT.systemPrompt);
    expect(result.user).toContain('c1');
    expect(result.user).toContain('Test comment');
  });

  test('replaces comments placeholder', () => {
    const comments = [{ id: 'c1', body: 'Test' }];
    const result = buildSentimentPrompt(comments);

    expect(result.user).not.toContain('{{comments}}');
  });
});

describe('buildTargetGroupPrompt', () => {
  test('returns system and user prompts', () => {
    const comments = [{ id: 'c1', body: 'Test comment' }];
    const result = buildTargetGroupPrompt(comments, 'jewish', 'nexus');

    expect(result.system).toBe(TARGET_GROUP_PROMPTS.nexus.systemPrompt);
    expect(result.user).toContain('c1');
    expect(result.user).toContain('jewish');
  });

  test('replaces target group placeholder', () => {
    const comments = [{ id: 'c1', body: 'Test' }];
    const result = buildTargetGroupPrompt(comments, 'muslim', 'jda');

    expect(result.user).not.toContain('{{target_group}}');
    expect(result.user).toContain('muslim');
  });

  test('works with all frameworks', () => {
    const comments = [{ id: 'c1', body: 'Test' }];

    const nexus = buildTargetGroupPrompt(comments, 'jewish', 'nexus');
    const jda = buildTargetGroupPrompt(comments, 'jewish', 'jda');
    const ihra = buildTargetGroupPrompt(comments, 'jewish', 'ihra');

    expect(nexus.system).toContain('Nexus');
    expect(jda.system).toContain('JDA');
    expect(ihra.system).toContain('IHRA');
  });
});

describe('getPromptTemplate', () => {
  test('returns sentiment prompt for sentiment task', () => {
    const template = getPromptTemplate('sentiment');
    expect(template).toBe(SENTIMENT_PROMPT);
  });

  test('returns correct framework prompt for target_group task', () => {
    expect(getPromptTemplate('target_group', 'nexus')).toBe(TARGET_GROUP_PROMPTS.nexus);
    expect(getPromptTemplate('target_group', 'jda')).toBe(TARGET_GROUP_PROMPTS.jda);
    expect(getPromptTemplate('target_group', 'ihra')).toBe(TARGET_GROUP_PROMPTS.ihra);
  });

  test('defaults to nexus for target_group without framework', () => {
    const template = getPromptTemplate('target_group');
    expect(template).toBe(TARGET_GROUP_PROMPTS.nexus);
  });
});

describe('validatePromptOutput', () => {
  test('validates array output', () => {
    const schema = { type: 'array', items: { required: ['id', 'sentiment'] } };
    const validOutput = [{ id: 'c1', sentiment: 'positive' }];
    const invalidOutput = [{ id: 'c1' }]; // Missing sentiment

    expect(validatePromptOutput(validOutput, schema)).toBe(true);
    expect(validatePromptOutput(invalidOutput, schema)).toBe(false);
  });

  test('returns false for non-array when expecting array', () => {
    const schema = { type: 'array', items: { required: ['id'] } };

    expect(validatePromptOutput({ id: 'c1' }, schema)).toBe(false);
    expect(validatePromptOutput('string', schema)).toBe(false);
  });

  test('returns false for null or undefined', () => {
    const schema = { type: 'array' };

    expect(validatePromptOutput(null, schema)).toBe(false);
    expect(validatePromptOutput(undefined, schema)).toBe(false);
  });

  test('validates items have required fields', () => {
    const schema = { type: 'array', items: { required: ['a', 'b'] } };

    expect(validatePromptOutput([{ a: 1, b: 2 }], schema)).toBe(true);
    expect(validatePromptOutput([{ a: 1 }], schema)).toBe(false);
  });

  test('rejects non-object items in array', () => {
    const schema = { type: 'array', items: { required: ['id'] } };

    expect(validatePromptOutput(['string', 'items'], schema)).toBe(false);
    expect(validatePromptOutput([null], schema)).toBe(false);
  });
});
