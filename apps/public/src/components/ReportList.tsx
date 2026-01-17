'use client';

import { ReportCard } from './ReportCard';
import type { Report } from '@subreddit-bias/db';

// Mock data for display - in production this would come from the API
const mockReports: Partial<Report>[] = [];

export function ReportList() {
  if (mockReports.length === 0) {
    return (
      <div className="text-center py-12 bg-muted rounded-lg">
        <p className="text-muted-foreground">
          No reports available yet. Reports will appear here once generated.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      {mockReports.map((report) => (
        <ReportCard key={report.id} report={report as Report} />
      ))}
    </div>
  );
}
