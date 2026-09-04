import { getCases, getIssues, getSummary, issuePipeline } from '@/lib/metrics';
import { IssueBoard } from '@/components/IssueBoard';
import { IssuePipelineStrip } from '@/components/Summary';

export const dynamic = 'force-dynamic';

export default async function IssuesPage() {
  const [issues, cases, summary] = await Promise.all([getIssues(), getCases(), getSummary()]);
  const pipeline = issuePipeline(issues);

  // Seeded means the whole workbook (cases + issues) is the fallback snapshot,
  // not a real sheet — see src/lib/workbook.ts.
  const isSeeded = summary.sync.source === 'seed' && issues.length > 0;

  return (
    <>
      <IssuePipelineStrip s={summary} />
      <IssueBoard issues={issues} cases={cases} pipeline={pipeline} isSeeded={isSeeded} />
    </>
  );
}
