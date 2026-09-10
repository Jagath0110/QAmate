'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { PRIORITY_COLOR, PRIORITY_ORDER, STATUS_ORDER } from '@/lib/constants';
import type { TestCaseDTO } from '@/lib/types';
import { EmptyState, Pagination, SearchIcon, SortableHeaders, StatusBadge, TimeChip } from './ui';
import { CaseDrawer } from './CaseDrawer';

type ColKey =
  | 'testCaseId'
  | 'scenario'
  | 'module'
  | 'type'
  | 'priority'
  | 'platform'
  | 'status'
  | 'timeVerify'
  | 'tester'
  | 'executedAt';

const COLS: { k: ColKey; t: string }[] = [
  { k: 'testCaseId', t: 'TC-ID' },
  { k: 'scenario', t: 'Test scenario' },
  { k: 'module', t: 'Module' },
  { k: 'type', t: 'Type' },
  { k: 'priority', t: 'Priority' },
  { k: 'platform', t: 'Platform' },
  { k: 'status', t: 'Status' },
  { k: 'timeVerify', t: 'Time verify' },
  { k: 'tester', t: 'Tester' },
  { k: 'executedAt', t: 'Executed' },
];

const TIME_STATE_OPTIONS: { v: string; t: string }[] = [
  { v: 'any', t: 'Any time-based' },
  { v: 'pending', t: 'Time-pending' },
  { v: 'due', t: 'Verification due' },
  { v: 'overdue', t: 'Verification overdue' },
  { v: 'verified', t: 'Time-verified' },
];

const FILTER_KEYS = [
  'q',
  'status',
  'area',
  'module',
  'type',
  'priority',
  'platform',
  'execution',
  'tester',
  'timeState',
  'from',
  'to',
  'attention',
] as const;
type FilterKey = (typeof FILTER_KEYS)[number];
type Filters = Record<FilterKey, string>;

const EMPTY: Filters = {
  q: '',
  status: '',
  area: '',
  module: '',
  type: '',
  priority: '',
  platform: '',
  execution: '',
  tester: '',
  timeState: '',
  from: '',
  to: '',
  attention: '',
};

const uniq = (vals: (string | null)[]) =>
  [...new Set(vals.filter((v): v is string => Boolean(v)))].sort();

