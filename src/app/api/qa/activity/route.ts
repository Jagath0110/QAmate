import { NextResponse, type NextRequest } from 'next/server';
import { getActivity } from '@/lib/metrics';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const limit = Math.min(200, Math.max(1, Number(req.nextUrl.searchParams.get('limit') ?? 25)));
  return NextResponse.json({ activity: await getActivity(limit) });
}
