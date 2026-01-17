'use client';

interface HostilityDistribution {
  none: number;
  low: number;
  medium: number;
  high: number;
}

interface LabelCounts {
  slur_or_epithet: number;
  dehumanization: number;
  stereotype_or_trope: number;
  conspiracy_claim: number;
  collective_blame: number;
  calls_for_exclusion_or_violence: number;
  denial_or_minimization: number;
}

interface TargetGroupStats {
  framework: string;
  targetGroup: string;
  totalMentions: number;
  sampleSize: number;
  prevalenceRate: number;
  prevalenceCI: { lower: number; upper: number };
  hostilityDistribution: HostilityDistribution;
  labelCounts: LabelCounts;
  avgConfidence: number;
}

interface TargetGroupChartProps {
  stats: TargetGroupStats;
}

export function TargetGroupChart({ stats }: TargetGroupChartProps) {
  const formatPercent = (value: number) => `${(value * 100).toFixed(1)}%`;

  const hostilityColors = {
    none: '#22c55e',
    low: '#84cc16',
    medium: '#eab308',
    high: '#ef4444',
  };

  const hostilityTotal =
    stats.hostilityDistribution.none +
    stats.hostilityDistribution.low +
    stats.hostilityDistribution.medium +
    stats.hostilityDistribution.high;

  const labelDescriptions: Record<string, string> = {
    slur_or_epithet: 'Slurs or Epithets',
    dehumanization: 'Dehumanization',
    stereotype_or_trope: 'Stereotypes/Tropes',
    conspiracy_claim: 'Conspiracy Claims',
    collective_blame: 'Collective Blame',
    calls_for_exclusion_or_violence: 'Calls for Exclusion/Violence',
    denial_or_minimization: 'Denial/Minimization',
  };

  return (
    <div className="bg-card rounded-lg border p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-semibold capitalize">{stats.targetGroup}</h3>
          <p className="text-sm text-muted-foreground">
            Framework: {stats.framework.toUpperCase()}
          </p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold">{formatPercent(stats.prevalenceRate)}</p>
          <p className="text-xs text-muted-foreground">
            CI: {formatPercent(stats.prevalenceCI.lower)} - {formatPercent(stats.prevalenceCI.upper)}
          </p>
        </div>
      </div>

      {/* Hostility Distribution Bar */}
      <div className="mb-6">
        <p className="text-sm font-medium mb-2">Hostility Distribution</p>
        <div className="h-4 rounded-full overflow-hidden flex bg-muted">
          {hostilityTotal > 0 && (
            <>
              <div
                style={{
                  width: `${(stats.hostilityDistribution.none / hostilityTotal) * 100}%`,
                  backgroundColor: hostilityColors.none,
                }}
                title={`None: ${stats.hostilityDistribution.none}`}
              />
              <div
                style={{
                  width: `${(stats.hostilityDistribution.low / hostilityTotal) * 100}%`,
                  backgroundColor: hostilityColors.low,
                }}
                title={`Low: ${stats.hostilityDistribution.low}`}
              />
              <div
                style={{
                  width: `${(stats.hostilityDistribution.medium / hostilityTotal) * 100}%`,
                  backgroundColor: hostilityColors.medium,
                }}
                title={`Medium: ${stats.hostilityDistribution.medium}`}
              />
              <div
                style={{
                  width: `${(stats.hostilityDistribution.high / hostilityTotal) * 100}%`,
                  backgroundColor: hostilityColors.high,
                }}
                title={`High: ${stats.hostilityDistribution.high}`}
              />
            </>
          )}
        </div>
        <div className="flex justify-between text-xs text-muted-foreground mt-1">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: hostilityColors.none }} />
            None ({stats.hostilityDistribution.none})
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: hostilityColors.low }} />
            Low ({stats.hostilityDistribution.low})
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: hostilityColors.medium }} />
            Medium ({stats.hostilityDistribution.medium})
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: hostilityColors.high }} />
            High ({stats.hostilityDistribution.high})
          </span>
        </div>
      </div>

      {/* Label Breakdown */}
      <div>
        <p className="text-sm font-medium mb-2">Indicator Breakdown</p>
        <div className="space-y-2">
          {Object.entries(stats.labelCounts)
            .filter(([_, count]) => count > 0)
            .sort((a, b) => b[1] - a[1])
            .map(([label, count]) => (
              <div key={label} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{labelDescriptions[label] ?? label}</span>
                <span className="font-medium">{count}</span>
              </div>
            ))}
          {Object.values(stats.labelCounts).every(c => c === 0) && (
            <p className="text-sm text-muted-foreground">No indicators detected</p>
          )}
        </div>
      </div>

      {/* Metadata */}
      <div className="mt-4 pt-4 border-t text-xs text-muted-foreground">
        <div className="flex justify-between">
          <span>Sample Size: {stats.sampleSize}</span>
          <span>Mentions: {stats.totalMentions}</span>
          <span>Confidence: {formatPercent(stats.avgConfidence)}</span>
        </div>
      </div>
    </div>
  );
}
