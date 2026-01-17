'use client';

import { useState } from 'react';

export function RunPanel() {
  const [subreddit, setSubreddit] = useState('');
  const [timeframe, setTimeframe] = useState('week');
  const [enableTargetGroup, setEnableTargetGroup] = useState(false);
  const [targetGroups, setTargetGroups] = useState<string[]>([]);
  const [isRunning, setIsRunning] = useState(false);

  const handleRun = async () => {
    if (!subreddit) return;
    setIsRunning(true);
    // In production, this would call the API
    setTimeout(() => setIsRunning(false), 2000);
  };

  return (
    <div className="space-y-8">
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
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Timeframe</label>
            <select
              value={timeframe}
              onChange={(e) => setTimeframe(e.target.value)}
              className="input"
            >
              <option value="day">Past 24 hours</option>
              <option value="week">Past week</option>
              <option value="month">Past month</option>
              <option value="year">Past year</option>
            </select>
          </div>

          <div className="border-t border-border pt-4">
            <label className="flex items-center gap-2 mb-4">
              <input
                type="checkbox"
                checked={enableTargetGroup}
                onChange={(e) => setEnableTargetGroup(e.target.checked)}
              />
              <span className="text-sm font-medium">Enable Target Group Analysis</span>
            </label>

            {enableTargetGroup && (
              <div className="ml-6 space-y-2">
                <label className="block text-sm text-muted-foreground mb-2">
                  Select target groups to analyze:
                </label>
                {['jewish', 'muslim', 'black', 'lgbtq', 'asian', 'immigrant'].map((group) => (
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
                    />
                    <span className="text-sm capitalize">{group}</span>
                  </label>
                ))}
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
            {isRunning ? 'Starting...' : 'Run Analysis'}
          </button>
        </div>
      </section>

      <section className="card">
        <h2 className="text-lg font-semibold mb-4">Scheduled Scans</h2>
        <p className="text-sm text-muted-foreground">
          No scheduled scans configured. Use the Configure panel to set up automated scans.
        </p>
      </section>

      <section className="card">
        <h2 className="text-lg font-semibold mb-4">Cost Estimate</h2>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-2xl font-bold">~2,500</p>
            <p className="text-xs text-muted-foreground">Estimated comments</p>
          </div>
          <div>
            <p className="text-2xl font-bold">~$0.05</p>
            <p className="text-xs text-muted-foreground">Estimated cost</p>
          </div>
          <div>
            <p className="text-2xl font-bold">~5 min</p>
            <p className="text-xs text-muted-foreground">Estimated time</p>
          </div>
        </div>
      </section>
    </div>
  );
}
