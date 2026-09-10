/**
 * Google Sheet connection diagnostic.
 *
 *   npm run check:sheet
 *
 * Tells you exactly which step is broken instead of a raw Google error.
 * Reads only — it never writes to the sheet or the database.
 */
import { google } from 'googleapis';
import { JWT } from 'google-auth-library';
import {
  AUTOMATED_TAB,
  CASE_HEADERS,
  CASE_TABS,
  CASE_TIME_HEADERS,
  ISSUE_HEADERS,
  ISSUES_TAB,
  LISTS_TAB,
} from '../src/lib/constants';

const ok = (m: string) => console.log(`  ✓ ${m}`);
const bad = (m: string) => console.log(`  ✕ ${m}`);
const warn = (m: string) => console.log(`  ! ${m}`);

async function main() {
  let failed = false;

  console.log('\n1. Environment variables');
  const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  const sheetId = process.env.QA_SHEET_ID;

  if (!rawKey) {
    bad('GOOGLE_SERVICE_ACCOUNT_KEY is not set in .env');
    failed = true;
  } else {
    ok(`GOOGLE_SERVICE_ACCOUNT_KEY is set (${rawKey.length} chars)`);
  }
  if (!sheetId) {
    bad('QA_SHEET_ID is not set in .env');
    failed = true;
  } else if (/docs\.google\.com/.test(sheetId)) {
    bad(`QA_SHEET_ID looks like a full URL. Use only the id between /d/ and /edit.`);
    failed = true;
  } else {
    ok(`QA_SHEET_ID = ${sheetId}`);
  }
  if (failed) {
    console.log('\nFix the above, then run again.\n');
    process.exit(1);
  }

  console.log('\n2. Service-account key');
  let creds: { client_email: string; private_key: string; project_id?: string };
  try {
    const decoded = rawKey!.trim().startsWith('{')
      ? rawKey!
      : Buffer.from(rawKey!, 'base64').toString('utf8');
    creds = JSON.parse(decoded);
  } catch {
    bad('Could not parse the key. It must be the service-account JSON, either raw or base64-encoded, on ONE line.');
    process.exit(1);
  }
  if (!creds.client_email || !creds.private_key) {
    bad('The JSON parsed but has no client_email / private_key — is this the right file?');
    process.exit(1);
  }
  ok(`Service account: ${creds.client_email}`);
  if (creds.project_id) ok(`Project: ${creds.project_id}`);

  console.log('\n3. Authenticating');
  const auth = new JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  try {
    await auth.authorize();
    ok('Token obtained');
  } catch (e) {
    bad(`Authentication failed: ${e instanceof Error ? e.message : e}`);
    console.log('    → Check the private_key survived copy/paste (its \\n escapes matter).');
    process.exit(1);
  }

  console.log('\n4. Opening the spreadsheet');
  const sheets = google.sheets({ version: 'v4', auth });
  let tabNames: string[] = [];
  try {
    const meta = await sheets.spreadsheets.get({ spreadsheetId: sheetId!, fields: 'properties.title,sheets.properties.title' });
    tabNames = (meta.data.sheets ?? []).map((s) => s.properties?.title ?? '');
    ok(`Opened "${meta.data.properties?.title}" — ${tabNames.length} tabs`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    bad(`Could not open the sheet: ${msg}`);
    if (/permission|403/i.test(msg)) {
      console.log(`    → Share the sheet with ${creds.client_email} as Viewer.`);
    } else if (/not found|404/i.test(msg)) {
      console.log('    → QA_SHEET_ID is wrong. Copy the id from the sheet URL between /d/ and /edit.');
    } else if (/has not been used|disabled/i.test(msg)) {
      console.log('    → Enable the Google Sheets API for this project in Google Cloud Console.');
    }
    process.exit(1);
  }

  console.log('\n5. Required tabs');
  for (const t of [...CASE_TABS, AUTOMATED_TAB, LISTS_TAB, ISSUES_TAB]) {
    if (tabNames.includes(t)) ok(t);
    else {
      bad(`Missing tab: "${t}"`);
      failed = true;
    }
  }
  const extra = tabNames.filter(
    (t) => ![...CASE_TABS, AUTOMATED_TAB, LISTS_TAB, ISSUES_TAB, 'README'].includes(t)
  );
  if (extra.length) warn(`Extra tabs (ignored by the sync): ${extra.join(', ')}`);

  console.log('\n6. Header row of each case tab');
  const res = await sheets.spreadsheets.values.batchGet({
    spreadsheetId: sheetId!,
    ranges: CASE_TABS.map((t) => `'${t}'!A1:Y1`),
  });
  (res.data.valueRanges ?? []).forEach((r, i) => {
    const tab = CASE_TABS[i];
    const header = ((r.values?.[0] ?? []) as unknown[]).map((h) => String(h ?? '').trim());
    const missing = CASE_HEADERS.filter((h) => !header.includes(h));
    if (missing.length) {
      bad(`${tab} — missing column(s): ${missing.join(', ')}`);
      failed = true;
    } else {
      ok(`${tab} — all 19 columns present`);
    }
    // Optional time-based verification columns — never a failure, just noise
    // when a tab has some but not all of them.
    const timeHave = CASE_TIME_HEADERS.filter((h) => header.includes(h));
    if (timeHave.length && timeHave.length < CASE_TIME_HEADERS.length) {
      warn(
        `${tab} — partial time-verification columns; add: ${CASE_TIME_HEADERS.filter(
          (h) => !header.includes(h)
        ).join(', ')}`
      );
    } else if (timeHave.length === CASE_TIME_HEADERS.length) {
      ok(`${tab} — time-based verification columns present`);
    }
  });

  if (tabNames.includes(ISSUES_TAB)) {
    console.log('\n6b. Header row of the Issues tab');
    const issuesRes = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId!,
      range: `'${ISSUES_TAB}'!A1:Y1`,
    });
    const header = ((issuesRes.data.values?.[0] ?? []) as unknown[]).map((h) => String(h ?? '').trim());
    const missing = ISSUE_HEADERS.filter((h) => !header.includes(h));
    if (missing.length) {
      bad(`${ISSUES_TAB} — missing column(s): ${missing.join(', ')}`);
      failed = true;
    } else {
      ok(`${ISSUES_TAB} — all ${ISSUE_HEADERS.length} columns present`);
    }
  }

  console.log('\n7. Row counts');
  const counts = await sheets.spreadsheets.values.batchGet({
    spreadsheetId: sheetId!,
    ranges: [...CASE_TABS, AUTOMATED_TAB].map((t) => `'${t}'!C1:C2000`),
  });
  let totalCases = 0;
  (counts.data.valueRanges ?? []).forEach((r, i) => {
    const tab = [...CASE_TABS, AUTOMATED_TAB][i];
    // Column C is TC-ID on case tabs; on the Excluded tab TC-ID is column B,
    // so this is an approximation there — the real parser handles both shapes.
    const rows = ((r.values ?? []) as unknown[][]).slice(1).filter((v) => String(v?.[0] ?? '').trim()).length;
    totalCases += rows;
    ok(`${tab}: ~${rows} rows with an id in column C`);
  });
  console.log(`  Total: ~${totalCases}`);

  console.log(
    failed
      ? '\n✕ Connection works but the sheet structure has problems. Fix the ✕ items above.\n'
      : '\n✓ Everything checks out. The app reads this sheet live — just reload it, or hit POST /api/sync/run to refresh sooner.\n'
  );
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error('\nUnexpected error:', e);
  process.exit(1);
});
