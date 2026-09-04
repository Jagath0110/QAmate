/** Formatting helpers shared by server and client components. */

export const n = (x: number): string => x.toLocaleString('en-US');

export const pct = (a: number, b: number): number => (b ? (a / b) * 100 : 0);

/** One decimal place, always shown — "17.0%" reads as measured, "17%" as rounded. */
export const f1 = (x: number): string => (Math.round(x * 10) / 10).toFixed(1);

export function isoDate(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  const date = typeof d === 'string' ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

export function relativeTime(iso: string | null): string {
  if (!iso) return 'never';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 'never';
  const mins = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (mins < 1) return 'just now';
  if (mins === 1) return '1 min ago';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return hrs === 1 ? '1 hour ago' : `${hrs} hours ago`;
  const days = Math.round(hrs / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

/**
 * The sheet stores steps as "1. Do this. 2. Then that." — split them back into
 * discrete steps so the detail view can render a numbered list.
 */
export function parseSteps(steps: string | null | undefined): string[] {
  if (!steps) return [];
  const parts = String(steps)
    .split(/\s*(?=\d+\.\s)/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length < 2) return [String(steps).trim()];
  return parts.map((p) => p.replace(/^\d+\.\s*/, ''));
}

/** CSV cell escaping for the export endpoint. */
export function csvCell(v: unknown): string {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
