import type { UomDimension } from '@/lib/matching/types';

export interface UomDefinition {
  code: string;
  name: string;
  dimension: UomDimension;
  /** Base unit code of this dimension (EA, M, KG, L…) */
  baseCode: string;
  /** Multiply a quantity in this unit by factor to obtain base units. */
  factorToBase: number;
  aliases: string[];
  /** SAP ISO unit code (T006-ISOCODE) for the ERP export adapter. */
  isoCode: string;
}

/** Seed for `uom_master`. Aliases reflect what is actually found in CPSE ERP extracts. */
export const UOM_SEED: UomDefinition[] = [
  { code: 'EA', name: 'Each', dimension: 'COUNT', baseCode: 'EA', factorToBase: 1, isoCode: 'EA', aliases: ['EACH', 'NOS', 'NOS.', 'NO', 'NO.', 'NUMBER', 'NUMBERS', 'PC', 'PCS', 'PCS.', 'PIECE', 'PIECES', 'UN', 'UNIT', 'UNITS', 'ST', 'EA.'] },
  { code: 'SET', name: 'Set', dimension: 'SET', baseCode: 'SET', factorToBase: 1, isoCode: 'SET', aliases: ['SETS', 'ST.'] },
  { code: 'PR', name: 'Pair', dimension: 'PAIR', baseCode: 'PR', factorToBase: 1, isoCode: 'PR', aliases: ['PAIR', 'PAIRS', 'PRS'] },
  { code: 'M', name: 'Metre', dimension: 'LENGTH', baseCode: 'M', factorToBase: 1, isoCode: 'MTR', aliases: ['MTR', 'MTRS', 'METER', 'METERS', 'METRE', 'METRES', 'RM', 'RMT', 'R.M.', 'RUNNING METRE', 'LM', 'MTR.'] },
  { code: 'KM', name: 'Kilometre', dimension: 'LENGTH', baseCode: 'M', factorToBase: 1000, isoCode: 'KMT', aliases: ['KMS', 'KILOMETRE', 'KILOMETER'] },
  { code: 'FT', name: 'Foot', dimension: 'LENGTH', baseCode: 'M', factorToBase: 0.3048, isoCode: 'FOT', aliases: ['FEET', 'FOOT'] },
  { code: 'KG', name: 'Kilogram', dimension: 'MASS', baseCode: 'KG', factorToBase: 1, isoCode: 'KGM', aliases: ['KGS', 'KILOGRAM', 'KILOGRAMS', 'KG.'] },
  { code: 'TO', name: 'Metric tonne', dimension: 'MASS', baseCode: 'KG', factorToBase: 1000, isoCode: 'TNE', aliases: ['TONNE', 'TONNES', 'TON', 'TONS', 'TE'] },
  { code: 'L', name: 'Litre', dimension: 'VOLUME', baseCode: 'L', factorToBase: 1, isoCode: 'LTR', aliases: ['LTR', 'LTRS', 'LITRE', 'LITER', 'LT'] },
  { code: 'KL', name: 'Kilolitre', dimension: 'VOLUME', baseCode: 'L', factorToBase: 1000, isoCode: 'KLT', aliases: ['KILOLITRE'] },
];

export interface UomNormalization {
  original: string | null;
  code: string | null;
  baseCode: string | null;
  dimension: UomDimension;
  factorToBase: number;
  flags: string[];
}

/**
 * Normalize a raw ERP unit of measure. Context-aware: "MT" is a metric tonne in most Indian
 * stores ledgers, but for a CABLE (expected dimension LENGTH) it almost always means metre.
 */
export function normalizeUom(raw: string | null | undefined, expected: UomDimension | null, master: UomDefinition[] = UOM_SEED): UomNormalization {
  const flags: string[] = [];
  const original = raw?.trim() ? raw.trim() : null;
  if (!original) {
    return { original: null, code: null, baseCode: null, dimension: 'UNKNOWN', factorToBase: 1, flags: ['UOM_MISSING'] };
  }
  const token = original.toUpperCase().replace(/\s+/g, ' ');

  let def: UomDefinition | undefined;
  if (token === 'MT' || token === 'MT.') {
    flags.push('UOM_AMBIGUOUS_MT');
    def = master.find((u) => u.code === (expected === 'LENGTH' ? 'M' : 'TO'));
  } else {
    def = master.find((u) => u.code === token) ?? master.find((u) => u.aliases.includes(token));
  }

  if (!def) {
    return { original, code: null, baseCode: null, dimension: 'UNKNOWN', factorToBase: 1, flags: [...flags, 'UOM_UNRECOGNISED'] };
  }
  if (def.code !== token) flags.push('UOM_NONSTANDARD_ALIAS');
  if (expected && expected !== 'UNKNOWN' && def.dimension !== expected) flags.push('UOM_DIMENSION_MISMATCH');
  return { original, code: def.code, baseCode: def.baseCode, dimension: def.dimension, factorToBase: def.factorToBase, flags };
}

/** UOM compatibility score used in fusion (Stage E). */
export function uomCompatibility(a: { code: string | null; dimension: UomDimension }, b: { code: string | null; dimension: UomDimension }): { score: number; reason: string } {
  if (!a.code || !b.code) return { score: 0.5, reason: 'UOM_UNKNOWN' };
  if (a.code === b.code) return { score: 1, reason: 'UOM_SAME' };
  if (a.dimension === b.dimension && a.dimension !== 'UNKNOWN') return { score: 0.9, reason: 'UOM_CONVERTIBLE' };
  return { score: 0, reason: 'UOM_INCOMPATIBLE' };
}
