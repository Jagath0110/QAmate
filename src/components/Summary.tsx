'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  HEALTH_WEIGHTS,
  PRIORITY_COLOR,
  STATUS_COLOR,
  STATUS_ORDER,
  healthColor,
} from '@/lib/constants';
import { f1, n } from '@/lib/format';
import type { CoverageRow, ModuleHealth, QaSummary, TestCaseDTO } from '@/lib/types';
import { EmptyState, Panel, StatusBadge } from './ui';
import { CaseDrawer } from './CaseDrawer';

/** The hero: one band that answers "how much is done, what passed, what failed". */
export function ExecutionLedger({ s }: { s: QaSummary }) {
  return (
    <div className="panel hero">
      <div className="hero-main">
        <span className="eyebrow">Execution ledger · all manual cases</span>
        <h2>
          {n(s.executed)} of {n(s.inScope)} manual cases executed — {f1(s.executionPct)}% complete
        </h2>
        <p className="sub">
          {n(s.pass)} passed and {n(s.fail)} failed so far, with {n(s.remaining)} still to run.{' '}
          {n(s.notApplicable)} cases are marked not applicable and are excluded from the denominator.{' '}
          {n(s.automatedCount)} further scenarios are covered by the automated suite.
        </p>

        <div className="ledger">
          {STATUS_ORDER.map((k) => {
            const v = s.counts[k] ?? 0;
            if (!v) return null;
            const w = (v / s.total) * 100;
            return (
              <div
                key={k}
                className="seg"
                style={{ width: `${w}%`, background: STATUS_COLOR[k] }}
                title={`${k}: ${v} cases (${f1(w)}%)`}
              >
                {w > 6 ? v : ''}
              </div>
            );
          })}
        </div>

        <div className="ledgend">
          {STATUS_ORDER.map((k) => {
            const v = s.counts[k] ?? 0;
            if (!v) return null;
            return (
              <span className="lg" key={k}>
                <i className="sw" style={{ background: STATUS_COLOR[k] }} />
                {k} <b>{v}</b>
              </span>
            );
          })}
        </div>
      </div>

      <div className="hero-side">
        <span className="eyebrow">QA Health Score</span>
        <div className="score">{Math.round(s.healthScore)}</div>
        <div className="scorelab">{s.healthBand}</div>
        <div className="gauge">
          <i style={{ width: `${s.healthScore}%`, background: healthColor(s.healthScore) }} />
        </div>
        <div className="formula">
          {HEALTH_WEIGHTS.pass * 100}% pass rate · {HEALTH_WEIGHTS.execution * 100}% execution progress ·{' '}
          {HEALTH_WEIGHTS.risk * 100}% open-risk clearance. Score rises as the suite is executed, not just
          as cases pass.
        </div>
      </div>
    </div>
  );
}

export function KpiStrip({ s }: { s: QaSummary }) {
  const cells: [string, string, string, string?][] = [
    ['Total test cases', n(s.total), `${n(s.totalWithAutomated)} incl. automated`],
    ['Test execution', `${f1(s.executionPct)}%`, `${n(s.executed)} of ${n(s.inScope)} in scope`],
    ['Pass rate', `${f1(s.passPct)}%`, `${n(s.pass)} of ${n(s.executed)} executed`, 'var(--pass)'],
    [
      'Failure rate',
      `${f1(s.failurePct)}%`,
      `${n(s.fail)} failed case${s.fail === 1 ? '' : 's'}`,
      s.fail ? 'var(--fail)' : undefined,
    ],
    [
      'Blocked / retest',
      `${n(s.blocked)} / ${n(s.retest)}`,
      'awaiting unblock & re-run',
      s.blocked || s.retest ? 'var(--blocked)' : undefined,
    ],
    ['Automation coverage', `${f1(s.automationPct)}%`, `${n(s.automatedCount)} automated scenarios`, 'var(--auto)'],
  ];
  return (
    <div className="panel kpis">
      {cells.map(([k, v, d, tone]) => (
        <div className="kpi" key={k}>
          <div className="k">{k}</div>
          <div className="v" style={tone ? { color: tone } : undefined}>
            {v}
          </div>
          <div className="d">{d}</div>
        </div>
      ))}
    </div>
  );
}

