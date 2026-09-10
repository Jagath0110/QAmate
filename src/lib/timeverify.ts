/**
 * Time-based test cases — the ones a single test run can't finish because the
 * behaviour under test only happens after real time passes: a plan bought today
 * expires in 30 days, a trial converts after 14, a token rotates after 90.
 *
 * The sheet records only two facts — when the clock started and how long the
 * wait is. Everything here (the verify-by date, whether it's still pending, the
 * countdown, whether it's overdue) is DERIVED from those plus today's date, so
 * the dashboard is always current without a re-sync — same philosophy as
 * `deriveStage` for issues.
 *
 * Three optional columns on any case tab drive it (add none, some, or all —
 * absent columns never abort the sync):
 *
 *   Time Trigger Date  — the day the trigger action was performed (clock start)
 *   Verify After       — the wait: "30d", "2w", "3mo", "1y", "48h", or a bare
 *                        number meaning days
 *   Verify Result      — "Pass" / "Fail", filled in once a human has checked the
 *                        outcome on/after the verify-by date (blank = not yet)
 */

/** Days after the verify-by date that a check is still considered on-time.
 *  Past this, an unverified case flips to "overdue" and needs attention. */
export const VERIFY_GRACE_DAYS = 3;

export type TimeState =
  | 'pending' // clock running, verify-by date still in the future
  | 'due' // verify-by date reached (within the grace window), not yet checked
  | 'overdue' // grace window passed with no result — the setup pass is now suspect
  | 'verified_pass'
  | 'verified_fail'
  | 'invalid'; // a trigger date or period is missing/unreadable

export interface TimeVerification {
  state: TimeState;
  /** ISO date (yyyy-mm-dd) the clock started, or null. */
  triggerDate: string | null;
  /** The raw "Verify After" cell, e.g. "30d". */
  periodRaw: string | null;
  /** Human form of the period, e.g. "30 days", or null if unreadable. */
  periodLabel: string | null;
  /** ISO date the outcome can be verified, or null when it can't be computed. */
  verifyBy: string | null;
  /** verifyBy + VERIFY_GRACE_DAYS — last day a check still counts as on-time. */
  windowEnd: string | null;
  /** Whole days until verifyBy; negative once past. null when invalid/verified. */
  daysLeft: number | null;
  /** Short label for a chip: "Verify in 12d", "Due today", "Overdue 3d". */
  label: string;
  result: 'Pass' | 'Fail' | null;
}

export const TIME_STATE_META: Record<
  TimeState,
  { label: string; color: string; soft: string }
> = {
  pending: { label: 'Time-pending', color: 'var(--retest)', soft: 'var(--retest-soft)' },
  due: { label: 'Verification due', color: 'var(--blocked)', soft: 'var(--blocked-soft)' },
  overdue: { label: 'Verification overdue', color: 'var(--fail)', soft: 'var(--fail-soft)' },
  verified_pass: { label: 'Time-verified', color: 'var(--pass)', soft: 'var(--pass-soft)' },
  verified_fail: { label: 'Time-verify failed', color: 'var(--fail)', soft: 'var(--fail-soft)' },
  invalid: { label: 'Time check — setup', color: 'var(--notrun)', soft: 'var(--notrun-soft)' },
};

interface Period {
  unit: 'h' | 'd' | 'w' | 'mo' | 'y';
  amount: number;
  label: string;
}

const UNIT_ALIASES: Record<string, Period['unit']> = {
  h: 'h', hr: 'h', hrs: 'h', hour: 'h', hours: 'h',
  d: 'd', day: 'd', days: 'd',
  w: 'w', wk: 'w', wks: 'w', week: 'w', weeks: 'w',
  m: 'mo', mo: 'mo', mon: 'mo', mth: 'mo', mths: 'mo', month: 'mo', months: 'mo',
  y: 'y', yr: 'y', yrs: 'y', year: 'y', years: 'y',
};

