/**
 * First-run seed: load the workbook snapshot (or the live sheet if configured)
 * and the issue lifecycle examples, then write today's snapshot.
 *
 *   npm run seed
 */
import { runSync } from '../src/lib/sync';
import { syncIssues } from '../src/lib/github';
import { prisma } from '../src/lib/db';

async function main() {
  console.log('▸ Syncing test cases…');
  const result = await runSync('seed');
  if (result.status === 'failed') {
    console.error('✕ Sync failed:', result.error);
    process.exit(1);
  }
  console.log(
    `  ${result.source === 'sheet' ? 'Google Sheet' : 'Seeded snapshot'} — ` +
      `${result.created} created, ${result.updated} updated, ${result.unchanged} unchanged, ` +
      `${result.softDeleted} archived`
  );

  console.log('▸ Syncing issues…');
  const issues = await syncIssues();
  console.log(`  ${issues.synced} issues from ${issues.source}${issues.error ? ` (${issues.error})` : ''}`);

  const [cases, automated] = await Promise.all([
    prisma.testCase.count({ where: { deletedAt: null, execution: 'Manual' } }),
    prisma.testCase.count({ where: { deletedAt: null, execution: 'Automated' } }),
  ]);

  if (result.warnings.length) {
    console.log(`\n▸ ${result.warnings.length} data-quality warning(s). First five:`);
    for (const w of result.warnings.slice(0, 5)) {
      console.log(`  · [${w.rule}] ${w.testCaseId ?? w.tab}: ${w.message}`);
    }
  }

  console.log(`\n✓ Ready — ${cases} manual cases, ${automated} automated. Run: npm run dev`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
