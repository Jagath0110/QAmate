import { AppShell } from '@/components/AppShell';
import { prisma, isDatabaseReady } from '@/lib/db';
import { getSyncState } from '@/lib/sync';
import { SetupNotice } from '@/components/SetupNotice';

export const dynamic = 'force-dynamic';

export default async function QaLayout({ children }: { children: React.ReactNode }) {
  const ready = await isDatabaseReady();
  if (!ready) return <SetupNotice />;

  const [caseCount, issueCount, sync] = await Promise.all([
    prisma.testCase.count({ where: { deletedAt: null } }),
    prisma.issue.count(),
    getSyncState(),
  ]);

  return (
    <AppShell sync={sync} caseCount={caseCount} issueCount={issueCount}>
      {children}
    </AppShell>
  );
}
