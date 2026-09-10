'use client';

import { useEffect, useRef } from 'react';
import { PRIORITY_COLOR } from '@/lib/constants';
import { parseSteps } from '@/lib/format';
import type { TestCaseDTO } from '@/lib/types';
import { TIME_STATE_META, VERIFY_GRACE_DAYS, type TimeVerification } from '@/lib/timeverify';
import { StatusBadge, TimeChip } from './ui';

function Field({ label, value, mono }: { label: string; value?: string | null; mono?: boolean }) {
  if (!value) {
    return (
      <div className="field na">
        <div className="k">{label}</div>
        <div className="v">Not recorded</div>
      </div>
    );
  }
  return (
    <div className="field">
      <div className="k">{label}</div>
      <div className={`v${mono ? ' mono' : ''}`}>{value}</div>
    </div>
  );
}

/**
 * The time-based verification panel: what a single test run couldn't finish
 * because the outcome only lands after real time passes. Every date here is
 * derived from the trigger date + wait period; the countdown reflects today.
 */
function TimeVerifySection({ tv }: { tv: TimeVerification }) {
  const m = TIME_STATE_META[tv.state];
  const rows: [string, string | null][] = [
    ['Clock started (trigger date)', tv.triggerDate],
    ['Required wait', tv.periodLabel ?? tv.periodRaw],
    ['Verify outcome on/after', tv.verifyBy],
    ['On-time until', tv.windowEnd ? `${tv.windowEnd} (+${VERIFY_GRACE_DAYS}d grace)` : null],
    ['Recorded result', tv.result],
  ];

  const note =
    tv.state === 'pending'
      ? `Setup was verified on the trigger date. The time-dependent outcome can't be checked until ${tv.verifyBy} — this case is pending a real-world wait, not blocked by a defect.`
      : tv.state === 'due'
        ? `The wait has elapsed. Verify the outcome now and record Pass/Fail in the sheet's "Verify Result" column.`
        : tv.state === 'overdue'
          ? `The verification window closed on ${tv.windowEnd} with no result recorded. Re-run the trigger or verify immediately — the earlier setup pass can no longer be trusted for sign-off.`
          : tv.state === 'invalid'
            ? `Add a "Time Trigger Date" and a "Verify After" period (e.g. 30d, 2w, 3mo) so the verification date can be computed.`
            : `Outcome verified ${tv.result === 'Pass' ? 'passing' : 'failing'} after the required wait.`;

  return (
    <div className="field">
      <div className="k">Time-based verification</div>
      <div style={{ margin: '4px 0 10px' }}>
        <span className="badge" style={{ color: m.color, background: m.soft }}>
          <i className="sw" style={{ background: m.color }} />
          {m.label} · {tv.label}
        </span>
      </div>
      <div className="dmeta" style={{ marginBottom: 10 }}>
        {rows.map(([k, v]) => (
          <div key={k}>
            <div className="k">{k}</div>
            <div className="v">{v ?? '—'}</div>
          </div>
        ))}
      </div>
      <div className="callout">{note}</div>
    </div>
  );
}

export function CaseDrawer({
  testCase: c,
  onClose,
}: {
  testCase: TestCaseDTO;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const steps = parseSteps(c.steps);
  const meta: [string, string | null][] = [
    ['Module', c.module],
    ['Platform', c.platform],
    ['Tester', c.tester],
    ['Execution date', c.executedAt],
    ['Defect ID', c.defectId],
    ['Source', c.sourceLabel],
  ];

  return (
    <div className="scrim" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="drawer" role="dialog" aria-modal="true" aria-labelledby="dTitle">
        <div className="dhead">
          <div>
            <div className="tcid">
              {c.testCaseId} · {c.area}
            </div>
            <h3 id="dTitle">{c.scenario}</h3>
            <div style={{ marginTop: 8, display: 'flex', gap: 7, flexWrap: 'wrap' }}>
              <StatusBadge status={c.status} />
              {c.timeVerification ? <TimeChip tv={c.timeVerification} /> : null}
              {c.priority ? (
                <span className="tag" style={{ color: PRIORITY_COLOR[c.priority] ?? 'var(--ink-2)' }}>
                  {c.priority} priority
                </span>
              ) : null}
              {c.type ? <span className="tag">{c.type}</span> : null}
              <span className="tag">{c.execution}</span>
            </div>
          </div>
          <button className="x" ref={closeRef} onClick={onClose} aria-label="Close" type="button">
            ✕
          </button>
        </div>

        <div className="dbody">
          <div className="dmeta">
            {meta.map(([k, v]) => (
              <div key={k}>
                <div className="k">{k}</div>
                <div className="v">{v ?? '—'}</div>
              </div>
            ))}
          </div>

          <Field label="Preconditions" value={c.preconditions} />
          <Field label="Test data" value={c.testData} />

          {c.timeVerification ? <TimeVerifySection tv={c.timeVerification} /> : null}

          {steps.length > 1 ? (
            <div className="field">
              <div className="k">Test steps</div>
              <div className="steps">
                {steps.map((s, i) => (
                  <div className="step" key={i}>
                    <span className="n">{i + 1}</span>
                    <span>{s}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <Field label="Test steps" value={c.steps} />
          )}

          <Field label="Expected result" value={c.expected} />
          <Field label="Actual result" value={c.actual} />
          <Field label="Comments / notes" value={c.comments} />

          {c.whyManual ? (
            <div className="field">
              <div className="k">Why this case needs a human</div>
              <div className="callout">{c.whyManual}</div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
