import { describe, test, expect } from 'bun:test';
import {
  isTooShort,
  isLikelyNeutral,
  analyzeSentimentLexicon,
  hasSlurs,
  hasDehumanization,
  hasConspiracyLanguage,
  hasViolenceLanguage,
  detectTargetGroups,
  runSentimentHeuristics,
  runTargetGroupHeuristics,
  needsLLMAnalysis,
  getAvailableTargetGroups,
} from './heuristics';

describe('isTooShort', () => {
  test('returns true for very short text', () => {
    expect(isTooShort('ok')).toBe(true);
    expect(isTooShort('hi')).toBe(true);
    expect(isTooShort('a b')).toBe(true);
  });

  test('returns false for longer text', () => {
    expect(isTooShort('This is a longer sentence')).toBe(false);
    expect(isTooShort('One two three four')).toBe(false);
  });
});

describe('isLikelyNeutral', () => {
  test('returns true for neutral patterns', () => {
    expect(isLikelyNeutral('yes')).toBe(true);
    expect(isLikelyNeutral('no')).toBe(true);
    expect(isLikelyNeutral('ok')).toBe(true);
    expect(isLikelyNeutral('okay')).toBe(true);
    expect(isLikelyNeutral('sure')).toBe(true);
    expect(isLikelyNeutral('maybe')).toBe(true);
    expect(isLikelyNeutral('idk')).toBe(true);
    expect(isLikelyNeutral('tbh')).toBe(true);
  });

  test('returns true for URLs', () => {
    expect(isLikelyNeutral('https://example.com')).toBe(true);
    expect(isLikelyNeutral('http://test.com/page')).toBe(true);
  });

  test('returns true for subreddit references', () => {
    expect(isLikelyNeutral('r/test')).toBe(true);
    expect(isLikelyNeutral('r/programming')).toBe(true);
  });

  test('returns true for user references', () => {
    expect(isLikelyNeutral('u/testuser')).toBe(true);
  });

  test('returns true for numbers only', () => {
    expect(isLikelyNeutral('12345')).toBe(true);
  });

  test('returns true for very short text', () => {
    expect(isLikelyNeutral('hi')).toBe(true);
  });

  test('returns false for longer meaningful text', () => {
    expect(isLikelyNeutral('This is a great idea!')).toBe(false);
    expect(isLikelyNeutral('I really hate this approach')).toBe(false);
  });
});

