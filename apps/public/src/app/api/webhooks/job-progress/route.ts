import { NextResponse } from 'next/server';
import { createDatabaseClient, type JobStatus } from '@subreddit-bias/db';

/**
 * POST /api/webhooks/job-progress
 * Webhook endpoint for job progress updates
 *
 * Used by background workers to report job progress
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();

    const {
      jobId,
      reportId,
      status,
      progress,
      currentPhase,
      tokensUsed,
      commentsProcessed,
      commentsTotal,
      errorMessage,
      // Final results (if status is 'completed')
      communitySentiment,
      moderatorSentiment,
      targetGroupStats,
      estimatedCost,
    } = body;

    if (!jobId && !reportId) {
      return NextResponse.json(
        { success: false, error: 'jobId or reportId is required' },
        { status: 400 }
      );
    }

    const db = createDatabaseClient();
    await db.connect();

    // Get the job
    const job = jobId
      ? await db.getJob(jobId)
      : await db.getJobByReportId(reportId);

    if (!job) {
      return NextResponse.json(
        { success: false, error: 'Job not found' },
        { status: 404 }
      );
    }

    // Update job progress
    if (progress !== undefined || currentPhase !== undefined) {
      await db.updateJobProgress(
        job.id,
        progress ?? job.progress,
        currentPhase ?? job.currentPhase,
        tokensUsed ?? job.tokensUsed,
        commentsProcessed ?? job.commentsProcessed
      );
    }

    // Update job status if provided
    if (status) {
      await db.updateJobStatus(job.id, status as JobStatus, errorMessage);

      // Update report status to match
      if (status === 'completed' || status === 'failed') {
        await db.updateReportStatus(job.reportId, status as JobStatus, errorMessage);
      }
    }

    // Update report stats if this is a completion
    if (status === 'completed' && communitySentiment !== undefined) {
      await db.updateReportStats(
        job.reportId,
        communitySentiment,
        moderatorSentiment ?? null,
        targetGroupStats ?? [],
        commentsTotal ?? commentsProcessed ?? 0,
        tokensUsed ?? 0,
        estimatedCost ?? 0
      );
    }

    // Get updated job and report
    const updatedJob = await db.getJob(job.id);
    const report = await db.getReport(job.reportId);

    return NextResponse.json({
      success: true,
      data: {
        job: updatedJob,
        report: {
          id: report?.id,
          status: report?.status,
          subreddit: report?.subreddit,
        },
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
 * GET /api/webhooks/job-progress
 * Get progress for a specific job
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('jobId');
    const reportId = searchParams.get('reportId');

    if (!jobId && !reportId) {
      return NextResponse.json(
        { success: false, error: 'jobId or reportId query parameter is required' },
        { status: 400 }
      );
    }

    const db = createDatabaseClient();
    await db.connect();

    const job = jobId
      ? await db.getJob(jobId)
      : await db.getJobByReportId(reportId!);

    if (!job) {
      return NextResponse.json(
        { success: false, error: 'Job not found' },
        { status: 404 }
      );
    }

    const report = await db.getReport(job.reportId);

    return NextResponse.json({
      success: true,
      data: {
        job,
        report: report
          ? {
              id: report.id,
              status: report.status,
              subreddit: report.subreddit,
              communitySentiment: report.communitySentiment,
              moderatorSentiment: report.moderatorSentiment,
              targetGroupStats: report.targetGroupStats,
            }
          : null,
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
