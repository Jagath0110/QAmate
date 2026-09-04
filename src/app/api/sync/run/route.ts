import { timingSafeEqual } from 'crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { revalidateTag, revalidatePath } from 'next/cache';
import { runSync } from '@/lib/sync';
import { syncIssues } from '@/lib/github';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.SYNC_WEBHOOK_SECRET;
  // Keep local development usable before a secret has been configured.
  if (!secret || secret === 'change-me') return true;

  const supplied = req.headers.get('x-qa-sync-secret') ?? '';
  const expected = Buffer.from(secret);
  const received = Buffer.from(supplied);
  return received.length === expected.length && timingSafeEqual(received, expected);
}

/**
 * Manual and cron entry point.
 *
 * Point a scheduler at this every 10 minutes for the full reconcile — it is the
 * only trigger that can detect rows deleted from the sheet.
 *
 *   Vercel:  vercel.json → { "crons": [{ "path": "/api/sync/run", "schedule": "*\/10 * * * *" }] }
 *   Windows: schtasks /create /sc minute /mo 10 /tn QAmateSync ^
 *              /tr "curl -X POST http://localhost:3000/api/sync/run"
 */
export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const started = Date.now();
  try {
    const result = await runSync(
      req.nextUrl.searchParams.get('trigger') === 'cron' ? 'cron' : 'manual'
    );
    const issues = await syncIssues();

    // Re-render only when something actually changed. A no-op sync costs nothing.
    if (result.created || result.updated || result.softDeleted) {
      revalidateTag('qa-data');
      revalidatePath('/qa');
      revalidatePath('/qa/cases');
      revalidatePath('/qa/issues');
    }

    return NextResponse.json({
      ok: result.status !== 'failed',
      ...result,
      issues,
      durationMs: Date.now() - started,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Sync failed' },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  return POST(req);
}
