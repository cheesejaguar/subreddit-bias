import { describe, test, expect } from 'bun:test';
import {
  calculateSentimentDistribution,
  calculateSentimentStats,
  calculateHostilityDistribution,
  calculateLabelCounts,
  wilsonScoreInterval,
  calculateTargetGroupStats,
  aggregateTargetGroupStats,
  calculateSentimentDelta,
  calculatePrevalenceDelta,
  meetsSampleSizeThreshold,
  toPercentage,
  formatConfidenceInterval,
  isSignificantDifference,
  getDominantSentiment,
  calculateSentimentSkew,
  combineSentimentStats,
} from './aggregation';
import type { SentimentClassification, TargetGroupClassification } from '@subreddit-bias/db';

describe('calculateSentimentDistribution', () => {
  test('calculates correct distribution', () => {
    const classifications: SentimentClassification[] = [
      { commentId: '1', sentiment: 'positive', subjectivity: 0.5, confidence: 0.8, fromCache: false, modelUsed: 'test', promptVersion: '1.0.0' },
      { commentId: '2', sentiment: 'positive', subjectivity: 0.5, confidence: 0.8, fromCache: false, modelUsed: 'test', promptVersion: '1.0.0' },
      { commentId: '3', sentiment: 'neutral', subjectivity: 0.5, confidence: 0.8, fromCache: false, modelUsed: 'test', promptVersion: '1.0.0' },
      { commentId: '4', sentiment: 'negative', subjectivity: 0.5, confidence: 0.8, fromCache: false, modelUsed: 'test', promptVersion: '1.0.0' },
    ];

    const distribution = calculateSentimentDistribution(classifications);

    expect(distribution.positive).toBe(2);
    expect(distribution.neutral).toBe(1);
    expect(distribution.negative).toBe(1);
    expect(distribution.total).toBe(4);
  });

  test('handles empty array', () => {
    const distribution = calculateSentimentDistribution([]);

    expect(distribution.positive).toBe(0);
    expect(distribution.neutral).toBe(0);
    expect(distribution.negative).toBe(0);
    expect(distribution.total).toBe(0);
  });
});

describe('calculateSentimentStats', () => {
  test('calculates correct stats', () => {
    const classifications: SentimentClassification[] = [
      { commentId: '1', sentiment: 'positive', subjectivity: 0.4, confidence: 0.8, fromCache: false, modelUsed: 'test', promptVersion: '1.0.0' },
      { commentId: '2', sentiment: 'neutral', subjectivity: 0.6, confidence: 0.9, fromCache: false, modelUsed: 'test', promptVersion: '1.0.0' },
    ];

    const stats = calculateSentimentStats(classifications);

    expect(stats.distribution.total).toBe(2);
    expect(stats.avgSubjectivity).toBeCloseTo(0.5, 5);
    expect(stats.avgConfidence).toBeCloseTo(0.85, 5);
    expect(stats.sampleSize).toBe(2);
  });

  test('handles empty array', () => {
    const stats = calculateSentimentStats([]);

    expect(stats.distribution.total).toBe(0);
    expect(stats.avgSubjectivity).toBe(0);
    expect(stats.avgConfidence).toBe(0);
    expect(stats.sampleSize).toBe(0);
  });
});

describe('calculateHostilityDistribution', () => {
  test('calculates correct distribution', () => {
    const classifications: Partial<TargetGroupClassification>[] = [
      { hostilityLevel: 'none' },
      { hostilityLevel: 'low' },
      { hostilityLevel: 'medium' },
      { hostilityLevel: 'high' },
      { hostilityLevel: 'none' },
    ];

    const distribution = calculateHostilityDistribution(classifications as TargetGroupClassification[]);

    expect(distribution.none).toBe(2);
    expect(distribution.low).toBe(1);
    expect(distribution.medium).toBe(1);
    expect(distribution.high).toBe(1);
  });
});

describe('calculateLabelCounts', () => {
  test('calculates correct label counts', () => {
    const classifications: Partial<TargetGroupClassification>[] = [
      { labels: ['dehumanization', 'slur_or_epithet'] },
      { labels: ['dehumanization'] },
      { labels: ['conspiracy_claim'] },
    ];

    const counts = calculateLabelCounts(classifications as TargetGroupClassification[]);

    expect(counts.dehumanization).toBe(2);
    expect(counts.slur_or_epithet).toBe(1);
    expect(counts.conspiracy_claim).toBe(1);
    expect(counts.collective_blame).toBe(0);
  });
});

