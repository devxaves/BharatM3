import { createHash } from 'node:crypto';
import { and, eq, inArray, ne, sql } from 'drizzle-orm';
import type { Executor } from '@/lib/db/client';
import {
  approvalTasks,
  canonicalMaterials,
  matchRecommendations,
  matchingRuns,
  materialMappings,
  modelVersions,
  normalizedMaterialRecords,
  organizations,
  rawMaterialRecords,
} from '@/lib/db/schema';
import { appendAudit, type Actor } from '@/lib/governance/audit';
import { canonicalDescription, generateCnmc, mergeAttributes } from '@/lib/governance/cnmc';
import { blockingKey, pairKey } from './candidates';
import { MATCHER_VERSION } from './config';
import { loadEngineConfig, loadSchemas, loadSubstitutionRules } from './load-config';
import { matchPair } from './scoring';
import type { EngineConfig, MatchableCategory, MatchRecord, MatchResult, Routing } from './types';

const QUEUE: Record<Routing, string | null> = { AUTO_QUEUE: 'FAST_TRACK', REVIEW: 'FULL_REVIEW', UNRESOLVED: 'UNRESOLVED', NONE: null };

export async function ensureModelVersion(db: Executor, config: EngineConfig, embeddingModel: string) {
  const fingerprint = createHash('sha256').update(JSON.stringify({ MATCHER_VERSION, embeddingModel, config })).digest('hex').slice(0, 12);
  const existing = await db.select().from(modelVersions).where(eq(modelVersions.notes, fingerprint));
  if (existing[0]) return existing[0];
  const [row] = await db
    .insert(modelVersions)
    .values({ matcherVersion: MATCHER_VERSION, embeddingModel, weights: config.weights, thresholds: config.thresholds, config, notes: fingerprint })
    .returning();
  return row;
}

export async function loadMatchRecords(db: Executor, opts: { categories?: string[] } = {}): Promise<MatchRecord[]> {
  const rows = await db
    .select({
      id: rawMaterialRecords.id,
      orgCode: organizations.code,
      legacyCode: rawMaterialRecords.legacyCode,
      category: normalizedMaterialRecords.categoryCode,
      normalized: normalizedMaterialRecords.normalizedDescription,
      attributes: normalizedMaterialRecords.attributes,
      baseUom: normalizedMaterialRecords.baseUom,
      uomDimension: normalizedMaterialRecords.uomDimension,
      manufacturer: rawMaterialRecords.rawManufacturer,
      partNumber: rawMaterialRecords.rawPartNumber,
      embedding: normalizedMaterialRecords.embedding,
      price: rawMaterialRecords.lastPoPriceInr,
    })
    .from(normalizedMaterialRecords)
    .innerJoin(rawMaterialRecords, eq(rawMaterialRecords.id, normalizedMaterialRecords.rawId))
    .innerJoin(organizations, eq(organizations.id, rawMaterialRecords.orgId))
    .where(and(ne(normalizedMaterialRecords.categoryCode, 'UNCLASSIFIED'), ne(normalizedMaterialRecords.categoryCode, 'PENDING'), opts.categories ? inArray(normalizedMaterialRecords.categoryCode, opts.categories) : undefined));
  return rows.map((r) => ({
    id: r.id,
    orgCode: r.orgCode,
    legacyCode: r.legacyCode,
    category: r.category as MatchRecord['category'],
    normalizedDescription: r.normalized,
    attributes: r.attributes,
    baseUom: r.baseUom,
    uomDimension: r.uomDimension as MatchRecord['uomDimension'],
    manufacturer: r.manufacturer ?? (r.attributes.manufacturer?.value as string | undefined) ?? null,
    partNumber: r.partNumber,
    embedding: (r.embedding as number[] | null) ?? [],
    unitPriceInr: r.price,
  }));
}

