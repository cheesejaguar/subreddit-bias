import { NextResponse } from 'next/server';
import { createDatabaseClient, type CreateReport, type ReportConfig } from '@subreddit-bias/db';
import { createDefaultSamplingConfig, generateSeed } from '@subreddit-bias/core';

// POST - Create a new report
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      subreddit,
      timeframe = 'week',
      enableTargetGroupAnalysis = false,
      targetGroups = [],
      frameworks = ['nexus', 'jda'],
      peerSubreddits = [],
    } = body;

    if (!subreddit) {
      return NextResponse.json(
        { success: false, error: 'Subreddit is required' },
        { status: 400 }
      );
    }

    // Calculate timeframe
    const now = new Date();
    const timeframeStart = new Date();
    switch (timeframe) {
      case 'day':
        timeframeStart.setDate(timeframeStart.getDate() - 1);
        break;
      case 'week':
        timeframeStart.setDate(timeframeStart.getDate() - 7);
        break;
      case 'month':
        timeframeStart.setMonth(timeframeStart.getMonth() - 1);
        break;
      case 'year':
        timeframeStart.setFullYear(timeframeStart.getFullYear() - 1);
        break;
    }

    // Generate deterministic seed
    const seed = generateSeed(subreddit, timeframeStart, now);
    const sampling = createDefaultSamplingConfig(seed);

    const config: ReportConfig = {
      subreddit,
      timeframeStart,
      timeframeEnd: now,
      sampling,
      frameworks,
      enableTargetGroupAnalysis,
      targetGroups,
      peerSubreddits,
      methodologyVersion: '1.0.0',
    };

    const db = createDatabaseClient();
    await db.connect();

    const reportData: CreateReport = {
      subreddit,
      config,
      methodologyVersion: '1.0.0',
    };

    const report = await db.createReport(reportData);

    // Create associated job
    await db.createJob({
      reportId: report.id,
      status: 'pending',
      progress: 0,
      currentPhase: 'Initializing',
      tokensUsed: 0,
      commentsProcessed: 0,
      commentsTotal: 0,
      rateLimitEvents: 0,
    });

    return NextResponse.json({
      success: true,
      data: report,
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

// GET - List all reports (including non-completed for admin)
export async function GET() {
  try {
    const db = createDatabaseClient();
    await db.connect();

    const reports = await db.getAllReports(50);

    return NextResponse.json({
      success: true,
      data: reports,
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
