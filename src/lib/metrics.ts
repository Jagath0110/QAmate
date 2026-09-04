import { prisma } from './db';
import { getSyncState } from './sync';
import {
  HEALTH_WEIGHTS,
  PRIORITY_ORDER,
  STATUS_ORDER,
  healthBand,
  type IssueStage,
} from './constants';
import { pct } from './format';
import type {
  CoverageRow,
  IssueDTO,
  IssuePipeline,
  ModuleHealth,
  QaSummary,
  TestCaseDTO,
  TrendPoint,
} from './types';

type Row = Awaited<ReturnType<typeof prisma.testCase.findMany>>[number];

export function toDTO(c: Row): TestCaseDTO {
  return {
    id: c.id,
    testCaseId: c.testCaseId,
    sheetTab: c.sheetTab,
    rowNumber: c.rowNumber,
    area: c.area,
    module: c.module,
    scenario: c.scenario,
    type: c.type,
    priority: c.priority,
    platform: c.platform,
    preconditions: c.preconditions,
    testData: c.testData,
    steps: c.steps,
    expected: c.expected,
    actual: c.actual,
    status: c.status,
    defectId: c.defectId,
    tester: c.tester,
    executedAt: c.executedAt ? c.executedAt.toISOString().slice(0, 10) : null,
    comments: c.comments,
    sourceLabel: c.sourceLabel,
    whyManual: c.whyManual,
    execution: c.execution === 'Automated' ? 'Automated' : 'Manual',
  };
}

export function issueToDTO(i: Awaited<ReturnType<typeof prisma.issue.findMany>>[number]): IssueDTO {
  const parse = (s: string): string[] => {
    try {
      const v = JSON.parse(s);
      return Array.isArray(v) ? v.map(String) : [];
    } catch {
      return [];
    }
  };
  const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
  return {
    id: i.id,
    number: i.number,
    repo: i.repo,
    title: i.title,
    url: i.url,
    testCaseIds: parse(i.testCaseIds),
    module: i.module,
    area: i.area,
    severity: i.severity,
    labels: parse(i.labels),
    stage: i.stage as IssueStage,
    reporter: i.reporter,
    assignee: i.assignee,
    createdAt: day(i.createdAt) ?? '',
    closedAt: day(i.closedAt),
    closedBy: i.closedBy,
    resolution: i.resolution,
    retestAt: day(i.retestAt),
    retestBy: i.retestBy,
    retestResult: i.retestResult,
    retestNote: i.retestNote,
    confirmedAt: day(i.confirmedAt),
    confirmedBy: i.confirmedBy,
    confirmNote: i.confirmNote,
    reopened: i.reopened,
    ghState: i.ghState,
  };
}

/** A case counts as executed when it passed or failed. Blocked and Retest are
 *  outstanding work, not completed work — counting them as done overstates
 *  progress, which is the one thing a client dashboard must never do. */
const isExecuted = (c: { status: string }) => c.status === 'Pass' || c.status === 'Fail';

function coverage(
  cases: TestCaseDTO[],
  key: keyof TestCaseDTO,
  opts: { limit?: number; order?: string[] } = {}
): CoverageRow[] {
  const map = new Map<string, CoverageRow>();
  for (const c of cases) {
    const label = (c[key] as string | null) ?? '—';
    const row = map.get(label) ?? { label, total: 0, executed: 0 };
    row.total++;
    if (isExecuted(c)) row.executed++;
    map.set(label, row);
  }
  let rows = [...map.values()];

  if (opts.order) {
    const ord = opts.order;
    rows.sort(
      (a, b) =>
        (ord.indexOf(a.label) < 0 ? 99 : ord.indexOf(a.label)) -
        (ord.indexOf(b.label) < 0 ? 99 : ord.indexOf(b.label))
    );
  } else {
    rows.sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));
  }

  // Past ~9 classes adjacent bars stop being distinguishable. Fold the tail.
  if (opts.limit && rows.length > opts.limit) {
    const head = rows.slice(0, opts.limit);
    const tail = rows.slice(opts.limit);
    head.push({
      label: `Other (${tail.length} types)`,
      total: tail.reduce((s, r) => s + r.total, 0),
      executed: tail.reduce((s, r) => s + r.executed, 0),
    });
    rows = head;
  }
  return rows;
}

