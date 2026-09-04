import { type NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { toDTO } from '@/lib/metrics';
import { csvCell } from '@/lib/format';

export const dynamic = 'force-dynamic';

const HEADERS: [string, string][] = [
  ['TC-ID', 'testCaseId'],
  ['Area', 'area'],
  ['Module', 'module'],
  ['Test Scenario', 'scenario'],
  ['Type', 'type'],
  ['Priority', 'priority'],
  ['Platform', 'platform'],
  ['Preconditions', 'preconditions'],
  ['Test Data', 'testData'],
  ['Test Steps', 'steps'],
  ['Expected Result', 'expected'],
  ['Actual Result', 'actual'],
  ['Status', 'status'],
  ['Defect ID', 'defectId'],
  ['Tester', 'tester'],
  ['Execution Date', 'executedAt'],
  ['Comments', 'comments'],
  ['Source', 'sourceLabel'],
  ['Why manual', 'whyManual'],
  ['Manual / Automated', 'execution'],
];

/** Clients ask for "the same view, as a spreadsheet" constantly. Honour the
 *  current filters so the export matches what they were looking at. */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const rows = (await prisma.testCase.findMany({ where: { deletedAt: null } })).map(toDTO);
  const q = (p.get('q') ?? '').trim().toLowerCase();
  const eq = (key: string, val: string | null | undefined) => !key || key === val;

  const filtered = rows.filter((c) => {
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
      const hay = Object.values(c).filter(Boolean).join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const lines = [
    HEADERS.map(([h]) => csvCell(h)).join(','),
    ...filtered.map((c) =>
      HEADERS.map(([, k]) => csvCell((c as unknown as Record<string, unknown>)[k])).join(',')
    ),
  ];

  // BOM so Excel opens UTF-8 correctly on Windows.
  const body = '﻿' + lines.join('\r\n');
  const stamp = new Date().toISOString().slice(0, 10);

  return new Response(body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="oraxs-qa-cases-${stamp}.csv"`,
    },
  });
}
