import { eq } from 'drizzle-orm';
import type { DB } from '@/lib/db/client';
import { matchRecommendations, normalizedMaterialRecords, rawMaterialRecords } from '@/lib/db/schema';

/**
 * Offline quality evaluation against the synthetic seed's ground truth (each seeded record carries the id of the
 * physical material it was rendered from). Only meaningful for seeded data; uploaded records are excluded.
 */
export async function evaluateMatching(db: DB) {
  const recs = await db.select({ a: matchRecommendations.recordAId, b: matchRecommendations.recordBId, type: matchRecommendations.matchType, vetoed: matchRecommendations.vetoed }).from(matchRecommendations);
  const raws = await db
    .select({ id: rawMaterialRecords.id, payload: rawMaterialRecords.rawPayload, cat: normalizedMaterialRecords.categoryCode })
    .from(rawMaterialRecords)
    .innerJoin(normalizedMaterialRecords, eq(normalizedMaterialRecords.rawId, rawMaterialRecords.id));
  const truth = new Map<string, string>();
  const catOf = new Map<string, string>();
  for (const r of raws) {
    const t = (r.payload as { _seedTruthKey?: string } | null)?._seedTruthKey;
    if (t && !t.startsWith('INSUFF') && !t.startsWith('UNC')) truth.set(r.id, t);
    catOf.set(r.id, r.cat);
  }
  // ground-truth equivalent pairs
  const groups = new Map<string, string[]>();
  for (const [id, t] of truth) groups.set(t, [...(groups.get(t) ?? []), id]);
  let truthPairs = 0;
  for (const g of groups.values()) truthPairs += (g.length * (g.length - 1)) / 2;

  const positive = new Set(['IDENTICAL', 'DUPLICATE', 'NEAR_DUPLICATE']);
  let tp = 0;
  let fp = 0;
  let feSame = 0;
  let feDiff = 0;
  let vetoCorrect = 0;
  let vetoWrong = 0;
  const found = new Set<string>();
  for (const r of recs) {
    const ta = truth.get(r.a);
    const tb = truth.get(r.b);
    if (!ta || !tb) continue;
    const same = ta === tb;
    if (positive.has(r.type)) {
      if (same) {
        tp++;
        found.add([r.a, r.b].sort().join('|'));
      } else fp++;
    }
    if (r.type === 'FUNCTIONALLY_EQUIVALENT') (same ? feSame++ : feDiff++);
    if (r.vetoed) (same ? vetoWrong++ : vetoCorrect++);
  }
  // Transitive recall: pairs connected through positive recommendations (what the steward sees as a cluster)
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    const p = parent.get(x) ?? x;
    if (p === x) return x;
    const r = find(p);
    parent.set(x, r);
    return r;
  };
  for (const r of recs) if (positive.has(r.type) && truth.get(r.a) && truth.get(r.a) === truth.get(r.b)) parent.set(find(r.a), find(r.b));
  let clusterRecall = 0;
  for (const g of groups.values()) for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) if (find(g[i]) === find(g[j])) clusterRecall++;

  return {
    evaluatedRecords: truth.size,
    truthPairs,
    precision: tp + fp ? tp / (tp + fp) : null,
    pairRecall: truthPairs ? found.size / truthPairs : null,
    clusterRecall: truthPairs ? clusterRecall / truthPairs : null,
    truePositives: tp,
    falsePositives: fp,
    functionalEquivalent: { sameMaterial: feSame, differentMaterial: feDiff },
    vetoes: { correct: vetoCorrect, wrong: vetoWrong, precision: vetoCorrect + vetoWrong ? vetoCorrect / (vetoCorrect + vetoWrong) : null },
    note: 'Positive = IDENTICAL, DUPLICATE or NEAR_DUPLICATE. Ground truth = synthetic seed material id. Uploaded records are excluded.',
  };
}
