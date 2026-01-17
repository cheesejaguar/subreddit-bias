'use client';

import { useState } from 'react';

export function AuditPanel() {
  const [selectedReport, setSelectedReport] = useState<string | null>(null);

  // Mock data
  const reports = [
    { id: '1', subreddit: 'example', date: '2024-01-15', commentCount: 1250 },
  ];

  return (
    <div className="space-y-8">
      <section className="card">
        <h2 className="text-lg font-semibold mb-4">Report Selection</h2>
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
                <span className="text-sm text-muted-foreground">{report.date}</span>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                {report.commentCount} comments sampled
              </p>
            </button>
          ))}
        </div>
      </section>

      {selectedReport && (
        <>
          <section className="card">
            <h2 className="text-lg font-semibold mb-4">Sampled Comments</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Comment IDs and permalinks from the sample. Full text is not retained.
            </p>

            <div className="border border-border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="text-left p-3">Comment ID</th>
                    <th className="text-left p-3">Post</th>
                    <th className="text-left p-3">Strategy</th>
                    <th className="text-left p-3">Depth</th>
                    <th className="text-left p-3">Moderator</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-border">
                    <td className="p-3 font-mono text-xs">abc123</td>
                    <td className="p-3">
                      <a
                        href="#"
                        className="text-primary hover:underline"
                      >
                        View
                      </a>
                    </td>
                    <td className="p-3">top</td>
                    <td className="p-3">1</td>
                    <td className="p-3">No</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex justify-between items-center">
              <span className="text-sm text-muted-foreground">
                Showing 1 of 1250 comments
              </span>
              <div className="flex gap-2">
                <button className="btn btn-secondary text-xs">Previous</button>
                <button className="btn btn-secondary text-xs">Next</button>
              </div>
            </div>
          </section>

          <section className="card">
            <h2 className="text-lg font-semibold mb-4">Classification Outputs</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Individual classification results for auditing purposes.
            </p>

            <div className="border border-border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="text-left p-3">Comment ID</th>
                    <th className="text-left p-3">Sentiment</th>
                    <th className="text-left p-3">Confidence</th>
                    <th className="text-left p-3">Source</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-border">
                    <td className="p-3 font-mono text-xs">abc123</td>
                    <td className="p-3">
                      <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-xs">
                        neutral
                      </span>
                    </td>
                    <td className="p-3">0.85</td>
                    <td className="p-3">LLM</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section className="card">
            <h2 className="text-lg font-semibold mb-4">Methodology Details</h2>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Methodology Version</p>
                <p className="font-medium">1.0.0</p>
              </div>
              <div>
                <p className="text-muted-foreground">Prompt Version</p>
                <p className="font-medium">1.0.0</p>
              </div>
              <div>
                <p className="text-muted-foreground">Sampling Seed</p>
                <p className="font-mono">1234567890</p>
              </div>
              <div>
                <p className="text-muted-foreground">Model</p>
                <p className="font-medium">openai/gpt-4o-mini</p>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
