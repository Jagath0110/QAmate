'use client';

import { useCallback, useMemo, useState } from 'react';
import { ISSUE_STAGE, SEVERITY_COLOR, SEVERITY_ORDER, type IssueStage } from '@/lib/constants';
import type { IssueDTO, IssuePipeline, TestCaseDTO } from '@/lib/types';
import { EmptyState, Pagination, Panel, SearchIcon, SortableHeaders } from './ui';
import { IssueDrawer } from './IssueDrawer';
import { CaseDrawer } from './CaseDrawer';

type ColKey =
  | 'number'
  | 'title'
  | 'testCaseIds'
  | 'module'
  | 'severity'
  | 'stage'
  | 'assignee'
  | 'createdAt'
  | 'confirmedBy';

const COLS: { k: ColKey; t: string }[] = [
  { k: 'number', t: 'Issue' },
  { k: 'title', t: 'Title' },
  { k: 'testCaseIds', t: 'Test cases' },
  { k: 'module', t: 'Module' },
  { k: 'severity', t: 'Severity' },
  { k: 'stage', t: 'Lifecycle' },
  { k: 'assignee', t: 'Assignee' },
  { k: 'createdAt', t: 'Created' },
  { k: 'confirmedBy', t: 'Confirmed by' },
];

/** Four dots: created → resolved → retested → confirmed. A red ✕ on step 3
 *  means the retest failed and the issue went back to the developer. */
export function StageTracker({ issue }: { issue: IssueDTO }) {
  const s2 = Boolean(issue.closedAt);
  const s3 = Boolean(issue.retestAt);
  const s4 = Boolean(issue.confirmedAt);
  const bad = issue.retestResult === 'Fail';
  const stage = ISSUE_STAGE[issue.stage];

  const Node = ({ on, isBad, label }: { on: boolean; isBad?: boolean; label: string }) => (
    <span className={`n${isBad ? ' bad' : on ? ' on' : ''}`} title={label}>
      {isBad ? '✕' : on ? '✓' : ''}
    </span>
  );

  return (
    <div>
      <div className="track4">
        <Node on label="Issue created" />
        <span className={`l${s2 ? ' on' : ''}`} />
        <Node on={s2} label="Resolved" />
        <span className={`l${s3 && !bad ? ' on' : ''}`} />
        <Node on={s3 && !bad} isBad={bad} label="Retested by QA" />
        <span className={`l${s4 ? ' on' : ''}`} />
        <Node on={s4} label="Confirmed by senior" />
      </div>
      <div className="stagelab" style={{ color: stage.color }}>
        {stage.short}
      </div>
    </div>
  );
}

const EMPTY = {
  q: '',
  stage: '',
  severity: '',
  module: '',
  assignee: '',
  confirmer: '',
  openOnly: false,
  reopened: false,
};

