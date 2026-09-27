import { createHash } from 'node:crypto';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { Executor } from '@/lib/db/client';
import { ingestionBatches, materialAttributes, normalizedMaterialRecords, rawMaterialRecords } from '@/lib/db/schema';
import { appendAudit, type Actor } from '@/lib/governance/audit';
import { canonicalDescription } from '@/lib/governance/cnmc';
import { embedTexts, semanticTokens } from '@/lib/matching/embedding';
import { loadDictionary, loadSchemas, loadUomMaster } from '@/lib/matching/load-config';
import type { MatchableCategory } from '@/lib/matching/types';
import { processRecord } from './process';

export const PIPELINE_VERSION = 'bm3-pipeline-1.2';

export interface IngestRow {
  legacyCode: string;
  description: string;
  longText?: string | null;
  uom?: string | null;
  manufacturer?: string | null;
  partNumber?: string | null;
  materialGroup?: string | null;
  unitPriceInr?: number | null;
  annualQty?: number | null;
  payload?: Record<string, unknown>;
}

const clean = (s: string | null | undefined) => (s ?? '').toString().trim() || null;

export function rowHash(orgId: string, r: IngestRow): string {
  const parts = [orgId, r.legacyCode, r.description, r.longText, r.uom, r.manufacturer, r.partNumber].map((x) => clean(x as string) ?? '');
  return createHash('sha256').update(parts.join('␟')).digest('hex');
}

/** Stage 1 — ingestion. Idempotent: identical rows (same org + code + content) are skipped, never duplicated. */
export async function ingestRows(
  db: Executor,
  args: { orgId: string; sourceSystemId: string | null; fileName: string; rows: IngestRow[]; mapping?: Record<string, string>; actor: Actor; at?: Date },
) {
  const fileHash = createHash('sha256').update(JSON.stringify(args.rows)).digest('hex');
  const valid = args.rows.filter((r) => clean(r.legacyCode) && clean(r.description));
  const rejected = args.rows.length - valid.length;

  const [batch] = await db
    .insert(ingestionBatches)
    .values({ orgId: args.orgId, sourceSystemId: args.sourceSystemId, fileName: args.fileName, fileHash, rowCount: args.rows.length, rejected, columnMapping: args.mapping, createdBy: args.actor.id, createdAt: args.at })
    .returning();

  let inserted = 0;
  for (let i = 0; i < valid.length; i += 200) {
    const chunk = valid.slice(i, i + 200).map((r) => ({
      orgId: args.orgId,
      sourceSystemId: args.sourceSystemId,
      batchId: batch.id,
      legacyCode: clean(r.legacyCode)!,
      rawDescription: clean(r.description)!,
      rawLongText: clean(r.longText),
      rawUom: clean(r.uom),
      rawManufacturer: clean(r.manufacturer),
      rawPartNumber: clean(r.partNumber),
      rawMaterialGroup: clean(r.materialGroup),
      lastPoPriceInr: r.unitPriceInr ?? null,
      annualQty: r.annualQty ?? null,
      rawPayload: r.payload ?? null,
      rowHash: rowHash(args.orgId, r),
      ingestedAt: args.at,
    }));
    const res = await db.insert(rawMaterialRecords).values(chunk).onConflictDoNothing({ target: rawMaterialRecords.rowHash }).returning({ id: rawMaterialRecords.id });
    inserted += res.length;
  }
  const skipped = valid.length - inserted;
  await db.update(ingestionBatches).set({ inserted, skippedDuplicates: skipped }).where(eq(ingestionBatches.id, batch.id));
  await appendAudit(db, args.actor, {
    action: 'INGESTION_BATCH_CREATED',
    entityType: 'ingestion_batch',
    entityId: batch.id,
    payload: { fileName: args.fileName, rows: args.rows.length, inserted, skippedDuplicates: skipped, rejected },
    at: args.at,
  });
  return { batchId: batch.id, rows: args.rows.length, inserted, skippedDuplicates: skipped, rejected };
}

async function rawForStage(db: Executor, batchId: string | null, pending: 'normalize' | 'classify') {
  const base = db
    .select({ raw: rawMaterialRecords, normId: normalizedMaterialRecords.id, cat: normalizedMaterialRecords.categoryCode })
    .from(rawMaterialRecords)
    .leftJoin(normalizedMaterialRecords, eq(normalizedMaterialRecords.rawId, rawMaterialRecords.id));
  const cond =
    pending === 'normalize'
      ? and(isNull(normalizedMaterialRecords.id), batchId ? eq(rawMaterialRecords.batchId, batchId) : undefined)
      : and(eq(normalizedMaterialRecords.categoryCode, 'PENDING'), batchId ? eq(rawMaterialRecords.batchId, batchId) : undefined);
  return base.where(cond);
}

