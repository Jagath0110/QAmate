'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { relativeTime } from '@/lib/format';
import type { SyncState } from '@/lib/types';

/**
 * Header, sync pill and the two-level tab bar.
 *
 * The sync pill is the client's only signal that what they are looking at is
 * current, so it updates on a timer rather than only on navigation.
 */
export function AppShell({
  sync,
  caseCount,
  issueCount,
  children,
  internal = true,
}: {
  sync: SyncState;
  caseCount: number;
  issueCount: number;
  children: React.ReactNode;
  internal?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [syncing, setSyncing] = useState(false);
  const [ago, setAgo] = useState(() => relativeTime(sync.lastSyncedAt));

  useEffect(() => {
    setAgo(relativeTime(sync.lastSyncedAt));
    const t = setInterval(() => setAgo(relativeTime(sync.lastSyncedAt)), 20_000);
    return () => clearInterval(t);
  }, [sync.lastSyncedAt]);

  async function resync() {
    setSyncing(true);
    try {
      await fetch('/api/sync/run', { method: 'POST' });
      startTransition(() => router.refresh());
    } finally {
      setSyncing(false);
    }
  }

  const tabs = [
    { href: '/qa', label: 'QA Summary', count: null as number | null },
    { href: '/qa/cases', label: 'Test Cases', count: caseCount },
    { href: '/qa/issues', label: 'Issues', count: issueCount },
  ];

  return (
    <>
      <div className="top">
        <div className="wrap">
          <div className="topbar">
            <div className="brandmark">
              <span className="logo" aria-hidden="true">
                <svg width="19" height="19" viewBox="0 0 20 20" fill="none">
                  <path
                    d="M3 10.5 L7.4 15 L17 5"
                    stroke="#fff"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              <span>
                <span className="nm">Oraxs QA Console</span>
                <span className="sb">Human / Manual Test Report · v1</span>
              </span>
            </div>

            <div className="sync">
              <span className="syncpill" title={syncLabel(sync)}>
                <span className={`dot ${sync.state}`} />
                {sync.state === 'never' ? 'Not yet synced' : 'Synced'}{' '}
                <span className="mono">{ago}</span>
              </span>
              {internal ? (
                <button className="btn" onClick={resync} disabled={syncing} type="button">
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path
                      d="M14 8a6 6 0 1 1-1.8-4.3M14 2v4h-4"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  {syncing ? 'Syncing…' : 'Sync now'}
                </button>
              ) : null}
            </div>
          </div>

          <div className="tabs" role="tablist">
            {tabs.map((t) => (
              <Link
                key={t.href}
                href={t.href}
                className="tab"
                role="tab"
                data-active={pathname === t.href ? 'true' : 'false'}
                aria-selected={pathname === t.href}
              >
                {t.label}
                {t.count != null ? <span className="ct">{t.count}</span> : null}
              </Link>
            ))}
          </div>
        </div>
      </div>

      <main>
        <div className="wrap">{children}</div>
      </main>
    </>
  );
}

function syncLabel(sync: SyncState): string {
  if (sync.state === 'never') return sync.error ?? 'No data has loaded yet.';
  if (sync.state === 'error') return sync.error ?? 'The last refresh failed or the data is very stale.';
  if (sync.state === 'stale') return 'Data is older than the warning threshold.';
  return 'Reading from the Google Sheet.';
}
