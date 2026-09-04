import { getCases, getIssues, issuePipeline } from '@/lib/metrics';
import { IssueBoard } from '@/components/IssueBoard';
import { IssuePipelineStrip } from '@/components/Summary';
import { getSummary } from '@/lib/metrics';
import { githubConfigured } from '@/lib/github';

export const dynamic = 'force-dynamic';

export default async function IssuesPage() {
  const [issues, cases, summary] = await Promise.all([getIssues(), getCases(), getSummary()]);
  const pipeline = issuePipeline(issues);

  // "Seeded" means: no GitHub token AND no case in the sheet points at an issue.
  const hasDefectIds = cases.some((c) => c.defectId);
  const isSeeded = !githubConfigured() && !hasDefectIds && issues.length > 0;

  return (
    <>
      <IssuePipelineStrip s={summary} />
      <IssueBoard issues={issues} cases={cases} pipeline={pipeline} isSeeded={isSeeded} />
    </>
  );
}
