import { describe, test, expect } from 'bun:test';
import {
  compareToBaseline,
  compareSentiment,
  compareTargetGroup,
  aggregateBaselineComparisons,
  formatBaselineComparison,
  PLATFORM_BASELINE_SUBREDDITS,
  DEFAULT_BASELINE_CONFIG,
  type BaselineComparison,
} from './baseline';
import type { SentimentStats, TargetGroupStats } from '@subreddit-bias/db';

describe('PLATFORM_BASELINE_SUBREDDITS', () => {
  test('includes expected subreddits', () => {
    expect(PLATFORM_BASELINE_SUBREDDITS).toContain('AskReddit');
    expect(PLATFORM_BASELINE_SUBREDDITS).toContain('news');
    expect(PLATFORM_BASELINE_SUBREDDITS).toContain('worldnews');
    expect(PLATFORM_BASELINE_SUBREDDITS.length).toBeGreaterThan(0);
  });
});

describe('DEFAULT_BASELINE_CONFIG', () => {
  test('has sensible defaults', () => {
    expect(DEFAULT_BASELINE_CONFIG.minSampleSize).toBe(30);
    expect(DEFAULT_BASELINE_CONFIG.peerSubreddits).toEqual([]);
    expect(DEFAULT_BASELINE_CONFIG.platformBaselineSubreddits).toEqual(PLATFORM_BASELINE_SUBREDDITS);
  });
});

describe('compareSentiment', () => {
  test('detects significant positive difference', () => {
    const subject = { positive: 70, neutral: 20, negative: 10, total: 100 };
    const baseline = { positive: 30, neutral: 50, negative: 20, total: 100 };

    const result = compareSentiment(subject, baseline);

    expect(result.delta.positive).toBeCloseTo(0.4, 5);
    expect(result.delta.negative).toBeCloseTo(-0.1, 5);
    expect(result.isSignificant).toBe(true);
    expect(result.interpretation).toContain('higher positive sentiment');
  });

  test('detects significant negative difference', () => {
    const subject = { positive: 10, neutral: 20, negative: 70, total: 100 };
    const baseline = { positive: 30, neutral: 50, negative: 20, total: 100 };

    const result = compareSentiment(subject, baseline);

    expect(result.delta.negative).toBeCloseTo(0.5, 5);
    expect(result.isSignificant).toBe(true);
    expect(result.interpretation).toContain('higher negative sentiment');
  });

  test('reports no significant difference for similar distributions', () => {
    const subject = { positive: 32, neutral: 48, negative: 20, total: 100 };
    const baseline = { positive: 30, neutral: 50, negative: 20, total: 100 };

    const result = compareSentiment(subject, baseline);

    // Confidence intervals likely overlap for such similar distributions
    expect(result.delta.positive).toBeCloseTo(0.02, 5);
  });

  test('handles empty distributions', () => {
    const subject = { positive: 0, neutral: 0, negative: 0, total: 0 };
    const baseline = { positive: 30, neutral: 50, negative: 20, total: 100 };

    const result = compareSentiment(subject, baseline);

    expect(result.subject).toEqual(subject);
    expect(result.baseline).toEqual(baseline);
  });
});

