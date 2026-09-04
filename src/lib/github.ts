import { prisma } from './db';
import { deriveStage } from './constants';
import seedIssues from '@/data/seed-issues.json';

/**
 * GitHub issue integration.
 *
 * The link between a test case and an issue is the sheet's Defect ID column:
 * write "#412", "412" or a full issue URL there and this module pulls the
 * issue's real title, state, assignee and close date from the GitHub API.
 *
 * The QA half of the lifecycle — who retested, when, and who signed off — is
 * not something GitHub knows. It comes from issue LABELS and COMMENTS, which
 * keeps the QA team in one tool:
 *
 *   label  qa:retest-passed | qa:retest-failed        → retest outcome
 *   label  qa:confirmed                               → senior sign-off
 *   label  severity:critical|high|medium|low          → severity
 *   comment starting "QA RETEST:"    by the tester    → retest note + date
 *   comment starting "QA CONFIRMED:" by the senior    → sign-off note + date
 *
 * Without GITHUB_TOKEN the seed file is used, so the tab is never empty.
 */

const API = 'https://api.github.com';

export function githubConfigured(): boolean {
  return Boolean(process.env.GITHUB_TOKEN && process.env.GITHUB_REPO);
}

export function githubRepo(): string {
  return process.env.GITHUB_REPO || 'oraxs/oraxs-platform';
}

interface GhUser {
  login: string;
}
interface GhLabel {
  name: string;
}
interface GhIssue {
  number: number;
  title: string;
  body: string | null;
  html_url: string;
  state: 'open' | 'closed';
  created_at: string;
  closed_at: string | null;
  user: GhUser | null;
  assignee: GhUser | null;
  labels: (GhLabel | string)[];
  pull_request?: unknown;
}
interface GhComment {
  body: string;
  created_at: string;
  user: GhUser | null;
}

async function gh<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`GitHub ${res.status} ${res.statusText} on ${path}`);
  }
  return (await res.json()) as T;
}

const labelNames = (labels: (GhLabel | string)[]): string[] =>
  labels.map((l) => (typeof l === 'string' ? l : l.name));

function severityFrom(labels: string[]): string {
  const hit = labels.find((l) => l.toLowerCase().startsWith('severity:'));
  if (!hit) return 'Medium';
  const v = hit.split(':')[1]?.trim().toLowerCase() ?? 'medium';
  return v.charAt(0).toUpperCase() + v.slice(1);
}

/** "#412", "412", "GH-412" or a full issue URL all resolve to 412. */
export function parseDefectId(defectId: string | null | undefined): number | null {
  if (!defectId) return null;
  const url = /github\.com\/[^/]+\/[^/]+\/issues\/(\d+)/.exec(defectId);
  if (url) return Number(url[1]);
  const m = /(\d{1,7})/.exec(defectId);
  return m ? Number(m[1]) : null;
}

function extractQaEvents(comments: GhComment[]) {
  let retestAt: Date | null = null;
  let retestBy: string | null = null;
  let retestNote: string | null = null;
  let confirmedAt: Date | null = null;
  let confirmedBy: string | null = null;
  let confirmNote: string | null = null;

  for (const c of comments) {
    const body = (c.body ?? '').trim();
    if (/^QA RETEST:/i.test(body)) {
      retestAt = new Date(c.created_at);
      retestBy = c.user?.login ?? null;
      retestNote = body.replace(/^QA RETEST:\s*/i, '');
    } else if (/^QA CONFIRMED:/i.test(body)) {
      confirmedAt = new Date(c.created_at);
      confirmedBy = c.user?.login ?? null;
      confirmNote = body.replace(/^QA CONFIRMED:\s*/i, '');
    }
  }
  return { retestAt, retestBy, retestNote, confirmedAt, confirmedBy, confirmNote };
}

/**
 * Pull every issue referenced by a Defect ID in the sheet, plus anything
 * carrying a `qa` label, and upsert it with its derived lifecycle stage.
 */