export function IssueBoard({
  issues,
  cases,
  pipeline,
  isSeeded,
}: {
  issues: IssueDTO[];
  cases: TestCaseDTO[];
  pipeline: IssuePipeline;
  isSeeded: boolean;
}) {
  const [f, setF] = useState({ ...EMPTY });
  const [sortKey, setSortKey] = useState<ColKey>('number');
  const [dir, setDir] = useState<1 | -1>(1);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);
  const [openIssue, setOpenIssue] = useState<IssueDTO | null>(null);
  const [openCase, setOpenCase] = useState<TestCaseDTO | null>(null);

  const set = useCallback(<K extends keyof typeof EMPTY>(k: K, v: (typeof EMPTY)[K]) => {
    setF((prev) => ({ ...prev, [k]: v }));
    setPage(1);
  }, []);

  const facets = useMemo(
    () => ({
      module: [...new Set(issues.map((i) => i.module).filter(Boolean))].sort() as string[],
      assignee: [...new Set(issues.map((i) => i.assignee).filter(Boolean))].sort() as string[],
      confirmer: [...new Set(issues.map((i) => i.confirmedBy).filter(Boolean))].sort() as string[],
    }),
    [issues]
  );

  const filtered = useMemo(() => {
    const q = f.q.trim().toLowerCase();
    return issues.filter((i) => {
      if (f.stage && i.stage !== f.stage) return false;
      if (f.severity && i.severity !== f.severity) return false;
      if (f.module && i.module !== f.module) return false;
      if (f.assignee && i.assignee !== f.assignee) return false;
      if (f.confirmer && i.confirmedBy !== f.confirmer) return false;
      if (f.openOnly && i.stage === 'confirmed') return false;
      if (f.reopened && !i.reopened) return false;
      if (q) {
        const hay = [
          `#${i.number}`,
          i.title,
          i.module,
          i.area,
          i.severity,
          ISSUE_STAGE[i.stage].label,
          i.assignee,
          i.reporter,
          i.resolution,
          i.retestNote,
          i.retestBy,
          i.confirmedBy,
          i.confirmNote,
          i.testCaseIds.join(' '),
          i.labels.join(' '),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [issues, f]);

  const sorted = useMemo(() => {
    const rows = [...filtered];
    rows.sort((a, b) => {
      if (sortKey === 'number') return (a.number - b.number) * dir;
      if (sortKey === 'severity')
        return (
          ((SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9)) * dir ||
          a.number - b.number
        );
      if (sortKey === 'stage')
        return (
          (ISSUE_STAGE[a.stage].step - ISSUE_STAGE[b.stage].step) * dir || a.number - b.number
        );
      const x = sortKey === 'testCaseIds' ? a.testCaseIds.join() : (a[sortKey] ?? '');
      const y = sortKey === 'testCaseIds' ? b.testCaseIds.join() : (b[sortKey] ?? '');
      if (!x && y) return 1;
      if (x && !y) return -1;
      return String(x).localeCompare(String(y), undefined, { numeric: true }) * dir;
    });
    return rows;
  }, [filtered, sortKey, dir]);

  const pages = Math.max(1, Math.ceil(sorted.length / perPage));
  const current = Math.min(page, pages);
  const slice = sorted.slice((current - 1) * perPage, current * perPage);

  const actionable = useMemo(
    () =>
      issues
        .filter((i) => i.stage !== 'confirmed')
        .sort(
          (a, b) =>
            (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9) ||
            a.number - b.number
        ),
    [issues]
  );

  const byModule = useMemo(() => {
    const m = new Map<string, { label: string; total: number; confirmed: number }>();
    for (const i of issues) {
      const key = i.module ?? i.area ?? '—';
      const row = m.get(key) ?? { label: key, total: 0, confirmed: 0 };
      row.total++;
      if (i.stage === 'confirmed') row.confirmed++;
      m.set(key, row);
    }
    return [...m.values()].sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));
  }, [issues]);
  const modMax = Math.max(1, ...byModule.map((r) => r.total));

  const kpis: [string, number, string, string?][] = [
    ['Total issues', pipeline.created, 'raised from QA failures'],
    ['Open / in progress', pipeline.open + pipeline.inProgress, 'not yet fixed', 'var(--fail)'],
    ['Awaiting retest', pipeline.awaitingRetest, 'fixed, QA to verify', 'var(--retest)'],
    ['Awaiting sign-off', pipeline.awaitingSignOff, 'retest passed', 'var(--accent)'],
    ['Confirmed closed', pipeline.confirmed, 'senior approved', 'var(--pass)'],
    ['Reopened', pipeline.reopened, 'failed retest at least once', pipeline.reopened ? 'var(--fail)' : undefined],
  ];

  if (!issues.length) {
    return (
      <Panel title="Issues">
        <EmptyState
          title="No issues recorded yet"
          body="This tab fills as soon as QA adds a row to the Issues tab in the sheet and writes its Issue ID into a failed test case's Defect ID column."
        />
      </Panel>
    );
  }

  return (
    <>
      {isSeeded ? (
        <div className="banner warn">
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M8 4.6v4M8 11.2h.01" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          </svg>
          <span>
            <b>Illustrative data.</b> No Google Sheet is configured yet, so these {issues.length} issues are a
            worked example of the lifecycle, linked to real test case IDs. Set{' '}
            <code>GOOGLE_SERVICE_ACCOUNT_KEY</code> and <code>QA_SHEET_ID</code> in <code>.env</code>, add an{' '}
            <code>Issues</code> tab to the sheet, and record Issue IDs in the case tabs&apos; Defect ID column.
          </span>
        </div>
      ) : null}

      <div className="panel kpis">
        {kpis.map(([k, v, d, tone]) => (
          <div className="kpi" key={k}>
            <div className="k">{k}</div>
            <div className="v" style={tone ? { color: tone } : undefined}>
              {v}
            </div>
            <div className="d">{d}</div>
          </div>
        ))}
      </div>

      <div className="grid2">
        <Panel title="Awaiting action" hint="What is blocking closure right now">
          <div className="att">
            {actionable.length ? (
              <>
                {actionable.slice(0, 7).map((i) => (
                  <button className="attitem" key={i.number} type="button" onClick={() => setOpenIssue(i)}>
                    <span className="stripe" style={{ background: SEVERITY_COLOR[i.severity] ?? 'var(--ink-3)' }} />
                    <span style={{ minWidth: 0 }}>
                      <span className="aid">
                        #{i.number} · {i.severity} · {ISSUE_STAGE[i.stage].short}
                      </span>
                      <span className="as" style={{ display: 'block' }}>
                        {i.title}
                      </span>
                      <span className="am" style={{ display: 'block' }}>
                        {ISSUE_STAGE[i.stage].action}
                        {i.assignee ? ` — ${i.assignee}` : ''}
                      </span>
                    </span>
                  </button>
                ))}
                {actionable.length > 7 ? (
                  <div
                    style={{
                      paddingTop: 11,
                      borderTop: '1px solid var(--line)',
                      fontSize: 12.5,
                      color: 'var(--ink-3)',
                    }}
                  >
                    + {actionable.length - 7} more below
                  </div>
                ) : null}
              </>
            ) : (
              <EmptyState title="Every issue is confirmed closed." body="Nothing is waiting on anyone." />
            )}
          </div>
        </Panel>

        <Panel title="Issues by module" hint="Open vs. fully confirmed">
          <div className="clegend">
            <span className="lg">
              <i className="sw" style={{ background: 'var(--pass)' }} />
              Confirmed closed
            </span>
            <span className="lg">
              <i className="sw" style={{ background: 'var(--notrun)' }} />
              Still in the loop
            </span>
          </div>
          <div className="chart">
            {byModule.map((r) => (
              <div className="barrow" key={r.label}>
                <span className="lbl" title={r.label}>
                  {r.label}
                </span>
                <span className="track" style={{ width: `${(r.total / modMax) * 100}%` }}>
                  {r.confirmed ? (
                    <i
                      style={{ width: `${(r.confirmed / r.total) * 100}%`, background: 'var(--pass)' }}
                      title={`Confirmed: ${r.confirmed}`}
                    />
                  ) : null}
                  <i
                    style={{ width: `${((r.total - r.confirmed) / r.total) * 100}%`, background: 'var(--notrun)' }}
                    title={`Open: ${r.total - r.confirmed}`}
                  />
                </span>
                <span className="num">{r.total}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <div className="panel">
        <div className="filters">
          <label className="search">
            <SearchIcon />
            <input
              type="text"
              value={f.q}
              onChange={(e) => set('q', e.target.value)}
              placeholder="Search issue number, title, test case, resolution, reviewer…"
              aria-label="Search issues"
            />
          </label>

          <select aria-label="Lifecycle stage" value={f.stage} onChange={(e) => set('stage', e.target.value)}>
            <option value="">Lifecycle stage · all</option>
            {(Object.keys(ISSUE_STAGE) as IssueStage[]).map((k) => (
              <option key={k} value={k}>
                {ISSUE_STAGE[k].label}
              </option>
            ))}
          </select>
          <select aria-label="Severity" value={f.severity} onChange={(e) => set('severity', e.target.value)}>
            <option value="">Severity · all</option>
            {['Critical', 'High', 'Medium', 'Low'].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <select aria-label="Module" value={f.module} onChange={(e) => set('module', e.target.value)}>
            <option value="">Module · all</option>
            {facets.module.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
          <select aria-label="Assignee" value={f.assignee} onChange={(e) => set('assignee', e.target.value)}>
            <option value="">Assignee · all</option>
            {facets.assignee.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
          <select aria-label="Confirmed by" value={f.confirmer} onChange={(e) => set('confirmer', e.target.value)}>
            <option value="">Confirmed by · all</option>
            {facets.confirmer.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>

          <button
            className="chip alt"
            type="button"
            aria-pressed={f.openOnly}
            onClick={() => set('openOnly', !f.openOnly)}
          >
            Not yet confirmed
          </button>
          <button
            className="chip"
            type="button"
            aria-pressed={f.reopened}
            onClick={() => set('reopened', !f.reopened)}
          >
            Reopened only
          </button>
          <button className="linkbtn" type="button" onClick={() => setF({ ...EMPTY })}>
            Reset
          </button>
        </div>

        <div className="tablewrap">
          <table className="responsive">
            <thead>
              <SortableHeaders
                cols={COLS}
                sortKey={sortKey}
                dir={dir}
                onSort={(k) => {
                  if (k === sortKey) setDir((d) => (d === 1 ? -1 : 1));
                  else {
                    setSortKey(k);
                    setDir(1);
                  }
                }}
              />
            </thead>
            <tbody>
              {slice.length ? (
                slice.map((i) => (
                  <tr
                    key={i.number}
                    data-clickable
                    tabIndex={0}
                    onClick={() => setOpenIssue(i)}
                    onKeyDown={(e) => e.key === 'Enter' && setOpenIssue(i)}
                  >
                    <td className="idc" data-label="Issue">
                      <span className="ghnum">#{i.number}</span>
                    </td>
                    <td className="sc">
                      {i.title}
                      {i.labels.length ? <span className="pre">{i.labels.join(' · ')}</span> : null}
                    </td>
                    <td data-label="Test cases">
                      {i.testCaseIds.map((id) => {
                        const c = cases.find((x) => x.testCaseId === id);
                        return (
                          <button
                            className="tclink"
                            key={id}
                            type="button"
                            title={`Open test case ${id}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (c) setOpenCase(c);
                            }}
                          >
                            {id}
                          </button>
                        );
                      })}
                    </td>
                    <td data-label="Module">
                      <span className="tag">{i.module ?? i.area ?? '—'}</span>
                    </td>
                    <td className="sev" data-label="Severity" style={{ color: SEVERITY_COLOR[i.severity] }}>
                      {i.severity}
                      {i.reopened ? (
                        <div style={{ fontSize: 10.5, color: 'var(--fail)' }}>reopened ×{i.reopened}</div>
                      ) : null}
                    </td>
                    <td data-label="Lifecycle">
                      <StageTracker issue={i} />
                    </td>
                    <td className="idc" data-label="Assignee">
                      {i.assignee ?? 'unassigned'}
                    </td>
                    <td className="idc" data-label="Created">
                      {i.createdAt}
                    </td>
                    <td className="idc" data-label="Confirmed by">
                      {i.confirmedBy ?? '—'}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={COLS.length}>
                    <EmptyState
                      title="No issues match these filters"
                      body="Try clearing the search box or resetting the filters."
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <Pagination
          page={current}
          pages={pages}
          perPage={perPage}
          total={sorted.length}
          noun="issues"
          onPage={(p) => {
            setPage(p);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          onPerPage={(v) => {
            setPerPage(v);
            setPage(1);
          }}
        />
      </div>

      {openIssue ? (
        <IssueDrawer
          issue={openIssue}
          cases={cases}
          onOpenCase={(c) => {
            setOpenIssue(null);
            setOpenCase(c);
          }}
          onClose={() => setOpenIssue(null)}
        />
      ) : null}
      {openCase ? <CaseDrawer testCase={openCase} onClose={() => setOpenCase(null)} /> : null}
    </>
  );
}