/** Stage A (DB variant): pgvector cosine KNN within the same category. */
async function knnNeighbours(db: Executor, rec: MatchRecord, k: number): Promise<string[]> {
  if (!rec.embedding.length) return [];
  const vec = `[${rec.embedding.join(',')}]`;
  const res = await db.execute<{ raw_id: string }>(sql`
    SELECT raw_id FROM normalized_material_records
    WHERE category_code = ${rec.category} AND raw_id <> ${rec.id} AND embedding IS NOT NULL
    ORDER BY embedding <=> ${vec}::vector
    LIMIT ${k}`);
  const rows = (res as unknown as { rows?: { raw_id: string }[] }).rows ?? (res as unknown as { raw_id: string }[]);
  return rows.map((r) => r.raw_id);
}

function shouldStore(r: MatchResult): boolean {
  switch (r.matchType) {
    case 'IDENTICAL':
    case 'DUPLICATE':
    case 'NEAR_DUPLICATE':
    case 'FUNCTIONALLY_EQUIVALENT':
      return true;
    case 'RELATED_BUT_NOT_EQUIVALENT':
      // keep the informative ones: high-similarity "false friends" blocked by a safety rule (other than a plain
      // size difference), and close relatives that differ on an identity attribute
      if (r.vetoes.length) return r.rawScore >= 0.72 && r.vetoes.some((v) => v.kind !== 'SIZE');
      return r.rawScore >= 0.62;
    default:
      return false;
  }
}

export interface RunOptions {
  batchId?: string | null;
  actor: Actor;
  at?: Date;
}

