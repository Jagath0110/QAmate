import { timingSafeEqual } from 'crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { revalidateTag, revalidatePath } from 'next/cache';
import { getWorkbook, getSyncState, invalidateWorkbook } from '@/lib/workbook';

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
 * Manual and cron entry point. There is no database to reconcile — this just
 * forces the in-memory workbook cache to refetch the sheet immediately
 * instead of waiting out its ~60s TTL.
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
    invalidateWorkbook();
    const wb = await getWorkbook();
    const sync = await getSyncState();

    revalidateTag('qa-data');
    revalidatePath('/qa');
    revalidatePath('/qa/cases');
    revalidatePath('/qa/issues');

    return NextResponse.json({
      ok: !wb.error,
      source: wb.source,
      cases: wb.cases.length,
      issues: wb.issues.length,
      warnings: wb.warnings,
      error: wb.error,
      sync,
      durationMs: Date.now() - started,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Refresh failed' },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  return POST(req);
}
