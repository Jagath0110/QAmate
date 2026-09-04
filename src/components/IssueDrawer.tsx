'use client';

import { useEffect, useRef } from 'react';
import { ISSUE_STAGE, SEVERITY_COLOR } from '@/lib/constants';
import type { IssueDTO, TestCaseDTO } from '@/lib/types';

type StepState = 'done' | 'bad' | 'pending';

function Step({
  state,
  num,
  head,
  meta,
  body,
}: {
  state: StepState;
  num: number;
  head: string;
  meta?: string;
  body?: string;
}) {
  return (
    <div className={`tlstep ${state}`}>
      <div className="mk">{state === 'done' ? '✓' : state === 'bad' ? '✕' : num}</div>
      <div>
        <div className="th">{head}</div>
        {meta ? <div className="tm">{meta}</div> : null}
        {body ? <div className="tb">{body}</div> : null}
      </div>
    </div>
  );
}

/**
 * The four-step lifecycle, told as a timeline: what happened, who did it, and
 * for the steps that have not happened yet, WHY they are still pending. A
 * client should never have to guess what is blocking closure.
 */
export function IssueDrawer({
  issue: i,
  cases,
  onOpenCase,
  onClose,
}: {
  issue: IssueDTO;
  cases: TestCaseDTO[];
  onOpenCase: (c: TestCaseDTO) => void;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const stage = ISSUE_STAGE[i.stage];
  const badRetest = i.retestResult === 'Fail';
  const linked = i.testCaseIds
    .map((id) => cases.find((c) => c.testCaseId === id))
    .filter((c): c is TestCaseDTO => Boolean(c));

  const meta: [string, string | null][] = [
    ['Module', i.module],
    ['Area', i.area],
    ['Reported by', i.reporter],
    ['Assignee', i.assignee],
    ['Created', i.createdAt],
    ['Closed', i.closedAt],
  ];

  return (
    <div className="scrim" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="drawer" role="dialog" aria-modal="true" aria-labelledby="iTitle">
        <div className="dhead">
          <div>
            <div className="tcid">
              {i.repo} · issue #{i.number}
            </div>
            <h3 id="iTitle">{i.title}</h3>
            <div style={{ marginTop: 8, display: 'flex', gap: 7, flexWrap: 'wrap' }}>
              <span className="badge" style={{ color: stage.color, background: 'var(--surface-2)' }}>
                <i className="sw" style={{ background: stage.color }} />
                {stage.label}
              </span>
              <span className="tag" style={{ color: SEVERITY_COLOR[i.severity] ?? 'var(--ink-2)' }}>
                {i.severity} severity
              </span>
              {i.reopened ? (
                <span className="tag" style={{ color: 'var(--fail)' }}>
                  reopened ×{i.reopened}
                </span>
              ) : null}
              {i.labels.map((l) => (
                <span className="tag" key={l}>
                  {l}
                </span>
              ))}
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

          <div className="field">
            <div className="k">Linked test cases</div>
            <div className="v">
              {linked.length ? (
                linked.map((c) => (
                  <button className="tclink" key={c.testCaseId} type="button" onClick={() => onOpenCase(c)}>
                    {c.testCaseId}
                  </button>
                ))
              ) : i.testCaseIds.length ? (
                i.testCaseIds.map((id) => (
                  <span className="tclink" key={id}>
                    {id}
                  </span>
                ))
              ) : (
                <span style={{ color: 'var(--ink-3)', fontStyle: 'italic' }}>
                  No test case links this issue yet — add the issue number to the case&apos;s Defect ID column.
                </span>
              )}
              {linked.length ? (
                <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginTop: 6 }}>
                  Click a case to open its full test detail.
                </div>
              ) : null}
            </div>
          </div>

          <div className="field">
            <div className="k">Lifecycle</div>
            <div className="tl">
              <Step
                state="done"
                num={1}
                head="Issue created in GitHub"
                meta={`${i.createdAt} · ${i.reporter ?? 'unknown'} · ${i.repo}#${i.number}`}
                body={`Raised from ${i.testCaseIds.length} failed test case${
                  i.testCaseIds.length === 1 ? '' : 's'
                }${i.assignee ? `, assigned to ${i.assignee}` : ', not yet assigned'}.`}
              />

              {i.closedAt ? (
                <Step
                  state="done"
                  num={2}
                  head="Closed / resolved in GitHub"
                  meta={`${i.closedAt}${i.closedBy ? ` · ${i.closedBy}` : ''}`}
                  body={i.resolution ?? 'Closed in GitHub.'}
                />
              ) : (
                <Step
                  state="pending"
                  num={2}
                  head="Closed / resolved in GitHub"
                  body={
                    i.stage === 'in_progress'
                      ? `Fix in progress with ${i.assignee ?? 'the team'}.`
                      : 'Waiting for a developer to pick this up.'
                  }
                />
              )}

              {i.retestAt ? (
                <Step
                  state={badRetest ? 'bad' : 'done'}
                  num={3}
                  head={`Retested by QA — ${i.retestResult}`}
                  meta={`${i.retestAt}${i.retestBy ? ` · ${i.retestBy}` : ''}`}
                  body={i.retestNote ?? undefined}
                />
              ) : (
                <Step
                  state="pending"
                  num={3}
                  head="Retested by QA"
                  body={
                    i.closedAt
                      ? 'Fix is merged. QA has not re-run the linked test cases yet.'
                      : 'Blocked until the fix is resolved in GitHub.'
                  }
                />
              )}

              {i.confirmedAt ? (
                <Step
                  state="done"
                  num={4}
                  head="Confirmed by mentor / senior developer"
                  meta={`${i.confirmedAt}${i.confirmedBy ? ` · ${i.confirmedBy}` : ''}`}
                  body={i.confirmNote ?? undefined}
                />
              ) : (
                <Step
                  state="pending"
                  num={4}
                  head="Confirmed by mentor / senior developer"
                  body={
                    badRetest
                      ? 'Retest failed — the issue went back to the developer and must pass a retest before sign-off.'
                      : i.retestResult === 'Pass'
                        ? 'Retest passed. Awaiting final sign-off before this is counted as closed.'
                        : 'Sign-off happens once QA confirms the retest passes.'
                  }
                />
              )}
            </div>
          </div>

          {i.url ? (
            <div className="field">
              <div className="k">GitHub</div>
              <div className="v">
                <a href={i.url} target="_blank" rel="noreferrer">
                  {i.repo}#{i.number} ↗
                </a>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
