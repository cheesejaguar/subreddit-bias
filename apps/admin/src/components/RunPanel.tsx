'use client';

import { useState } from 'react';

interface CreateReportResponse {
  success: boolean;
  data?: {
    id: string;
    subreddit: string;
  };
  error?: string;
}

export function RunPanel() {
  const [subreddit, setSubreddit] = useState('');
  const [timeframe, setTimeframe] = useState('week');
  const [enableTargetGroup, setEnableTargetGroup] = useState(false);
  const [targetGroups, setTargetGroups] = useState<string[]>([]);
  const [frameworks, setFrameworks] = useState<string[]>(['nexus', 'jda']);
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  const handleRun = async () => {
    if (!subreddit) return;

    setIsRunning(true);
    setResult(null);

    try {
      const response = await fetch('/api/admin/reports', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          subreddit: subreddit.replace(/^r\//, ''), // Remove r/ prefix if present
          timeframe,
          enableTargetGroupAnalysis: enableTargetGroup,
          targetGroups: enableTargetGroup ? targetGroups : [],
          frameworks,
        }),
      });

      const data: CreateReportResponse = await response.json();

      if (data.success && data.data) {
        setResult({
          success: true,
          message: `Report created for r/${data.data.subreddit}. Check the Monitor panel to track progress.`,
        });
        // Clear form
        setSubreddit('');
      } else {
        setResult({
          success: false,
          message: data.error || 'Failed to create report',
        });
      }
    } catch (err) {
      setResult({
        success: false,
        message: err instanceof Error ? err.message : 'Failed to create report',
      });
    } finally {
      setIsRunning(false);
    }
  };

  // Estimate based on config
  const estimatedComments =
    2 * // strategies
    25 * // posts per strategy
    50; // comments per post
  const estimatedCost = (estimatedComments * 150 * 0.15) / 1_000_000; // ~150 tokens per comment

  return (
    <div className="space-y-8">
      {result && (
        <div
          className={`p-4 rounded-lg ${
            result.success
              ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
              : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
          }`}
        >
          {result.message}
        </div>
      )}

      <section className="card">
        <h2 className="text-lg font-semibold mb-4">Create New Report</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Subreddit</label>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">r/</span>
              <input
                type="text"
                value={subreddit}
                onChange={(e) => setSubreddit(e.target.value)}
                placeholder="subreddit_name"
                className="input flex-1"
                disabled={isRunning}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Timeframe</label>
            <select
              value={timeframe}
              onChange={(e) => setTimeframe(e.target.value)}
              className="input"
              disabled={isRunning}
            >
              <option value="day">Past 24 hours</option>
              <option value="week">Past week</option>
              <option value="month">Past month</option>
              <option value="year">Past year</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Target Group Frameworks
            </label>
            <div className="space-y-2 ml-2">
              {[
                { id: 'nexus', label: 'Nexus Document' },
                { id: 'jda', label: 'Jerusalem Declaration (JDA)' },
                { id: 'ihra', label: 'IHRA Working Definition' },
              ].map((fw) => (
                <label key={fw.id} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={frameworks.includes(fw.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setFrameworks([...frameworks, fw.id]);
                      } else {
                        setFrameworks(frameworks.filter((f) => f !== fw.id));
                      }
                    }}
                    disabled={isRunning}
                  />
                  <span className="text-sm">{fw.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="border-t border-border pt-4">
            <label className="flex items-center gap-2 mb-4">
              <input
                type="checkbox"
                checked={enableTargetGroup}
                onChange={(e) => setEnableTargetGroup(e.target.checked)}
                disabled={isRunning}
              />
              <span className="text-sm font-medium">Enable Target Group Analysis</span>
            </label>

            {enableTargetGroup && (
              <div className="ml-6 space-y-2">
                <label className="block text-sm text-muted-foreground mb-2">
                  Select target groups to analyze:
                </label>
                {['jewish', 'muslim', 'black', 'lgbtq', 'asian', 'immigrant'].map(
                  (group) => (
                    <label key={group} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={targetGroups.includes(group)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setTargetGroups([...targetGroups, group]);
                          } else {
                            setTargetGroups(targetGroups.filter((g) => g !== group));
                          }
                        }}
                        disabled={isRunning}
                      />
                      <span className="text-sm capitalize">{group}</span>
                    </label>
                  )
                )}
              </div>
            )}
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            onClick={handleRun}
            disabled={!subreddit || isRunning}
            className="btn btn-primary disabled:opacity-50"
          >
            {isRunning ? 'Creating Report...' : 'Run Analysis'}
          </button>
        </div>
      </section>

      <section className="card">
        <h2 className="text-lg font-semibold mb-4">Cost Estimate</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Estimated based on default sampling configuration.
        </p>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-2xl font-bold">~{estimatedComments.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">Estimated comments</p>
          </div>
          <div>
            <p className="text-2xl font-bold">~${estimatedCost.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground">Estimated cost</p>
          </div>
          <div>
            <p className="text-2xl font-bold">~5 min</p>
            <p className="text-xs text-muted-foreground">Estimated time</p>
          </div>
        </div>
      </section>

      <section className="card">
        <h2 className="text-lg font-semibold mb-4">Scheduled Scans</h2>
        <p className="text-sm text-muted-foreground">
          No scheduled scans configured. Scheduled scans can be configured via the
          Configure panel or by setting up Vercel cron jobs.
        </p>
      </section>
    </div>
  );
}
