import type { IssueStage } from './constants';
import type { TimeVerification } from './timeverify';

/** A test case as the UI consumes it — dates are ISO strings, not Date objects. */
export interface TestCaseDTO {
  id: string;
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
  executedAt: string | null;
  comments: string | null;
  sourceLabel: string | null;
  whyManual: string | null;
  execution: 'Manual' | 'Automated';
  /** Raw time-based verification inputs from the sheet (ISO date / period text). */
  timeTriggerAt: string | null;
  verifyAfter: string | null;
  verifyResult: string | null;
  /** Everything derived from those plus today — null for a normal case. */
  timeVerification: TimeVerification | null;
}

export interface IssueDTO {
  id: string;
  number: number;
  title: string;
  url: string | null;
  testCaseIds: string[];
  module: string | null;
  area: string | null;
  severity: string;
  labels: string[];
  stage: IssueStage;
  reporter: string | null;
  assignee: string | null;
  createdAt: string;
  closedAt: string | null;
  closedBy: string | null;
  resolution: string | null;
  retestAt: string | null;
  retestBy: string | null;
  retestResult: string | null;
  retestNote: string | null;
  confirmedAt: string | null;
  confirmedBy: string | null;
  confirmNote: string | null;
  reopened: number;
}

export interface ModuleHealth {
  key: string;
  module: string;
  area: string;
  total: number;
  inScope: number;
  executed: number;
  executionPct: number;
  counts: Record<string, number>;
  pass: number;
  fail: number;
  blocked: number;
  retest: number;
  risk: number;
}

export interface CoverageRow {
  label: string;
  total: number;
  executed: number;
}

export interface QaSummary {
  total: number;
  totalWithAutomated: number;
  automatedCount: number;
  inScope: number;
  counts: Record<string, number>;
  pass: number;
  fail: number;
  blocked: number;
  retest: number;
  notRun: number;
  notApplicable: number;
  executed: number;
  remaining: number;
  executionPct: number;
  passPct: number;
  failurePct: number;
  automationPct: number;
  openRisk: number;
  /** Time-based cases waiting on a real-world clock. */
  timePending: number;
  timeDue: number;
  timeOverdue: number;
  timeVerified: number;
  healthScore: number;
  healthBand: string;
  modules: ModuleHealth[];
  coverageByType: CoverageRow[];
  coverageByPriority: CoverageRow[];
  coverageByPlatform: CoverageRow[];
  coverageByArea: CoverageRow[];
  attention: TestCaseDTO[];
  recent: TestCaseDTO[];
  issuePipeline: IssuePipeline;
  sync: SyncState;
}

export interface IssuePipeline {
  created: number;
  resolved: number;
  retested: number;
  retestPassed: number;
  retestFailed: number;
  confirmed: number;
  reopened: number;
  open: number;
  inProgress: number;
  awaitingRetest: number;
  awaitingSignOff: number;
}

export interface SyncState {
  lastSyncedAt: string | null;
  state: 'ok' | 'stale' | 'error' | 'never';
  warnings: SyncWarning[];
  error: string | null;
}

export interface SyncWarning {
  rule: string;
  tab: string;
  row: number;
  testCaseId: string | null;
  message: string;
}
