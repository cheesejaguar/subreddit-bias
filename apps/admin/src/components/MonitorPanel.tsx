'use client';

export function MonitorPanel() {
  // Mock data - in production this would come from the API
  const jobs = [
    {
      id: '1',
      subreddit: 'example',
      status: 'completed',
      progress: 100,
      currentPhase: 'Done',
      tokensUsed: 15420,
      commentsProcessed: 1250,
      commentsTotal: 1250,
      startedAt: new Date(Date.now() - 300000),
      completedAt: new Date(),
    },
  ];

  const formatTime = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(date);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'text-green-600 bg-green-100 dark:text-green-400 dark:bg-green-900/30';
      case 'running':
        return 'text-yellow-600 bg-yellow-100 dark:text-yellow-400 dark:bg-yellow-900/30';
      case 'failed':
        return 'text-red-600 bg-red-100 dark:text-red-400 dark:bg-red-900/30';
      default:
        return 'text-gray-600 bg-gray-100 dark:text-gray-400 dark:bg-gray-900/30';
    }
  };

  return (
    <div className="space-y-8">
      <section className="card">
        <h2 className="text-lg font-semibold mb-4">Active Jobs</h2>

        {jobs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No active jobs</p>
        ) : (
          <div className="space-y-4">
            {jobs.map((job) => (
              <div key={job.id} className="border border-border rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="font-medium">r/{job.subreddit}</h3>
                    <p className="text-xs text-muted-foreground">
                      Started: {formatTime(job.startedAt)}
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

                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Comments</p>
                    <p className="font-medium">
                      {job.commentsProcessed} / {job.commentsTotal}
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
        <h2 className="text-lg font-semibold mb-4">API Usage Summary</h2>
        <div className="grid grid-cols-4 gap-4">
          <div className="text-center p-4 bg-muted rounded-lg">
            <p className="text-2xl font-bold">0</p>
            <p className="text-xs text-muted-foreground">Requests Today</p>
          </div>
          <div className="text-center p-4 bg-muted rounded-lg">
            <p className="text-2xl font-bold">0</p>
            <p className="text-xs text-muted-foreground">Tokens Today</p>
          </div>
          <div className="text-center p-4 bg-muted rounded-lg">
            <p className="text-2xl font-bold">$0.00</p>
            <p className="text-xs text-muted-foreground">Cost Today</p>
          </div>
          <div className="text-center p-4 bg-muted rounded-lg">
            <p className="text-2xl font-bold">0</p>
            <p className="text-xs text-muted-foreground">Rate Limit Events</p>
          </div>
        </div>
      </section>

      <section className="card">
        <h2 className="text-lg font-semibold mb-4">Recent Rate Limit Events</h2>
        <p className="text-sm text-muted-foreground">No rate limit events recorded</p>
      </section>
    </div>
  );
}
