import { and, desc, eq, sql } from 'drizzle-orm';
import { rowsOf, type DB } from '@/lib/db/client';
import {
  canonicalMaterials,
  ingestionBatches,
  matchRecommendations,
  materialMappings,
  normalizedMaterialRecords,
  organizations,
  rawMaterialRecords,
  sourceSystems,
  users,
} from '@/lib/db/schema';

export async function listRecords(db: DB) {
  const rows = await db
    .select({
      id: rawMaterialRecords.id,
      org: organizations.code,
      legacyCode: rawMaterialRecords.legacyCode,
      raw: rawMaterialRecords.rawDescription,
      uom: rawMaterialRecords.rawUom,
      normalized: normalizedMaterialRecords.normalizedDescription,
      category: normalizedMaterialRecords.categoryCode,
      categoryConfidence: normalizedMaterialRecords.categoryConfidence,
      baseUom: normalizedMaterialRecords.baseUom,
      completeness: normalizedMaterialRecords.completeness,
      flags: normalizedMaterialRecords.qualityFlags,
      missing: normalizedMaterialRecords.missingRequired,
      cnmc: canonicalMaterials.cnmc,
      canonicalId: canonicalMaterials.id,
      batchId: rawMaterialRecords.batchId,
      ingestedAt: rawMaterialRecords.ingestedAt,
    })
    .from(rawMaterialRecords)
    .innerJoin(organizations, eq(organizations.id, rawMaterialRecords.orgId))
    .leftJoin(normalizedMaterialRecords, eq(normalizedMaterialRecords.rawId, rawMaterialRecords.id))
    .leftJoin(materialMappings, and(eq(materialMappings.rawRecordId, rawMaterialRecords.id), eq(materialMappings.status, 'ACTIVE')))
    .leftJoin(canonicalMaterials, eq(canonicalMaterials.id, materialMappings.canonicalId))
    .orderBy(desc(rawMaterialRecords.ingestedAt), rawMaterialRecords.legacyCode);
  const pending = await db.execute<{ id: string; n: number }>(sql`
    SELECT id, count(*)::int AS n FROM (
      SELECT record_a_id AS id FROM match_recommendations WHERE status IN ('PENDING','NEEDS_INFO') AND routing <> 'NONE'
      UNION ALL SELECT record_b_id FROM match_recommendations WHERE status IN ('PENDING','NEEDS_INFO') AND routing <> 'NONE'
    ) x GROUP BY id`);
  const pendingMap = new Map(rowsOf<{ id: string; n: number }>(pending).map((r) => [r.id, r.n]));
  return rows.map((r) => ({ ...r, pendingReviews: pendingMap.get(r.id) ?? 0 }));
}

export async function getRecord(db: DB, id: string) {
  const [row] = await db
    .select({ raw: rawMaterialRecords, norm: normalizedMaterialRecords, org: organizations, system: sourceSystems, batch: ingestionBatches })
    .from(rawMaterialRecords)
    .innerJoin(organizations, eq(organizations.id, rawMaterialRecords.orgId))
    .leftJoin(sourceSystems, eq(sourceSystems.id, rawMaterialRecords.sourceSystemId))
    .leftJoin(ingestionBatches, eq(ingestionBatches.id, rawMaterialRecords.batchId))
    .leftJoin(normalizedMaterialRecords, eq(normalizedMaterialRecords.rawId, rawMaterialRecords.id))
    .where(eq(rawMaterialRecords.id, id));
  if (!row) return null;
  const [mapping] = await db
    .select({ mapping: materialMappings, canonical: canonicalMaterials })
    .from(materialMappings)
    .innerJoin(canonicalMaterials, eq(canonicalMaterials.id, materialMappings.canonicalId))
    .where(and(eq(materialMappings.rawRecordId, id), eq(materialMappings.status, 'ACTIVE')));
  const recs = await db
    .select({ id: matchRecommendations.id, a: matchRecommendations.recordAId, b: matchRecommendations.recordBId, type: matchRecommendations.matchType, score: matchRecommendations.finalScore, status: matchRecommendations.status, vetoed: matchRecommendations.vetoed })
    .from(matchRecommendations)
    .where(sql`${matchRecommendations.recordAId} = ${id} OR ${matchRecommendations.recordBId} = ${id}`)
    .orderBy(desc(matchRecommendations.finalScore))
    .limit(12);
  const { raw, norm, org, system, batch } = row;
  return {
    raw: { ...raw, rawPayload: stripInternal(raw.rawPayload) },
    norm: norm ? { ...norm, embedding: undefined } : null,
    org,
    system,
    batch,
    mapping: mapping ?? null,
    recommendations: recs,
  };
}

/** Internal evaluation keys (synthetic ground truth) are never exposed through the API. */
export function stripInternal(p: Record<string, unknown> | null) {
  if (!p) return p;
  return Object.fromEntries(Object.entries(p).filter(([k]) => !k.startsWith('_')));
}

export async function listBatches(db: DB) {
  return db
    .select({
      id: ingestionBatches.id,
      org: organizations.code,
      fileName: ingestionBatches.fileName,
      rowCount: ingestionBatches.rowCount,
      inserted: ingestionBatches.inserted,
      skipped: ingestionBatches.skippedDuplicates,
      rejected: ingestionBatches.rejected,
      status: ingestionBatches.status,
      createdAt: ingestionBatches.createdAt,
      createdBy: users.name,
    })
    .from(ingestionBatches)
    .innerJoin(organizations, eq(organizations.id, ingestionBatches.orgId))
    .leftJoin(users, eq(users.id, ingestionBatches.createdBy))
    .orderBy(desc(ingestionBatches.createdAt));
}
