'use client';

import type { Report } from '@subreddit-bias/db';
import { SentimentChart } from './SentimentChart';

interface ReportCardProps {
  report: Report;
}

export function ReportCard({ report }: ReportCardProps) {
  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(date);
  };

  return (
    <a
      href={`/reports/${report.id}`}
      className="block p-6 bg-background border border-border rounded-lg hover:border-foreground/20 transition-colors"
    >
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold">r/{report.subreddit}</h3>
          <p className="text-sm text-muted-foreground">
            {formatDate(report.createdAt)}
          </p>
        </div>
        <span
          className={`px-2 py-1 text-xs rounded-full ${
            report.status === 'completed'
              ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
              : report.status === 'running'
              ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
              : 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
          }`}
        >
          {report.status}
        </span>
      </div>

      {report.communitySentiment && (
        <div className="mb-4">
          <p className="text-sm font-medium mb-2">Community Sentiment</p>
          <SentimentChart distribution={report.communitySentiment.distribution} />
        </div>
      )}

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{report.sampledCommentCount} comments analyzed</span>
        <span>v{report.methodologyVersion}</span>
      </div>
    </a>
  );
}
