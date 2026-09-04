import { getSummary } from '@/lib/metrics';
import {
  AttentionList,
  AutomationSplit,
  CoverageChart,
  ExecutionLedger,
  IssuePipelineStrip,
  KpiStrip,
  ModuleHealthTable,
  RecentTable,
} from '@/components/Summary';
import { Banner } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function SummaryPage() {
  const s = await getSummary();

  return (
    <>
      {s.sync.state === 'error' ? (
        <Banner tone="error">
          <b>Sync problem.</b> {s.sync.error ?? 'The last sync failed or the data is over an hour old.'} The
          figures below are the last good data.
        </Banner>
      ) : s.sync.state === 'stale' ? (
        <Banner tone="warn">
          <b>Data is getting stale.</b> The last successful sync was more than{' '}
          {process.env.SYNC_STALE_WARN_MINUTES ?? 15} minutes ago.
        </Banner>
      ) : null}

      <ExecutionLedger s={s} />
      <KpiStrip s={s} />

      <div className="grid2">
        <ModuleHealthTable modules={s.modules} />
        <AttentionList cases={s.attention} />
      </div>

      <div className="grid2">
        <div className="panel">
          <CoverageChart
            title="Coverage by test type"
            hint={`${s.coverageByType.length} shown`}
            rows={s.coverageByType}
          />
        </div>
        <div className="panel">
          <CoverageChart title="Coverage by priority" rows={s.coverageByPriority} />
          <CoverageChart title="Coverage by platform" rows={s.coverageByPlatform} legend={false} />
        </div>
      </div>

      <AutomationSplit s={s} />

      <IssuePipelineStrip s={s} linkToIssues />

      <RecentTable cases={s.recent} />

      <div className="foot">
        <span>
          Source: <span className="mono">OraxsHumanManualTestReportv1</span> · Google Sheet
        </span>
        <span>Suite created 2026-09-02 · derived from Oraxs Master Test Report v3</span>
        <span>
          {s.total} manual · {s.automatedCount} automated · {s.modules.length} modules ·{' '}
          {s.coverageByType.length} test types
        </span>
      </div>
    </>
  );
}
