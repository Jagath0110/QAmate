import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { toDTO } from '@/lib/metrics';
import { PRIORITY_ORDER, STATUS_ORDER } from '@/lib/constants';

export const dynamic = 'force-dynamic';

/**
 * The UI ships the whole set once and filters in the browser — 433 rows is
 * small. This endpoint exists for integrations and for when the suite grows
 * past a few thousand cases, so pagination is already here when it's needed.
 */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const page = Math.max(1, Number(p.get('page') ?? 1));
  const pageSize = Math.min(500, Math.max(1, Number(p.get('pageSize') ?? 100)));

  const rows = (await prisma.testCase.findMany({ where: { deletedAt: null } })).map(toDTO);

  const q = (p.get('q') ?? '').trim().toLowerCase();
  const eq = (key: string, val: string | null | undefined) => !key || key === val;

  let filtered = rows.filter((c) => {
    if (!eq(p.get('status') ?? '', c.status)) return false;
    if (!eq(p.get('area') ?? '', c.area)) return false;
    if (!eq(p.get('module') ?? '', c.module)) return false;
    if (!eq(p.get('type') ?? '', c.type)) return false;
    if (!eq(p.get('priority') ?? '', c.priority)) return false;
    if (!eq(p.get('platform') ?? '', c.platform)) return false;
    if (!eq(p.get('execution') ?? '', c.execution)) return false;
    if (!eq(p.get('tester') ?? '', c.tester)) return false;
    if (p.get('attention') && !['Fail', 'Blocked', 'Retest'].includes(c.status)) return false;
    const from = p.get('from');
    const to = p.get('to');
    if (from && (!c.executedAt || c.executedAt < from)) return false;
    if (to && (!c.executedAt || c.executedAt > to)) return false;
    if (q) {
      const hay = [
        c.testCaseId, c.scenario, c.module, c.area, c.type, c.priority, c.platform,
        c.status, c.tester, c.defectId, c.steps, c.expected, c.actual,
        c.preconditions, c.comments, c.whyManual,
      ].filter(Boolean).join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const sort = (p.get('sort') ?? 'testCaseId') as keyof (typeof filtered)[number];
  const dir = p.get('dir') === 'desc' ? -1 : 1;
  filtered = filtered.sort((a, b) => {
    if (sort === 'priority')
      return ((PRIORITY_ORDER[a.priority ?? ''] ?? 9) - (PRIORITY_ORDER[b.priority ?? ''] ?? 9)) * dir;
    if (sort === 'status')
      return (STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status)) * dir;
    return String(a[sort] ?? '').localeCompare(String(b[sort] ?? ''), undefined, { numeric: true }) * dir;
  });

  return NextResponse.json({
    total: filtered.length,
    page,
    pageSize,
    pages: Math.max(1, Math.ceil(filtered.length / pageSize)),
    cases: filtered.slice((page - 1) * pageSize, page * pageSize),
  });
}
