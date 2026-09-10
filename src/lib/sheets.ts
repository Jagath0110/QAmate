import { google } from 'googleapis';
import { JWT } from 'google-auth-library';
import {
  AUTOMATED_TAB,
  CASE_HEADERS,
  CASE_TABS,
  ISSUE_HEADERS,
  ISSUES_TAB,
  LISTS_TAB,
  STATUSES,
} from './constants';
import type { SyncWarning } from './types';
import { parsePeriod } from './timeverify';

export interface ParsedCase {
  testCaseId: string;
  sheetTab: string;
  rowNumber: number;
  area: string;
  module: string | null;
  scenario: string;
  type: string | null;
  priority: string | null;
  platform: string | null;
  preconditions: string | null;
  testData: string | null;
  steps: string | null;
  expected: string | null;
  actual: string | null;
  status: string;
  defectId: string | null;
  tester: string | null;
  executedAt: Date | null;
  comments: string | null;
  sourceLabel: string | null;
  whyManual: string | null;
  execution: 'Manual' | 'Automated';
  /** Optional time-based verification inputs (see timeverify.ts). */
  timeTriggerAt: Date | null;
  verifyAfter: string | null;
  verifyResult: 'Pass' | 'Fail' | null;
}

export interface SheetEnums {
  statuses: string[];
  types: string[];
  priorities: string[];
  platforms: string[];
}

/** One row of the Issues tab. testCaseIds/reopened/stage are derived
 *  elsewhere from this plus the case list — never stored on the row. */
export interface ParsedIssue {
  issueId: number;
  title: string;
  module: string | null;
  area: string | null;
  severity: string;
  reporter: string | null;
  assignee: string | null;
  createdAt: Date | null;
  closedAt: Date | null;
  resolution: string | null;
  retestAt: Date | null;
  retestBy: string | null;
  retestResult: string | null;
  retestNote: string | null;
  confirmedAt: Date | null;
  confirmedBy: string | null;
  confirmNote: string | null;
  labels: string[];
  url: string | null;
}

export interface SheetReadResult {
  cases: ParsedCase[];
  issues: ParsedIssue[];
  enums: SheetEnums;
  warnings: SyncWarning[];
  rowsRead: number;
}

export class SheetSchemaError extends Error {}

export function sheetsConfigured(): boolean {
  return Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_KEY && process.env.QA_SHEET_ID);
}

