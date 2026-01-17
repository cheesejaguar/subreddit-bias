'use client';

interface SamplingConfig {
  strategies: string[];
  postsPerStrategy: number;
  commentsPerPost: number;
  maxDepth: number;
  seed: number;
}

interface MethodologyInfoProps {
  methodologyVersion: string;
  sampling: SamplingConfig;
  frameworks: string[];
  sampleSize: number;
  timeframeStart: string;
  timeframeEnd: string;
}

export function MethodologyInfo({
  methodologyVersion,
  sampling,
  frameworks,
  sampleSize,
  timeframeStart,
  timeframeEnd,
}: MethodologyInfoProps) {
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <div className="bg-card rounded-lg border p-6">
      <h3 className="font-semibold mb-4">Methodology Details</h3>

      <div className="space-y-4 text-sm">
        <div>
          <p className="text-muted-foreground">Methodology Version</p>
          <p className="font-mono">{methodologyVersion}</p>
        </div>

        <div>
          <p className="text-muted-foreground">Timeframe</p>
          <p>{formatDate(timeframeStart)} to {formatDate(timeframeEnd)}</p>
        </div>

        <div>
          <p className="text-muted-foreground">Sample Size</p>
          <p>{sampleSize.toLocaleString()} comments</p>
        </div>

        <div>
          <p className="text-muted-foreground">Sampling Strategy</p>
          <ul className="list-disc list-inside">
            {sampling.strategies.map((strategy) => (
              <li key={strategy} className="capitalize">{strategy}</li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground mt-1">
            {sampling.postsPerStrategy} posts per strategy, {sampling.commentsPerPost} comments per post, max depth {sampling.maxDepth}
          </p>
        </div>

        <div>
          <p className="text-muted-foreground">Reproducibility Seed</p>
          <p className="font-mono">{sampling.seed}</p>
        </div>

        {frameworks.length > 0 && (
          <div>
            <p className="text-muted-foreground">Analysis Frameworks</p>
            <ul className="list-disc list-inside">
              {frameworks.map((framework) => (
                <li key={framework} className="uppercase">{framework}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="pt-4 border-t">
          <p className="text-xs text-muted-foreground">
            Results are reproducible using the same methodology version and seed.
            Classifications use a two-stage cascade: fast heuristics for clear cases,
            LLM classification for ambiguous content.
          </p>
        </div>
      </div>
    </div>
  );
}
