/**
 * Aggregation module for computing statistics and distributions
 * from individual classifications
 */

import type {
  SentimentValue,
  SentimentClassification,
  TargetGroupClassification,
  SentimentStats,
  SentimentDistribution,
  TargetGroupStats,
  HostilityLevel,
  HostilityLabel,
  FrameworkType,
} from '@subreddit-bias/db';
import { HOSTILITY_LABELS } from '@subreddit-bias/db';

/**
 * Calculate sentiment distribution from classifications
 */
export function calculateSentimentDistribution(
  classifications: SentimentClassification[]
): SentimentDistribution {
  const distribution: SentimentDistribution = {
    positive: 0,
    neutral: 0,
    negative: 0,
    total: classifications.length,
  };

  for (const c of classifications) {
    distribution[c.sentiment]++;
  }

  return distribution;
}

/**
 * Calculate sentiment statistics from classifications
 */
export function calculateSentimentStats(
  classifications: SentimentClassification[]
): SentimentStats {
  if (classifications.length === 0) {
    return {
      distribution: { positive: 0, neutral: 0, negative: 0, total: 0 },
      avgSubjectivity: 0,
      avgConfidence: 0,
      sampleSize: 0,
    };
  }

  const distribution = calculateSentimentDistribution(classifications);

  const totalSubjectivity = classifications.reduce((sum, c) => sum + c.subjectivity, 0);
  const totalConfidence = classifications.reduce((sum, c) => sum + c.confidence, 0);

  return {
    distribution,
    avgSubjectivity: totalSubjectivity / classifications.length,
    avgConfidence: totalConfidence / classifications.length,
    sampleSize: classifications.length,
  };
}

/**
 * Calculate hostility level distribution
 */
export function calculateHostilityDistribution(
  classifications: TargetGroupClassification[]
): Record<HostilityLevel, number> {
  const distribution: Record<HostilityLevel, number> = {
    none: 0,
    low: 0,
    medium: 0,
    high: 0,
  };

  for (const c of classifications) {
    distribution[c.hostilityLevel]++;
  }

  return distribution;
}

/**
 * Calculate hostility label counts
 */
export function calculateLabelCounts(
  classifications: TargetGroupClassification[]
): Record<HostilityLabel, number> {
  const counts: Record<HostilityLabel, number> = {} as Record<HostilityLabel, number>;

  // Initialize all labels to 0
  for (const label of HOSTILITY_LABELS) {
    counts[label] = 0;
  }

  // Count occurrences
  for (const c of classifications) {
    for (const label of c.labels) {
      counts[label]++;
    }
  }

  return counts;
}

/**
 * Calculate Wilson score confidence interval
 * Used for estimating proportion confidence intervals
 */
export function wilsonScoreInterval(
  successes: number,
  total: number,
  confidence: number = 0.95
): { lower: number; upper: number } {
  if (total === 0) {
    return { lower: 0, upper: 0 };
  }

  // Z-score for confidence level
  const z = confidence === 0.95 ? 1.96 : confidence === 0.99 ? 2.576 : 1.645;

  const p = successes / total;
  const n = total;

  const denominator = 1 + (z * z) / n;
  const center = p + (z * z) / (2 * n);
  const margin = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * n)) / n);

  const lower = Math.max(0, (center - margin) / denominator);
  const upper = Math.min(1, (center + margin) / denominator);

  return { lower, upper };
}

/**
 * Calculate target group statistics
 */
export function calculateTargetGroupStats(
  classifications: TargetGroupClassification[],
  framework: FrameworkType,
  targetGroup: string
): TargetGroupStats {
  // Filter to relevant classifications
  const relevant = classifications.filter(
    c => c.framework === framework && c.targetGroup === targetGroup
  );

  if (relevant.length === 0) {
    return {
      framework,
      targetGroup,
      totalMentions: 0,
      hostilityDistribution: { none: 0, low: 0, medium: 0, high: 0 },
      labelCounts: {} as Record<HostilityLabel, number>,
      prevalenceRate: 0,
      confidenceInterval: { lower: 0, upper: 0 },
      avgConfidence: 0,
      sampleSize: 0,
    };
  }

  const hostilityDistribution = calculateHostilityDistribution(relevant);
  const labelCounts = calculateLabelCounts(relevant);

  // Count mentions and hostile mentions
  const totalMentions = relevant.filter(c => c.mentionsGroup).length;
  const hostileMentions = relevant.filter(
    c => c.mentionsGroup && c.hostilityLevel !== 'none'
  ).length;

  // Calculate prevalence rate (hostile / total mentions)
  const prevalenceRate = totalMentions > 0 ? hostileMentions / totalMentions : 0;

  // Calculate confidence interval
  const confidenceInterval = wilsonScoreInterval(hostileMentions, totalMentions);

  // Average confidence
  const totalConfidence = relevant.reduce((sum, c) => sum + c.confidence, 0);
  const avgConfidence = totalConfidence / relevant.length;

  return {
    framework,
    targetGroup,
    totalMentions,
    hostilityDistribution,
    labelCounts,
    prevalenceRate,
    confidenceInterval,
    avgConfidence,
    sampleSize: relevant.length,
  };
}

