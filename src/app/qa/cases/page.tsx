import { Suspense } from 'react';
import { getCases } from '@/lib/metrics';
import { CaseTable } from '@/components/CaseTable';

export const dynamic = 'force-dynamic';

export default async function CasesPage() {
  const cases = await getCases();
  return (
    <Suspense fallback={<TableSkeleton />}>
      <CaseTable cases={cases} />
    </Suspense>
  );
}

function TableSkeleton() {
  return (
    <div className="panel">
      <div className="filters">
        <div className="sk" style={{ height: 34, flex: '1 1 250px' }} />
        {Array.from({ length: 5 }).map((_, i) => (
          <div className="sk" key={i} style={{ height: 34, width: 130 }} />
        ))}
      </div>
      <div style={{ padding: '10px 16px' }}>
        {Array.from({ length: 12 }).map((_, i) => (
          <div className="sk" key={i} style={{ height: 34, margin: '8px 0' }} />
        ))}
      </div>
    </div>
  );
}
