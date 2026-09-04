import { NextResponse } from 'next/server';
import { getSummary } from '@/lib/metrics';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return NextResponse.json(await getSummary());
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to build summary' },
      { status: 500 }
    );
  }
}
