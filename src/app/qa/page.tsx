import { getSummary, getTrends } from '@/lib/metrics';
import {
  AttentionList,
  AutomationSplit,
  CoverageChart,
  ExecutionLedger,
  IssuePipelineStrip,
  KpiStrip,
  ModuleHealthTable,
  RecentTable,
  TrendPanel,
} from '@/components/Summary';
import { Banner } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function SummaryPage() {
  const [s, trends] = await Promise.all([getSummary(), getTrends(90)]);

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

      {s.sync.source === 'seed' ? (
        <Banner tone="info">
          <b>Running on the seeded snapshot.</b> Google Sheets is not configured, so these are the 298 manual
          cases and 135 automated scenarios captured from the QA workbook. Set{' '}
          <code>GOOGLE_SERVICE_ACCOUNT_KEY</code> and <code>QA_SHEET_ID</code> in <code>.env</code> for live
          sync.
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

      <div className="grid2">
        <AutomationSplit s={s} />
        <TrendPanel points={trends} firstDate={s.executionDates[0] ?? null} />
      </div>

      <IssuePipelineStrip s={s} linkToIssues />

      <RecentTable cases={s.recent} />

      <div className="foot">
        <span>
          Source: <span className="mono">OraxsHumanManualTestReportv1</span> ·{' '}
          {s.sync.source === 'sheet' ? 'Google Sheet' : 'seeded snapshot'}
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