const UNIT_NOUN: Record<Period['unit'], [string, string]> = {
  h: ['hour', 'hours'],
  d: ['day', 'days'],
  w: ['week', 'weeks'],
  mo: ['month', 'months'],
  y: ['year', 'years'],
};

/** "30d" / "30 days" / "2w" / "3mo" / "1 year" / "48h" / "45" (bare = days). */
export function parsePeriod(raw: string | null | undefined): Period | null {
  if (raw == null) return null;
  const s = String(raw).trim().toLowerCase();
  const m = /^(\d+(?:\.\d+)?)\s*([a-z]*)$/.exec(s);
  if (!m) return null;
  const amount = Number(m[1]);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const unit = m[2] === '' ? 'd' : UNIT_ALIASES[m[2]];
  if (!unit) return null;
  const [one, many] = UNIT_NOUN[unit];
  return { unit, amount, label: `${amount} ${amount === 1 ? one : many}` };
}

/** Calendar-aware where it matters — a "1 month" wait lands on the same day
 *  number next month, not 30 days later. */
function addPeriod(date: Date, p: Period): Date {
  const d = new Date(date.getTime());
  switch (p.unit) {
    case 'h':
      d.setUTCHours(d.getUTCHours() + p.amount);
      break;
    case 'd':
      d.setUTCDate(d.getUTCDate() + p.amount);
      break;
    case 'w':
      d.setUTCDate(d.getUTCDate() + p.amount * 7);
      break;
    case 'mo':
      d.setUTCMonth(d.getUTCMonth() + p.amount);
      break;
    case 'y':
      d.setUTCFullYear(d.getUTCFullYear() + p.amount);
      break;
  }
  return d;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const midnightUTC = (d: Date) =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
const dayDiff = (a: Date, b: Date) => Math.round((a.getTime() - b.getTime()) / 86_400_000);

/**
 * The whole model. Returns null for a normal (non-time-based) case, so callers
 * can treat "has a timeVerification" as "is time-based". Date maths is done at
 * date granularity in UTC so the countdown never flickers around midnight.
 */
export function deriveTimeVerification(
  input: {
    triggerDate: Date | null;
    period: string | null;
    result: 'Pass' | 'Fail' | null;
  },
  now: Date = new Date()
): TimeVerification | null {
  const { triggerDate, period, result } = input;
  if (!triggerDate && !period && !result) return null; // not a time-based case

  const p = parsePeriod(period);
  const base: TimeVerification = {
    state: 'invalid',
    triggerDate: triggerDate ? iso(triggerDate) : null,
    periodRaw: period ?? null,
    periodLabel: p?.label ?? null,
    verifyBy: null,
    windowEnd: null,
    daysLeft: null,
    label: 'Time check — needs a trigger date and a period',
    result,
  };

  // A recorded result is the end of the line, regardless of dates.
  if (result === 'Pass') return { ...base, state: 'verified_pass', label: 'Time-verified — pass' };
  if (result === 'Fail') return { ...base, state: 'verified_fail', label: 'Time-verified — fail' };

  if (!triggerDate || !p) {
    return {
      ...base,
      label: !triggerDate
        ? 'Time check — missing trigger date'
        : 'Time check — period unreadable (try "30d", "2w", "3mo")',
    };
  }

  const verifyBy = midnightUTC(addPeriod(triggerDate, p));
  const windowEnd = new Date(verifyBy.getTime() + VERIFY_GRACE_DAYS * 86_400_000);
  const today = midnightUTC(now);
  const daysLeft = dayDiff(verifyBy, today);

  let state: TimeState;
  let label: string;
  if (today.getTime() > windowEnd.getTime()) {
    state = 'overdue';
    label = `Overdue ${-daysLeft}d`;
  } else if (daysLeft <= 0) {
    state = 'due';
    label = daysLeft === 0 ? 'Due today' : `Due ${-daysLeft}d ago`;
  } else {
    state = 'pending';
    label = `Verify in ${daysLeft}d`;
  }

  return { ...base, state, verifyBy: iso(verifyBy), windowEnd: iso(windowEnd), daysLeft, label };
}