describe('compareTargetGroup', () => {
  test('calculates prevalence delta', () => {
    const subject: TargetGroupStats = {
      framework: 'nexus',
      targetGroup: 'jewish',
      totalMentions: 20,
      sampleSize: 200,
      prevalenceRate: 0.10,
      prevalenceCI: { lower: 0.06, upper: 0.15 },
      hostilityDistribution: { none: 15, low: 3, medium: 1, high: 1 },
      labelCounts: {
        slur_or_epithet: 0,
        dehumanization: 1,
        stereotype_or_trope: 2,
        conspiracy_claim: 1,
        collective_blame: 0,
        calls_for_exclusion_or_violence: 1,
        denial_or_minimization: 0,
      },
      avgConfidence: 0.8,
    };

    const baseline: TargetGroupStats = {
      framework: 'nexus',
      targetGroup: 'jewish',
      totalMentions: 10,
      sampleSize: 200,
      prevalenceRate: 0.05,
      prevalenceCI: { lower: 0.02, upper: 0.09 },
      hostilityDistribution: { none: 8, low: 1, medium: 1, high: 0 },
      labelCounts: {
        slur_or_epithet: 0,
        dehumanization: 0,
        stereotype_or_trope: 1,
        conspiracy_claim: 0,
        collective_blame: 0,
        calls_for_exclusion_or_violence: 0,
        denial_or_minimization: 0,
      },
      avgConfidence: 0.8,
    };

    const result = compareTargetGroup(subject, baseline);

    expect(result.targetGroup).toBe('jewish');
    expect(result.framework).toBe('nexus');
    expect(result.subjectPrevalence).toBe(0.10);
    expect(result.baselinePrevalence).toBe(0.05);
    expect(result.prevalenceDelta).toBeCloseTo(0.05, 5);
  });

  test('identifies non-significant difference', () => {
    const subject: TargetGroupStats = {
      framework: 'jda',
      targetGroup: 'muslim',
      totalMentions: 5,
      sampleSize: 100,
      prevalenceRate: 0.05,
      prevalenceCI: { lower: 0.02, upper: 0.11 },
      hostilityDistribution: { none: 4, low: 1, medium: 0, high: 0 },
      labelCounts: {
        slur_or_epithet: 0,
        dehumanization: 0,
        stereotype_or_trope: 0,
        conspiracy_claim: 0,
        collective_blame: 0,
        calls_for_exclusion_or_violence: 0,
        denial_or_minimization: 0,
      },
      avgConfidence: 0.7,
    };

    const baseline: TargetGroupStats = {
      framework: 'jda',
      targetGroup: 'muslim',
      totalMentions: 6,
      sampleSize: 100,
      prevalenceRate: 0.06,
      prevalenceCI: { lower: 0.02, upper: 0.12 },
      hostilityDistribution: { none: 5, low: 1, medium: 0, high: 0 },
      labelCounts: {
        slur_or_epithet: 0,
        dehumanization: 0,
        stereotype_or_trope: 0,
        conspiracy_claim: 0,
        collective_blame: 0,
        calls_for_exclusion_or_violence: 0,
        denial_or_minimization: 0,
      },
      avgConfidence: 0.7,
    };

    const result = compareTargetGroup(subject, baseline);

    // Confidence intervals overlap significantly
    expect(result.isSignificant).toBe(false);
    expect(result.interpretation).toContain('No statistically significant');
  });
});

describe('compareToBaseline', () => {
  const createSentimentStats = (positive: number, neutral: number, negative: number): SentimentStats => ({
    distribution: { positive, neutral, negative, total: positive + neutral + negative },
    avgSubjectivity: 0.5,
    avgConfidence: 0.8,
    sampleSize: positive + neutral + negative,
  });

  test('creates full baseline comparison', () => {
    const subjectSentiment = createSentimentStats(60, 30, 10);
    const baselineSentiment = createSentimentStats(40, 40, 20);

    const result = compareToBaseline(
      'testsubreddit',
      subjectSentiment,
      [],
      baselineSentiment,
      [],
      'peer',
      'r/comparison'
    );

    expect(result.type).toBe('peer');
    expect(result.subjectSubreddit).toBe('testsubreddit');
    expect(result.baselineDescription).toBe('r/comparison');
    expect(result.sentiment).not.toBeNull();
  });

  test('adds limitation for small sample sizes', () => {
    const subjectSentiment = createSentimentStats(10, 10, 5);
    const baselineSentiment = createSentimentStats(40, 40, 20);

    const result = compareToBaseline(
      'testsubreddit',
      subjectSentiment,
      [],
      baselineSentiment,
      [],
      'platform',
      'Platform baseline'
    );

    expect(result.limitations.some(l => l.includes('sample size'))).toBe(true);
  });

  test('adds limitation for missing target group data', () => {
    const subjectSentiment = createSentimentStats(50, 30, 20);
    const baselineSentiment = createSentimentStats(40, 40, 20);

    const subjectTargetGroups: TargetGroupStats[] = [
      {
        framework: 'nexus',
        targetGroup: 'jewish',
        totalMentions: 10,
        sampleSize: 100,
        prevalenceRate: 0.1,
        prevalenceCI: { lower: 0.05, upper: 0.17 },
        hostilityDistribution: { none: 8, low: 1, medium: 1, high: 0 },
        labelCounts: {
          slur_or_epithet: 0,
          dehumanization: 0,
          stereotype_or_trope: 1,
          conspiracy_claim: 0,
          collective_blame: 0,
          calls_for_exclusion_or_violence: 0,
          denial_or_minimization: 0,
        },
        avgConfidence: 0.8,
      },
    ];

    const result = compareToBaseline(
      'testsubreddit',
      subjectSentiment,
      subjectTargetGroups,
      baselineSentiment,
      [], // No baseline target group data
      'peer',
      'r/comparison'
    );

    expect(result.limitations.some(l => l.includes('No baseline data'))).toBe(true);
  });
});

