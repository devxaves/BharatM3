import { and, asc, desc, eq, inArray, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { rowsOf, type DB } from '@/lib/db/client';
import {
  approvalTasks,
  auditEvents,
  canonicalMaterials,
  matchRecommendations,
  materialMappings,
  modelVersions,
  normalizedMaterialRecords,
  organizations,
  rawMaterialRecords,
  users,
} from '@/lib/db/schema';
import { stripInternal } from './records';

export type QueueTab = 'FAST_TRACK' | 'FULL_REVIEW' | 'UNRESOLVED' | 'VETOED' | 'DECIDED';

const rawA = alias(rawMaterialRecords, 'ra');
const rawB = alias(rawMaterialRecords, 'rb');
const orgA = alias(organizations, 'oa');
const orgB = alias(organizations, 'ob');

export async function queueCounts(db: DB) {
  const res = await db.execute<{ k: string; n: number }>(sql`
    SELECT t.queue AS k, count(*)::int AS n FROM approval_tasks t WHERE t.status IN ('OPEN','NEEDS_INFO') GROUP BY t.queue
    UNION ALL SELECT 'VETOED', count(*)::int FROM match_recommendations WHERE vetoed
    UNION ALL SELECT 'DECIDED', count(*)::int FROM match_recommendations WHERE status IN ('APPROVED','REJECTED')`);
  const out: Record<string, number> = { FAST_TRACK: 0, FULL_REVIEW: 0, UNRESOLVED: 0, VETOED: 0, DECIDED: 0 };
  for (const r of rowsOf<{ k: string; n: number }>(res)) out[r.k] = Number(r.n);
  return out;
}

export async function reviewQueue(db: DB, tab: QueueTab) {
  const base = db
    .select({
      id: matchRecommendations.id,
      category: matchRecommendations.categoryCode,
      matchType: matchRecommendations.matchType,
      score: matchRecommendations.finalScore,
      rawScore: matchRecommendations.rawScore,
      vetoed: matchRecommendations.vetoed,
      routing: matchRecommendations.routing,
      status: matchRecommendations.status,
      reasonCodes: matchRecommendations.reasonCodes,
      proposedCnmc: matchRecommendations.proposedCnmc,
      decidedAt: matchRecommendations.decidedAt,
      createdAt: matchRecommendations.createdAt,
      aCode: rawA.legacyCode,
      aDesc: rawA.rawDescription,
      aOrg: orgA.code,
      bCode: rawB.legacyCode,
      bDesc: rawB.rawDescription,
      bOrg: orgB.code,
      queue: approvalTasks.queue,
      priority: approvalTasks.priority,
      taskStatus: approvalTasks.status,
      decidedBy: users.name,
    })
    .from(matchRecommendations)
    .innerJoin(rawA, eq(rawA.id, matchRecommendations.recordAId))
    .innerJoin(rawB, eq(rawB.id, matchRecommendations.recordBId))
    .innerJoin(orgA, eq(orgA.id, rawA.orgId))
    .innerJoin(orgB, eq(orgB.id, rawB.orgId))
    .leftJoin(approvalTasks, eq(approvalTasks.recommendationId, matchRecommendations.id))
    .leftJoin(users, eq(users.id, matchRecommendations.decidedBy));

  if (tab === 'VETOED') return base.where(eq(matchRecommendations.vetoed, true)).orderBy(desc(matchRecommendations.rawScore)).limit(400);
  if (tab === 'DECIDED') return base.where(inArray(matchRecommendations.status, ['APPROVED', 'REJECTED'])).orderBy(desc(matchRecommendations.decidedAt)).limit(400);
  return base
    .where(and(eq(approvalTasks.queue, tab), inArray(approvalTasks.status, ['OPEN', 'NEEDS_INFO'])))
    .orderBy(asc(approvalTasks.priority), desc(matchRecommendations.finalScore))
    .limit(600);
}

async function recordView(db: DB, rawId: string) {
  const [r] = await db
    .select({ raw: rawMaterialRecords, norm: normalizedMaterialRecords, org: organizations })
    .from(rawMaterialRecords)
    .innerJoin(organizations, eq(organizations.id, rawMaterialRecords.orgId))
    .innerJoin(normalizedMaterialRecords, eq(normalizedMaterialRecords.rawId, rawMaterialRecords.id))
    .where(eq(rawMaterialRecords.id, rawId));
  const [m] = await db
    .select({ id: materialMappings.id, canonicalId: canonicalMaterials.id, cnmc: canonicalMaterials.cnmc, description: canonicalMaterials.canonicalDescription })
    .from(materialMappings)
    .innerJoin(canonicalMaterials, eq(canonicalMaterials.id, materialMappings.canonicalId))
    .where(and(eq(materialMappings.rawRecordId, rawId), eq(materialMappings.status, 'ACTIVE')));
  return {
    id: r.raw.id,
    org: { code: r.org.code, name: r.org.name, sector: r.org.sector },
    legacyCode: r.raw.legacyCode,
    rawDescription: r.raw.rawDescription,
    rawLongText: r.raw.rawLongText,
    rawUom: r.raw.rawUom,
    manufacturer: r.raw.rawManufacturer,
    partNumber: r.raw.rawPartNumber,
    materialGroup: r.raw.rawMaterialGroup,
    lastPoPriceInr: r.raw.lastPoPriceInr,
    annualQty: r.raw.annualQty,
    payload: stripInternal(r.raw.rawPayload),
    normalized: r.norm.normalizedDescription,
    expansions: r.norm.expansions,
    category: r.norm.categoryCode,
    categoryConfidence: r.norm.categoryConfidence,
    classifierReasons: r.norm.classifierReasons,
    attributes: r.norm.attributes,
    baseUom: r.norm.baseUom,
    uomDimension: r.norm.uomDimension,
    completeness: r.norm.completeness,
    flags: r.norm.qualityFlags,
    missingRequired: r.norm.missingRequired,
    mapping: m ?? null,
  };
}

export async function recommendationDetail(db: DB, id: string) {
  const [rec] = await db
    .select({ rec: matchRecommendations, task: approvalTasks, mv: modelVersions, decidedBy: users.name })
    .from(matchRecommendations)
    .leftJoin(approvalTasks, eq(approvalTasks.recommendationId, matchRecommendations.id))
    .leftJoin(modelVersions, eq(modelVersions.id, matchRecommendations.modelVersionId))
    .leftJoin(users, eq(users.id, matchRecommendations.decidedBy))
    .where(eq(matchRecommendations.id, id));
  if (!rec) return null;
  const [a, b] = await Promise.all([recordView(db, rec.rec.recordAId), recordView(db, rec.rec.recordBId)]);
  const canonicalId = a.mapping?.canonicalId ?? b.mapping?.canonicalId;
  let cluster: { legacyCode: string; org: string; description: string; rawId: string }[] = [];
  if (canonicalId) {
    cluster = await db
      .select({ legacyCode: materialMappings.legacyCode, org: organizations.code, description: rawMaterialRecords.rawDescription, rawId: rawMaterialRecords.id })
      .from(materialMappings)
      .innerJoin(organizations, eq(organizations.id, materialMappings.orgId))
      .innerJoin(rawMaterialRecords, eq(rawMaterialRecords.id, materialMappings.rawRecordId))
      .where(and(eq(materialMappings.canonicalId, canonicalId), eq(materialMappings.status, 'ACTIVE')));
  }
  const history = await db.select().from(auditEvents).where(eq(auditEvents.entityId, id)).orderBy(asc(auditEvents.seq));
  return {
    ...rec.rec,
    task: rec.task,
    modelVersion: rec.mv ? { matcherVersion: rec.mv.matcherVersion, embeddingModel: rec.mv.embeddingModel } : null,
    decidedByName: rec.decidedBy,
    a,
    b,
    cluster,
    history,
  };
}

export async function nextPendingId(db: DB, afterId: string, queue: string) {
  const [row] = await db
    .select({ id: matchRecommendations.id })
    .from(matchRecommendations)
    .innerJoin(approvalTasks, eq(approvalTasks.recommendationId, matchRecommendations.id))
    .where(and(eq(approvalTasks.queue, queue), eq(approvalTasks.status, 'OPEN'), or(sql`${matchRecommendations.id} <> ${afterId}`)))
    .orderBy(asc(approvalTasks.priority), desc(matchRecommendations.finalScore))
    .limit(1);
  return row?.id ?? null;
}
