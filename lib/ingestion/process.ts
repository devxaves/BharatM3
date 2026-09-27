import { DEFAULT_CATEGORY_SCHEMAS } from '@/lib/matching/categories';
import { classifyMaterial } from '@/lib/matching/classifier';
import { attributeFingerprint, completeness, extractAttributes, missingRequired } from '@/lib/matching/extract';
import type { AttributeMap, CategoryCode, CategorySchema, MatchableCategory, UomDimension } from '@/lib/matching/types';
import type { DictionaryEntry } from './dictionary-seed';
import { normalizeDescription, type Expansion } from './normalize';
import { normalizeUom, UOM_SEED, type UomDefinition } from './uom';

export interface RawInput {
  legacyCode: string;
  description: string;
  longText?: string | null;
  uom?: string | null;
  manufacturer?: string | null;
  partNumber?: string | null;
  materialGroup?: string | null;
}

export interface ProcessedRecord {
  cleaned: string;
  normalized: string;
  tokens: string[];
  expansions: Expansion[];
  category: CategoryCode;
  categoryConfidence: number;
  classifierReasons: string[];
  attributes: AttributeMap;
  missingRequired: string[];
  completeness: number;
  fingerprint: string | null;
  uom: { original: string | null; code: string | null; baseCode: string | null; dimension: UomDimension; factorToBase: number };
  qualityFlags: string[];
}

export interface ProcessContext {
  dictionary: DictionaryEntry[];
  schemas?: Record<MatchableCategory, CategorySchema>;
  uomMaster?: UomDefinition[];
}

/** Stages 2–4 for one record: normalize → classify → category-aware re-normalize → extract → UOM → quality flags. */
export function processRecord(raw: RawInput, ctx: ProcessContext): ProcessedRecord {
  const schemas = ctx.schemas ?? DEFAULT_CATEGORY_SCHEMAS;
  const text = [raw.description, raw.longText].filter(Boolean).join(' ');
  const generic = normalizeDescription(text, ctx.dictionary, null);
  const cls = classifyMaterial(generic.normalized);
  const norm = cls.category === 'UNCLASSIFIED' ? generic : normalizeDescription(text, ctx.dictionary, cls.category);
  const schema = cls.category === 'UNCLASSIFIED' ? undefined : schemas[cls.category];

  const attributes = extractAttributes(cls.category, {
    text: `${norm.normalized} ; ${norm.cleaned}`,
    manufacturer: raw.manufacturer,
    partNumber: raw.partNumber,
  });
  const missing = missingRequired(schema, attributes);
  const uom = normalizeUom(raw.uom, schema?.expectedUomDimension ?? null, ctx.uomMaster ?? UOM_SEED);

  const flags: string[] = [...uom.flags];
  if (!raw.manufacturer && !attributes.manufacturer) flags.push('MANUFACTURER_MISSING');
  if (!raw.partNumber) flags.push('PART_NUMBER_MISSING');
  if (norm.expansions.length) flags.push(`ABBREVIATIONS_EXPANDED:${norm.expansions.length}`);
  if (raw.description.length === 40) flags.push('SHORT_TEXT_TRUNCATED_40');
  if (cls.category === 'UNCLASSIFIED') flags.push('UNCLASSIFIED');
  else if (cls.confidence < 0.7) flags.push('LOW_CLASSIFIER_CONFIDENCE');
  for (const m of missing) flags.push(`MISSING_REQUIRED:${m.toUpperCase()}`);

  return {
    cleaned: norm.cleaned,
    normalized: norm.normalized,
    tokens: norm.tokens,
    expansions: norm.expansions,
    category: cls.category,
    categoryConfidence: cls.confidence,
    classifierReasons: cls.reasons,
    attributes,
    missingRequired: missing,
    completeness: completeness(schema, attributes),
    fingerprint: attributeFingerprint(schema, attributes),
    uom: { original: uom.original, code: uom.code, baseCode: uom.baseCode, dimension: uom.dimension, factorToBase: uom.factorToBase },
    qualityFlags: flags,
  };
}
