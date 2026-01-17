'use client';

import { useState, useEffect, useCallback } from 'react';

interface Report {
  id: string;
  subreddit: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  sampledCommentCount: number;
  totalTokensUsed: number;
  estimatedCost: number;
  methodologyVersion: string;
  createdAt: string;
  completedAt: string | null;
  config: {
    sampling: {
      seed: number;
      strategies: string[];
      postsPerStrategy: number;
      commentsPerPost: number;
      maxDepth: number;
    };
    frameworks: string[];
  };
}

interface SampledComment {
  id: string;
  redditId: string;
  permalink: string;
  samplingStrategy: string;
  depth: number;
  isModeratorComment: boolean;
}

export function AuditPanel() {
  const [reports, setReports] = useState<Report[]>([]);
  const [selectedReport, setSelectedReport] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchReports = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/reports');
      const result = await response.json();

      if (result.success) {
        setReports(result.data);
        setError(null);
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch reports');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  const formatDate = (dateStr: string) => {
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(dateStr));
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'text-green-600';
      case 'running':
        return 'text-yellow-600';
      case 'failed':
      case 'cancelled':
        return 'text-red-600';
      case 'pending':
        return 'text-blue-600';
      default:
        return 'text-gray-600';
    }
  };

  const selectedReportData = reports.find((r) => r.id === selectedReport);

  if (loading) {
    return (
      <div className="space-y-8">
        <section className="card">
          <h2 className="text-lg font-semibold mb-4">Report Selection</h2>
          <p className="text-sm text-muted-foreground">Loading reports...</p>
        </section>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-8">
        <section className="card">
          <h2 className="text-lg font-semibold mb-4">Report Selection</h2>
          <p className="text-sm text-red-500">Error: {error}</p>
          <button onClick={fetchReports} className="btn btn-secondary mt-4">
            Retry
          </button>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <section className="card">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold">Report Selection</h2>
          <button onClick={fetchReports} className="btn btn-secondary text-xs">
            Refresh
          </button>
        </div>

        {reports.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No reports found. Create a new report from the Run panel.
          </p>
        ) : (
          <div className="space-y-2">
            {reports.map((report) => (
              <button
                key={report.id}
                onClick={() => setSelectedReport(report.id)}
                className={`w-full text-left p-3 rounded-lg border transition-colors ${
                  selectedReport === report.id
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50'
                }`}
              >
                <div className="flex justify-between items-center">
                  <span className="font-medium">r/{report.subreddit}</span>
                  <span className="text-sm text-muted-foreground">
                    {formatDate(report.createdAt)}
                  </span>
                </div>
                <div className="flex justify-between items-center mt-1">
                  <p className="text-sm text-muted-foreground">
                    {report.sampledCommentCount} comments sampled
                  </p>
                  <span className={`text-xs ${getStatusColor(report.status)}`}>
                    {report.status}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      {selectedReportData && (
        <>
          <section className="card">
            <h2 className="text-lg font-semibold mb-4">Report Details</h2>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Report ID</p>
                <p className="font-mono text-xs">{selectedReportData.id}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Status</p>
                <p className={`font-medium ${getStatusColor(selectedReportData.status)}`}>
                  {selectedReportData.status}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Comments Sampled</p>
                <p className="font-medium">{selectedReportData.sampledCommentCount}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Total Tokens</p>
                <p className="font-medium">
                  {selectedReportData.totalTokensUsed.toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Estimated Cost</p>
                <p className="font-medium">${selectedReportData.estimatedCost.toFixed(4)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Completed</p>
                <p className="font-medium">
                  {selectedReportData.completedAt
                    ? formatDate(selectedReportData.completedAt)
                    : '-'}
                </p>
              </div>
            </div>
          </section>

          <section className="card">
            <h2 className="text-lg font-semibold mb-4">Methodology Details</h2>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Methodology Version</p>
                <p className="font-medium">{selectedReportData.methodologyVersion}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Sampling Seed</p>
                <p className="font-mono">{selectedReportData.config?.sampling?.seed ?? '-'}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Strategies</p>
                <p className="font-medium">
                  {selectedReportData.config?.sampling?.strategies?.join(', ') ?? '-'}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Posts per Strategy</p>
                <p className="font-medium">
                  {selectedReportData.config?.sampling?.postsPerStrategy ?? '-'}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Comments per Post</p>
                <p className="font-medium">
                  {selectedReportData.config?.sampling?.commentsPerPost ?? '-'}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Max Depth</p>
                <p className="font-medium">
                  {selectedReportData.config?.sampling?.maxDepth ?? '-'}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Frameworks</p>
                <p className="font-medium uppercase">
                  {selectedReportData.config?.frameworks?.join(', ') ?? '-'}
                </p>
              </div>
            </div>
          </section>

          <section className="card">
            <h2 className="text-lg font-semibold mb-4">Sampled Comments</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Comment IDs and permalinks from the sample. Full text is not retained for privacy.
            </p>

            {selectedReportData.sampledCommentCount === 0 ? (
              <p className="text-sm text-muted-foreground">
                No comments sampled yet. The report may still be running.
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                {selectedReportData.sampledCommentCount} comments were sampled for this report.
                Individual comment data is available via the database for detailed auditing.
              </p>
            )}
          </section>
        </>
      )}
    </div>
  );
}
