import { NextResponse } from 'next/server';
import { createDatabaseClient } from '@subreddit-bias/db';

// GET - Get job status or list all jobs
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const reportId = searchParams.get('reportId');
    const activeOnly = searchParams.get('active') === 'true';

    const db = createDatabaseClient();
    await db.connect();

    // If reportId provided, get specific job
    if (reportId) {
      const job = await db.getJobByReportId(reportId);

      if (!job) {
        return NextResponse.json(
          { success: false, error: 'Job not found' },
          { status: 404 }
        );
      }

      return NextResponse.json({
        success: true,
        data: job,
      });
    }

    // Otherwise, list all jobs
    const jobs = activeOnly
      ? await db.getActiveJobs()
      : await db.getAllJobs();

    // Get associated reports for subreddit names
    const jobsWithSubreddits = await Promise.all(
      jobs.map(async (job) => {
        const report = await db.getReport(job.reportId);
        return {
          ...job,
          subreddit: report?.subreddit ?? 'unknown',
        };
      })
    );

    return NextResponse.json({
      success: true,
      data: jobsWithSubreddits,
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

// PUT - Update job status (for cancellation)
export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { jobId, action } = body;

    if (!jobId || !action) {
      return NextResponse.json(
        { success: false, error: 'jobId and action are required' },
        { status: 400 }
      );
    }

    const db = createDatabaseClient();
    await db.connect();

    const job = await db.getJob(jobId);
    if (!job) {
      return NextResponse.json(
        { success: false, error: 'Job not found' },
        { status: 404 }
      );
    }

    if (action === 'cancel') {
      await db.updateJobStatus(jobId, 'cancelled', 'Cancelled by user');
    }

    const updatedJob = await db.getJob(jobId);

    return NextResponse.json({
      success: true,
      data: updatedJob,
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
