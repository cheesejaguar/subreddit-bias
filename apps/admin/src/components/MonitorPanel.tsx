'use client';

import { useState, useEffect, useCallback } from 'react';

interface Job {
  id: string;
  reportId: string;
  subreddit: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  currentPhase: string;
  tokensUsed: number;
  commentsProcessed: number;
  commentsTotal: number;
  rateLimitEvents: number;
  startedAt: string | null;
  completedAt: string | null;
  errorMessage: string | null;
}

export function MonitorPanel() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchJobs = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/jobs');
      const result = await response.json();

      if (result.success) {
        setJobs(result.data);
        setError(null);
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch jobs');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchJobs();

    // Poll for updates every 5 seconds if there are active jobs
    const interval = setInterval(() => {
      const hasActiveJobs = jobs.some(
        (j) => j.status === 'pending' || j.status === 'running'
      );
      if (hasActiveJobs) {
        fetchJobs();
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [fetchJobs, jobs]);

  const formatTime = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(new Date(dateStr));
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'text-green-600 bg-green-100 dark:text-green-400 dark:bg-green-900/30';
      case 'running':
        return 'text-yellow-600 bg-yellow-100 dark:text-yellow-400 dark:bg-yellow-900/30';
      case 'failed':
      case 'cancelled':
        return 'text-red-600 bg-red-100 dark:text-red-400 dark:bg-red-900/30';
      case 'pending':
        return 'text-blue-600 bg-blue-100 dark:text-blue-400 dark:bg-blue-900/30';
      default:
        return 'text-gray-600 bg-gray-100 dark:text-gray-400 dark:bg-gray-900/30';
    }
  };

  // Calculate totals for the summary
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const todayJobs = jobs.filter(
    (j) => j.startedAt && new Date(j.startedAt) >= todayStart
  );
  const totalTokensToday = todayJobs.reduce((sum, j) => sum + j.tokensUsed, 0);
  const totalCostToday = (totalTokensToday * 0.15) / 1_000_000;
  const totalRateLimitEvents = todayJobs.reduce(
    (sum, j) => sum + j.rateLimitEvents,
    0
  );

  if (loading) {
    return (
      <div className="space-y-8">
        <section className="card">
          <h2 className="text-lg font-semibold mb-4">Active Jobs</h2>
          <p className="text-sm text-muted-foreground">Loading...</p>
        </section>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-8">
        <section className="card">
          <h2 className="text-lg font-semibold mb-4">Active Jobs</h2>
          <p className="text-sm text-red-500">Error: {error}</p>
          <button
            onClick={fetchJobs}
            className="btn btn-secondary mt-4"
          >
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
          <h2 className="text-lg font-semibold">Jobs</h2>
          <button
            onClick={fetchJobs}
            className="btn btn-secondary text-xs"
          >
            Refresh
          </button>
        </div>

        {jobs.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No jobs found. Create a new report from the Run panel.
          </p>
        ) : (
          <div className="space-y-4">
            {jobs.map((job) => (
              <div key={job.id} className="border border-border rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="font-medium">r/{job.subreddit}</h3>
                    <p className="text-xs text-muted-foreground">
                      Started: {formatTime(job.startedAt)}
                      {job.completedAt && ` • Completed: ${formatTime(job.completedAt)}`}
                    </p>
                  </div>
                  <span
                    className={`px-2 py-1 text-xs rounded-full font-medium ${getStatusColor(
                      job.status
                    )}`}
                  >
                    {job.status}
                  </span>
                </div>

                {(job.status === 'running' || job.status === 'pending') && (
                  <div className="mb-3">
                    <div className="flex justify-between text-sm mb-1">
                      <span>{job.currentPhase}</span>
                      <span>{job.progress}%</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary transition-all"
                        style={{ width: `${job.progress}%` }}
                      />
                    </div>
                  </div>
                )}

                {job.errorMessage && (
                  <p className="text-sm text-red-500 mb-3">{job.errorMessage}</p>
                )}

                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Comments</p>
                    <p className="font-medium">
                      {job.commentsProcessed}
                      {job.commentsTotal > 0 && ` / ${job.commentsTotal}`}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Tokens Used</p>
                    <p className="font-medium">{job.tokensUsed.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Est. Cost</p>
                    <p className="font-medium">
                      ${((job.tokensUsed * 0.15) / 1_000_000).toFixed(4)}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card">
        <h2 className="text-lg font-semibold mb-4">API Usage Summary (Today)</h2>
        <div className="grid grid-cols-4 gap-4">
          <div className="text-center p-4 bg-muted rounded-lg">
            <p className="text-2xl font-bold">{todayJobs.length}</p>
            <p className="text-xs text-muted-foreground">Jobs Today</p>
          </div>
          <div className="text-center p-4 bg-muted rounded-lg">
            <p className="text-2xl font-bold">{totalTokensToday.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">Tokens Today</p>
          </div>
          <div className="text-center p-4 bg-muted rounded-lg">
            <p className="text-2xl font-bold">${totalCostToday.toFixed(4)}</p>
            <p className="text-xs text-muted-foreground">Cost Today</p>
          </div>
          <div className="text-center p-4 bg-muted rounded-lg">
            <p className="text-2xl font-bold">{totalRateLimitEvents}</p>
            <p className="text-xs text-muted-foreground">Rate Limit Events</p>
          </div>
        </div>
      </section>

      {totalRateLimitEvents > 0 && (
        <section className="card">
          <h2 className="text-lg font-semibold mb-4">Recent Rate Limit Events</h2>
          <p className="text-sm text-muted-foreground">
            {totalRateLimitEvents} rate limit event(s) occurred today. Consider
            reducing batch size or adding delays between requests.
          </p>
        </section>
      )}
    </div>
  );
}
