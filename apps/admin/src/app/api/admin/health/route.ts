import { NextResponse } from 'next/server';
import { createDatabaseClient } from '@subreddit-bias/db';

export async function GET() {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    services: {
      database: { status: 'unknown' as 'ok' | 'error' | 'unknown', message: '' },
      redis: { status: 'unknown' as 'ok' | 'error' | 'unknown', message: '' },
    },
  };

  // Check database connection
  try {
    const db = createDatabaseClient();
    await db.connect();
    health.services.database = { status: 'ok', message: 'Connected' };
  } catch (error) {
    health.services.database = {
      status: 'error',
      message: error instanceof Error ? error.message : 'Connection failed',
    };
    health.status = 'degraded';
  }

  // Check Redis connection (optional - Vercel KV / Upstash)
  try {
    const redisUrl = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
    if (redisUrl) {
      health.services.redis = { status: 'ok', message: 'Configured' };
    } else {
      health.services.redis = { status: 'unknown', message: 'Not configured' };
    }
  } catch (error) {
    health.services.redis = {
      status: 'error',
      message: error instanceof Error ? error.message : 'Connection failed',
    };
  }

  return NextResponse.json(health);
}
