import { NextResponse } from 'next/server';
import { createDatabaseClient } from '@subreddit-bias/db';

export async function GET() {
  try {
    const db = createDatabaseClient();
    await db.connect();

    const reports = await db.getRecentReports(10);

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
