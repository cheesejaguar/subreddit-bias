import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { SentimentChart } from '@/components/SentimentChart';
import { TargetGroupChart } from '@/components/TargetGroupChart';
import { ConfidenceInterval } from '@/components/ConfidenceInterval';
import { MethodologyInfo } from '@/components/MethodologyInfo';

// Mock data - in production, this would be fetched from the API
const getMockReport = (id: string) => ({
  id,
  subreddit: 'example',
  status: 'completed' as const,
  methodologyVersion: '1.0.0',
  createdAt: '2024-01-15T10:00:00Z',
  completedAt: '2024-01-15T10:30:00Z',
  config: {
    subreddit: 'example',
    timeframeStart: '2024-01-08T00:00:00Z',
    timeframeEnd: '2024-01-15T00:00:00Z',
    sampling: {
      strategies: ['top', 'new'],
      postsPerStrategy: 25,
      commentsPerPost: 50,
      maxDepth: 2,
      seed: 1705315200,
    },
    frameworks: ['nexus', 'jda'],
    enableTargetGroupAnalysis: true,
    targetGroups: ['jewish', 'muslim'],
    peerSubreddits: [],
  },
  communitySentiment: {
    distribution: { positive: 350, neutral: 450, negative: 200, total: 1000 },
    avgSubjectivity: 0.45,
    avgConfidence: 0.82,
    sampleSize: 1000,
  },
  moderatorSentiment: {
    distribution: { positive: 25, neutral: 55, negative: 20, total: 100 },
    avgSubjectivity: 0.38,
    avgConfidence: 0.85,
    sampleSize: 100,
  },
  targetGroupStats: [
    {
      framework: 'nexus',
      targetGroup: 'jewish',
      totalMentions: 45,
      sampleSize: 1000,
      prevalenceRate: 0.045,
      prevalenceCI: { lower: 0.033, upper: 0.060 },
      hostilityDistribution: { none: 30, low: 8, medium: 5, high: 2 },
      labelCounts: {
        slur_or_epithet: 1,
        dehumanization: 2,
        stereotype_or_trope: 5,
        conspiracy_claim: 3,
        collective_blame: 1,
        calls_for_exclusion_or_violence: 1,
        denial_or_minimization: 0,
      },
      avgConfidence: 0.78,
    },
    {
      framework: 'nexus',
      targetGroup: 'muslim',
      totalMentions: 28,
      sampleSize: 1000,
      prevalenceRate: 0.028,
      prevalenceCI: { lower: 0.019, upper: 0.040 },
      hostilityDistribution: { none: 20, low: 5, medium: 2, high: 1 },
      labelCounts: {
        slur_or_epithet: 0,
        dehumanization: 1,
        stereotype_or_trope: 3,
        conspiracy_claim: 1,
        collective_blame: 1,
        calls_for_exclusion_or_violence: 0,
        denial_or_minimization: 0,
      },
      avgConfidence: 0.75,
    },
  ],
  sampledCommentCount: 1000,
  totalTokensUsed: 125000,
  estimatedCost: 0.45,
});

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const report = getMockReport(id);

  const formatPercent = (value: number) => `${(value * 100).toFixed(1)}%`;

  return (
    <main className="min-h-screen flex flex-col">
      <Header />
      <div className="flex-1 max-w-5xl mx-auto px-4 py-12 w-full">
        <div className="mb-8">
          <a href="/" className="text-sm text-muted-foreground hover:text-foreground">
            &larr; Back to Reports
          </a>
        </div>

        <article>
          <header className="mb-8">
            <h1 className="text-3xl font-bold mb-2">r/{report.subreddit} Analysis</h1>
            <p className="text-muted-foreground">
              Sentiment and language signal analysis from sampled content
            </p>
            <div className="mt-4 flex gap-4 text-sm text-muted-foreground">
              <span>Report ID: {report.id}</span>
              <span>&bull;</span>
              <span>Generated: {new Date(report.completedAt!).toLocaleDateString()}</span>
            </div>
          </header>

          {/* Limitations Disclaimer - Required by RALPH.md */}
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 mb-8">
            <h3 className="font-semibold text-yellow-800 dark:text-yellow-200 mb-2">
              Important Limitations & Disclaimer
            </h3>
            <ul className="text-sm text-yellow-700 dark:text-yellow-300 space-y-1">
              <li>&bull; This report shows <strong>measured indicators in sampled content</strong>, not verdicts about community beliefs</li>
              <li>&bull; Classifications may contain errors due to sarcasm, quoted content, reclaimed language, or context</li>
              <li>&bull; Prevalence estimates include confidence intervals reflecting statistical uncertainty</li>
              <li>&bull; Results are aggregate-only; no individual user data is available</li>
              <li>&bull; <strong>Do not use this data to harass or target individuals</strong></li>
            </ul>
          </div>

          {/* Community Sentiment Section */}
          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-4">Community Sentiment</h2>
            <div className="bg-card rounded-lg border p-6">
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <SentimentChart distribution={report.communitySentiment.distribution} />
                </div>
                <div className="space-y-4">
                  <ConfidenceInterval
                    value={report.communitySentiment.distribution.positive / report.communitySentiment.distribution.total}
                    lower={0.32}
                    upper={0.38}
                    label="Positive"
                    color="#22c55e"
                  />
                  <ConfidenceInterval
                    value={report.communitySentiment.distribution.neutral / report.communitySentiment.distribution.total}
                    lower={0.42}
                    upper={0.48}
                    label="Neutral"
                    color="#6b7280"
                  />
                  <ConfidenceInterval
                    value={report.communitySentiment.distribution.negative / report.communitySentiment.distribution.total}
                    lower={0.18}
                    upper={0.22}
                    label="Negative"
                    color="#ef4444"
                  />
                  <div className="text-sm text-muted-foreground pt-2 border-t">
                    <p>Sample Size: {report.communitySentiment.sampleSize.toLocaleString()} comments</p>
                    <p>Avg Confidence: {formatPercent(report.communitySentiment.avgConfidence)}</p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Moderator Sentiment Section */}
          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-4">Moderator Aggregate Sentiment</h2>
            <div className="bg-card rounded-lg border p-6">
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <SentimentChart distribution={report.moderatorSentiment.distribution} />
                </div>
                <div className="space-y-4">
                  <ConfidenceInterval
                    value={report.moderatorSentiment.distribution.positive / report.moderatorSentiment.distribution.total}
                    lower={0.17}
                    upper={0.35}
                    label="Positive"
                    color="#22c55e"
                  />
                  <ConfidenceInterval
                    value={report.moderatorSentiment.distribution.neutral / report.moderatorSentiment.distribution.total}
                    lower={0.45}
                    upper={0.64}
                    label="Neutral"
                    color="#6b7280"
                  />
                  <ConfidenceInterval
                    value={report.moderatorSentiment.distribution.negative / report.moderatorSentiment.distribution.total}
                    lower={0.13}
                    upper={0.29}
                    label="Negative"
                    color="#ef4444"
                  />
                  <div className="text-sm text-muted-foreground pt-2 border-t">
                    <p>Sample Size: {report.moderatorSentiment.sampleSize.toLocaleString()} comments</p>
                    <p>Avg Confidence: {formatPercent(report.moderatorSentiment.avgConfidence)}</p>
                    <p className="text-xs mt-1">Note: Aggregate only, no individual mod data</p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Target Group Analysis Section */}
          {report.config.enableTargetGroupAnalysis && report.targetGroupStats.length > 0 && (
            <section className="mb-8">
              <h2 className="text-xl font-semibold mb-4">Target Group Indicators</h2>

              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-4">
                <h3 className="font-semibold text-blue-800 dark:text-blue-200 mb-1">
                  About This Section
                </h3>
                <p className="text-sm text-blue-700 dark:text-blue-300">
                  This section shows estimated prevalence of group-directed content indicators using the
                  {' '}<strong>{report.config.frameworks.map(f => f.toUpperCase()).join(' and ')}</strong> framework(s).
                  Prevalence estimates are based on sampled content and include confidence intervals.
                  This measures <em>content</em>, not community beliefs.
                </p>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                {report.targetGroupStats.map((stats, index) => (
                  <TargetGroupChart key={`${stats.framework}-${stats.targetGroup}-${index}`} stats={stats} />
                ))}
              </div>
            </section>
          )}

          {/* Methodology Section */}
          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-4">Methodology</h2>
            <MethodologyInfo
              methodologyVersion={report.methodologyVersion}
              sampling={report.config.sampling}
              frameworks={report.config.frameworks}
              sampleSize={report.sampledCommentCount}
              timeframeStart={report.config.timeframeStart}
              timeframeEnd={report.config.timeframeEnd}
            />
          </section>

          {/* Processing Stats */}
          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-4">Processing Statistics</h2>
            <div className="bg-card rounded-lg border p-6">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-2xl font-bold">{report.sampledCommentCount.toLocaleString()}</p>
                  <p className="text-sm text-muted-foreground">Comments Analyzed</p>
                </div>
                <div>
                  <p className="text-2xl font-bold">{report.totalTokensUsed.toLocaleString()}</p>
                  <p className="text-sm text-muted-foreground">Tokens Used</p>
                </div>
                <div>
                  <p className="text-2xl font-bold">${report.estimatedCost.toFixed(2)}</p>
                  <p className="text-sm text-muted-foreground">Estimated Cost</p>
                </div>
              </div>
            </div>
          </section>

          {/* Misuse Prevention Banner - Required by RALPH.md */}
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
            <h3 className="font-semibold text-red-800 dark:text-red-200 mb-1">
              Misuse Prevention Notice
            </h3>
            <p className="text-sm text-red-700 dark:text-red-300">
              This data is provided for informational purposes only. Do not use this information
              to harass, target, or discriminate against individuals or communities. Misuse of
              this data may violate platform terms of service and applicable laws.
            </p>
          </div>
        </article>
      </div>
      <Footer />
    </main>
  );
}