export function ModuleHealthTable({ modules }: { modules: ModuleHealth[] }) {
  const [open, setOpen] = useState(false);
  const TOP = 12;
  const list = open ? modules : modules.slice(0, TOP);

  return (
    <Panel title="Module health" hint="Sorted by open risk, then by work remaining">
      <div className="mods">
        {list.map((m) => {
          const rc = m.fail ? 3 : m.blocked ? 2 : m.retest ? 1 : 0;
          const chip =
            rc === 0
              ? 'ok'
              : `${m.fail ? `${m.fail}F` : ''}${m.blocked ? `${m.blocked}B` : ''}${m.retest ? `${m.retest}R` : ''}`;
          return (
            <div className="modrow" key={m.key}>
              <div className="modname">
                <div className="n" title={m.module}>
                  {m.module}
                </div>
                <div className="a">
                  {m.area} · {m.total} cases
                </div>
              </div>
              <div className="minibar">
                {STATUS_ORDER.map((k) => {
                  const v = m.counts[k] ?? 0;
                  if (!v) return null;
                  return (
                    <i
                      key={k}
                      style={{ width: `${(v / m.total) * 100}%`, background: STATUS_COLOR[k] }}
                      title={`${k}: ${v}`}
                    />
                  );
                })}
              </div>
              <div className="pct">{f1(m.executionPct)}%</div>
              <div className={`risk r${rc}`} title={`Open risk score ${m.risk}`}>
                {chip}
              </div>
            </div>
          );
        })}
        {modules.length > TOP ? (
          <div style={{ paddingTop: 12, borderTop: '1px solid var(--line)' }}>
            <button className="linkbtn" onClick={() => setOpen(!open)} type="button">
              {open ? `Show top ${TOP} only` : `Show all ${modules.length} modules`}
            </button>
          </div>
        ) : null}
      </div>
    </Panel>
  );
}

export function AttentionList({ cases }: { cases: TestCaseDTO[] }) {
  const [selected, setSelected] = useState<TestCaseDTO | null>(null);
  return (
    <>
      <Panel title="Needs attention" hint={`${cases.length} open`}>
        <div className="att">
          {cases.length ? (
            cases.map((c) => (
              <button className="attitem" key={c.testCaseId} type="button" onClick={() => setSelected(c)}>
                <span className="stripe" style={{ background: STATUS_COLOR[c.status] }} />
                <span style={{ minWidth: 0 }}>
                  <span className="aid">
                    {c.testCaseId} · {c.status}
                  </span>
                  <span className="as" style={{ display: 'block' }}>
                    {c.scenario}
                  </span>
                  <span className="am" style={{ display: 'block' }}>
                    {c.module ?? c.area} · {c.priority ?? '—'} priority · {c.platform ?? '—'}
                  </span>
                </span>
              </button>
            ))
          ) : (
            <EmptyState title="Nothing failed or blocked." body="Every executed case passed." />
          )}
        </div>
      </Panel>
      {selected ? <CaseDrawer testCase={selected} onClose={() => setSelected(null)} /> : null}
    </>
  );
}

/** Executed vs. not-yet-run in one mark, so coverage and progress read together. */
export function CoverageChart({
  title,
  hint,
  rows,
  legend = true,
}: {
  title: string;
  hint?: string;
  rows: CoverageRow[];
  legend?: boolean;
}) {
  const max = Math.max(1, ...rows.map((r) => r.total));
  return (
    <>
      <div className="phead">
        <h3>{title}</h3>
        {hint ? <span className="hint">{hint}</span> : null}
      </div>
      {legend ? (
        <div className="clegend">
          <span className="lg">
            <i className="sw" style={{ background: 'var(--accent)' }} />
            Executed
          </span>
          <span className="lg">
            <i className="sw" style={{ background: 'var(--notrun)' }} />
            Not yet run
          </span>
        </div>
      ) : null}
      <div className="chart">
        {rows.map((r) => {
          const w = (r.total / max) * 100;
          const ep = r.total ? (r.executed / r.total) * 100 : 0;
          return (
            <div className="barrow" key={r.label}>
              <span className="lbl" title={r.label}>
                {r.label}
              </span>
              <span className="track" style={{ width: `${w}%` }}>
                {r.executed ? (
                  <i
                    style={{ width: `${ep}%`, background: 'var(--accent)' }}
                    title={`Executed: ${r.executed}`}
                  />
                ) : null}
                <i
                  style={{ width: `${100 - ep}%`, background: 'var(--notrun)' }}
                  title={`Not yet run: ${r.total - r.executed}`}
                />
              </span>
              <span className="num">{r.total}</span>
            </div>
          );
        })}
      </div>
    </>
  );
}