export function moduleHealth(cases: TestCaseDTO[]): ModuleHealth[] {
  const map = new Map<string, ModuleHealth>();
  for (const c of cases) {
    const module = c.module ?? c.area;
    const key = `${c.area} › ${module}`;
    const m =
      map.get(key) ??
      ({
        key,
        module,
        area: c.area,
        total: 0,
        inScope: 0,
        executed: 0,
        executionPct: 0,
        counts: {},
        pass: 0,
        fail: 0,
        blocked: 0,
        retest: 0,
        risk: 0,
      } as ModuleHealth);
    m.total++;
    m.counts[c.status] = (m.counts[c.status] ?? 0) + 1;
    map.set(key, m);
  }

  const out = [...map.values()].map((m) => {
    m.pass = m.counts['Pass'] ?? 0;
    m.fail = m.counts['Fail'] ?? 0;
    m.blocked = m.counts['Blocked'] ?? 0;
    m.retest = m.counts['Retest'] ?? 0;
    m.inScope = m.total - (m.counts['N/A'] ?? 0);
    m.executed = m.pass + m.fail;
    m.executionPct = pct(m.executed, m.inScope);
    // A failure is worse than a block is worse than a pending retest.
    m.risk = m.fail * 3 + m.blocked * 2 + m.retest;
    return m;
  });

  // Risk first, then most work remaining. Position on the list IS the answer to
  // "which modules have the most issues" — alphabetical would hide it.
  return out.sort(
    (a, b) => b.risk - a.risk || b.inScope - b.executed - (a.inScope - a.executed)
  );
}

export function issuePipeline(issues: IssueDTO[]): IssuePipeline {
  const has = (f: (i: IssueDTO) => boolean) => issues.filter(f).length;
  return {
    created: issues.length,
    resolved: has((i) => Boolean(i.closedAt)),
    retested: has((i) => Boolean(i.retestAt)),
    retestPassed: has((i) => i.retestResult === 'Pass'),
    retestFailed: has((i) => i.retestResult === 'Fail'),
    confirmed: has((i) => Boolean(i.confirmedAt)),
    reopened: has((i) => i.reopened > 0),
    open: has((i) => i.stage === 'open'),
    inProgress: has((i) => i.stage === 'in_progress'),
    awaitingRetest: has((i) => i.stage === 'resolved'),
    awaitingSignOff: has((i) => i.stage === 'retest_passed'),
  };
}