describe('wilsonScoreInterval', () => {
  test('returns interval for sample with successes', () => {
    const interval = wilsonScoreInterval(10, 100);

    expect(interval.lower).toBeGreaterThan(0);
    expect(interval.upper).toBeLessThan(1);
    expect(interval.lower).toBeLessThan(interval.upper);
  });

  test('returns zero interval for empty sample', () => {
    const interval = wilsonScoreInterval(0, 0);

    expect(interval.lower).toBe(0);
    expect(interval.upper).toBe(0);
  });

  test('handles 100% success rate', () => {
    const interval = wilsonScoreInterval(100, 100);

    expect(interval.upper).toBeLessThanOrEqual(1);
    expect(interval.lower).toBeGreaterThan(0.9);
  });

  test('handles 0% success rate', () => {
    const interval = wilsonScoreInterval(0, 100);

    expect(interval.lower).toBe(0);
    expect(interval.upper).toBeLessThan(0.05);
  });
});

describe('calculateTargetGroupStats', () => {
  test('calculates stats for matching classifications', () => {
    const classifications: TargetGroupClassification[] = [
      {
        commentId: '1',
        framework: 'nexus',
        mentionsGroup: true,
        targetGroup: 'jewish',
        hostilityLevel: 'low',
        labels: ['stereotype_or_trope'],
        confidence: 0.8,
        rationale: '',
        fromCache: false,
        modelUsed: 'test',
        promptVersion: '1.0.0',
      },
      {
        commentId: '2',
        framework: 'nexus',
        mentionsGroup: true,
        targetGroup: 'jewish',
        hostilityLevel: 'none',
        labels: [],
        confidence: 0.9,
        rationale: '',
        fromCache: false,
        modelUsed: 'test',
        promptVersion: '1.0.0',
      },
    ];

    const stats = calculateTargetGroupStats(classifications, 'nexus', 'jewish');

    expect(stats.totalMentions).toBe(2);
    expect(stats.sampleSize).toBe(2);
    expect(stats.hostilityDistribution.low).toBe(1);
    expect(stats.hostilityDistribution.none).toBe(1);
    expect(stats.prevalenceRate).toBe(0.5);
  });

  test('returns empty stats for no matching classifications', () => {
    const stats = calculateTargetGroupStats([], 'nexus', 'jewish');

    expect(stats.sampleSize).toBe(0);
    expect(stats.totalMentions).toBe(0);
    expect(stats.prevalenceRate).toBe(0);
  });
});

describe('aggregateTargetGroupStats', () => {
  test('aggregates stats for multiple frameworks and groups', () => {
    const classifications: TargetGroupClassification[] = [
      {
        commentId: '1',
        framework: 'nexus',
        mentionsGroup: true,
        targetGroup: 'jewish',
        hostilityLevel: 'low',
        labels: [],
        confidence: 0.8,
        rationale: '',
        fromCache: false,
        modelUsed: 'test',
        promptVersion: '1.0.0',
      },
      {
        commentId: '2',
        framework: 'jda',
        mentionsGroup: true,
        targetGroup: 'muslim',
        hostilityLevel: 'none',
        labels: [],
        confidence: 0.9,
        rationale: '',
        fromCache: false,
        modelUsed: 'test',
        promptVersion: '1.0.0',
      },
    ];

    const stats = aggregateTargetGroupStats(classifications, ['nexus', 'jda'], ['jewish', 'muslim']);

    expect(stats.length).toBeGreaterThan(0);
  });
});

describe('calculateSentimentDelta', () => {
  test('calculates delta between distributions', () => {
    const subject = { positive: 30, neutral: 50, negative: 20, total: 100 };
    const baseline = { positive: 20, neutral: 60, negative: 20, total: 100 };

    const delta = calculateSentimentDelta(subject, baseline);

    expect(delta.positive).toBeCloseTo(0.1, 5);
    expect(delta.neutral).toBeCloseTo(-0.1, 5);
    expect(delta.negative).toBeCloseTo(0, 5);
  });

  test('handles zero totals', () => {
    const subject = { positive: 0, neutral: 0, negative: 0, total: 0 };
    const baseline = { positive: 10, neutral: 10, negative: 10, total: 30 };

    const delta = calculateSentimentDelta(subject, baseline);

    expect(delta.positive).toBe(0);
    expect(delta.neutral).toBe(0);
    expect(delta.negative).toBe(0);
  });
});

