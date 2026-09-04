import { getCases, getIssues, getSummary, issuePipeline } from '@/lib/metrics';
import { IssueBoard } from '@/components/IssueBoard';
import { IssuePipelineStrip } from '@/components/Summary';

export const dynamic = 'force-dynamic';

export default async function IssuesPage() {
  const [issues, cases, summary] = await Promise.all([getIssues(), getCases(), getSummary()]);
  const pipeline = issuePipeline(issues);

  return (
    <>
      <IssuePipelineStrip s={summary} />
      <IssueBoard issues={issues} cases={cases} pipeline={pipeline} />
    </>
  );
}