function authClient(): JWT {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY || '';
  let json: { client_email: string; private_key: string };
  try {
    // Accept either raw JSON or base64-encoded JSON, because both get pasted.
    const decoded = raw.trim().startsWith('{')
      ? raw
      : Buffer.from(raw, 'base64').toString('utf8');
    json = JSON.parse(decoded);
  } catch {
    throw new Error(
      'GOOGLE_SERVICE_ACCOUNT_KEY is not valid JSON or base64-encoded JSON.'
    );
  }
  return new JWT({
    email: json.client_email,
    key: json.private_key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
}

// --- normalisation ---------------------------------------------------------

const clean = (v: unknown): string | null => {
  if (v == null) return null;
  const s = String(v).replace(/ /g, ' ').trim();
  return s.length ? s : null;
};

/** Sheets hands back dates as strings in many shapes. Accept the sane ones. */
function parseDate(v: unknown): Date | null {
  const s = clean(v);
  if (!s) return null;
  const iso = /^\d{4}-\d{2}-\d{2}/.exec(s);
  if (iso) {
    const d = new Date(`${iso[0]}T00:00:00.000Z`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const dmy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);
  if (dmy) {
    const d = new Date(
      Date.UTC(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]))
    );
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function matchStatus(v: unknown, allowed: string[]): { value: string; ok: boolean } {
  const s = clean(v);
  if (!s) return { value: 'Not Run', ok: true };
  const hit = allowed.find((a) => a.toLowerCase() === s.toLowerCase());
  return hit ? { value: hit, ok: true } : { value: 'Not Run', ok: false };
}

const TC_ID_RE = /^[A-Z][A-Z0-9-]{2,}$/;

// --- parsing ---------------------------------------------------------------

/**
 * Turn one case tab's raw grid into cases.
 *
 * Three rules the sheet forces on us:
 *  1. Rows whose only content is a heading in column A ("MOBILE APP - Chat")
 *     are section banners, not cases. A row is a case iff TC-ID is non-empty.
 *  2. Headers are mapped by NAME. A renamed header throws, aborting the sync
 *     before anything is written — a half-mapped import is worse than stale data.
 *  3. Unknown enum values are imported with a warning, never dropped. The sheet
 *     is the source of truth; we report drift, we don't silently "fix" it.
 */
export function parseCaseTab(
  tab: string,
  grid: string[][],
  enums: SheetEnums,
  warnings: SyncWarning[]
): ParsedCase[] {
  if (!grid.length) return [];

  const header = grid[0].map((h) => clean(h) ?? '');
  const missing = CASE_HEADERS.filter((h) => !header.includes(h));
  if (missing.length) {
    throw new SheetSchemaError(
      `Tab "${tab}" is missing expected column(s): ${missing.join(', ')}. ` +
        `Sync aborted — no data was changed. Restore the header row or update CASE_HEADERS.`
    );
  }
  const col = (name: string) => header.indexOf(name);
  const idx = {
    area: col('Area'),
    module: col('Module'),
    id: col('TC-ID'),
    scenario: col('Test Scenario'),
    type: col('Type'),
    priority: col('Priority'),
    platform: col('Platform'),
    pre: col('Preconditions'),
    data: col('Test Data'),
    steps: col('Test Steps'),
    expected: col('Expected Result'),
    actual: col('Actual Result'),
    status: col('Status'),
    defect: col('Defect ID'),
    tester: col('Tester'),
    date: col('Execution Date'),
    comments: col('Comments'),
    source: col('Source'),
    why: col('Why manual'),
    // Optional — col() returns -1 when absent and row[-1] is undefined, which
    // clean()/parseDate() treat as empty. The feature is simply off then.
    timeTrigger: col('Time Trigger Date'),
    verifyAfter: col('Verify After'),
    verifyResult: col('Verify Result'),
  };

  const out: ParsedCase[] = [];
  const seen = new Set<string>();

  for (let r = 1; r < grid.length; r++) {
    const row = grid[r];
    const rowNumber = r + 1;
    const testCaseId = clean(row[idx.id]);

    // Rule 1 — banner rows and blank rows.
    if (!testCaseId) continue;

    if (!TC_ID_RE.test(testCaseId)) {
      warnings.push({
        rule: 'tc-id-format',
        tab,
        row: rowNumber,
        testCaseId,
        message: `TC-ID "${testCaseId}" does not look like an identifier. Row skipped.`,
      });
      continue;
    }
    if (seen.has(testCaseId)) {
      warnings.push({
        rule: 'duplicate-tc-id',
        tab,
        row: rowNumber,
        testCaseId,
        message: `Duplicate TC-ID within "${tab}". Only the first occurrence was imported.`,
      });
      continue;
    }
    seen.add(testCaseId);

    const scenario = clean(row[idx.scenario]);
    if (!scenario) {
      warnings.push({
        rule: 'missing-scenario',
        tab,
        row: rowNumber,
        testCaseId,
        message: 'No Test Scenario recorded — the case list will show an empty title.',
      });
    }

    const st = matchStatus(row[idx.status], enums.statuses);
    if (!st.ok) {
      warnings.push({
        rule: 'unknown-status',
        tab,
        row: rowNumber,
        testCaseId,
        message: `Status "${clean(row[idx.status])}" is not in the Lists tab. Imported as Not Run — this case is missing from the executed count.`,
      });
    }

    const type = clean(row[idx.type]);
    if (type && enums.types.length && !enums.types.includes(type)) {
      warnings.push({
        rule: 'enum-drift-type',
        tab,
        row: rowNumber,
        testCaseId,
        message: `Type "${type}" is used here but is not in the Lists tab dropdown.`,
      });
    }
    const priority = clean(row[idx.priority]);
    if (priority && enums.priorities.length && !enums.priorities.includes(priority)) {
      warnings.push({
        rule: 'enum-drift-priority',
        tab,
        row: rowNumber,
        testCaseId,
        message: `Priority "${priority}" is not in the Lists tab dropdown.`,
      });
    }

    const executedAt = parseDate(row[idx.date]);
    const actual = clean(row[idx.actual]);
    const tester = clean(row[idx.tester]);
    const defectId = clean(row[idx.defect]);

    // The PORTAL-008 class of error: a result was written but the status was
    // never moved off the dropdown default, so the case is invisible in metrics.
    if (actual && st.value === 'Not Run') {
      warnings.push({
        rule: 'result-without-status',
        tab,
        row: rowNumber,
        testCaseId,
        message:
          'An Actual Result is recorded but Status is still "Not Run". This case is missing from the executed count.',
      });
    }
    if ((st.value === 'Pass' || st.value === 'Fail') && !executedAt) {
      warnings.push({
        rule: 'missing-execution-date',
        tab,
        row: rowNumber,
        testCaseId,
        message: `Status is ${st.value} but no Execution Date is recorded — this case cannot appear in trends.`,
      });
    }
    if ((st.value === 'Pass' || st.value === 'Fail') && !tester) {
      warnings.push({
        rule: 'missing-tester',
        tab,
        row: rowNumber,
        testCaseId,
        message: `Status is ${st.value} but no Tester is recorded.`,
      });
    }
    if (st.value === 'Fail' && !defectId) {
      warnings.push({
        rule: 'fail-without-defect',
        tab,
        row: rowNumber,
        testCaseId,
        message: 'Case failed but no Defect ID is recorded — it will not appear on the Issues tab.',
      });
    }
    if (executedAt && executedAt.getTime() > Date.now() + 86_400_000) {
      warnings.push({
        rule: 'future-date',
        tab,
        row: rowNumber,
        testCaseId,
        message: `Execution Date ${executedAt.toISOString().slice(0, 10)} is in the future.`,
      });
    }

    // Optional time-based verification inputs.
    const timeTriggerAt = parseDate(row[idx.timeTrigger]);
    const verifyAfter = clean(row[idx.verifyAfter]);
    const verifyResultRaw = clean(row[idx.verifyResult]);
    const verifyResult: 'Pass' | 'Fail' | null = verifyResultRaw
      ? /^pass$/i.test(verifyResultRaw)
        ? 'Pass'
        : /^fail$/i.test(verifyResultRaw)
          ? 'Fail'
          : null
      : null;

    if (verifyResultRaw && !verifyResult) {
      warnings.push({
        rule: 'time-verify-bad-result',
        tab,
        row: rowNumber,
        testCaseId,
        message: `Verify Result "${verifyResultRaw}" should be Pass or Fail — it was ignored.`,
      });
    }
    if (verifyAfter && !parsePeriod(verifyAfter)) {
      warnings.push({
        rule: 'time-verify-bad-period',
        tab,
        row: rowNumber,
        testCaseId,
        message: `Verify After "${verifyAfter}" is not a period like "30d", "2w", "3mo" or "1y".`,
      });
    }
    if (verifyAfter && parsePeriod(verifyAfter) && !timeTriggerAt && !verifyResult) {
      warnings.push({
        rule: 'time-verify-incomplete',
        tab,
        row: rowNumber,
        testCaseId,
        message:
          'Verify After is set but Time Trigger Date is empty — the verification date cannot be computed.',
      });
    }
    if (timeTriggerAt && !verifyAfter && !verifyResult) {
      warnings.push({
        rule: 'time-verify-incomplete',
        tab,
        row: rowNumber,
        testCaseId,
        message: 'Time Trigger Date is set but Verify After (the wait period) is empty.',
      });
    }

    out.push({
      testCaseId,
      sheetTab: tab,
      rowNumber,
      area: clean(row[idx.area]) ?? tab,
      module: clean(row[idx.module]),
      scenario: scenario ?? testCaseId,
      type,
      priority,
      platform: clean(row[idx.platform]),
      preconditions: clean(row[idx.pre]),
      testData: clean(row[idx.data]),
      steps: clean(row[idx.steps]),
      expected: clean(row[idx.expected]),
      actual,
      status: st.value,
      defectId,
      tester,
      executedAt,
      comments: clean(row[idx.comments]),
      sourceLabel: clean(row[idx.source]),
      whyManual: clean(row[idx.why]),
      execution: 'Manual',
      timeTriggerAt,
      verifyAfter,
      verifyResult,
    });
  }

  return out;
}

/**
 * The Excluded tab has only four columns. Importing it as Automated is what
 * makes the automation-coverage figure real rather than an estimate.
 */
export function parseAutomatedTab(grid: string[][]): ParsedCase[] {
  if (!grid.length) return [];
  const header = grid[0].map((h) => clean(h) ?? '');
  const iSrc = header.findIndex((h) => /source/i.test(h));
  const iId = header.findIndex((h) => /tc-?id/i.test(h));
  const iType = header.findIndex((h) => /type/i.test(h));
  const iScen = header.findIndex((h) => /scenario/i.test(h));
  if (iId < 0) return [];

  const out: ParsedCase[] = [];
  const seen = new Set<string>();
  for (let r = 1; r < grid.length; r++) {
    const row = grid[r];
    const id = clean(row[iId]);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const area = (iSrc >= 0 ? clean(row[iSrc]) : null) ?? 'Automated';
    out.push({
      testCaseId: id,
      sheetTab: AUTOMATED_TAB,
      rowNumber: r + 1,
      area,
      module: null,
      scenario: (iScen >= 0 ? clean(row[iScen]) : null) ?? id,
      type: iType >= 0 ? clean(row[iType]) : null,
      priority: null,
      platform: null,
      preconditions: null,
      testData: null,
      steps: null,
      expected: null,
      actual: null,
      status: 'Automated',
      defectId: null,
      tester: null,
      executedAt: null,
      comments: null,
      sourceLabel: 'Automation suite',
      whyManual: null,
      execution: 'Automated',
      timeTriggerAt: null,
      verifyAfter: null,
      verifyResult: null,
    });
  }
  return out;
}

/** The Lists tab is the enum contract — read it, don't hard-code the dropdowns. */
export function parseListsTab(grid: string[][]): SheetEnums {
  const fallback: SheetEnums = {
    statuses: [...STATUSES],
    types: [],
    priorities: [],
    platforms: [],
  };
  if (!grid.length) return fallback;
  const header = grid[0].map((h) => (clean(h) ?? '').toLowerCase());
  const colOf = (name: string) => header.findIndex((h) => h === name);
  const column = (i: number): string[] => {
    if (i < 0) return [];
    const vals: string[] = [];
    for (let r = 1; r < grid.length; r++) {
      const v = clean(grid[r]?.[i]);
      if (v) vals.push(v);
    }
    return vals;
  };
  const statuses = column(colOf('status'));
  return {
    statuses: statuses.length ? statuses : fallback.statuses,
    types: column(colOf('type')),
    priorities: column(colOf('priority')),
    platforms: column(colOf('platform')),
  };
}

/** "#412", "412", "ISS-412" or a full URL all resolve to 412. Used to link a
 *  case's Defect ID to a row on the Issues tab. */
export function parseDefectId(defectId: string | null | undefined): number | null {
  if (!defectId) return null;
  const m = /(\d{1,7})/.exec(defectId);
  return m ? Number(m[1]) : null;
}

/**
 * The Issues tab. Same philosophy as parseCaseTab: headers mapped by name, a
 * renamed/missing header aborts the sync. Test Case IDs are not a column —
 * they are derived by scanning the case tabs' Defect ID column for this row's
 * Issue ID, so QA never enters the same fact twice.
 */
export function parseIssuesTab(
  grid: string[][],
  warnings: SyncWarning[]
): ParsedIssue[] {
  if (!grid.length) return [];

  const header = grid[0].map((h) => clean(h) ?? '');
  const missing = ISSUE_HEADERS.filter((h) => !header.includes(h));
  if (missing.length) {
    throw new SheetSchemaError(
      `Tab "${ISSUES_TAB}" is missing expected column(s): ${missing.join(', ')}. ` +
        `Sync aborted — no data was changed. Restore the header row or update ISSUE_HEADERS.`
    );
  }
  const col = (name: string) => header.indexOf(name);
  const idx = {
    id: col('Issue ID'),
    title: col('Title'),
    module: col('Module'),
    area: col('Area'),
    severity: col('Severity'),
    reporter: col('Reporter'),
    assignee: col('Assignee'),
    created: col('Created Date'),
    resolved: col('Resolved Date'),
    resolution: col('Resolution'),
    retestDate: col('Retest Date'),
    retestBy: col('Retest By'),
    retestResult: col('Retest Result'),
    retestNote: col('Retest Note'),
    confirmedDate: col('Confirmed Date'),
    confirmedBy: col('Confirmed By'),
    confirmNote: col('Confirm Note'),
    labels: col('Labels'),
    url: col('URL'),
  };

  const out: ParsedIssue[] = [];
  const seen = new Set<number>();

  for (let r = 1; r < grid.length; r++) {
    const row = grid[r];
    const rowNumber = r + 1;
    const rawId = clean(row[idx.id]);
    if (!rawId) continue; // blank / banner row

    const issueId = Number(rawId.replace(/[^\d]/g, ''));
    if (!issueId || Number.isNaN(issueId)) {
      warnings.push({
        rule: 'issue-id-format',
        tab: ISSUES_TAB,
        row: rowNumber,
        testCaseId: null,
        message: `Issue ID "${rawId}" is not a number. Row skipped.`,
      });
      continue;
    }
    if (seen.has(issueId)) {
      warnings.push({
        rule: 'duplicate-issue-id',
        tab: ISSUES_TAB,
        row: rowNumber,
        testCaseId: null,
        message: `Duplicate Issue ID ${issueId}. Only the first occurrence was imported.`,
      });
      continue;
    }
    seen.add(issueId);

    const retestResult = clean(row[idx.retestResult]);
    if (retestResult && retestResult !== 'Pass' && retestResult !== 'Fail') {
      warnings.push({
        rule: 'invalid-retest-result',
        tab: ISSUES_TAB,
        row: rowNumber,
        testCaseId: null,
        message: `Retest Result "${retestResult}" on Issue ${issueId} should be Pass or Fail. Imported as empty.`,
      });
    }

    const labelsRaw = clean(row[idx.labels]);

    out.push({
      issueId,
      title: clean(row[idx.title]) ?? `Issue ${issueId}`,
      module: clean(row[idx.module]),
      area: clean(row[idx.area]),
      severity: clean(row[idx.severity]) ?? 'Medium',
      reporter: clean(row[idx.reporter]),
      assignee: clean(row[idx.assignee]),
      createdAt: parseDate(row[idx.created]),
      closedAt: parseDate(row[idx.resolved]),
      resolution: clean(row[idx.resolution]),
      retestAt: parseDate(row[idx.retestDate]),
      retestBy: clean(row[idx.retestBy]),
      retestResult: retestResult === 'Pass' || retestResult === 'Fail' ? retestResult : null,
      retestNote: clean(row[idx.retestNote]),
      confirmedAt: parseDate(row[idx.confirmedDate]),
      confirmedBy: clean(row[idx.confirmedBy]),
      confirmNote: clean(row[idx.confirmNote]),
      labels: labelsRaw ? labelsRaw.split(',').map((s) => s.trim()).filter(Boolean) : [],
      url: clean(row[idx.url]),
    });
  }

  return out;
}

/**
 * Read the whole workbook in ONE batchGet. Ten separate calls would burn quota
 * and take five times as long.
 */
export async function readWorkbook(): Promise<SheetReadResult> {
  if (!sheetsConfigured()) {
    throw new Error(
      'Google Sheets is not configured. Set GOOGLE_SERVICE_ACCOUNT_KEY and QA_SHEET_ID in .env.'
    );
  }
  const sheets = google.sheets({ version: 'v4', auth: authClient() });
  const tabs = [...CASE_TABS, AUTOMATED_TAB, LISTS_TAB, ISSUES_TAB];

  const res = await sheets.spreadsheets.values.batchGet({
    spreadsheetId: process.env.QA_SHEET_ID!,
    // A1:Y covers the 19 CASE_HEADERS plus room for the optional time-based
    // verification columns (Time Trigger Date / Verify After / Verify Result).
    ranges: tabs.map((t) => `'${t}'!A1:Y2000`),
    valueRenderOption: 'UNFORMATTED_VALUE',
    dateTimeRenderOption: 'FORMATTED_STRING',
  });

  const ranges = res.data.valueRanges ?? [];
  const gridFor = (tab: string): string[][] => {
    const i = tabs.indexOf(tab as (typeof tabs)[number]);
    const rows = (ranges[i]?.values ?? []) as unknown[][];
    return rows.map((r) => r.map((c) => (c == null ? '' : String(c))));
  };

  const warnings: SyncWarning[] = [];
  const enums = parseListsTab(gridFor(LISTS_TAB));

  let cases: ParsedCase[] = [];
  let rowsRead = 0;
  for (const tab of CASE_TABS) {
    const grid = gridFor(tab);
    rowsRead += Math.max(0, grid.length - 1);
    cases = cases.concat(parseCaseTab(tab, grid, enums, warnings));
  }
  const autoGrid = gridFor(AUTOMATED_TAB);
  rowsRead += Math.max(0, autoGrid.length - 1);
  cases = cases.concat(parseAutomatedTab(autoGrid));

  const issues = parseIssuesTab(gridFor(ISSUES_TAB), warnings);

  return { cases, issues, enums, warnings, rowsRead };
}