describe('calculatePrevalenceDelta', () => {
  test('calculates delta between prevalence rates', () => {
    const subject = { prevalenceRate: 0.15 } as any;
    const baseline = { prevalenceRate: 0.10 } as any;

    const delta = calculatePrevalenceDelta(subject, baseline);

    expect(delta).toBeCloseTo(0.05, 5);
  });
});

describe('meetsSampleSizeThreshold', () => {
  test('returns true when above threshold', () => {
    expect(meetsSampleSizeThreshold({ sampleSize: 50 }, 30)).toBe(true);
  });

  test('returns false when below threshold', () => {
    expect(meetsSampleSizeThreshold({ sampleSize: 20 }, 30)).toBe(false);
  });

  test('uses default threshold of 30', () => {
    expect(meetsSampleSizeThreshold({ sampleSize: 30 })).toBe(true);
    expect(meetsSampleSizeThreshold({ sampleSize: 29 })).toBe(false);
  });
});

describe('toPercentage', () => {
  test('converts decimal to percentage string', () => {
    expect(toPercentage(0.5)).toBe('50.0%');
    expect(toPercentage(0.123, 1)).toBe('12.3%');
    expect(toPercentage(0.1234, 2)).toBe('12.34%');
  });
});

describe('formatConfidenceInterval', () => {
  test('formats interval as percentage range', () => {
    const result = formatConfidenceInterval({ lower: 0.05, upper: 0.15 });
    expect(result).toBe('5.0% - 15.0%');
  });
});

describe('isSignificantDifference', () => {
  test('returns true when intervals do not overlap', () => {
    const ci1 = { lower: 0.1, upper: 0.2 };
    const ci2 = { lower: 0.3, upper: 0.4 };

    expect(isSignificantDifference(ci1, ci2)).toBe(true);
  });

  test('returns false when intervals overlap', () => {
    const ci1 = { lower: 0.1, upper: 0.3 };
    const ci2 = { lower: 0.2, upper: 0.4 };

    expect(isSignificantDifference(ci1, ci2)).toBe(false);
  });
});

describe('getDominantSentiment', () => {
  test('returns positive when most common', () => {
    expect(getDominantSentiment({ positive: 5, neutral: 3, negative: 2, total: 10 })).toBe('positive');
  });

  test('returns negative when most common', () => {
    expect(getDominantSentiment({ positive: 2, neutral: 3, negative: 5, total: 10 })).toBe('negative');
  });

  test('returns neutral when most common', () => {
    expect(getDominantSentiment({ positive: 2, neutral: 5, negative: 3, total: 10 })).toBe('neutral');
  });

  test('returns neutral for empty distribution', () => {
    expect(getDominantSentiment({ positive: 0, neutral: 0, negative: 0, total: 0 })).toBe('neutral');
  });
});

describe('calculateSentimentSkew', () => {
  test('returns positive skew for positive-heavy distribution', () => {
    const skew = calculateSentimentSkew({ positive: 80, neutral: 10, negative: 10, total: 100 });
    expect(skew).toBeCloseTo(0.7, 5);
  });

  test('returns negative skew for negative-heavy distribution', () => {
    const skew = calculateSentimentSkew({ positive: 10, neutral: 10, negative: 80, total: 100 });
    expect(skew).toBeCloseTo(-0.7, 5);
  });

  test('returns zero for balanced distribution', () => {
    const skew = calculateSentimentSkew({ positive: 33, neutral: 34, negative: 33, total: 100 });
    expect(skew).toBe(0);
  });

  test('returns zero for empty distribution', () => {
    expect(calculateSentimentSkew({ positive: 0, neutral: 0, negative: 0, total: 0 })).toBe(0);
  });
});

describe('combineSentimentStats', () => {
  test('combines multiple stats correctly', () => {
    const stats = [
      {
        distribution: { positive: 10, neutral: 20, negative: 5, total: 35 },
        avgSubjectivity: 0.5,
        avgConfidence: 0.8,
        sampleSize: 35,
      },
      {
        distribution: { positive: 5, neutral: 10, negative: 10, total: 25 },
        avgSubjectivity: 0.6,
        avgConfidence: 0.9,
        sampleSize: 25,
      },
    ];

    const combined = combineSentimentStats(stats);

    expect(combined.distribution.positive).toBe(15);
    expect(combined.distribution.neutral).toBe(30);
    expect(combined.distribution.negative).toBe(15);
    expect(combined.distribution.total).toBe(60);
    expect(combined.sampleSize).toBe(60);
  });

  test('returns empty stats for empty array', () => {
    const combined = combineSentimentStats([]);

    expect(combined.sampleSize).toBe(0);
    expect(combined.distribution.total).toBe(0);
  });
});