describe('aggregateBaselineComparisons', () => {
  test('returns null for empty array', () => {
    const result = aggregateBaselineComparisons([]);
    expect(result).toBeNull();
  });

  test('aggregates multiple comparisons', () => {
    const comparisons: BaselineComparison[] = [
      {
        type: 'peer',
        subjectSubreddit: 'test',
        baselineDescription: 'r/sub1',
        sentiment: {
          subject: { positive: 50, neutral: 30, negative: 20, total: 100 },
          baseline: { positive: 40, neutral: 40, negative: 20, total: 100 },
          delta: {
            positive: 0.1,
            neutral: -0.1,
            negative: 0,
            positiveCI: { lower: 0.05, upper: 0.15 },
            neutralCI: { lower: -0.15, upper: -0.05 },
            negativeCI: { lower: -0.05, upper: 0.05 },
          },
          isSignificant: true,
          interpretation: 'Higher positive sentiment',
        },
        targetGroups: [],
        isStatisticallySignificant: true,
        limitations: [],
      },
      {
        type: 'peer',
        subjectSubreddit: 'test',
        baselineDescription: 'r/sub2',
        sentiment: {
          subject: { positive: 50, neutral: 30, negative: 20, total: 100 },
          baseline: { positive: 30, neutral: 50, negative: 20, total: 100 },
          delta: {
            positive: 0.2,
            neutral: -0.2,
            negative: 0,
            positiveCI: { lower: 0.15, upper: 0.25 },
            neutralCI: { lower: -0.25, upper: -0.15 },
            negativeCI: { lower: -0.05, upper: 0.05 },
          },
          isSignificant: true,
          interpretation: 'Higher positive sentiment',
        },
        targetGroups: [],
        isStatisticallySignificant: true,
        limitations: [],
      },
    ];

    const result = aggregateBaselineComparisons(comparisons);

    expect(result).not.toBeNull();
    expect(result!.baselineDescription).toContain('Aggregated from 2');
    expect(result!.sentiment).not.toBeNull();
  });
});

describe('formatBaselineComparison', () => {
  test('formats comparison as readable text', () => {
    const comparison: BaselineComparison = {
      type: 'peer',
      subjectSubreddit: 'testsubreddit',
      baselineDescription: 'r/comparison',
      sentiment: {
        subject: { positive: 60, neutral: 30, negative: 10, total: 100 },
        baseline: { positive: 40, neutral: 40, negative: 20, total: 100 },
        delta: {
          positive: 0.2,
          neutral: -0.1,
          negative: -0.1,
          positiveCI: { lower: 0.1, upper: 0.3 },
          neutralCI: { lower: -0.2, upper: 0 },
          negativeCI: { lower: -0.15, upper: -0.05 },
        },
        isSignificant: true,
        interpretation: '20.0% higher positive sentiment',
      },
      targetGroups: [],
      isStatisticallySignificant: true,
      limitations: ['Small sample size warning'],
    };

    const formatted = formatBaselineComparison(comparison);

    expect(formatted).toContain('testsubreddit');
    expect(formatted).toContain('r/comparison');
    expect(formatted).toContain('Sentiment');
    expect(formatted).toContain('Limitations');
    expect(formatted).toContain('Small sample size');
  });
});
