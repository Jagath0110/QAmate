'use client';

import { useEffect, useRef } from 'react';
import { PRIORITY_COLOR } from '@/lib/constants';
import { parseSteps } from '@/lib/format';
import type { TestCaseDTO } from '@/lib/types';
import { StatusBadge } from './ui';

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
