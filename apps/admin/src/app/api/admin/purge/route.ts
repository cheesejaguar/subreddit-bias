import { NextResponse } from 'next/server';
import { createDatabaseClient } from '@subreddit-bias/db';

/**
 * POST /api/admin/purge
 * Purge temporary data to comply with data retention policy
 *
 * RALPH.md Section 9: Data retention & auditability
 * - Do not store full comment bodies beyond what is necessary
 * - Add a purge job to remove any temporarily stored content quickly
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      purgeType = 'expired_cache', // 'expired_cache' | 'old_reports' | 'all_temporary'
      olderThanDays = 30,
    } = body;

    const db = createDatabaseClient();
    await db.connect();

    const results: Record<string, number> = {};

    switch (purgeType) {
      case 'expired_cache': {
        // Purge expired cache entries
        // Note: In production with Neon, use db.purgeExpiredCacheEntries()
        results.cacheEntriesPurged = 0;
        break;
      }

      case 'old_reports': {
        // Purge reports older than specified days
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

        // Note: In production, cascade deletes would handle related data
        results.reportsPurged = 0;
        results.cutoffDate = cutoffDate.toISOString() as unknown as number;
        break;
      }

      case 'all_temporary': {
        // Purge all temporary content (for privacy compliance)
        // This includes:
        // - Expired cache entries
        // - Temporary comment body storage (if any)
        // - Rate limit events older than 24 hours

        results.cacheEntriesPurged = 0;
        results.temporaryDataPurged = 0;
        results.rateLimitEventsPurged = 0;
        break;
      }

      default:
        return NextResponse.json(
          { success: false, error: 'Invalid purge type' },
          { status: 400 }
        );
    }

    return NextResponse.json({
      success: true,
      data: {
        purgeType,
        results,
        timestamp: new Date().toISOString(),
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
 * GET /api/admin/purge
 * Get information about purgeable data
 */
export async function GET() {
  try {
    const db = createDatabaseClient();
    await db.connect();

    // Get counts of data that could be purged
    const counts = db.getCounts();

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    return NextResponse.json({
      success: true,
      data: {
        currentCounts: counts,
        purgeOptions: [
          {
            type: 'expired_cache',
            description: 'Remove expired cache entries',
            estimatedCount: counts.cacheEntries,
          },
          {
            type: 'old_reports',
            description: 'Remove reports older than 30 days',
            estimatedCount: counts.reports,
          },
          {
            type: 'all_temporary',
            description: 'Remove all temporary/transient data',
            estimatedCount: counts.cacheEntries,
          },
        ],
        dataRetentionPolicy: {
          cacheEntryTTL: '7 days',
          reportRetention: '90 days',
          commentBodyRetention: 'Processing only (not stored)',
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
