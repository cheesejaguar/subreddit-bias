/**
 * Baseline Comparison
 * Compare subreddit metrics against peer subreddits or platform baselines
 *
 * RALPH.md Section 3.2: Baselines (reduce confounding)
 */

import type {
  SentimentStats,
  TargetGroupStats,
  FrameworkType,
} from '@subreddit-bias/db';

import {
  type SentimentDistribution,
  calculateSentimentDelta,
  calculatePrevalenceDelta,
  wilsonScoreInterval,
  isSignificantDifference,
  toPercentage,
} from './aggregation';

// Baseline configuration
export interface BaselineConfig {
  // Peer subreddits to compare against (user-provided)
  peerSubreddits: string[];

  // Platform baseline subreddits (fixed per methodology version)
  platformBaselineSubreddits: string[];

  // Minimum sample size for valid comparison
  minSampleSize: number;
}

// Baseline comparison result
export interface BaselineComparison {
  type: 'peer' | 'platform';
  subjectSubreddit: string;
  baselineDescription: string;

  sentiment: SentimentComparison | null;
  targetGroups: TargetGroupComparison[];

  isStatisticallySignificant: boolean;
  limitations: string[];
}

// Sentiment comparison
export interface SentimentComparison {
  subject: SentimentDistribution;
  baseline: SentimentDistribution;
  delta: SentimentDelta;
  isSignificant: boolean;
  interpretation: string;
}

// Sentiment delta with confidence intervals
export interface SentimentDelta {
  positive: number;
  neutral: number;
  negative: number;

  positiveCI: { lower: number; upper: number };
  neutralCI: { lower: number; upper: number };
  negativeCI: { lower: number; upper: number };
}

// Target group comparison
export interface TargetGroupComparison {
  targetGroup: string;
  framework: FrameworkType;

  subjectPrevalence: number;
  baselinePrevalence: number;
  prevalenceDelta: number;

  subjectCI: { lower: number; upper: number };
  baselineCI: { lower: number; upper: number };

  isSignificant: boolean;
  interpretation: string;
}

// Default platform baseline subreddits
// These should be kept constant per methodology version for reproducibility
export const PLATFORM_BASELINE_SUBREDDITS = [
  'AskReddit',
  'news',
  'worldnews',
  'politics',
  'todayilearned',
];

// Default baseline configuration
export const DEFAULT_BASELINE_CONFIG: BaselineConfig = {
  peerSubreddits: [],
  platformBaselineSubreddits: PLATFORM_BASELINE_SUBREDDITS,
  minSampleSize: 30,
};

/**
 * Compare subject subreddit against baseline
 */
export function compareToBaseline(
  subjectSubreddit: string,
  subjectSentiment: SentimentStats,
  subjectTargetGroups: TargetGroupStats[],
  baselineSentiment: SentimentStats,
  baselineTargetGroups: TargetGroupStats[],
  baselineType: 'peer' | 'platform',
  baselineDescription: string
): BaselineComparison {
  const limitations: string[] = [];

  // Check sample sizes
  if (subjectSentiment.sampleSize < DEFAULT_BASELINE_CONFIG.minSampleSize) {
    limitations.push(`Subject sample size (${subjectSentiment.sampleSize}) below recommended minimum (${DEFAULT_BASELINE_CONFIG.minSampleSize})`);
  }
  if (baselineSentiment.sampleSize < DEFAULT_BASELINE_CONFIG.minSampleSize) {
    limitations.push(`Baseline sample size (${baselineSentiment.sampleSize}) below recommended minimum (${DEFAULT_BASELINE_CONFIG.minSampleSize})`);
  }

  // Sentiment comparison
  const sentimentComparison = compareSentiment(
    subjectSentiment.distribution,
    baselineSentiment.distribution
  );

  // Target group comparisons
  const targetGroupComparisons: TargetGroupComparison[] = [];

  for (const subjectTG of subjectTargetGroups) {
    const baselineTG = baselineTargetGroups.find(
      tg => tg.targetGroup === subjectTG.targetGroup && tg.framework === subjectTG.framework
    );

    if (!baselineTG) {
      limitations.push(`No baseline data for ${subjectTG.targetGroup} (${subjectTG.framework})`);
      continue;
    }

    targetGroupComparisons.push(
      compareTargetGroup(subjectTG, baselineTG)
    );
  }

  // Determine overall statistical significance
  const isStatisticallySignificant =
    sentimentComparison.isSignificant ||
    targetGroupComparisons.some(tg => tg.isSignificant);

  return {
    type: baselineType,
    subjectSubreddit,
    baselineDescription,
    sentiment: sentimentComparison,
    targetGroups: targetGroupComparisons,
    isStatisticallySignificant,
    limitations,
  };
}