/** Stages A–E + exclusion + classification + routing, persisted as match_recommendations / approval_tasks. */
export async function runMatching(db: Executor, opts: RunOptions) {
  const t0 = Date.now();
  const config = await loadEngineConfig(db);
  const schemas = await loadSchemas(db);
  const rules = await loadSubstitutionRules(db);
  const all = await loadMatchRecords(db);
  const byId = new Map(all.map((r) => [r.id, r]));
  const embeddingModel =
    (await db.select({ m: normalizedMaterialRecords.embeddingModel }).from(normalizedMaterialRecords).where(sql`embedding_model IS NOT NULL`).limit(1))[0]?.m ?? 'unknown';
  const mv = await ensureModelVersion(db, config, embeddingModel);

  let targets = all;
  if (opts.batchId) {
    const ids = new Set((await db.select({ id: rawMaterialRecords.id }).from(rawMaterialRecords).where(eq(rawMaterialRecords.batchId, opts.batchId))).map((r) => r.id));
    targets = all.filter((r) => ids.has(r.id));
  }

  const [run] = await db
    .insert(matchingRuns)
    .values({ modelVersionId: mv.id, scope: opts.batchId ? 'BATCH' : 'FULL', batchId: opts.batchId ?? null, triggeredBy: opts.actor.id, recordsConsidered: targets.length, startedAt: opts.at })
    .returning();

  // Stage A — blocking groups
  const blocks = new Map<string, string[]>();
  for (const r of all) {
    const schema = schemas[r.category as MatchableCategory];
    const bk = schema ? blockingKey(schema, r) : null;
    if (!bk) continue;
    blocks.set(bk, [...(blocks.get(bk) ?? []), r.id]);
  }

  const pairs = new Map<string, [MatchRecord, MatchRecord]>();
  for (const t of targets) {
    const schema = schemas[t.category as MatchableCategory];
    if (!schema) continue;
    const bk = blockingKey(schema, t);
    const cand = new Set<string>(bk ? blocks.get(bk) ?? [] : []);
    for (const id of await knnNeighbours(db, t, config.knnCandidates)) cand.add(id);
    cand.delete(t.id);
    for (const cid of cand) {
      const c = byId.get(cid);
      if (!c || c.category !== t.category) continue;
      const key = pairKey(t.id, c.id);
      if (!pairs.has(key)) pairs.set(key, t.id < c.id ? [t, c] : [c, t]);
    }
  }

  // Stages B–E + exclusion + classification
  const results: { key: string; r: MatchResult }[] = [];
  for (const [key, [a, b]] of pairs) {
    const schema = schemas[a.category as MatchableCategory];
    results.push({ key, r: matchPair(a, b, { schema, config, substitutionRules: rules }) });
  }

  const toStore = results.filter((x) => shouldStore(x.r));
  // INSUFFICIENT_DATA: keep the 3 strongest candidates per under-specified record so stewards see what it *might* be
  const insufficient = results.filter((x) => x.r.matchType === 'INSUFFICIENT_DATA');
  const perRecord = new Map<string, { key: string; r: MatchResult }[]>();
  for (const x of insufficient) {
    const a = byId.get(x.r.aId)!;
    const b = byId.get(x.r.bId)!;
    for (const rec of [a, b]) {
      const miss = x.r.missingRequired[rec.id === x.r.aId ? 'a' : 'b'];
      if (miss.length) perRecord.set(rec.id, [...(perRecord.get(rec.id) ?? []), x]);
    }
  }
  const insuffKeys = new Set<string>();
  for (const list of perRecord.values()) for (const x of list.sort((p, q) => q.r.rawScore - p.r.rawScore).slice(0, 3)) insuffKeys.add(x.key);
  toStore.push(...insufficient.filter((x) => insuffKeys.has(x.key)));
  // NOT_MATCHED: a record with no stored relationship gets its nearest candidate recorded as evidence of uniqueness
  const covered = new Set(toStore.flatMap((x) => [x.r.aId, x.r.bId]));
  for (const t of targets) {
    if (covered.has(t.id)) continue;
    const best = results.filter((x) => x.r.aId === t.id || x.r.bId === t.id).sort((p, q) => q.r.rawScore - p.r.rawScore)[0];
    if (best) toStore.push(best);
  }

  // Existing mappings → propose the existing CNMC when one side is already harmonised
  const mappings = await db
    .select({ raw: materialMappings.rawRecordId, cnmc: canonicalMaterials.cnmc, desc: canonicalMaterials.canonicalDescription, canonicalId: materialMappings.canonicalId })
    .from(materialMappings)
    .innerJoin(canonicalMaterials, eq(canonicalMaterials.id, materialMappings.canonicalId))
    .where(eq(materialMappings.status, 'ACTIVE'));
  const mapOf = new Map(mappings.map((m) => [m.raw, m]));

  // One task per (unharmonised record, national code): when a candidate already belongs to an approved
  // canonical group, keep only the strongest pair into that group — approving it joins the whole group.
  const bestIntoGroup = new Map<string, { key: string; r: MatchResult }>();
  const dropped = new Set<string>();
  for (const x of toStore) {
    if (x.r.vetoes.length) continue;
    const ma = mapOf.get(x.r.aId);
    const mb = mapOf.get(x.r.bId);
    if (!!ma === !!mb) continue;
    const gk = `${ma ? x.r.bId : x.r.aId}|${(ma ?? mb)!.canonicalId}`;
    const cur = bestIntoGroup.get(gk);
    if (!cur || x.r.finalScore > cur.r.finalScore) {
      if (cur) dropped.add(cur.key);
      bestIntoGroup.set(gk, x);
    } else dropped.add(x.key);
  }
  const deduped = toStore.filter((x) => !dropped.has(x.key));

  const existing = new Map(
    (await db.select({ id: matchRecommendations.id, key: matchRecommendations.pairKey, status: matchRecommendations.status }).from(matchRecommendations)).map((e) => [e.key, e]),
  );

  const counts: Record<string, number> = {};
  const vetoCounts: Record<string, number> = {};
  let written = 0;
  let skippedDecided = 0;
  let skippedResolved = 0;

  for (const { key, r } of deduped) {
    counts[r.matchType] = (counts[r.matchType] ?? 0) + 1;
    for (const v of r.vetoes) vetoCounts[v.rule] = (vetoCounts[v.rule] ?? 0) + 1;
    const prev = existing.get(key);
    if (prev && !['PENDING', 'NEEDS_INFO'].includes(prev.status)) {
      skippedDecided++;
      continue; // never override a human decision
    }
    const ma = mapOf.get(r.aId);
    const mb = mapOf.get(r.bId);
    if (ma && mb && ma.canonicalId === mb.canonicalId) {
      skippedResolved++;
      continue;
    }
    const a = byId.get(r.aId)!;
    const b = byId.get(r.bId)!;
    const anchor = ma ?? mb;
    const merged = mergeAttributes([a.attributes, b.attributes]);
    const cat = r.category as MatchableCategory;
    const values = {
      recordAId: r.aId,
      recordBId: r.bId,
      pairKey: key,
      categoryCode: r.category,
      matchType: r.matchType,
      rawScore: r.rawScore,
      finalScore: r.finalScore,
      componentScores: r.components,
      effectiveWeights: r.effectiveWeights,
      deterministicRule: r.deterministic,
      vetoed: r.vetoes.length > 0,
      vetoes: r.vetoes,
      substitutions: r.substitutionsApplied,
      attributeDiff: r.comparisons,
      reasonCodes: r.reasonCodes,
      explanation: r.explanation,
      routing: r.routing,
      proposedCnmc: anchor?.cnmc ?? (r.missingRequired.a.length + r.missingRequired.b.length ? null : generateCnmc(cat, merged)),
      proposedDescription: anchor?.desc ?? canonicalDescription(cat, merged),
      modelVersionId: mv.id,
      runId: run.id,
      updatedAt: new Date(),
    };
    let recId: string;
    if (prev) {
      await db.update(matchRecommendations).set(values).where(eq(matchRecommendations.id, prev.id));
      recId = prev.id;
    } else {
      const [ins] = await db.insert(matchRecommendations).values({ ...values, createdAt: opts.at }).returning({ id: matchRecommendations.id });
      recId = ins.id;
    }
    written++;
    const queue = QUEUE[r.routing];
    if (queue) {
      const priority = r.matchType === 'FUNCTIONALLY_EQUIVALENT' ? 1 : r.matchType === 'NEAR_DUPLICATE' ? 2 : r.matchType === 'INSUFFICIENT_DATA' ? 4 : 3;
      await db
        .insert(approvalTasks)
        .values({ recommendationId: recId, queue, priority, createdAt: opts.at })
        .onConflictDoUpdate({ target: approvalTasks.recommendationId, set: { queue, priority } });
    }
  }

  // Pending pairs now dominated by a stronger pair into the same national code are retired (kept, not deleted).
  const stale = [...dropped].map((k) => existing.get(k)).filter((e): e is NonNullable<typeof e> => !!e && e.status === 'PENDING');
  if (stale.length) {
    const ids = stale.map((s) => s.id);
    await db.update(matchRecommendations).set({ status: 'SUPERSEDED', decisionNote: 'Collapsed: a stronger pair into the same national code is queued', updatedAt: new Date() }).where(inArray(matchRecommendations.id, ids));
    await db.update(approvalTasks).set({ status: 'DONE', closedAt: new Date() }).where(inArray(approvalTasks.recommendationId, ids));
  }

  const durationMs = Date.now() - t0;
  const stats = { byMatchType: counts, vetoes: vetoCounts, pairsEvaluated: pairs.size, skippedDecided, skippedResolved, collapsedIntoGroups: dropped.size, config: { thresholds: config.thresholds, weights: config.weights } };
  await db
    .update(matchingRuns)
    .set({ candidatesEvaluated: pairs.size, recommendationsWritten: written, durationMs, stats, finishedAt: opts.at ? new Date(opts.at.getTime() + durationMs) : new Date() })
    .where(eq(matchingRuns.id, run.id));
  await appendAudit(db, opts.actor, {
    action: 'MATCHING_RUN_COMPLETED',
    entityType: 'matching_run',
    entityId: run.id,
    payload: { scope: opts.batchId ? 'BATCH' : 'FULL', batchId: opts.batchId ?? null, recordsConsidered: targets.length, pairsEvaluated: pairs.size, recommendationsWritten: written, byMatchType: counts, modelVersion: mv.matcherVersion, embeddingModel: mv.embeddingModel, durationMs },
    at: opts.at,
  });
  return { runId: run.id, recordsConsidered: targets.length, pairsEvaluated: pairs.size, recommendationsWritten: written, byMatchType: counts, vetoes: vetoCounts, durationMs };
}
