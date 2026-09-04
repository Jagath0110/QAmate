import {
  readWorkbook,
  sheetsConfigured,
  SheetSchemaError,
  type ParsedCase,
  type ParsedIssue,
} from './sheets';
import type { SyncState, SyncWarning } from './types';

/**
 * Render runs this as one long-lived Node process (not per-request
 * serverless), so a module-level cache is the natural place to hold the
 * workbook — no database, no per-request Sheets round trip.
 *
 * There is no mock/seed data. If the sheet has never been read successfully,
 * `loaded` is false and the app shows a setup notice instead of fabricated
 * numbers. Once a read has succeeded, a later transient failure keeps
 * serving that last real read (marked stale via `error`) rather than either
 * crashing or inventing data.
 */
const TTL_MS = 60_000;

export interface WorkbookData {
  cases: ParsedCase[];
  issues: ParsedIssue[];
  warnings: SyncWarning[];
  fetchedAt: number; // epoch ms
  error: string | null;
  /** True once at least one read of the real sheet has succeeded. */
  loaded: boolean;
}

let cache: WorkbookData | null = null;
let inflight: Promise<WorkbookData> | null = null;

async function fetchLive(): Promise<WorkbookData> {
  if (!sheetsConfigured()) {
    return {
      cases: [],
      issues: [],
      warnings: [],
      fetchedAt: Date.now(),
      error: 'Google Sheets is not configured. Set GOOGLE_SERVICE_ACCOUNT_KEY and QA_SHEET_ID.',
      loaded: false,
    };
  }
  try {
    const read = await readWorkbook();
    return {
      cases: read.cases,
      issues: read.issues,
      warnings: read.warnings,
      fetchedAt: Date.now(),
      error: null,
      loaded: true,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const prefixed = err instanceof SheetSchemaError ? `Schema drift. ${message}` : message;
    // A transient failure after a prior success keeps showing that real data,
    // marked stale — never fabricated data.
    if (cache?.loaded) {
      return { ...cache, fetchedAt: cache.fetchedAt, error: prefixed };
    }
    return {
      cases: [],
      issues: [],
      warnings: [],
      fetchedAt: Date.now(),
      error: prefixed,
      loaded: false,
    };
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

  if (!wb.loaded) {
    return {
      lastSyncedAt: null,
      state: 'never',
      warnings: wb.warnings,
      error: wb.error,
    };
  }

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
  };
}