/**
 * Compare sentiment distributions
 */
export function compareSentiment(
  subject: SentimentDistribution,
  baseline: SentimentDistribution
): SentimentComparison {
  const delta = calculateSentimentDelta(subject, baseline);

  // Calculate confidence intervals for each sentiment
  const subjectPositiveCI = wilsonScoreInterval(subject.positive, subject.total);
  const subjectNeutralCI = wilsonScoreInterval(subject.neutral, subject.total);
  const subjectNegativeCI = wilsonScoreInterval(subject.negative, subject.total);

  const baselinePositiveCI = wilsonScoreInterval(baseline.positive, baseline.total);
  const baselineNeutralCI = wilsonScoreInterval(baseline.neutral, baseline.total);
  const baselineNegativeCI = wilsonScoreInterval(baseline.negative, baseline.total);

  // Check significance for each
  const positiveSignificant = isSignificantDifference(subjectPositiveCI, baselinePositiveCI);
  const neutralSignificant = isSignificantDifference(subjectNeutralCI, baselineNeutralCI);
  const negativeSignificant = isSignificantDifference(subjectNegativeCI, baselineNegativeCI);

  const isSignificant = positiveSignificant || neutralSignificant || negativeSignificant;

  // Generate interpretation
  const interpretation = generateSentimentInterpretation(delta, isSignificant);

  return {
    subject,
    baseline,
    delta: {
      positive: delta.positive,
      neutral: delta.neutral,
      negative: delta.negative,
      positiveCI: {
        lower: subjectPositiveCI.lower - baselinePositiveCI.upper,
        upper: subjectPositiveCI.upper - baselinePositiveCI.lower,
      },
      neutralCI: {
        lower: subjectNeutralCI.lower - baselineNeutralCI.upper,
        upper: subjectNeutralCI.upper - baselineNeutralCI.lower,
      },
      negativeCI: {
        lower: subjectNegativeCI.lower - baselineNegativeCI.upper,
        upper: subjectNegativeCI.upper - baselineNegativeCI.lower,
      },
    },
    isSignificant,
    interpretation,
  };
}

/**
 * Compare target group prevalence
 */
export function compareTargetGroup(
  subject: TargetGroupStats,
  baseline: TargetGroupStats
): TargetGroupComparison {
  const prevalenceDelta = calculatePrevalenceDelta(subject, baseline);

  const isSignificant = isSignificantDifference(
    subject.prevalenceCI,
    baseline.prevalenceCI
  );

  const interpretation = generateTargetGroupInterpretation(
    subject.targetGroup,
    subject.prevalenceRate,
    baseline.prevalenceRate,
    prevalenceDelta,
    isSignificant
  );

  return {
    targetGroup: subject.targetGroup,
    framework: subject.framework,
    subjectPrevalence: subject.prevalenceRate,
    baselinePrevalence: baseline.prevalenceRate,
    prevalenceDelta,
    subjectCI: subject.prevalenceCI,
    baselineCI: baseline.prevalenceCI,
    isSignificant,
    interpretation,
  };
}

/**
 * Generate interpretation text for sentiment comparison
 */
function generateSentimentInterpretation(
  delta: { positive: number; neutral: number; negative: number },
  isSignificant: boolean
): string {
  if (!isSignificant) {
    return 'No statistically significant difference in sentiment distribution compared to baseline.';
  }

  const parts: string[] = [];

  if (Math.abs(delta.positive) >= 0.05) {
    const direction = delta.positive > 0 ? 'higher' : 'lower';
    parts.push(`${toPercentage(Math.abs(delta.positive))} ${direction} positive sentiment`);
  }

  if (Math.abs(delta.negative) >= 0.05) {
    const direction = delta.negative > 0 ? 'higher' : 'lower';
    parts.push(`${toPercentage(Math.abs(delta.negative))} ${direction} negative sentiment`);
  }

  if (parts.length === 0) {
    return 'Marginal difference in sentiment distribution compared to baseline.';
  }

  return `Compared to baseline: ${parts.join(', ')}.`;
}

/**
 * Generate interpretation text for target group comparison
 */
function generateTargetGroupInterpretation(
  targetGroup: string,
  subjectRate: number,
  baselineRate: number,
  delta: number,
  isSignificant: boolean
): string {
  if (!isSignificant) {
    return `No statistically significant difference in ${targetGroup}-related content prevalence compared to baseline.`;
  }

  const direction = delta > 0 ? 'higher' : 'lower';
  const magnitude = Math.abs(delta);

  if (magnitude < 0.01) {
    return `Marginally ${direction} prevalence of ${targetGroup}-related content indicators.`;
  }

  return `${toPercentage(magnitude)} ${direction} prevalence of ${targetGroup}-related content indicators compared to baseline (${toPercentage(subjectRate)} vs ${toPercentage(baselineRate)}).`;
}