/**
 * Aggregate multiple target group stats
 */
export function aggregateTargetGroupStats(
  classifications: TargetGroupClassification[],
  frameworks: FrameworkType[],
  targetGroups: string[]
): TargetGroupStats[] {
  const stats: TargetGroupStats[] = [];

  for (const framework of frameworks) {
    for (const targetGroup of targetGroups) {
      const groupStats = calculateTargetGroupStats(classifications, framework, targetGroup);
      if (groupStats.sampleSize > 0) {
        stats.push(groupStats);
      }
    }
  }

  return stats;
}

/**
 * Calculate sentiment delta between two distributions
 */
export function calculateSentimentDelta(
  subject: SentimentDistribution,
  baseline: SentimentDistribution
): { positive: number; neutral: number; negative: number } {
  if (subject.total === 0 || baseline.total === 0) {
    return { positive: 0, neutral: 0, negative: 0 };
  }

  const subjectRates = {
    positive: subject.positive / subject.total,
    neutral: subject.neutral / subject.total,
    negative: subject.negative / subject.total,
  };

  const baselineRates = {
    positive: baseline.positive / baseline.total,
    neutral: baseline.neutral / baseline.total,
    negative: baseline.negative / baseline.total,
  };

  return {
    positive: subjectRates.positive - baselineRates.positive,
    neutral: subjectRates.neutral - baselineRates.neutral,
    negative: subjectRates.negative - baselineRates.negative,
  };
}

/**
 * Calculate prevalence delta between target group stats
 */
export function calculatePrevalenceDelta(
  subject: TargetGroupStats,
  baseline: TargetGroupStats
): number {
  return subject.prevalenceRate - baseline.prevalenceRate;
}

/**
 * Check if sample size meets minimum threshold
 */
export function meetsSampleSizeThreshold(
  stats: { sampleSize: number },
  minSampleSize: number = 30
): boolean {
  return stats.sampleSize >= minSampleSize;
}

/**
 * Calculate percentage for display
 */
export function toPercentage(value: number, decimals: number = 1): string {
  return (value * 100).toFixed(decimals) + '%';
}

/**
 * Format confidence interval for display
 */
export function formatConfidenceInterval(
  ci: { lower: number; upper: number },
  decimals: number = 1
): string {
  return `${toPercentage(ci.lower, decimals)} - ${toPercentage(ci.upper, decimals)}`;
}

/**
 * Determine statistical significance of difference
 * Uses overlap of confidence intervals as a simple heuristic
 */
export function isSignificantDifference(
  ci1: { lower: number; upper: number },
  ci2: { lower: number; upper: number }
): boolean {
  // No overlap means significant difference
  return ci1.upper < ci2.lower || ci2.upper < ci1.lower;
}

/**
 * Get dominant sentiment from distribution
 */
export function getDominantSentiment(distribution: SentimentDistribution): SentimentValue {
  if (distribution.total === 0) return 'neutral';

  if (distribution.positive >= distribution.neutral && distribution.positive >= distribution.negative) {
    return 'positive';
  }
  if (distribution.negative >= distribution.neutral && distribution.negative >= distribution.positive) {
    return 'negative';
  }
  return 'neutral';
}

/**
 * Calculate skew index for sentiment
 * Returns value from -1 (all negative) to +1 (all positive)
 */
export function calculateSentimentSkew(distribution: SentimentDistribution): number {
  if (distribution.total === 0) return 0;

  const positiveRate = distribution.positive / distribution.total;
  const negativeRate = distribution.negative / distribution.total;

  return positiveRate - negativeRate;
}

/**
 * Combine multiple sentiment stats (e.g., for baseline averaging)
 */
export function combineSentimentStats(stats: SentimentStats[]): SentimentStats {
  if (stats.length === 0) {
    return {
      distribution: { positive: 0, neutral: 0, negative: 0, total: 0 },
      avgSubjectivity: 0,
      avgConfidence: 0,
      sampleSize: 0,
    };
  }

  const combined: SentimentDistribution = {
    positive: 0,
    neutral: 0,
    negative: 0,
    total: 0,
  };

  let totalSubjectivity = 0;
  let totalConfidence = 0;
  let totalSamples = 0;

  for (const s of stats) {
    combined.positive += s.distribution.positive;
    combined.neutral += s.distribution.neutral;
    combined.negative += s.distribution.negative;
    combined.total += s.distribution.total;
    totalSubjectivity += s.avgSubjectivity * s.sampleSize;
    totalConfidence += s.avgConfidence * s.sampleSize;
    totalSamples += s.sampleSize;
  }

  return {
    distribution: combined,
    avgSubjectivity: totalSamples > 0 ? totalSubjectivity / totalSamples : 0,
    avgConfidence: totalSamples > 0 ? totalConfidence / totalSamples : 0,
    sampleSize: totalSamples,
  };
}
