/**
 * One full sync from the command line — handy for a scheduled task that would
 * rather run a script than hit the HTTP endpoint.
 *
 *   npm run sync
 */
import { runSync } from '../src/lib/sync';
import { syncIssues } from '../src/lib/github';
import { prisma } from '../src/lib/db';

async function main() {
  const started = Date.now();
  const result = await runSync('cron');
  const issues = await syncIssues();

  console.log(
    JSON.stringify(
      {
        status: result.status,
        source: result.source,
        rowsRead: result.rowsRead,
        created: result.created,
        updated: result.updated,
        unchanged: result.unchanged,
        softDeleted: result.softDeleted,
        warnings: result.warnings.length,
        issues: issues.synced,
        issueSource: issues.source,
        durationMs: Date.now() - started,
        error: result.error,
      },
      null,
      2
    )
  );

  await prisma.$disconnect();
  if (result.status === 'failed') process.exit(1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
