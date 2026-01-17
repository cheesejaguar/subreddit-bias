import { NextResponse } from 'next/server';
import { createDatabaseClient } from '@subreddit-bias/db';

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const db = createDatabaseClient();
    await db.connect();

    const report = await db.getReport(params.id);

    if (!report) {
      return NextResponse.json(
        {
          success: false,
          error: 'Report not found',
        },
        { status: 404 }
      );
    }

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
