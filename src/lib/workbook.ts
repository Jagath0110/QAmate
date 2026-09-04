import {
  readWorkbook,
  sheetsConfigured,
  SheetSchemaError,
  type ParsedCase,
  type ParsedIssue,
} from './sheets';
import type { SyncState, SyncWarning } from './types';
import seedCasesJson from '@/data/seed-cases.json';
import seedIssuesJson from '@/data/seed-issues.json';

/**
 * Render runs this as one long-lived Node process (not per-request
 * serverless), so a module-level cache is the natural place to hold the
 * workbook — no database, no per-request Sheets round trip.
 */
const TTL_MS = 60_000;

export interface WorkbookData {
  cases: ParsedCase[];
  issues: ParsedIssue[];
  warnings: SyncWarning[];
  fetchedAt: number; // epoch ms
  source: 'sheet' | 'seed';
  error: string | null;
}

let cache: WorkbookData | null = null;
let inflight: Promise<WorkbookData> | null = null;

/** Load the seeded snapshot of the workbook — used when Sheets isn't
 *  configured, or as a fallback if a live read fails. */
function loadSeedCases(): ParsedCase[] {
  const raw = seedCasesJson as {
    manual: Record<string, unknown>[];
    automated: Record<string, unknown>[];
  };
  const map = (r: Record<string, unknown>, tab: string, execution: 'Manual' | 'Automated'): ParsedCase => {
    const s = (k: string) => {
      const v = r[k];
      return v == null || v === '' ? null : String(v);
    };
    const date = s('executionDate');
    return {
      testCaseId: String(r.id),
      sheetTab: (s('sheet') ?? tab)!,
      rowNumber: 0,
      area: s('area') ?? tab,
      module: s('module'),
      scenario: s('scenario') ?? String(r.id),
      type: s('type'),
      priority: s('priority'),
      platform: s('platform'),
      preconditions: s('preconditions'),
      testData: s('testData'),
      steps: s('steps'),
      expected: s('expected'),
      actual: s('actual'),
      status: s('status') ?? 'Not Run',
      defectId: s('defectId'),
      tester: s('tester'),
      executedAt: date ? new Date(`${date}T00:00:00.000Z`) : null,
      comments: s('comments'),
      sourceLabel: s('source'),
      whyManual: s('whyManual'),
      execution,
    };
  };
  return [
    ...raw.manual.map((r) => map(r, 'Seed', 'Manual')),
    ...raw.automated.map((r) => map(r, 'Excluded (automatable)', 'Automated')),
  ];
}

/** Worked-example issues, linked to real seed test-case IDs by hand since the
 *  seed cases don't carry a Defect ID. */
function loadSeedIssues(): ParsedIssue[] {
  const raw = seedIssuesJson as { issues: Record<string, unknown>[] };
  const d = (v: unknown) => (v ? new Date(`${String(v)}T09:00:00.000Z`) : null);
  const s = (v: unknown) => (v == null || v === '' ? null : String(v));

  return raw.issues.map((i) => ({
    issueId: Number(i.num),
    title: String(i.title),
    module: s(i.module),
    area: s(i.area),
    severity: String(i.severity ?? 'Medium'),
    reporter: s(i.reporter),
    assignee: s(i.assignee),
    createdAt: d(i.createdAt),
    closedAt: d(i.closedAt),
    resolution: s(i.resolution),
    retestAt: d(i.retestAt),
    retestBy: s(i.retestBy),
    retestResult: s(i.retestResult),
    retestNote: s(i.retestNote),
    confirmedAt: d(i.confirmedAt),
    confirmedBy: s(i.confirmedBy),
    confirmNote: s(i.confirmNote),
    labels: Array.isArray(i.labels) ? (i.labels as string[]) : [],
    url: null,
    testCaseIds: Array.isArray(i.tcIds) ? (i.tcIds as string[]) : [],
  }));
}

function seedResult(warning: SyncWarning): WorkbookData {
  return {
    cases: loadSeedCases(),
    issues: loadSeedIssues(),
    warnings: [warning],
    fetchedAt: Date.now(),
    source: 'seed',
    error: null,
  };
}

async function fetchLive(): Promise<WorkbookData> {
  if (!sheetsConfigured()) {
    return seedResult({
      rule: 'no-sheet-configured',
      tab: '—',
      row: 0,
      testCaseId: null,
      message:
        'Google Sheets is not configured, so this is the seeded snapshot of the workbook. Set GOOGLE_SERVICE_ACCOUNT_KEY and QA_SHEET_ID in .env for live data.',
    });
  }
  try {
    const read = await readWorkbook();
    return {
      cases: read.cases,
      issues: read.issues,
      warnings: read.warnings,
      fetchedAt: Date.now(),
      source: 'sheet',
      error: null,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const prefixed = err instanceof SheetSchemaError ? `Schema drift. ${message}` : message;
    // A transient failure should show the last good read as stale, not crash
    // the dashboard — the seed is the fallback of last resort only.
    if (cache) {
      return { ...cache, error: prefixed };
    }
    return seedResult({
      rule: 'sheet-read-failed',
      tab: '—',
      row: 0,
      testCaseId: null,
      message: `Could not read the Google Sheet: ${prefixed}. Showing the seeded snapshot instead.`,
    });
  }
}

/** Serve the cached workbook if it's fresh; otherwise refetch. Concurrent
 *  callers during a refetch share one in-flight request. */
export async function getWorkbook(): Promise<WorkbookData> {
  if (cache && Date.now() - cache.fetchedAt < TTL_MS) return cache;
  if (!inflight) {
    inflight = fetchLive().then((data) => {
      cache = data;
      inflight = null;
      return data;
    });
  }
  return inflight;
}

/** Force the next getWorkbook() to refetch — called by the sync routes after
 *  an edit in the sheet, instead of waiting out the TTL. */
export function invalidateWorkbook(): void {
  cache = null;
}

const WARN_MIN = () => Number(process.env.SYNC_STALE_WARN_MINUTES ?? 15);
const ERROR_MIN = () => Number(process.env.SYNC_STALE_ERROR_MINUTES ?? 60);

export async function getSyncState(): Promise<SyncState> {
  const wb = await getWorkbook();
  const ageMin = (Date.now() - wb.fetchedAt) / 60_000;

  let state: SyncState['state'] = 'ok';
  if (wb.error) state = 'error';
  else if (ageMin > ERROR_MIN()) state = 'error';
  else if (ageMin > WARN_MIN()) state = 'stale';

  return {
    lastSyncedAt: new Date(wb.fetchedAt).toISOString(),
    state,
    warnings: wb.warnings,
    error: wb.error,
    source: wb.source,
  };
}