/** Stage 2 — normalization: text cleanup, abbreviation expansion, UOM standardisation. */
export async function normalizeBatch(db: Executor, batchId: string | null) {
  const dictionary = await loadDictionary(db);
  const uomMaster = await loadUomMaster(db);
  const rows = await rawForStage(db, batchId, 'normalize');
  let abbreviations = 0;
  let uomIssues = 0;
  const values = rows.map(({ raw }) => {
    const p = processRecord(
      { legacyCode: raw.legacyCode, description: raw.rawDescription, longText: raw.rawLongText, uom: raw.rawUom, manufacturer: raw.rawManufacturer, partNumber: raw.rawPartNumber },
      { dictionary, uomMaster },
    );
    abbreviations += p.expansions.length;
    if (p.qualityFlags.some((f) => f.startsWith('UOM_'))) uomIssues++;
    return {
      rawId: raw.id,
      cleanedText: p.cleaned,
      normalizedDescription: p.normalized,
      tokens: p.tokens,
      expansions: p.expansions,
      categoryCode: 'PENDING',
      categoryConfidence: 0,
      classifierReasons: [] as string[],
      attributes: {},
      missingRequired: [] as string[],
      completeness: 0,
      uomOriginal: p.uom.original,
      baseUom: p.uom.code,
      uomDimension: p.uom.dimension,
      uomFactor: p.uom.factorToBase,
      qualityFlags: p.qualityFlags.filter((f) => f.startsWith('UOM_') || f.startsWith('ABBREV') || f.startsWith('SHORT_TEXT') || f.endsWith('_MISSING')),
      pipelineVersion: PIPELINE_VERSION,
    };
  });
  for (let i = 0; i < values.length; i += 200) await db.insert(normalizedMaterialRecords).values(values.slice(i, i + 200)).onConflictDoNothing();
  if (batchId) await db.update(ingestionBatches).set({ status: 'NORMALIZED' }).where(eq(ingestionBatches.id, batchId));
  return { normalized: values.length, abbreviationsExpanded: abbreviations, uomIssues };
}

/** Stages 3–4 — category classification, attribute extraction, embeddings. */
export async function classifyBatch(db: Executor, batchId: string | null) {
  const dictionary = await loadDictionary(db);
  const uomMaster = await loadUomMaster(db);
  const schemas = await loadSchemas(db);
  const rows = await rawForStage(db, batchId, 'classify');
  const byCategory: Record<string, number> = {};
  let insufficient = 0;

  const processed = rows.map(({ raw, normId }) => ({
    raw,
    normId: normId!,
    p: processRecord(
      { legacyCode: raw.legacyCode, description: raw.rawDescription, longText: raw.rawLongText, uom: raw.rawUom, manufacturer: raw.rawManufacturer, partNumber: raw.rawPartNumber },
      { dictionary, uomMaster, schemas },
    ),
  }));
  const { vectors, model } = await embedTexts(processed.map((x) => ({ text: x.p.normalized, tokens: semanticTokens(x.p.normalized) })));

  for (let i = 0; i < processed.length; i++) {
    const { normId, p } = processed[i];
    byCategory[p.category] = (byCategory[p.category] ?? 0) + 1;
    if (p.missingRequired.length) insufficient++;
    const proposed = p.category !== 'UNCLASSIFIED' && !p.missingRequired.length ? canonicalDescription(p.category as MatchableCategory, p.attributes) : null;
    await db
      .update(normalizedMaterialRecords)
      .set({
        categoryCode: p.category,
        categoryConfidence: p.categoryConfidence,
        classifierReasons: p.classifierReasons,
        normalizedDescription: p.normalized,
        tokens: p.tokens,
        expansions: p.expansions,
        attributes: p.attributes,
        attributeFingerprint: p.fingerprint,
        missingRequired: p.missingRequired,
        completeness: p.completeness,
        qualityFlags: p.qualityFlags,
        embedding: vectors[i],
        embeddingModel: model,
        proposedDescription: proposed,
        processedAt: new Date(),
      })
      .where(eq(normalizedMaterialRecords.id, normId));
  }

  const attrRows = processed.flatMap(({ normId, p }) =>
    Object.entries(p.attributes).map(([key, a]) => ({
      normalizedId: normId,
      key,
      valueText: typeof a.value === 'string' ? a.value : String(a.value),
      valueNum: typeof a.value === 'number' ? a.value : null,
      unit: null,
      confidence: a.confidence,
      source: a.source,
      raw: a.raw ?? null,
    })),
  );
  if (processed.length) await db.delete(materialAttributes).where(inArray(materialAttributes.normalizedId, processed.map((x) => x.normId)));
  for (let i = 0; i < attrRows.length; i += 500) await db.insert(materialAttributes).values(attrRows.slice(i, i + 500));
  if (batchId) await db.update(ingestionBatches).set({ status: 'CLASSIFIED' }).where(eq(ingestionBatches.id, batchId));
  return { classified: processed.length, byCategory, insufficient, attributesExtracted: attrRows.length, embeddingModel: model };
}

export async function batchQualitySummary(db: Executor, batchId: string) {
  const rows = await db
    .select({ flags: normalizedMaterialRecords.qualityFlags, cat: normalizedMaterialRecords.categoryCode })
    .from(normalizedMaterialRecords)
    .innerJoin(rawMaterialRecords, eq(rawMaterialRecords.id, normalizedMaterialRecords.rawId))
    .where(eq(rawMaterialRecords.batchId, batchId));
  const counts: Record<string, number> = {};
  for (const r of rows) for (const f of r.flags) counts[f.split(':')[0]] = (counts[f.split(':')[0]] ?? 0) + 1;
  return counts;
}