export function CaseTable({ cases }: { cases: TestCaseDTO[] }) {
  const router = useRouter();
  const params = useSearchParams();

  // Filter state lives in the URL, so any filtered view is a shareable link —
  // "here's exactly what's failing in Auto Check-in" becomes a URL, not a
  // screenshot.
  const [filters, setFilters] = useState<Filters>(() => {
    const f = { ...EMPTY };
    for (const k of FILTER_KEYS) f[k] = params.get(k) ?? '';
    return f;
  });
  const [sortKey, setSortKey] = useState<ColKey>('testCaseId');
  const [dir, setDir] = useState<1 | -1>(1);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);
  const [selected, setSelected] = useState<TestCaseDTO | null>(null);

  useEffect(() => {
    const sp = new URLSearchParams();
    for (const k of FILTER_KEYS) if (filters[k]) sp.set(k, filters[k]);
    const qs = sp.toString();
    router.replace(qs ? `/qa/cases?${qs}` : '/qa/cases', { scroll: false });
  }, [filters, router]);

  const set = useCallback((k: FilterKey, v: string) => {
    setFilters((f) => ({ ...f, [k]: v }));
    setPage(1);
  }, []);

  const facets = useMemo(
    () => ({
      status: uniq(cases.map((c) => c.status)),
      area: uniq(cases.map((c) => c.area)),
      module: uniq(
        cases.filter((c) => !filters.area || c.area === filters.area).map((c) => c.module)
      ),
      type: uniq(cases.map((c) => c.type)),
      priority: ['Critical', 'High', 'Medium', 'Low'].filter((p) =>
        cases.some((c) => c.priority === p)
      ),
      platform: uniq(cases.map((c) => c.platform)),
      tester: uniq(cases.map((c) => c.tester)),
    }),
    [cases, filters.area]
  );

  const filtered = useMemo(() => {
    const q = filters.q.trim().toLowerCase();
    return cases.filter((c) => {
      if (filters.status && c.status !== filters.status) return false;
      if (filters.area && c.area !== filters.area) return false;
      if (filters.module && c.module !== filters.module) return false;
      if (filters.type && c.type !== filters.type) return false;
      if (filters.priority && c.priority !== filters.priority) return false;
      if (filters.platform && c.platform !== filters.platform) return false;
      if (filters.execution && c.execution !== filters.execution) return false;
      if (filters.tester && c.tester !== filters.tester) return false;
      if (filters.timeState) {
        const tv = c.timeVerification;
        if (!tv) return false;
        if (filters.timeState === 'verified') {
          if (tv.state !== 'verified_pass' && tv.state !== 'verified_fail') return false;
        } else if (filters.timeState !== 'any' && tv.state !== filters.timeState) {
          return false;
        }
      }
      if (filters.attention && !['Fail', 'Blocked', 'Retest'].includes(c.status)) return false;
      if (filters.from && (!c.executedAt || c.executedAt < filters.from)) return false;
      if (filters.to && (!c.executedAt || c.executedAt > filters.to)) return false;
      if (q) {
        const hay = [
          c.testCaseId,
          c.scenario,
          c.module,
          c.area,
          c.type,
          c.priority,
          c.platform,
          c.status,
          c.tester,
          c.defectId,
          c.verifyAfter,
          c.timeVerification?.label,
          c.timeVerification?.verifyBy,
          c.steps,
          c.expected,
          c.actual,
          c.preconditions,
          c.comments,
          c.whyManual,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [cases, filters]);

  const sorted = useMemo(() => {
    const rows = [...filtered];
    rows.sort((a, b) => {
      // Priority and status sort by their real order, never alphabetically.
      if (sortKey === 'priority') {
        return (
          ((PRIORITY_ORDER[a.priority ?? ''] ?? 9) - (PRIORITY_ORDER[b.priority ?? ''] ?? 9)) * dir
        );
      }
      if (sortKey === 'status') {
        const ai = STATUS_ORDER.indexOf(a.status);
        const bi = STATUS_ORDER.indexOf(b.status);
        return ((ai < 0 ? 9 : ai) - (bi < 0 ? 9 : bi)) * dir;
      }
      if (sortKey === 'timeVerify') {
        // Soonest to act first (overdue, due, then ascending days-left);
        // non-time-based cases always sort to the bottom.
        const av = a.timeVerification?.daysLeft;
        const bv = b.timeVerification?.daysLeft;
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        return (av - bv) * dir;
      }
      const x = a[sortKey] ?? '';
      const y = b[sortKey] ?? '';
      if (!x && y) return 1;
      if (x && !y) return -1;
      return String(x).localeCompare(String(y), undefined, { numeric: true }) * dir;
    });
    return rows;
  }, [filtered, sortKey, dir]);

  const pages = Math.max(1, Math.ceil(sorted.length / perPage));
  const current = Math.min(page, pages);
  const slice = sorted.slice((current - 1) * perPage, current * perPage);

  const onSort = (k: ColKey) => {
    if (k === sortKey) setDir((d) => (d === 1 ? -1 : 1));
    else {
      setSortKey(k);
      setDir(1);
    }
  };

  const activeCount = FILTER_KEYS.filter((k) => filters[k]).length;

  return (
    <>
      <div className="panel">
        <div className="filters">
          <label className="search">
            <SearchIcon />
            <input
              type="text"
              value={filters.q}
              onChange={(e) => set('q', e.target.value)}
              placeholder="Search ID, scenario, steps, expected result, tester, defect…"
              aria-label="Search test cases"
            />
          </label>

          <Select label="Status" value={filters.status} options={facets.status} onChange={(v) => set('status', v)} />
          <Select label="Area" value={filters.area} options={facets.area} onChange={(v) => set('area', v)} />
          <Select label="Module" value={filters.module} options={facets.module} onChange={(v) => set('module', v)} />
          <Select label="Type" value={filters.type} options={facets.type} onChange={(v) => set('type', v)} />
          <Select label="Priority" value={filters.priority} options={facets.priority} onChange={(v) => set('priority', v)} />
          <Select label="Platform" value={filters.platform} options={facets.platform} onChange={(v) => set('platform', v)} />
          <select
            aria-label="Manual or automated"
            value={filters.execution}
            onChange={(e) => set('execution', e.target.value)}
          >
            <option value="">Manual + automated</option>
            <option>Manual</option>
            <option>Automated</option>
          </select>
          <Select label="Tester" value={filters.tester} options={facets.tester} onChange={(v) => set('tester', v)} />

          <select
            aria-label="Time-based verification"
            value={filters.timeState}
            onChange={(e) => set('timeState', e.target.value)}
          >
            <option value="">Time verify · all</option>
            {TIME_STATE_OPTIONS.map((o) => (
              <option key={o.v} value={o.v}>
                {o.t}
              </option>
            ))}
          </select>

          <input
            type="date"
            aria-label="Executed from"
            value={filters.from}
            onChange={(e) => set('from', e.target.value)}
          />
          <input type="date" aria-label="Executed to" value={filters.to} onChange={(e) => set('to', e.target.value)} />

          <button
            className="chip"
            type="button"
            aria-pressed={filters.attention === '1'}
            onClick={() => set('attention', filters.attention ? '' : '1')}
          >
            Failed &amp; blocked only
          </button>
          <button className="linkbtn" type="button" onClick={() => setFilters({ ...EMPTY })}>
            Reset{activeCount ? ` (${activeCount})` : ''}
          </button>
          <a className="linkbtn" href={`/api/qa/export?format=csv&${new URLSearchParams(
            Object.fromEntries(FILTER_KEYS.filter((k) => filters[k]).map((k) => [k, filters[k]]))
          ).toString()}`}>
            Export CSV
          </a>
        </div>

        <div className="tablewrap">
          <table className="responsive">
            <thead>
              <SortableHeaders cols={COLS} sortKey={sortKey} dir={dir} onSort={onSort} />
            </thead>
            <tbody>
              {slice.length ? (
                slice.map((c) => (
                  <tr
                    key={`${c.sheetTab}-${c.testCaseId}`}
                    data-clickable
                    tabIndex={0}
                    onClick={() => setSelected(c)}
                    onKeyDown={(e) => e.key === 'Enter' && setSelected(c)}
                  >
                    <td className="idc" data-label="TC-ID">
                      {c.testCaseId}
                    </td>
                    <td className="sc">
                      {c.scenario}
                      {c.preconditions ? <span className="pre">{c.preconditions}</span> : null}
                    </td>
                    <td data-label="Module">
                      <span className="tag">{c.module ?? c.area}</span>
                    </td>
                    <td data-label="Type">
                      <span className="tag">{c.type ?? '—'}</span>
                    </td>
                    <td
                      className="prio"
                      data-label="Priority"
                      style={{ color: PRIORITY_COLOR[c.priority ?? ''] ?? 'var(--ink-3)' }}
                    >
                      {c.priority ?? '—'}
                    </td>
                    <td className="idc" data-label="Platform">
                      {c.platform ?? '—'}
                    </td>
                    <td data-label="Status">
                      <StatusBadge status={c.status} />
                    </td>
                    <td data-label="Time verify">
                      <TimeChip tv={c.timeVerification} />
                    </td>
                    <td className="idc" data-label="Tester">
                      {c.tester ?? '—'}
                    </td>
                    <td className="idc" data-label="Executed">
                      {c.executedAt ?? '—'}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={COLS.length}>
                    <EmptyState
                      title="No test cases match these filters"
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
          noun="cases"
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

      {selected ? <CaseDrawer testCase={selected} onClose={() => setSelected(null)} /> : null}
    </>
  );
}

function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{label} · all</option>
      {options.map((o) => (
        <option key={o}>{o}</option>
      ))}
    </select>
  );
}