export async function getSummary(): Promise<QaSummary> {
  const [rows, issueRows, sync] = await Promise.all([
    prisma.testCase.findMany({ where: { deletedAt: null } }),
    prisma.issue.findMany(),
    getSyncState(),
  ]);

  const all = rows.map(toDTO);
  const manual = all.filter((c) => c.execution === 'Manual');
  const automated = all.filter((c) => c.execution === 'Automated');

  const counts: Record<string, number> = {};
  for (const s of STATUS_ORDER) counts[s] = 0;
  for (const c of manual) counts[c.status] = (counts[c.status] ?? 0) + 1;

  const total = manual.length;
  const notApplicable = counts['N/A'] ?? 0;
  const inScope = total - notApplicable;
  const pass = counts['Pass'] ?? 0;
  const fail = counts['Fail'] ?? 0;
  const blocked = counts['Blocked'] ?? 0;
  const retest = counts['Retest'] ?? 0;
  const notRun = counts['Not Run'] ?? 0;
  const executed = pass + fail;

  const executionPct = pct(executed, inScope);
  const passPct = pct(pass, executed);
  const failurePct = pct(fail, executed);
  const openRisk = fail + blocked + retest;
  const riskClearance = inScope ? 100 - pct(openRisk, inScope) : 100;

  const healthScore =
    HEALTH_WEIGHTS.pass * passPct +
    HEALTH_WEIGHTS.execution * executionPct +
    HEALTH_WEIGHTS.risk * riskClearance;

  const attention = manual
    .filter((c) => ['Fail', 'Blocked', 'Retest'].includes(c.status))
    .sort(
      (a, b) =>
        STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) ||
        (PRIORITY_ORDER[a.priority ?? ''] ?? 9) - (PRIORITY_ORDER[b.priority ?? ''] ?? 9)
    );

  const recent = manual
    .filter((c) => c.executedAt)
    .sort(
      (a, b) =>
        (b.executedAt ?? '').localeCompare(a.executedAt ?? '') ||
        a.testCaseId.localeCompare(b.testCaseId)
    )
    .slice(0, 8);

  const issues = issueRows.map(issueToDTO);

  return {
    total,
    totalWithAutomated: all.length,
    automatedCount: automated.length,
    inScope,
    counts,
    pass,
    fail,
    blocked,
    retest,
    notRun,
    notApplicable,
    executed,
    remaining: inScope - executed,
    executionPct,
    passPct,
    failurePct,
    automationPct: pct(automated.length, all.length),
    openRisk,
    healthScore,
    healthBand: healthBand(healthScore),
    modules: moduleHealth(manual),
    coverageByType: coverage(manual, 'type', { limit: 9 }),
    coverageByPriority: coverage(manual, 'priority', {
      order: ['Critical', 'High', 'Medium', 'Low'],
    }),
    coverageByPlatform: coverage(manual, 'platform'),
    coverageByArea: coverage(manual, 'area'),
    attention,
    recent,
    executionDates: [...new Set(manual.map((c) => c.executedAt).filter(Boolean))].sort() as string[],
    issuePipeline: issuePipeline(issues),
    sync,
  };
}

export async function getCases(): Promise<TestCaseDTO[]> {
  const rows = await prisma.testCase.findMany({
    where: { deletedAt: null },
    orderBy: [{ area: 'asc' }, { testCaseId: 'asc' }],
  });
  return rows.map(toDTO);
}

export async function getIssues(): Promise<IssueDTO[]> {
  const rows = await prisma.issue.findMany({ orderBy: { number: 'asc' } });
  return rows.map(issueToDTO);
}

export async function getTrends(days = 90): Promise<TrendPoint[]> {
  const since = new Date(Date.now() - days * 86_400_000);
  const snaps = await prisma.qaSnapshot.findMany({
    where: { capturedOn: { gte: since } },
    orderBy: { capturedOn: 'asc' },
  });
  return snaps.map((s) => {
    const executed = s.passed + s.failed;
    return {
      date: s.capturedOn.toISOString().slice(0, 10),
      passed: s.passed,
      failed: s.failed,
      blocked: s.blocked,
      executed,
      inScope: s.inScope,
      passPct: pct(s.passed, executed),
      executionPct: pct(executed, s.inScope),
      healthScore: s.healthScore,
      openIssues: s.openIssues,
    };
  });
}

export async function getActivity(limit = 25) {
  const revs = await prisma.testCaseRevision.findMany({
    orderBy: { changedAt: 'desc' },
    take: limit,
    include: { testCase: { select: { scenario: true, module: true, area: true } } },
  });
  return revs.map((r) => ({
    testCaseId: r.testCaseId,
    scenario: r.testCase?.scenario ?? r.testCaseId,
    module: r.testCase?.module ?? r.testCase?.area ?? null,
    fromStatus: r.fromStatus,
    toStatus: r.toStatus,
    changedAt: r.changedAt.toISOString(),
  }));
}
