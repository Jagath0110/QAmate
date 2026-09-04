'use client';

import { STATUS_COLOR, STATUS_SOFT } from '@/lib/constants';

export function StatusBadge({ status }: { status: string }) {
  const c = STATUS_COLOR[status] ?? 'var(--notrun)';
  const bg = STATUS_SOFT[status] ?? 'var(--notrun-soft)';
  // Colour AND label, never colour alone — survives colour-blindness, greyscale
  // printing and a washed-out projector.
  return (
    <span className="badge" style={{ color: c, background: bg }}>
      <i className="sw" style={{ background: c }} />
      {status}
    </span>
  );
}

export function EmptyState({
  title,
  body,
  icon,
}: {
  title: string;
  body?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="empty">
      {icon}
      <div className="et">{title}</div>
      {body ? <div style={{ marginTop: 5, maxWidth: '46ch', marginInline: 'auto' }}>{body}</div> : null}
    </div>
  );
}

export function Panel({
  title,
  hint,
  children,
  style,
}: {
  title?: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div className="panel" style={style}>
      {title ? (
        <div className="phead">
          <h3>{title}</h3>
          {hint ? <span className="hint">{hint}</span> : null}
        </div>
      ) : null}
      {children}
    </div>
  );
}

export function Banner({
  tone = 'info',
  children,
}: {
  tone?: 'info' | 'warn' | 'error';
  children: React.ReactNode;
}) {
  return (
    <div className={`banner ${tone}`}>
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5" />
        <path d="M8 4.6v4M8 11.2h.01" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
      <span>{children}</span>
    </div>
  );
}

export function Pagination({
  page,
  pages,
  perPage,
  total,
  noun,
  onPage,
  onPerPage,
}: {
  page: number;
  pages: number;
  perPage: number;
  total: number;
  noun: string;
  onPage: (p: number) => void;
  onPerPage: (n: number) => void;
}) {
  const from = Math.max(1, page - 2);
  const to = Math.min(pages, from + 4);
  const win: number[] = [];
  for (let i = from; i <= to; i++) win.push(i);

  return (
    <div className="pager">
      <span>
        {total ? (page - 1) * perPage + 1 : 0}–{Math.min(page * perPage, total)} of{' '}
        {total.toLocaleString('en-US')} {noun}
      </span>
      <span className="sp">
        <button className="pbtn" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">
          ‹
        </button>
        {win.map((i) => (
          <button
            key={i}
            className="pbtn"
            aria-current={i === page ? 'true' : undefined}
            onClick={() => onPage(i)}
          >
            {i}
          </button>
        ))}
        <button className="pbtn" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page">
          ›
        </button>
        <select
          aria-label="Rows per page"
          style={{ marginLeft: 6 }}
          value={perPage}
          onChange={(e) => onPerPage(Number(e.target.value))}
        >
          {[25, 50, 100].map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
      </span>
    </div>
  );
}

export function SortableHeaders<K extends string>({
  cols,
  sortKey,
  dir,
  onSort,
}: {
  cols: { k: K; t: string }[];
  sortKey: K;
  dir: 1 | -1;
  onSort: (k: K) => void;
}) {
  return (
    <tr>
      {cols.map((c) => (
        <th
          key={c.k}
          className="sortable"
          onClick={() => onSort(c.k)}
          aria-sort={sortKey === c.k ? (dir > 0 ? 'ascending' : 'descending') : undefined}
        >
          {c.t}
          <span className="ar">{sortKey === c.k ? (dir > 0 ? '↑' : '↓') : '↕'}</span>
        </th>
      ))}
    </tr>
  );
}

export function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="7" cy="7" r="4.6" stroke="currentColor" strokeWidth="1.6" />
      <path d="M10.5 10.5 14 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