export async function syncIssues(): Promise<{ synced: number; source: 'github' | 'seed'; error?: string }> {
  if (!githubConfigured()) {
    const n = await seedIssuesIntoDb();
    return { synced: n, source: 'seed' };
  }

  const repo = githubRepo();
  try {
    // Which issues does the sheet point at?
    const cases = await prisma.testCase.findMany({
      where: { defectId: { not: null }, deletedAt: null },
      select: { testCaseId: true, defectId: true, module: true, area: true, priority: true },
    });

    const wanted = new Map<number, { tcIds: string[]; module: string | null; area: string | null; priority: string | null }>();
    for (const c of cases) {
      const num = parseDefectId(c.defectId);
      if (!num) continue;
      const entry = wanted.get(num) ?? { tcIds: [], module: c.module, area: c.area, priority: c.priority };
      entry.tcIds.push(c.testCaseId);
      wanted.set(num, entry);
    }

    // Anything labelled `qa` counts too, so an issue raised in GitHub first
    // still appears before QA has written the Defect ID back into the sheet.
    const labelled = await gh<GhIssue[]>(
      `/repos/${repo}/issues?state=all&labels=qa&per_page=100`
    ).catch(() => [] as GhIssue[]);
    for (const i of labelled) {
      if (i.pull_request) continue;
      if (!wanted.has(i.number)) {
        wanted.set(i.number, { tcIds: [], module: null, area: null, priority: null });
      }
    }

    let synced = 0;
    for (const [number, meta] of wanted) {
      let issue: GhIssue;
      try {
        issue = await gh<GhIssue>(`/repos/${repo}/issues/${number}`);
      } catch {
        continue; // a Defect ID that points at nothing shouldn't break the sync
      }
      if (issue.pull_request) continue;

      const comments = await gh<GhComment[]>(
        `/repos/${repo}/issues/${number}/comments?per_page=100`
      ).catch(() => [] as GhComment[]);

      const labels = labelNames(issue.labels);
      const qa = extractQaEvents(comments);

      // Labels win over comment parsing — they are the deliberate signal.
      const retestResult = labels.includes('qa:retest-failed')
        ? 'Fail'
        : labels.includes('qa:retest-passed')
          ? 'Pass'
          : qa.retestNote
            ? 'Pass'
            : null;
      const confirmedAt = labels.includes('qa:confirmed')
        ? (qa.confirmedAt ?? issue.closed_at ? new Date(qa.confirmedAt ?? issue.closed_at!) : new Date())
        : qa.confirmedAt;

      const stage = deriveStage({
        closedAt: issue.closed_at,
        assignee: issue.assignee?.login ?? null,
        retestResult,
        confirmedAt,
      });

      const data = {
        repo,
        title: issue.title,
        body: issue.body,
        url: issue.html_url,
        testCaseIds: JSON.stringify(meta.tcIds),
        module: meta.module,
        area: meta.area,
        severity: severityFrom(labels) || meta.priority || 'Medium',
        labels: JSON.stringify(labels.filter((l) => !l.startsWith('qa:') && !l.startsWith('severity:'))),
        stage,
        reporter: issue.user?.login ?? null,
        assignee: issue.assignee?.login ?? null,
        createdAt: new Date(issue.created_at),
        closedAt: issue.closed_at ? new Date(issue.closed_at) : null,
        closedBy: issue.closed_at ? (issue.assignee?.login ?? null) : null,
        resolution: null as string | null,
        retestAt: qa.retestAt,
        retestBy: qa.retestBy,
        retestResult,
        retestNote: qa.retestNote,
        confirmedAt,
        confirmedBy: qa.confirmedBy,
        confirmNote: qa.confirmNote,
        reopened: retestResult === 'Fail' ? 1 : 0,
        ghState: issue.state,
      };

      await prisma.issue.upsert({
        where: { number },
        create: { number, ...data },
        update: data,
      });
      synced++;
    }
    return { synced, source: 'github' };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const n = await seedIssuesIntoDb();
    return { synced: n, source: 'seed', error: message };
  }
}

/** Load the worked-example issues so the tab has content before GitHub is wired. */
export async function seedIssuesIntoDb(): Promise<number> {
  const raw = seedIssues as {
    repo: string;
    issues: Record<string, unknown>[];
  };
  const d = (v: unknown) => (v ? new Date(`${String(v)}T09:00:00.000Z`) : null);
  const s = (v: unknown) => (v == null || v === '' ? null : String(v));

  let n = 0;
  for (const i of raw.issues) {
    const number = Number(i.num);
    const data = {
      repo: raw.repo,
      title: String(i.title),
      body: null,
      url: `https://github.com/${raw.repo}/issues/${number}`,
      testCaseIds: JSON.stringify(i.tcIds ?? []),
      module: s(i.module),
      area: s(i.area),
      severity: String(i.severity ?? 'Medium'),
      labels: JSON.stringify(i.labels ?? []),
      stage: String(i.stage ?? 'open'),
      reporter: s(i.reporter),
      assignee: s(i.assignee),
      createdAt: d(i.createdAt) ?? new Date(),
      closedAt: d(i.closedAt),
      closedBy: s(i.closedBy),
      resolution: s(i.resolution),
      retestAt: d(i.retestAt),
      retestBy: s(i.retestBy),
      retestResult: s(i.retestResult),
      retestNote: s(i.retestNote),
      confirmedAt: d(i.confirmedAt),
      confirmedBy: s(i.confirmedBy),
      confirmNote: s(i.confirmNote),
      reopened: Number(i.reopened ?? 0),
      ghState: i.closedAt ? 'closed' : 'open',
    };
    await prisma.issue.upsert({
      where: { number },
      create: { number, ...data },
      update: data,
    });
    n++;
  }
  return n;
}
