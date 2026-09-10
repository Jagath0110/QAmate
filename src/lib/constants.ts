/**
 * Every enum the dashboard understands, in one place.
 *
 * The status/type/priority/platform values mirror the `Lists` tab of the QA
 * workbook. The sync job reads that tab at runtime, so a value QA adds to the
 * sheet shows up without a deploy — these are the fallbacks and the ordering.
 */

export const STATUSES = ['Pass', 'Fail', 'Blocked', 'Retest', 'Not Run', 'N/A'] as const;
export type Status = (typeof STATUSES)[number];

/** Display order for the ledger, legends and status sorting. */
export const STATUS_ORDER: readonly string[] = STATUSES;

export const STATUS_COLOR: Record<string, string> = {
  Pass: 'var(--pass)',
  Fail: 'var(--fail)',
  Blocked: 'var(--blocked)',
  Retest: 'var(--retest)',
  'Not Run': 'var(--notrun)',
  'N/A': 'var(--na)',
  Automated: 'var(--auto)',
};

export const STATUS_SOFT: Record<string, string> = {
  Pass: 'var(--pass-soft)',
  Fail: 'var(--fail-soft)',
  Blocked: 'var(--blocked-soft)',
  Retest: 'var(--retest-soft)',
  'Not Run': 'var(--notrun-soft)',
  'N/A': 'var(--notrun-soft)',
  Automated: 'var(--auto-soft)',
};

export const PRIORITIES = ['Critical', 'High', 'Medium', 'Low'] as const;
export const PRIORITY_ORDER: Record<string, number> = {
  Critical: 0,
  High: 1,
  Medium: 2,
  Low: 3,
};
export const PRIORITY_COLOR: Record<string, string> = {
  Critical: 'var(--fail)',
  High: 'var(--blocked)',
  Medium: 'var(--retest)',
  Low: 'var(--ink-3)',
};

/** Tabs in the workbook that hold test cases, in reading order. */
export const CASE_TABS = [
  'Clinic Staff App',
  'Patient Portal',
  'Platform Admin',
  'Marketing & Onboarding',
  'Cross-Cutting',
  'Mobile App',
  'Mobile Release & Compliance',
] as const;

/** Four columns only, a different shape from the case tabs. */
export const AUTOMATED_TAB = 'Excluded (automatable)';
export const LISTS_TAB = 'Lists';
export const ISSUES_TAB = 'Issues';

/**
 * The header row of every case tab, in sheet order. The importer maps by NAME,
 * not by position, so a reordered column is fine — a RENAMED one aborts the
 * sync on purpose, because a partially-mapped import is worse than stale data.
 */
export const CASE_HEADERS = [
  'Area',
  'Module',
  'TC-ID',
  'Test Scenario',
  'Type',
  'Priority',
  'Platform',
  'Preconditions',
  'Test Data',
  'Test Steps',
  'Expected Result',
  'Actual Result',
  'Status',
  'Defect ID',
  'Tester',
  'Execution Date',
  'Comments',
  'Source',
  'Why manual',
] as const;

/**
 * Optional columns the importer reads when they're present on a case tab. They
 * drive the time-based verification tracker (a plan bought today that only
 * expires in 30 days). Unlike CASE_HEADERS, a missing one of these never aborts
 * the sync — the feature is simply off for tabs that don't have them.
 */
export const CASE_TIME_HEADERS = [
  'Time Trigger Date',
  'Verify After',
  'Verify Result',
] as const;

/**
 * The header row of the Issues tab. Test Case IDs are NOT a column here —
 * they are derived from the case tabs' Defect ID column, same link the old
 * GitHub integration used, so QA never enters the same fact twice.
 */
export const ISSUE_HEADERS = [
  'Issue ID',
  'Title',
  'Module',
  'Area',
  'Severity',
  'Reporter',
  'Assignee',
  'Created Date',
  'Resolved Date',
  'Resolution',
  'Retest Date',
  'Retest By',
  'Retest Result',
  'Retest Note',
  'Confirmed Date',
  'Confirmed By',
  'Confirm Note',
  'Labels',
  'URL',
] as const;

// --- Issue lifecycle -------------------------------------------------------

export type IssueStage =
  | 'open'
  | 'in_progress'
  | 'resolved'
  | 'retest_failed'
  | 'retest_passed'
  | 'confirmed';

export const ISSUE_STAGE: Record<
  IssueStage,
  { label: string; short: string; color: string; step: number; action: string }
> = {
  open: {
    label: 'Open',
    short: 'Open',
    color: 'var(--fail)',
    step: 1,
    action: 'Needs a developer assigned',
  },
  in_progress: {
    label: 'In progress',
    short: 'In progress',
    color: 'var(--blocked)',
    step: 1,
    action: 'Fix in progress',
  },
  resolved: {
    label: 'Resolved — awaiting retest',
    short: 'Awaiting retest',
    color: 'var(--retest)',
    step: 2,
    action: 'QA to retest the fix',
  },
  retest_failed: {
    label: 'Retest failed — reopened',
    short: 'Retest failed',
    color: 'var(--fail)',
    step: 3,
    action: 'Reopened — back to the developer',
  },
  retest_passed: {
    label: 'Retest passed — awaiting sign-off',
    short: 'Awaiting sign-off',
    color: 'var(--accent)',
    step: 3,
    action: 'Mentor / senior to confirm',
  },
  confirmed: {
    label: 'Confirmed closed',
    short: 'Confirmed',
    color: 'var(--pass)',
    step: 4,
    action: 'Closed',
  },
};

export const SEVERITY_ORDER: Record<string, number> = {
  Critical: 0,
  High: 1,
  Medium: 2,
  Low: 3,
};
export const SEVERITY_COLOR = PRIORITY_COLOR;

/**
 * Derive the lifecycle stage from the facts, rather than storing an opinion.
 * Any change to what "resolved" means happens here and nowhere else.
 */
export function deriveStage(i: {
  closedAt?: Date | string | null;
  assignee?: string | null;
  retestResult?: string | null;
  confirmedAt?: Date | string | null;
}): IssueStage {
  if (i.confirmedAt) return 'confirmed';
  if (i.retestResult === 'Fail') return 'retest_failed';
  if (i.retestResult === 'Pass') return 'retest_passed';
  if (i.closedAt) return 'resolved';
  if (i.assignee) return 'in_progress';
  return 'open';
}

// --- Health score ----------------------------------------------------------

export const HEALTH_WEIGHTS = { pass: 0.4, execution: 0.35, risk: 0.25 };

export function healthBand(score: number): string {
  const s = Math.round(score);
  if (s >= 85) return 'Strong';
  if (s >= 70) return 'On track — early execution';
  if (s >= 50) return 'Needs execution';
  return 'At risk';
}

export function healthColor(score: number): string {
  const s = Math.round(score);
  if (s >= 85) return 'var(--pass)';
  if (s >= 70) return 'var(--accent)';
  if (s >= 50) return 'var(--retest)';
  return 'var(--fail)';
}
