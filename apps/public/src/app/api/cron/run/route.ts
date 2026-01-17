import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { createDatabaseClient } from '@subreddit-bias/db';
import { executePipeline } from '@subreddit-bias/core';

/**
 * POST /api/cron/run
 * Triggered by Vercel Cron to process scheduled report jobs
 *
 * Security: Validates CRON_SECRET header
 */
export async function POST(request: Request) {
  try {
    // Verify cron secret for security
    const headersList = await headers();
    const authHeader = headersList.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const db = createDatabaseClient();
    await db.connect();

    // Get all active schedules that are due
    const schedules = await db.getActiveSchedules();
    const now = new Date();

    const processedJobs: string[] = [];
    const errors: string[] = [];

    for (const schedule of schedules) {
      // Check if schedule is due (nextRunAt is in the past or not set)
      if (schedule.nextRunAt && schedule.nextRunAt > now) {
        continue;
      }

      try {
        // Create a new report for this schedule
        const report = await db.createReport({
          subreddit: schedule.subreddit,
          config: schedule.config,
          methodologyVersion: '1.0.0',
        });

        // Create associated job
        const job = await db.createJob({
          reportId: report.id,
          status: 'pending',
          progress: 0,
          currentPhase: 'Queued',
          tokensUsed: 0,
          commentsProcessed: 0,
          commentsTotal: 0,
          rateLimitEvents: 0,
        });

        // Update schedule last run time
        await db.updateSchedule(schedule.id, {
          lastRunAt: now,
          nextRunAt: calculateNextRun(schedule.cronExpression, now),
        });

        // Execute the pipeline (in a real deployment, this would be queued)
        await db.updateJobStatus(job.id, 'running');

        const result = await executePipeline(schedule.config, {
          onProgress: async (progress) => {
            await db.updateJobProgress(
              job.id,
              progress.progress,
              progress.phase,
              progress.tokensUsed,
              progress.commentsProcessed
            );
          },
        });

        if (result.success) {
          // Update report with results
          await db.updateReportStats(
            report.id,
            result.communitySentiment,
            result.moderatorSentiment,
            result.targetGroupStats,
            result.sampledComments.length,
            result.totalTokensUsed,
            result.estimatedCost
          );
          await db.updateReportStatus(report.id, 'completed');
          await db.updateJobStatus(job.id, 'completed');

          // Save classifications
          if (result.sentimentClassifications.length > 0) {
            await db.createSentimentClassifications(result.sentimentClassifications);
          }
          if (result.targetGroupClassifications.length > 0) {
            await db.createTargetGroupClassifications(result.targetGroupClassifications);
          }

          processedJobs.push(report.id);
        } else {
          await db.updateReportStatus(report.id, 'failed', result.error);
          await db.updateJobStatus(job.id, 'failed', result.error);
          errors.push(`Report ${report.id}: ${result.error}`);
        }
      } catch (error) {
        errors.push(`Schedule ${schedule.id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        processedJobs,
        schedulesChecked: schedules.length,
        errors: errors.length > 0 ? errors : undefined,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * Calculate next run time from cron expression
 * Simplified implementation - in production, use a proper cron parser
 */
function calculateNextRun(cronExpression: string, from: Date): Date {
  // Parse cron expression (minute hour day month weekday)
  const parts = cronExpression.split(' ');

  if (parts.length !== 5) {
    // Default to 6 hours from now
    const next = new Date(from);
    next.setHours(next.getHours() + 6);
    return next;
  }

  const [minute, hour] = parts;

  const next = new Date(from);

  // Simple handling for common patterns
  if (hour.startsWith('*/')) {
    // Every N hours
    const interval = parseInt(hour.slice(2), 10);
    next.setHours(next.getHours() + interval);
    next.setMinutes(parseInt(minute, 10) || 0);
    next.setSeconds(0);
    next.setMilliseconds(0);
  } else if (hour !== '*') {
    // Specific hour
    next.setHours(parseInt(hour, 10));
    next.setMinutes(parseInt(minute, 10) || 0);
    next.setSeconds(0);
    next.setMilliseconds(0);

    // If we've passed this time today, move to tomorrow
    if (next <= from) {
      next.setDate(next.getDate() + 1);
    }
  } else {
    // Default: 6 hours from now
    next.setHours(next.getHours() + 6);
  }

  return next;
}

// Allow GET for testing
export async function GET() {
  return NextResponse.json({
    message: 'Cron endpoint. Use POST to trigger scheduled jobs.',
    schedule: '0 */6 * * * (every 6 hours)',
  });
}
