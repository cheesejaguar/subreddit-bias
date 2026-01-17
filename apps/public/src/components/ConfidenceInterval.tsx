'use client';

interface ConfidenceIntervalProps {
  value: number;
  lower: number;
  upper: number;
  label: string;
  color?: string;
}

export function ConfidenceInterval({
  value,
  lower,
  upper,
  label,
  color = '#3b82f6',
}: ConfidenceIntervalProps) {
  const formatPercent = (v: number) => `${(v * 100).toFixed(1)}%`;

  // Scale to 0-100% range for visualization
  const scale = 100;
  const pointPosition = value * scale;
  const lowerPosition = lower * scale;
  const upperPosition = upper * scale;
  const intervalWidth = (upper - lower) * scale;

  return (
    <div className="mb-4">
      <div className="flex justify-between text-sm mb-1">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground">
          {formatPercent(value)} (CI: {formatPercent(lower)} - {formatPercent(upper)})
        </span>
      </div>
      <div className="relative h-6 bg-muted rounded">
        {/* Confidence interval bar */}
        <div
          className="absolute h-2 top-2 rounded"
          style={{
            left: `${lowerPosition}%`,
            width: `${intervalWidth}%`,
            backgroundColor: color,
            opacity: 0.3,
          }}
        />
        {/* Point estimate marker */}
        <div
          className="absolute w-1 h-4 top-1 rounded"
          style={{
            left: `${pointPosition}%`,
            backgroundColor: color,
            transform: 'translateX(-50%)',
          }}
        />
        {/* Scale markers */}
        <div className="absolute inset-0 flex justify-between text-xs text-muted-foreground px-1 items-end pb-0.5">
          <span>0%</span>
          <span>50%</span>
          <span>100%</span>
        </div>
      </div>
    </div>
  );
}
