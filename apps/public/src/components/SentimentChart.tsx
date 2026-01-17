'use client';

import type { SentimentDistribution } from '@subreddit-bias/db';

interface SentimentChartProps {
  distribution: SentimentDistribution;
  showLabels?: boolean;
}

export function SentimentChart({ distribution, showLabels = true }: SentimentChartProps) {
  const total = distribution.total || 1;
  const positivePercent = (distribution.positive / total) * 100;
  const neutralPercent = (distribution.neutral / total) * 100;
  const negativePercent = (distribution.negative / total) * 100;

  return (
    <div>
      <div className="flex h-4 rounded-full overflow-hidden bg-muted">
        <div
          className="bg-green-500 transition-all"
          style={{ width: `${positivePercent}%` }}
          title={`Positive: ${positivePercent.toFixed(1)}%`}
        />
        <div
          className="bg-gray-400 transition-all"
          style={{ width: `${neutralPercent}%` }}
          title={`Neutral: ${neutralPercent.toFixed(1)}%`}
        />
        <div
          className="bg-red-500 transition-all"
          style={{ width: `${negativePercent}%` }}
          title={`Negative: ${negativePercent.toFixed(1)}%`}
        />
      </div>

      {showLabels && (
        <div className="flex justify-between mt-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-green-500" />
            Positive {positivePercent.toFixed(1)}%
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-gray-400" />
            Neutral {neutralPercent.toFixed(1)}%
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-red-500" />
            Negative {negativePercent.toFixed(1)}%
          </span>
        </div>
      )}
    </div>
  );
}
