import { NextResponse, type NextRequest } from 'next/server';
import { getTrends } from '@/lib/metrics';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const days = Math.min(730, Math.max(1, Number(req.nextUrl.searchParams.get('days') ?? 90)));
  const points = await getTrends(days);
  return NextResponse.json({
    days,
    points,
    // Say plainly why a trend chart is empty rather than returning [] silently.
    note:
      points.length < 2
        ? 'Trends need at least two daily snapshots. The sync job writes one per day.'
        : undefined,
  });
}
