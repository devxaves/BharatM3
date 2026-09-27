/**
 * npm run eval — matching quality against the synthetic seed's ground truth, plus pipeline timing.
 * Runs on a fresh in-memory database so it never disturbs the dev database.
 */
import { createStandaloneDb } from '@/lib/db/client';
import { evaluateMatching } from '@/lib/queries/evaluation';
import { seedDatabase } from './seed';

async function main() {
  const t0 = Date.now();
  const { db, close } = await createStandaloneDb({ inMemory: true });
  await seedDatabase(db, (m) => console.log(m));
  const seedMs = Date.now() - t0;
  const e = await evaluateMatching(db);
  const pct = (v: number | null) => (v === null ? '—' : `${(v * 100).toFixed(1)}%`);
  console.log('\nMatching quality vs synthetic ground truth');
  console.log(`  records evaluated        ${e.evaluatedRecords}`);
  console.log(`  true equivalent pairs    ${e.truthPairs}`);
  console.log(`  precision (dup/near-dup) ${pct(e.precision)}  (${e.truePositives} TP / ${e.falsePositives} FP)`);
  console.log(`  pair recall              ${pct(e.pairRecall)}`);
  console.log(`  cluster recall           ${pct(e.clusterRecall)}`);
  console.log(`  veto precision           ${pct(e.vetoes.precision)}  (${e.vetoes.correct} correct / ${e.vetoes.wrong} wrong)`);
  console.log(`  functional-equiv routed  ${e.functionalEquivalent.sameMaterial} same-item / ${e.functionalEquivalent.differentMaterial} different-item`);
  console.log(`\nend-to-end seed + pipeline + historical decisions: ${(seedMs / 1000).toFixed(1)} s (PRD target < 120 s)`);
  await close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