describe('analyzeSentimentLexicon', () => {
  test('detects positive sentiment', () => {
    const result = analyzeSentimentLexicon('This is great and amazing! I love it!');
    expect(result.positiveCount).toBeGreaterThan(0);
    expect(result.sentiment).toBe('positive');
  });

  test('detects negative sentiment', () => {
    const result = analyzeSentimentLexicon('This is terrible and awful. I hate it.');
    expect(result.negativeCount).toBeGreaterThan(0);
    expect(result.sentiment).toBe('negative');
  });

  test('returns null sentiment for mixed content', () => {
    const result = analyzeSentimentLexicon('Some good and some bad things here.');
    expect(result.sentiment).toBeNull();
  });

  test('returns null sentiment for neutral content', () => {
    const result = analyzeSentimentLexicon('The weather is cloudy today.');
    expect(result.sentiment).toBeNull();
  });

  test('includes confidence score', () => {
    const result = analyzeSentimentLexicon('Great amazing wonderful fantastic!');
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  test('counts total words', () => {
    const result = analyzeSentimentLexicon('one two three four five');
    expect(result.totalWords).toBe(5);
  });
});

describe('hasSlurs', () => {
  test('returns object with found and indicators properties', () => {
    const result = hasSlurs('This is a clean text');
    expect(result).toHaveProperty('found');
    expect(result).toHaveProperty('indicators');
    expect(Array.isArray(result.indicators)).toBe(true);
  });

  test('returns false for clean text', () => {
    const result = hasSlurs('This is a normal sentence without any slurs.');
    expect(result.found).toBe(false);
    expect(result.indicators).toHaveLength(0);
  });
});

describe('hasDehumanization', () => {
  test('detects dehumanizing language', () => {
    const result1 = hasDehumanization('They are subhuman creatures');
    expect(result1.found).toBe(true);
    expect(result1.indicators.length).toBeGreaterThan(0);

    const result2 = hasDehumanization('These vermin need to be stopped');
    expect(result2.found).toBe(true);
  });

  test('returns false for clean text', () => {
    const result = hasDehumanization('I disagree with their policies.');
    expect(result.found).toBe(false);
  });
});

describe('hasConspiracyLanguage', () => {
  test('detects conspiracy language', () => {
    const result1 = hasConspiracyLanguage('They control the media and banks');
    expect(result1.found).toBe(true);

    const result2 = hasConspiracyLanguage('Its a global conspiracy');
    expect(result2.found).toBe(true);

    const result3 = hasConspiracyLanguage('They are pulling the strings');
    expect(result3.found).toBe(true);
  });

  test('returns false for clean text', () => {
    const result = hasConspiracyLanguage('The media reported on the event.');
    expect(result.found).toBe(false);
  });
});

describe('hasViolenceLanguage', () => {
  test('detects calls for violence', () => {
    const result1 = hasViolenceLanguage('They should all be removed');
    expect(result1.found).toBe(true);

    const result2 = hasViolenceLanguage('Get rid of all of them');
    expect(result2.found).toBe(true);
  });

  test('returns false for clean text', () => {
    const result = hasViolenceLanguage('I think we should vote for change.');
    expect(result.found).toBe(false);
  });
});

describe('detectTargetGroups', () => {
  test('detects Jewish references', () => {
    const result = detectTargetGroups('The Jewish community celebrated the holiday', ['jewish']);
    expect(result.found).toBe(true);
    expect(result.groups).toContain('jewish');
  });

  test('detects Muslim references', () => {
    const result = detectTargetGroups('Muslim leaders attended the conference', ['muslim']);
    expect(result.found).toBe(true);
    expect(result.groups).toContain('muslim');
  });

  test('detects LGBTQ references', () => {
    const result = detectTargetGroups('The LGBTQ community organized a parade', ['lgbtq']);
    expect(result.found).toBe(true);
    expect(result.groups).toContain('lgbtq');
  });

  test('detects multiple groups', () => {
    const result = detectTargetGroups('Both Jewish and Muslim leaders met', ['jewish', 'muslim']);
    expect(result.found).toBe(true);
    expect(result.groups).toContain('jewish');
    expect(result.groups).toContain('muslim');
  });

  test('returns false when no groups mentioned', () => {
    const result = detectTargetGroups('The weather is nice today', ['jewish', 'muslim']);
    expect(result.found).toBe(false);
    expect(result.groups).toHaveLength(0);
  });

  test('ignores unknown target groups', () => {
    const result = detectTargetGroups('Some text here', ['unknown_group']);
    expect(result.found).toBe(false);
  });
});

describe('runSentimentHeuristics', () => {
  test('returns confident neutral for very short text', () => {
    const result = runSentimentHeuristics('ok');
    expect(result.confident).toBe(true);
    expect(result.suggestion.sentiment).toBe('neutral');
  });

  test('returns confident positive for strongly positive text', () => {
    const result = runSentimentHeuristics('This is absolutely great and amazing! I love it so much!');
    expect(result.confident).toBe(true);
    expect(result.suggestion.sentiment).toBe('positive');
  });

  test('returns confident negative for strongly negative text', () => {
    const result = runSentimentHeuristics('This is terrible and awful. I hate this horrible thing.');
    expect(result.confident).toBe(true);
    expect(result.suggestion.sentiment).toBe('negative');
  });

  test('returns not confident for ambiguous text', () => {
    const result = runSentimentHeuristics('I went to the store and bought some groceries.');
    expect(result.confident).toBe(false);
    expect(result.reason).toBe('Requires LLM analysis');
  });
});

describe('runTargetGroupHeuristics', () => {
  test('returns confident none when no group mentioned', () => {
    const result = runTargetGroupHeuristics('The weather is nice today', ['jewish']);
    expect(result.confident).toBe(true);
    expect(result.suggestion.hasTargetGroupMention).toBe(false);
    expect(result.suggestion.hostilityLevel).toBe('none');
  });

  test('returns confident high for obvious hostility with dehumanization', () => {
    const result = runTargetGroupHeuristics('Jews are subhuman vermin', ['jewish']);
    expect(result.confident).toBe(true);
    expect(result.suggestion.hasTargetGroupMention).toBe(true);
    expect(result.suggestion.hostilityLevel).toBe('high');
  });

  test('returns confident high for violence language', () => {
    const result = runTargetGroupHeuristics('Jews should all be removed', ['jewish']);
    expect(result.confident).toBe(true);
    expect(result.suggestion.hostilityLevel).toBe('high');
  });

  test('returns not confident with medium for conspiracy language', () => {
    const result = runTargetGroupHeuristics('Jews control the media and banks', ['jewish']);
    expect(result.confident).toBe(false);
    expect(result.suggestion.hostilityLevel).toBe('medium');
    expect(result.reason).toContain('conspiracy');
  });

  test('returns not confident when group mentioned without obvious hostility', () => {
    const result = runTargetGroupHeuristics('The Jewish community met yesterday', ['jewish']);
    expect(result.confident).toBe(false);
    expect(result.suggestion.hasTargetGroupMention).toBe(true);
  });

  test('includes indicators', () => {
    const result = runTargetGroupHeuristics('Jews control the media', ['jewish']);
    expect(result.indicators.length).toBeGreaterThan(0);
  });
});

describe('needsLLMAnalysis', () => {
  test('returns true when sentiment is not confident', () => {
    const sentimentResult = {
      confident: false,
      suggestion: {},
      reason: 'Test',
      indicators: [],
    };
    expect(needsLLMAnalysis(sentimentResult, null)).toBe(true);
  });

  test('returns true when target group is not confident', () => {
    const sentimentResult = {
      confident: true,
      suggestion: { sentiment: 'neutral' as const },
      reason: 'Test',
      indicators: [],
    };
    const targetGroupResult = {
      confident: false,
      suggestion: {},
      reason: 'Test',
      indicators: [],
    };
    expect(needsLLMAnalysis(sentimentResult, targetGroupResult)).toBe(true);
  });

  test('returns false when both are confident', () => {
    const sentimentResult = {
      confident: true,
      suggestion: { sentiment: 'neutral' as const },
      reason: 'Test',
      indicators: [],
    };
    const targetGroupResult = {
      confident: true,
      suggestion: { hasTargetGroupMention: false, hostilityLevel: 'none' as const },
      reason: 'Test',
      indicators: [],
    };
    expect(needsLLMAnalysis(sentimentResult, targetGroupResult)).toBe(false);
  });
});

describe('getAvailableTargetGroups', () => {
  test('returns list of available target groups', () => {
    const groups = getAvailableTargetGroups();
    expect(groups).toContain('jewish');
    expect(groups).toContain('muslim');
    expect(groups).toContain('black');
    expect(groups).toContain('lgbtq');
    expect(groups).toContain('asian');
    expect(groups).toContain('immigrant');
  });
});