/**
 * Combine multiple baseline comparisons (for peer subreddit aggregation)
 */
export function aggregateBaselineComparisons(
  comparisons: BaselineComparison[]
): BaselineComparison | null {
  if (comparisons.length === 0) return null;

  const first = comparisons[0];

  // Aggregate sentiment
  let aggregatedSentiment: SentimentComparison | null = null;
  const sentimentComparisons = comparisons
    .map(c => c.sentiment)
    .filter((s): s is SentimentComparison => s !== null);

  if (sentimentComparisons.length > 0) {
    // Average the baselines
    const avgBaseline: SentimentDistribution = {
      positive: Math.round(sentimentComparisons.reduce((sum, s) => sum + s.baseline.positive, 0) / sentimentComparisons.length),
      neutral: Math.round(sentimentComparisons.reduce((sum, s) => sum + s.baseline.neutral, 0) / sentimentComparisons.length),
      negative: Math.round(sentimentComparisons.reduce((sum, s) => sum + s.baseline.negative, 0) / sentimentComparisons.length),
      total: Math.round(sentimentComparisons.reduce((sum, s) => sum + s.baseline.total, 0) / sentimentComparisons.length),
    };

    aggregatedSentiment = compareSentiment(first.sentiment!.subject, avgBaseline);
  }

  // Aggregate target groups
  const allTargetGroups = comparisons.flatMap(c => c.targetGroups);
  const uniqueTargetGroupKeys = new Set(
    allTargetGroups.map(tg => `${tg.targetGroup}:${tg.framework}`)
  );

  const aggregatedTargetGroups: TargetGroupComparison[] = [];
  for (const key of uniqueTargetGroupKeys) {
    const [targetGroup, framework] = key.split(':');
    const matching = allTargetGroups.filter(
      tg => tg.targetGroup === targetGroup && tg.framework === framework
    );

    if (matching.length > 0) {
      // Average the baseline prevalences
      const avgBaselinePrevalence = matching.reduce((sum, tg) => sum + tg.baselinePrevalence, 0) / matching.length;
      const subjectPrevalence = matching[0].subjectPrevalence;

      aggregatedTargetGroups.push({
        targetGroup,
        framework: framework as FrameworkType,
        subjectPrevalence,
        baselinePrevalence: avgBaselinePrevalence,
        prevalenceDelta: subjectPrevalence - avgBaselinePrevalence,
        subjectCI: matching[0].subjectCI,
        baselineCI: {
          lower: Math.min(...matching.map(m => m.baselineCI.lower)),
          upper: Math.max(...matching.map(m => m.baselineCI.upper)),
        },
        isSignificant: matching.some(m => m.isSignificant),
        interpretation: generateTargetGroupInterpretation(
          targetGroup,
          subjectPrevalence,
          avgBaselinePrevalence,
          subjectPrevalence - avgBaselinePrevalence,
          matching.some(m => m.isSignificant)
        ),
      });
    }
  }

  // Combine limitations
  const allLimitations = new Set(comparisons.flatMap(c => c.limitations));

  return {
    type: first.type,
    subjectSubreddit: first.subjectSubreddit,
    baselineDescription: `Aggregated from ${comparisons.length} baseline comparisons`,
    sentiment: aggregatedSentiment,
    targetGroups: aggregatedTargetGroups,
    isStatisticallySignificant:
      (aggregatedSentiment?.isSignificant ?? false) ||
      aggregatedTargetGroups.some(tg => tg.isSignificant),
    limitations: Array.from(allLimitations),
  };
}

/**
 * Format baseline comparison for display
 */
export function formatBaselineComparison(comparison: BaselineComparison): string {
  const lines: string[] = [
    `Baseline Comparison: ${comparison.subjectSubreddit} vs ${comparison.baselineDescription}`,
    '',
  ];

  if (comparison.sentiment) {
    lines.push('Sentiment:');
    lines.push(`  ${comparison.sentiment.interpretation}`);
    lines.push('');
  }

  if (comparison.targetGroups.length > 0) {
    lines.push('Target Group Indicators:');
    for (const tg of comparison.targetGroups) {
      lines.push(`  ${tg.targetGroup} (${tg.framework}): ${tg.interpretation}`);
    }
    lines.push('');
  }

  if (comparison.limitations.length > 0) {
    lines.push('Limitations:');
    for (const limitation of comparison.limitations) {
      lines.push(`  - ${limitation}`);
    }
  }

  return lines.join('\n');
}
