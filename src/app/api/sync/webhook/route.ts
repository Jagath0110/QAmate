import { createHmac, timingSafeEqual } from 'crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { getWorkbook, invalidateWorkbook } from '@/lib/workbook';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Apps Script entry point — near-instant updates while QA is working.
 *
 * Paste this into the sheet (Extensions → Apps Script), set SYNC_WEBHOOK_SECRET
 * to the same value in .env, and add an installable onEdit trigger:
 *
 *   const URL='https://your-host/api/sync/webhook', SECRET='...';
 *   function onEditDebounced() {
 *     const p = PropertiesService.getScriptProperties();
 *     const now = Date.now();
 *     if (now - Number(p.getProperty('last') || 0) < 30000) return;  // debounce
 *     p.setProperty('last', String(now));
 *     const body = JSON.stringify({ ts: now });
 *     const sig  = Utilities.computeHmacSha256Signature(body, SECRET)
 *                    .map(b => ('0'+(b & 0xFF).toString(16)).slice(-2)).join('');
 *     UrlFetchApp.fetch(URL, {
 *       method: 'post', contentType: 'application/json', payload: body,
 *       headers: { 'X-QA-Signature': sig }, muteHttpExceptions: true });
 *   }
 *
 * There is no database to reconcile against — this just forces the in-memory
 * workbook cache to refetch immediately instead of waiting out its TTL.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.SYNC_WEBHOOK_SECRET;
  const body = await req.text();

  if (secret && secret !== 'change-me') {
    const sent = req.headers.get('x-qa-signature') ?? '';
    const expected = createHmac('sha256', secret).update(body).digest('hex');
    const a = Buffer.from(sent);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return NextResponse.json({ ok: false, error: 'Bad signature' }, { status: 401 });
    }
  }

  try {
    invalidateWorkbook();
    const wb = await getWorkbook();
    revalidateTag('qa-data');
    revalidatePath('/qa');
    revalidatePath('/qa/cases');
    revalidatePath('/qa/issues');
    return NextResponse.json(
      { ok: !wb.error, loaded: wb.loaded, cases: wb.cases.length, issues: wb.issues.length },
      { status: 202 }
    );
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Refresh failed' },
      { status: 500 }
    );
  }
}
