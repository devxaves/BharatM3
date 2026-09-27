import { sql } from 'drizzle-orm';
import {
  bigserial,
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector,
} from 'drizzle-orm/pg-core';
import type { AttributeMap, AttrComparison, ComponentScores, ScoringWeights, VetoResult } from '@/lib/matching/types';

const id = () => uuid('id').primaryKey().defaultRandom();
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

// ── Organisations & sources ──────────────────────────────────────────────────
export const organizations = pgTable('organizations', {
  id: id(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  sector: text('sector').notNull(),
  ministry: text('ministry'),
  hq: text('hq'),
  createdAt: createdAt(),
});

export const sourceSystems = pgTable('source_systems', {
  id: id(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  name: text('name').notNull(),
  systemType: text('system_type').notNull(), // SAP_ECC | SAP_S4HANA | ORACLE_EBS | CSV
  version: text('version'),
  client: text('client'),
  createdAt: createdAt(),
});

// ── Users / roles ────────────────────────────────────────────────────────────
export const roles = pgTable('roles', {
  code: text('code').primaryKey(),
  name: text('name').notNull(),
  permissions: jsonb('permissions').$type<string[]>().notNull(),
});

export const users = pgTable('users', {
  id: id(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  role: text('role').notNull().references(() => roles.code),
  orgId: uuid('org_id').references(() => organizations.id),
  designation: text('designation'),
  createdAt: createdAt(),
});

// ── Ingestion ────────────────────────────────────────────────────────────────
export const ingestionBatches = pgTable('ingestion_batches', {
  id: id(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  sourceSystemId: uuid('source_system_id').references(() => sourceSystems.id),
  fileName: text('file_name').notNull(),
  fileHash: text('file_hash').notNull(),
  rowCount: integer('row_count').notNull(),
  inserted: integer('inserted').notNull().default(0),
  skippedDuplicates: integer('skipped_duplicates').notNull().default(0),
  rejected: integer('rejected').notNull().default(0),
  columnMapping: jsonb('column_mapping').$type<Record<string, string>>(),
  status: text('status').notNull().default('INGESTED'), // INGESTED | NORMALIZED | CLASSIFIED | MATCHED
  stats: jsonb('stats').$type<Record<string, unknown>>(),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: createdAt(),
});

export const rawMaterialRecords = pgTable(
  'raw_material_records',
  {
    id: id(),
    orgId: uuid('org_id').notNull().references(() => organizations.id),
    sourceSystemId: uuid('source_system_id').references(() => sourceSystems.id),
    batchId: uuid('batch_id').references(() => ingestionBatches.id),
    legacyCode: text('legacy_code').notNull(),
    rawDescription: text('raw_description').notNull(),
    rawLongText: text('raw_long_text'),
    rawUom: text('raw_uom'),
    rawManufacturer: text('raw_manufacturer'),
    rawPartNumber: text('raw_part_number'),
    rawMaterialGroup: text('raw_material_group'),
    lastPoPriceInr: doublePrecision('last_po_price_inr'),
    annualQty: doublePrecision('annual_qty'),
    rawPayload: jsonb('raw_payload').$type<Record<string, unknown>>(),
    /** sha256(org + legacy code + content) — makes re-ingestion idempotent */
    rowHash: text('row_hash').notNull(),
    ingestedAt: timestamp('ingested_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('raw_row_hash_uq').on(t.rowHash), index('raw_org_code_idx').on(t.orgId, t.legacyCode)],
);

export const normalizedMaterialRecords = pgTable(
  'normalized_material_records',
  {
    id: id(),
    rawId: uuid('raw_id').notNull().unique().references(() => rawMaterialRecords.id),
    cleanedText: text('cleaned_text').notNull(),
    normalizedDescription: text('normalized_description').notNull(),
    tokens: jsonb('tokens').$type<string[]>().notNull(),
    expansions: jsonb('expansions').$type<{ term: string; expansion: string; kind: string }[]>().notNull(),
    categoryCode: text('category_code').notNull(),
    categoryConfidence: real('category_confidence').notNull(),
    classifierReasons: jsonb('classifier_reasons').$type<string[]>().notNull(),
    attributes: jsonb('attributes').$type<AttributeMap>().notNull(),
    attributeFingerprint: text('attribute_fingerprint'),
    missingRequired: jsonb('missing_required').$type<string[]>().notNull(),
    completeness: real('completeness').notNull(),
    uomOriginal: text('uom_original'),
    baseUom: text('base_uom'),
    uomDimension: text('uom_dimension').notNull(),
    uomFactor: doublePrecision('uom_factor').notNull().default(1),
    qualityFlags: jsonb('quality_flags').$type<string[]>().notNull(),
    embedding: vector('embedding', { dimensions: 256 }),
    embeddingModel: text('embedding_model'),
    proposedDescription: text('proposed_description'),
    pipelineVersion: text('pipeline_version').notNull(),
    processedAt: timestamp('processed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('norm_category_idx').on(t.categoryCode),
    index('norm_fingerprint_idx').on(t.attributeFingerprint),
    index('norm_desc_trgm_idx').using('gin', t.normalizedDescription.op('gin_trgm_ops')),
    index('norm_embedding_hnsw_idx').using('hnsw', t.embedding.op('vector_cosine_ops')),
  ],
);

export const materialAttributes = pgTable(
  'material_attributes',
  {
    id: id(),
    normalizedId: uuid('normalized_id').notNull().references(() => normalizedMaterialRecords.id),
    key: text('key').notNull(),
    valueText: text('value_text'),
    valueNum: doublePrecision('value_num'),
    unit: text('unit'),
    confidence: real('confidence').notNull(),
    source: text('source').notNull(),
    raw: text('raw'),
  },
  (t) => [index('attr_norm_idx').on(t.normalizedId), index('attr_key_idx').on(t.key, t.valueText)],
);

// ── Reference / configuration masters ────────────────────────────────────────
export const materialCategories = pgTable('material_categories', {
  code: text('code').primaryKey(),
  name: text('name').notNull(),
  cnmcPrefix: text('cnmc_prefix').notNull(),
  defaultUnspsc: text('default_unspsc'),
  description: text('description'),
});

export const categoryAttributeSchemas = pgTable('category_attribute_schemas', {
  id: id(),
  categoryCode: text('category_code').notNull().references(() => materialCategories.code),
  version: integer('version').notNull(),
  schema: jsonb('schema').$type<unknown>().notNull(),
  active: boolean('active').notNull().default(true),
  createdAt: createdAt(),
});

export const uomMaster = pgTable('uom_master', {
  code: text('code').primaryKey(),
  name: text('name').notNull(),
  dimension: text('dimension').notNull(),
  baseCode: text('base_code').notNull(),
  factorToBase: doublePrecision('factor_to_base').notNull(),
  isoCode: text('iso_code').notNull(),
  aliases: jsonb('aliases').$type<string[]>().notNull(),
});

export const synonymMaster = pgTable(
  'synonym_master',
  {
    id: id(),
    term: text('term').notNull(),
    expansion: text('expansion').notNull(),
    kind: text('kind').notNull(), // ABBREVIATION | SYNONYM
    categoryCode: text('category_code'),
    version: integer('version').notNull().default(1),
    active: boolean('active').notNull().default(true),
    updatedBy: uuid('updated_by').references(() => users.id),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('syn_term_idx').on(t.term)],
);

export const classificationMaster = pgTable('classification_master', {
  id: id(),
  categoryCode: text('category_code').notNull(),
  subtype: text('subtype'),
  unspscCode: text('unspsc_code').notNull(),
  unspscTitle: text('unspsc_title').notNull(),
});

export const substitutionRules = pgTable('substitution_rules', {
  id: id(),
  categoryCode: text('category_code').notNull(),
  attributeKey: text('attribute_key').notNull(),
  fromValue: text('from_value').notNull(),
  toValue: text('to_value').notNull(),
  bidirectional: boolean('bidirectional').notNull().default(false),
  rationale: text('rationale').notNull(),
  approvedBy: text('approved_by').notNull(),
  active: boolean('active').notNull().default(true),
  createdAt: createdAt(),
});

export const appConfig = pgTable('app_config', {
  key: text('key').primaryKey(),
  value: jsonb('value').$type<unknown>().notNull(),
  updatedBy: uuid('updated_by').references(() => users.id),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const modelVersions = pgTable('model_versions', {
  id: id(),
  matcherVersion: text('matcher_version').notNull(),
  embeddingModel: text('embedding_model').notNull(),
  weights: jsonb('weights').$type<ScoringWeights>().notNull(),
  thresholds: jsonb('thresholds').$type<unknown>().notNull(),
  config: jsonb('config').$type<unknown>().notNull(),
  notes: text('notes'),
  createdAt: createdAt(),
});

export const matchingRuns = pgTable('matching_runs', {
  id: id(),
  modelVersionId: uuid('model_version_id').notNull().references(() => modelVersions.id),
  scope: text('scope').notNull(), // FULL | BATCH
  batchId: uuid('batch_id').references(() => ingestionBatches.id),
  triggeredBy: uuid('triggered_by').references(() => users.id),
  recordsConsidered: integer('records_considered').notNull().default(0),
  candidatesEvaluated: integer('candidates_evaluated').notNull().default(0),
  recommendationsWritten: integer('recommendations_written').notNull().default(0),
  durationMs: integer('duration_ms'),
  stats: jsonb('stats').$type<Record<string, unknown>>(),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
});

// ── Matching output & governance ─────────────────────────────────────────────
export const matchRecommendations = pgTable(
  'match_recommendations',
  {
    id: id(),
    recordAId: uuid('record_a_id').notNull().references(() => rawMaterialRecords.id),
    recordBId: uuid('record_b_id').notNull().references(() => rawMaterialRecords.id),
    pairKey: text('pair_key').notNull(),
    categoryCode: text('category_code').notNull(),
    matchType: text('match_type').notNull(),
    rawScore: real('raw_score').notNull(),
    finalScore: real('final_score').notNull(),
    componentScores: jsonb('component_scores').$type<ComponentScores>().notNull(),
    effectiveWeights: jsonb('effective_weights').$type<ScoringWeights>().notNull(),
    deterministicRule: text('deterministic_rule'),
    vetoed: boolean('vetoed').notNull().default(false),
    vetoes: jsonb('vetoes').$type<VetoResult[]>().notNull(),
    substitutions: jsonb('substitutions').$type<string[]>().notNull(),
    attributeDiff: jsonb('attribute_diff').$type<AttrComparison[]>().notNull(),
    reasonCodes: jsonb('reason_codes').$type<string[]>().notNull(),
    explanation: text('explanation').notNull(),
    routing: text('routing').notNull(), // AUTO_QUEUE | REVIEW | UNRESOLVED | NONE
    status: text('status').notNull().default('PENDING'), // PENDING | APPROVED | REJECTED | NEEDS_INFO | SUPERSEDED
    proposedCnmc: text('proposed_cnmc'),
    proposedDescription: text('proposed_description'),
    decisionNote: text('decision_note'),
    decidedBy: uuid('decided_by').references(() => users.id),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    modelVersionId: uuid('model_version_id').references(() => modelVersions.id),
    runId: uuid('run_id').references(() => matchingRuns.id),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('rec_pair_uq').on(t.pairKey),
    index('rec_status_idx').on(t.status, t.routing),
    index('rec_type_idx').on(t.matchType),
    index('rec_a_idx').on(t.recordAId),
    index('rec_b_idx').on(t.recordBId),
  ],
);

export const approvalTasks = pgTable(
  'approval_tasks',
  {
    id: id(),
    recommendationId: uuid('recommendation_id').notNull().unique().references(() => matchRecommendations.id),
    queue: text('queue').notNull(), // FAST_TRACK | FULL_REVIEW | UNRESOLVED
    priority: integer('priority').notNull().default(3),
    status: text('status').notNull().default('OPEN'), // OPEN | NEEDS_INFO | DONE
    assigneeId: uuid('assignee_id').references(() => users.id),
    dueAt: timestamp('due_at', { withTimezone: true }),
    createdAt: createdAt(),
    closedAt: timestamp('closed_at', { withTimezone: true }),
  },
  (t) => [index('task_queue_idx').on(t.queue, t.status)],
);

export const canonicalMaterials = pgTable(
  'canonical_materials',
  {
    id: id(), // immutable internal UUID
    cnmc: text('cnmc').notNull().unique(),
    shortCode: text('short_code').notNull().unique(),
    canonicalDescription: text('canonical_description').notNull(),
    categoryCode: text('category_code').notNull(),
    subtype: text('subtype'),
    unspscCode: text('unspsc_code'),
    attributes: jsonb('attributes').$type<AttributeMap>().notNull(),
    baseUom: text('base_uom'),
    status: text('status').notNull().default('APPROVED'), // APPROVED | RETIRED
    version: integer('version').notNull().default(1),
    estAnnualValueInr: doublePrecision('est_annual_value_inr'),
    createdBy: uuid('created_by').references(() => users.id),
    approvedBy: uuid('approved_by').references(() => users.id),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('canon_cat_idx').on(t.categoryCode), index('canon_desc_trgm_idx').using('gin', t.canonicalDescription.op('gin_trgm_ops'))],
);

export const materialMappings = pgTable(
  'material_mappings',
  {
    id: id(),
    canonicalId: uuid('canonical_id').notNull().references(() => canonicalMaterials.id),
    rawRecordId: uuid('raw_record_id').notNull().references(() => rawMaterialRecords.id),
    orgId: uuid('org_id').notNull().references(() => organizations.id),
    legacyCode: text('legacy_code').notNull(),
    matchType: text('match_type').notNull(),
    confidence: real('confidence').notNull(),
    status: text('status').notNull().default('ACTIVE'), // ACTIVE | REVERSED
    recommendationId: uuid('recommendation_id').references(() => matchRecommendations.id),
    createdBy: uuid('created_by').references(() => users.id),
    createdAt: createdAt(),
    reversedAt: timestamp('reversed_at', { withTimezone: true }),
    reversedBy: uuid('reversed_by').references(() => users.id),
    reversalReason: text('reversal_reason'),
  },
  (t) => [
    // one ACTIVE mapping per legacy record; reversed rows are retained for traceability
    uniqueIndex('mapping_active_uq').on(t.rawRecordId).where(sql`status = 'ACTIVE'`),
    index('mapping_canon_idx').on(t.canonicalId),
    index('mapping_legacy_idx').on(t.legacyCode),
  ],
);

export const auditEvents = pgTable(
  'audit_events',
  {
    seq: bigserial('seq', { mode: 'number' }).primaryKey(),
    id: uuid('id').notNull().defaultRandom().unique(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
    actorId: uuid('actor_id').references(() => users.id),
    actorName: text('actor_name').notNull(),
    actorRole: text('actor_role').notNull(),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    reason: text('reason'),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    prevHash: text('prev_hash').notNull(),
    hash: text('hash').notNull(),
  },
  (t) => [index('audit_entity_idx').on(t.entityType, t.entityId), index('audit_action_idx').on(t.action)],
);
