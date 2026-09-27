import { DICTIONARY_SEED } from '@/lib/ingestion/dictionary-seed';
import { processRecord } from '@/lib/ingestion/process';
import { DEFAULT_CATEGORY_SCHEMAS } from '@/lib/matching/categories';
import { DEFAULT_ENGINE_CONFIG } from '@/lib/matching/config';
import { localEmbedding, semanticTokens } from '@/lib/matching/embedding';
import { matchPair } from '@/lib/matching/scoring';
import type { CategoryCode, MatchableCategory, MatchRecord, SubstitutionRule } from '@/lib/matching/types';
import { SUBSTITUTION_RULES_SEED } from '@/seed/reference-data';

let n = 0;

/** Build a MatchRecord exactly the way the pipeline does (normalize → classify → extract → embed). */
export function rec(
  description: string,
  opts: { org?: string; uom?: string; manufacturer?: string; partNumber?: string; price?: number; longText?: string } = {},
): MatchRecord {
  const p = processRecord(
    { legacyCode: `T${++n}`, description, longText: opts.longText, uom: opts.uom ?? 'EA', manufacturer: opts.manufacturer, partNumber: opts.partNumber },
    { dictionary: DICTIONARY_SEED },
  );
  return {
    id: `rec-${String(n).padStart(4, '0')}`,
    orgCode: opts.org ?? 'CPCL',
    legacyCode: `T${n}`,
    category: p.category,
    normalizedDescription: p.normalized,
    attributes: p.attributes,
    baseUom: p.uom.code,
    uomDimension: p.uom.dimension,
    manufacturer: opts.manufacturer ?? null,
    partNumber: opts.partNumber ?? null,
    embedding: localEmbedding(semanticTokens(p.normalized)),
    unitPriceInr: opts.price ?? null,
  };
}

export function compare(a: MatchRecord, b: MatchRecord, rules: SubstitutionRule[] = SUBSTITUTION_RULES_SEED) {
  expect(a.category).toBe(b.category);
  return matchPair(a, b, { schema: DEFAULT_CATEGORY_SCHEMAS[a.category as MatchableCategory], config: DEFAULT_ENGINE_CONFIG, substitutionRules: rules });
}

/** Attribute values extracted from a description, asserting the expected category. */
export function attrsOf(description: string, category?: CategoryCode) {
  const p = processRecord({ legacyCode: 'X', description }, { dictionary: DICTIONARY_SEED });
  if (category) expect(p.category).toBe(category);
  return Object.fromEntries(Object.entries(p.attributes).map(([k, v]) => [k, v.value]));
}
