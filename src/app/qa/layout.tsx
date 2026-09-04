import { AppShell } from '@/components/AppShell';
import { getWorkbook, getSyncState } from '@/lib/workbook';

export const dynamic = 'force-dynamic';

export default async function QaLayout({ children }: { children: React.ReactNode }) {
  const [wb, sync] = await Promise.all([getWorkbook(), getSyncState()]);
  const caseCount = wb.cases.length;
  const issueCount = wb.issues.length;

  return (
    <AppShell sync={sync} caseCount={caseCount} issueCount={issueCount}>
      {children}
    </AppShell>
  );
}
