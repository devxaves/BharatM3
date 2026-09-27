import { and, eq, inArray, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { ApiError } from '@/lib/api';
import type { DB, Executor } from '@/lib/db/client';
import {
  approvalTasks,
  canonicalMaterials,
  classificationMaster,
  matchRecommendations,
  materialCategories,
  materialMappings,
  normalizedMaterialRecords,
  rawMaterialRecords,
} from '@/lib/db/schema';
import type { AttributeMap, MatchableCategory } from '@/lib/matching/types';
import { appendAudit, type Actor } from './audit';
import { canonicalDescription, generateCnmc, mergeAttributes, shortCode } from './cnmc';

export const DecisionInput = z.object({
  action: z.enum(['APPROVE', 'REJECT', 'EDIT', 'REQUEST_INFO']),
  note: z.string().trim().max(2000).optional(),
  edits: z
    .object({
      description: z.string().trim().min(8).max(240).optional(),
      attributes: z.record(z.union([z.string(), z.number()])).optional(),
    })
    .optional(),
});
export type DecisionInput = z.infer<typeof DecisionInput>;

const APPROVABLE = new Set(['IDENTICAL', 'DUPLICATE', 'NEAR_DUPLICATE', 'FUNCTIONALLY_EQUIVALENT']);
const TYPE_KEY: Record<string, string> = { BEARING: 'bearing_type', VALVE: 'valve_type', CABLE: 'cable_type', FASTENER: 'fastener_type', PUMP: 'pump_type' };

async function uniqueCnmc(tx: Executor, base: string) {
  let cnmc = base;
  for (let v = 2; ; v++) {
    const [hit] = await tx.select({ id: canonicalMaterials.id }).from(canonicalMaterials).where(eq(canonicalMaterials.cnmc, cnmc));
    if (!hit) return cnmc;
    cnmc = `${base}-V${v}`;
  }
}

/** Illustrative consolidation value: Σ(last PO price × annual qty) of all mapped legacy records. */
async function refreshCanonicalValue(tx: Executor, canonicalId: string) {
  await tx.execute(sql`
    UPDATE canonical_materials c SET est_annual_value_inr = sub.v, updated_at = now()
    FROM (
      SELECT m.canonical_id, COALESCE(SUM(r.last_po_price_inr * r.annual_qty), 0) AS v
      FROM material_mappings m JOIN raw_material_records r ON r.id = m.raw_record_id
      WHERE m.status = 'ACTIVE' AND m.canonical_id = ${canonicalId}
      GROUP BY m.canonical_id
    ) sub WHERE c.id = sub.canonical_id`);
}

export async function createCanonical(
  tx: Executor,
  actor: Actor,
  args: { category: MatchableCategory; attributes: AttributeMap; description?: string; baseUom: string | null; recommendationId?: string; at?: Date },
) {
  const [cat] = await tx.select().from(materialCategories).where(eq(materialCategories.code, args.category));
  const subtype = (args.attributes[TYPE_KEY[args.category]]?.value as string | undefined) ?? null;
  const classes = await tx.select().from(classificationMaster).where(eq(classificationMaster.categoryCode, args.category));
  const unspsc = classes.find((c) => c.subtype === subtype) ?? classes.find((c) => c.subtype === null);
  const cnmc = await uniqueCnmc(tx, generateCnmc(args.category, args.attributes));
  const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(canonicalMaterials).where(eq(canonicalMaterials.categoryCode, args.category));
  const [row] = await tx
    .insert(canonicalMaterials)
    .values({
      cnmc,
      shortCode: shortCode(cat?.cnmcPrefix ?? 'GEN', Number(n) + 1),
      canonicalDescription: args.description ?? canonicalDescription(args.category, args.attributes),
      categoryCode: args.category,
      subtype,
      unspscCode: unspsc?.unspscCode ?? cat?.defaultUnspsc ?? null,
      attributes: args.attributes,
      baseUom: args.baseUom,
      createdBy: actor.id,
      approvedBy: actor.id,
      createdAt: args.at,
      updatedAt: args.at,
    })
    .returning();
  await appendAudit(tx, actor, {
    action: 'CANONICAL_MATERIAL_CREATED',
    entityType: 'canonical_material',
    entityId: row.id,
    payload: { cnmc: row.cnmc, shortCode: row.shortCode, description: row.canonicalDescription, unspsc: row.unspscCode, recommendationId: args.recommendationId ?? null, generator: 'template-v1' },
    at: args.at,
  });
  return row;
}

async function loadRecommendation(tx: Executor, id: string) {
  const [rec] = await tx.select().from(matchRecommendations).where(eq(matchRecommendations.id, id));
  if (!rec) throw new ApiError(404, 'Recommendation not found');
  return rec;
}

export async function decideRecommendation(db: DB, recommendationId: string, input: DecisionInput, actor: Actor, at?: Date) {
  const parsed = DecisionInput.parse(input);
  return db.transaction(async (tx) => {
    const rec = await loadRecommendation(tx, recommendationId);
    if (!['PENDING', 'NEEDS_INFO'].includes(rec.status)) throw new ApiError(409, `Recommendation already ${rec.status.toLowerCase()}`);
    const when = at ?? new Date();

    if (parsed.action === 'REJECT') {
      if (!parsed.note || parsed.note.length < 5) throw new ApiError(400, 'A rejection reason (≥ 5 characters) is required for the audit trail');
      await tx.update(matchRecommendations).set({ status: 'REJECTED', decisionNote: parsed.note, decidedBy: actor.id, decidedAt: when, updatedAt: when }).where(eq(matchRecommendations.id, rec.id));
      await tx.update(approvalTasks).set({ status: 'DONE', closedAt: when }).where(eq(approvalTasks.recommendationId, rec.id));
      await appendAudit(tx, actor, {
        action: 'RECOMMENDATION_REJECTED',
        entityType: 'match_recommendation',
        entityId: rec.id,
        reason: parsed.note,
        payload: { matchType: rec.matchType, finalScore: rec.finalScore, recordAId: rec.recordAId, recordBId: rec.recordBId, reasonCodes: rec.reasonCodes },
        at: when,
      });
      return { status: 'REJECTED' as const, canonical: null };
    }

    if (parsed.action === 'REQUEST_INFO') {
      if (!parsed.note) throw new ApiError(400, 'Describe what information is required from the source CPSE');
      await tx.update(matchRecommendations).set({ status: 'NEEDS_INFO', decisionNote: parsed.note, updatedAt: when }).where(eq(matchRecommendations.id, rec.id));
      await tx.update(approvalTasks).set({ status: 'NEEDS_INFO' }).where(eq(approvalTasks.recommendationId, rec.id));
      await appendAudit(tx, actor, { action: 'INFO_REQUESTED', entityType: 'match_recommendation', entityId: rec.id, reason: parsed.note, payload: { matchType: rec.matchType }, at: when });
      return { status: 'NEEDS_INFO' as const, canonical: null };
    }

    // APPROVE / EDIT (= approve with steward edits)
    if (rec.vetoed) throw new ApiError(422, 'A hard-exclusion veto is active on this pair; it cannot be approved as equivalent');
    if (!APPROVABLE.has(rec.matchType)) throw new ApiError(422, `${rec.matchType} recommendations cannot be approved — request information or reject`);

    const [na, nb] = await Promise.all([
      tx.select().from(normalizedMaterialRecords).where(eq(normalizedMaterialRecords.rawId, rec.recordAId)),
      tx.select().from(normalizedMaterialRecords).where(eq(normalizedMaterialRecords.rawId, rec.recordBId)),
    ]);
    const raws = await tx.select().from(rawMaterialRecords).where(inArray(rawMaterialRecords.id, [rec.recordAId, rec.recordBId]));
    const active = await tx
      .select()
      .from(materialMappings)
      .where(and(eq(materialMappings.status, 'ACTIVE'), inArray(materialMappings.rawRecordId, [rec.recordAId, rec.recordBId])));
    const mA = active.find((m) => m.rawRecordId === rec.recordAId);
    const mB = active.find((m) => m.rawRecordId === rec.recordBId);
    if (mA && mB && mA.canonicalId !== mB.canonicalId) {
      throw new ApiError(409, 'Both records are already mapped to different canonical materials. Reverse one mapping before merging.');
    }

    let canonical: typeof canonicalMaterials.$inferSelect | undefined;
    let created = false;
    if (mA || mB) {
      [canonical] = await tx.select().from(canonicalMaterials).where(eq(canonicalMaterials.id, (mA ?? mB)!.canonicalId));
      if (parsed.action === 'EDIT' && parsed.edits?.description) {
        const [upd] = await tx
          .update(canonicalMaterials)
          .set({ canonicalDescription: parsed.edits.description, version: canonical.version + 1, updatedAt: when })
          .where(eq(canonicalMaterials.id, canonical.id))
          .returning();
        await appendAudit(tx, actor, { action: 'CANONICAL_MATERIAL_EDITED', entityType: 'canonical_material', entityId: canonical.id, payload: { from: canonical.canonicalDescription, to: upd.canonicalDescription, version: upd.version }, at: when });
        canonical = upd;
      }
    }
    if (!canonical) {
      // Deterministic identity: if the template yields a national code that already exists, the pair joins it
      // instead of forking a second code (One Nation – One Material Code).
      const probe = generateCnmc(rec.categoryCode as MatchableCategory, mergeAttributes([na[0].attributes, nb[0].attributes]));
      const [hit] = await tx.select().from(canonicalMaterials).where(and(eq(canonicalMaterials.cnmc, probe), eq(canonicalMaterials.status, 'APPROVED')));
      if (hit && !parsed.edits?.attributes) {
        canonical = hit;
        await appendAudit(tx, actor, { action: 'CNMC_COLLISION_JOINED_EXISTING', entityType: 'canonical_material', entityId: hit.id, payload: { cnmc: hit.cnmc, recommendationId: rec.id }, at: when });
      }
    }
    if (!canonical) {
      let attrs = mergeAttributes([na[0].attributes, nb[0].attributes]);
      if (parsed.edits?.attributes) {
        attrs = { ...attrs };
        for (const [k, v] of Object.entries(parsed.edits.attributes)) attrs[k] = { value: v, confidence: 1, source: 'field', raw: 'steward edit' };
      }
      canonical = await createCanonical(tx, actor, {
        category: rec.categoryCode as MatchableCategory,
        attributes: attrs,
        description: parsed.edits?.description,
        baseUom: na[0].baseUom ?? nb[0].baseUom,
        recommendationId: rec.id,
        at: when,
      });
      created = true;
    }

    for (const raw of raws) {
      if (active.some((m) => m.rawRecordId === raw.id)) continue;
      const [mp] = await tx
        .insert(materialMappings)
        .values({ canonicalId: canonical.id, rawRecordId: raw.id, orgId: raw.orgId, legacyCode: raw.legacyCode, matchType: rec.matchType, confidence: rec.finalScore, recommendationId: rec.id, createdBy: actor.id, createdAt: when })
        .returning();
      await appendAudit(tx, actor, {
        action: 'LEGACY_CODE_MAPPED',
        entityType: 'material_mapping',
        entityId: mp.id,
        payload: { legacyCode: raw.legacyCode, rawRecordId: raw.id, cnmc: canonical.cnmc, canonicalId: canonical.id, matchType: rec.matchType, confidence: rec.finalScore },
        at: when,
      });
    }
    await refreshCanonicalValue(tx, canonical.id);

    await tx
      .update(matchRecommendations)
      .set({ status: 'APPROVED', decisionNote: parsed.note ?? null, decidedBy: actor.id, decidedAt: when, proposedCnmc: canonical.cnmc, updatedAt: when })
      .where(eq(matchRecommendations.id, rec.id));
    await tx.update(approvalTasks).set({ status: 'DONE', closedAt: when }).where(eq(approvalTasks.recommendationId, rec.id));
    await appendAudit(tx, actor, {
      action: parsed.action === 'EDIT' ? 'RECOMMENDATION_EDITED_AND_APPROVED' : 'RECOMMENDATION_APPROVED',
      entityType: 'match_recommendation',
      entityId: rec.id,
      reason: parsed.note ?? null,
      payload: { matchType: rec.matchType, finalScore: rec.finalScore, cnmc: canonical.cnmc, canonicalCreated: created, edits: parsed.edits ?? null, reasonCodes: rec.reasonCodes },
      at: when,
    });

    // Pending pairs whose two records now share this canonical are resolved transitively
    const memberIds = (await tx.select({ id: materialMappings.rawRecordId }).from(materialMappings).where(and(eq(materialMappings.canonicalId, canonical.id), eq(materialMappings.status, 'ACTIVE')))).map((r) => r.id);
    const superseded = await tx
      .update(matchRecommendations)
      .set({ status: 'SUPERSEDED', decisionNote: `Resolved transitively via ${canonical.cnmc}`, updatedAt: when })
      .where(and(inArray(matchRecommendations.status, ['PENDING', 'NEEDS_INFO']), inArray(matchRecommendations.recordAId, memberIds), inArray(matchRecommendations.recordBId, memberIds)))
      .returning({ id: matchRecommendations.id });
    if (superseded.length) {
      await tx.update(approvalTasks).set({ status: 'DONE', closedAt: when }).where(inArray(approvalTasks.recommendationId, superseded.map((s) => s.id)));
      await appendAudit(tx, actor, { action: 'RECOMMENDATIONS_SUPERSEDED', entityType: 'canonical_material', entityId: canonical.id, payload: { count: superseded.length, recommendationIds: superseded.map((s) => s.id) }, at: when });
    }
    // Other pending pairs touching these records now propose the existing CNMC
    await tx
      .update(matchRecommendations)
      .set({ proposedCnmc: canonical.cnmc, proposedDescription: canonical.canonicalDescription })
      .where(and(eq(matchRecommendations.status, 'PENDING'), or(inArray(matchRecommendations.recordAId, memberIds), inArray(matchRecommendations.recordBId, memberIds))));

    return { status: 'APPROVED' as const, canonical: { id: canonical.id, cnmc: canonical.cnmc, created }, superseded: superseded.length };
  });
}

export async function reverseMapping(db: DB, mappingId: string, reason: string, actor: Actor) {
  if (!reason || reason.trim().length < 5) throw new ApiError(400, 'A reversal reason is required');
  return db.transaction(async (tx) => {
    const [m] = await tx.select().from(materialMappings).where(eq(materialMappings.id, mappingId));
    if (!m) throw new ApiError(404, 'Mapping not found');
    if (m.status !== 'ACTIVE') throw new ApiError(409, 'Mapping is already reversed');
    const when = new Date();
    await tx.update(materialMappings).set({ status: 'REVERSED', reversedAt: when, reversedBy: actor.id, reversalReason: reason }).where(eq(materialMappings.id, m.id));
    await appendAudit(tx, actor, { action: 'LEGACY_MAPPING_REVERSED', entityType: 'material_mapping', entityId: m.id, reason, payload: { legacyCode: m.legacyCode, canonicalId: m.canonicalId } });
    const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(materialMappings).where(and(eq(materialMappings.canonicalId, m.canonicalId), eq(materialMappings.status, 'ACTIVE')));
    if (Number(n) === 0) {
      await tx.update(canonicalMaterials).set({ status: 'RETIRED', updatedAt: when }).where(eq(canonicalMaterials.id, m.canonicalId));
      await appendAudit(tx, actor, { action: 'CANONICAL_MATERIAL_RETIRED', entityType: 'canonical_material', entityId: m.canonicalId, reason: 'No active legacy mappings remain', payload: {} });
    } else await refreshCanonicalValue(tx, m.canonicalId);
    return { ok: true };
  });
}