export function AutomationSplit({ s }: { s: QaSummary }) {
  const manualPct = (s.total / s.totalWithAutomated) * 100;
  return (
    <Panel title="Manual vs. automated coverage" hint={`${f1(s.automationPct)}% automated`}>
      <div className="chart">
        <div className="ledger" style={{ height: 36, marginBottom: 12 }}>
          <div
            className="seg"
            style={{ width: `${manualPct}%`, background: 'var(--accent)' }}
            title={`Manual: ${s.total}`}
          >
            {s.total} manual
          </div>
          <div
            className="seg"
            style={{ width: `${100 - manualPct}%`, background: 'var(--auto)' }}
            title={`Automated: ${s.automatedCount}`}
          >
            {s.automatedCount} automated
          </div>
        </div>
        <p style={{ fontSize: 13, color: 'var(--ink-2)', margin: 0, lineHeight: 1.55 }}>
          Of {n(s.totalWithAutomated)} total scenarios, {n(s.automatedCount)} are covered by automation — API
          authorization, cross-tenant isolation, security headers and form validation. The remaining{' '}
          {n(s.total)} need a human because they involve real email/SMS, payment or SSO integrations, a
          physical device, or a visual judgement.
        </p>
      </div>
    </Panel>
  );
}

export function RecentTable({ cases }: { cases: TestCaseDTO[] }) {
  const [selected, setSelected] = useState<TestCaseDTO | null>(null);
  return (
    <>
      <Panel
        title="Recently updated test cases"
        hint="Newest execution results from the sheet"
        style={{ marginBottom: 18 }}
      >
        <div className="tablewrap">
          {cases.length ? (
            <table>
              <thead>
                <tr>
                  <th>TC-ID</th>
                  <th>Test scenario</th>
                  <th>Module</th>
                  <th>Status</th>
                  <th>Tester</th>
                  <th>Executed</th>
                </tr>
              </thead>
              <tbody>
                {cases.map((c) => (
                  <tr key={c.testCaseId} data-clickable onClick={() => setSelected(c)}>
                    <td className="idc">{c.testCaseId}</td>
                    <td className="sc">{c.scenario}</td>
                    <td>
                      <span className="tag">{c.module ?? c.area}</span>
                    </td>
                    <td>
                      <StatusBadge status={c.status} />
                    </td>
                    <td className="idc">{c.tester ?? '—'}</td>
                    <td className="idc">{c.executedAt ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptyState
              title="No execution results recorded yet"
              body="Rows appear here as QA sets a status and execution date in the sheet."
            />
          )}
        </div>
      </Panel>
      {selected ? <CaseDrawer testCase={selected} onClose={() => setSelected(null)} /> : null}
    </>
  );
}

export function IssuePipelineStrip({
  s,
  linkToIssues = false,
}: {
  s: QaSummary;
  linkToIssues?: boolean;
}) {
  const router = useRouter();
  const p = s.issuePipeline;
  const steps = [
    {
      n: 'STEP 01',
      t: 'Issue created',
      v: p.created,
      d: 'from failed & blocked test cases',
      done: p.created,
      c: 'var(--accent)',
    },
    {
      n: 'STEP 02',
      t: 'Closed / resolved',
      v: p.resolved,
      d: `${p.created - p.resolved} still being fixed`,
      done: p.resolved,
      c: 'var(--retest)',
    },
    {
      n: 'STEP 03',
      t: 'Retested by QA',
      v: p.retested,
      d: `${p.retestPassed} passed · ${p.retestFailed} failed & reopened`,
      done: p.retestPassed,
      c: 'var(--blocked)',
    },
    {
      n: 'STEP 04',
      t: 'Confirmed by mentor / senior',
      v: p.confirmed,
      d: `${Math.max(0, p.retestPassed - p.confirmed)} awaiting sign-off`,
      done: p.confirmed,
      c: 'var(--pass)',
    },
  ];

  return (
    <Panel
      title={linkToIssues ? 'Defect & issue status' : 'Defect lifecycle'}
      hint={
        linkToIssues ? (
          <button className="linkbtn" type="button" onClick={() => router.push('/qa/issues')}>
            View all issues →
          </button>
        ) : (
          'Failed case → issue logged → fix merged → QA retest → senior sign-off'
        )
      }
      style={{ marginBottom: 18 }}
    >
      <div className="pipeline">
        {steps.map((st) => (
          <div className="pstep" key={st.n}>
            <div className="pn">{st.n}</div>
            <div className="pt">{st.t}</div>
            <div className="pv" style={{ color: st.c }}>
              {st.v}
              <span> / {p.created || 0}</span>
            </div>
            <div className="pd">{st.d}</div>
            <div className="pflow">
              <i style={{ width: `${p.created ? (st.done / p.created) * 100 : 0}%`, background: st.c }} />
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

export { PRIORITY_COLOR };
