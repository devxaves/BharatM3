import { eq } from 'drizzle-orm';
import type { Executor } from '@/lib/db/client';
import { appConfig, categoryAttributeSchemas, substitutionRules, synonymMaster, uomMaster } from '@/lib/db/schema';
import type { DictionaryEntry } from '@/lib/ingestion/dictionary-seed';
import type { UomDefinition } from '@/lib/ingestion/uom';
import { DEFAULT_CATEGORY_SCHEMAS } from './categories';
import { DEFAULT_ENGINE_CONFIG } from './config';
import type { CategorySchema, EngineConfig, MatchableCategory, SubstitutionRule } from './types';

/** All tunables are read from the database at run time (PRD §10: config, not hardcoding). */
export async function loadEngineConfig(db: Executor): Promise<EngineConfig> {
  const [row] = await db.select().from(appConfig).where(eq(appConfig.key, 'engine'));
  return { ...DEFAULT_ENGINE_CONFIG, ...((row?.value as Partial<EngineConfig>) ?? {}) };
}

export async function loadSchemas(db: Executor): Promise<Record<MatchableCategory, CategorySchema>> {
  const rows = await db.select().from(categoryAttributeSchemas).where(eq(categoryAttributeSchemas.active, true));
  const out = { ...DEFAULT_CATEGORY_SCHEMAS };
  for (const r of rows) out[r.categoryCode as MatchableCategory] = r.schema as CategorySchema;
  return out;
}

export async function loadSubstitutionRules(db: Executor): Promise<SubstitutionRule[]> {
  const rows = await db.select().from(substitutionRules).where(eq(substitutionRules.active, true));
  return rows.map((r) => ({ id: r.id, category: r.categoryCode as MatchableCategory, attributeKey: r.attributeKey, fromValue: r.fromValue, toValue: r.toValue, bidirectional: r.bidirectional, rationale: r.rationale }));
}

export async function loadDictionary(db: Executor): Promise<DictionaryEntry[]> {
  const rows = await db.select().from(synonymMaster).where(eq(synonymMaster.active, true));
  return rows.map((r) => ({ term: r.term, expansion: r.expansion, kind: r.kind as DictionaryEntry['kind'], category: r.categoryCode }));
}

export async function loadUomMaster(db: Executor): Promise<UomDefinition[]> {
  const rows = await db.select().from(uomMaster);
  return rows.map((r) => ({ code: r.code, name: r.name, dimension: r.dimension as UomDefinition['dimension'], baseCode: r.baseCode, factorToBase: r.factorToBase, isoCode: r.isoCode, aliases: r.aliases }));
}
