/**
 * Shared domain types for the UniMat matching engine.
 * These are pure types — no DB or framework dependency — so every engine stage is unit-testable.
 */

export const CATEGORY_CODES = ['BEARING', 'VALVE', 'CABLE', 'FASTENER', 'PUMP', 'UNCLASSIFIED'] as const;
export type CategoryCode = (typeof CATEGORY_CODES)[number];
export type MatchableCategory = Exclude<CategoryCode, 'UNCLASSIFIED'>;

export type AttrGroup = 'attribute' | 'specification' | 'dimension' | 'descriptive';

/** Safety-critical attribute families. A mismatch on any of these triggers a hard veto. */
export type VetoKind = 'PRESSURE_CLASS' | 'MATERIAL_GRADE' | 'VOLTAGE' | 'CERTIFICATION' | 'THREAD' | 'SIZE';

export interface AttributeField {
  key: string;
  label: string;
  group: AttrGroup;
  type: 'text' | 'number';
  unit?: string;
  /** Relative importance inside its group. 0 = displayed but not scored. */
  weight: number;
  /** Missing value → record cannot be confidently matched (INSUFFICIENT_DATA). */
  required: boolean;
  /** Part of the material's identity: used for attribute fingerprint + CNMC. */
  identity: boolean;
  /** If set, a confirmed mismatch vetoes the match regardless of score. */
  veto?: VetoKind;
  /** Relative numeric tolerance treated as "equal" (e.g. 0.03 = ±3%). */
  tolerance?: number;
}

export interface CategorySchema {
  code: MatchableCategory;
  name: string;
  cnmcPrefix: string;
  defaultUnspsc: string;
  expectedUomDimension: UomDimension;
  fields: AttributeField[];
  /** Attribute keys used to build blocking keys in Stage A. */
  blockingKeys: string[];
}

export type UomDimension = 'COUNT' | 'LENGTH' | 'MASS' | 'VOLUME' | 'SET' | 'PAIR' | 'UNKNOWN';

export type AttrValue = string | number;

export interface ExtractedAttribute {
  value: AttrValue;
  confidence: number;
  source: 'regex' | 'dictionary' | 'derived' | 'lookup' | 'field';
  raw?: string;
}

export type AttributeMap = Record<string, ExtractedAttribute>;

export const MATCH_TYPES = [
  'IDENTICAL',
  'DUPLICATE',
  'NEAR_DUPLICATE',
  'FUNCTIONALLY_EQUIVALENT',
  'RELATED_BUT_NOT_EQUIVALENT',
  'NOT_MATCHED',
  'INSUFFICIENT_DATA',
] as const;
export type MatchType = (typeof MATCH_TYPES)[number];

export type Routing = 'AUTO_QUEUE' | 'REVIEW' | 'UNRESOLVED' | 'NONE';

export interface ScoringWeights {
  semantic: number;
  attribute: number;
  specification: number;
  dimension: number;
  classification: number;
  uom: number;
  procurement: number;
}

export interface Thresholds {
  duplicate: number; // ≥ → IDENTICAL / DUPLICATE
  nearDuplicate: number; // ≥ → NEAR_DUPLICATE
  functional: number; // ≥ → FUNCTIONALLY_EQUIVALENT
  related: number; // ≥ → RELATED_BUT_NOT_EQUIVALENT, else NOT_MATCHED
  autoQueue: number; // routing
  review: number; // routing
}

export interface EngineConfig {
  weights: ScoringWeights;
  thresholds: Thresholds;
  /** Linear calibration of raw cosine → semantic similarity (documented in docs/decisions.md). */
  semanticCalibration: { floor: number; ceil: number };
  /** How to treat procurement history when unavailable for either record. */
  missingHistoryPolicy: 'renormalize' | 'zero';
  /** Candidates per record fetched through pgvector KNN in Stage A. */
  knnCandidates: number;
}

/** A record as seen by the matching engine (post normalization / extraction). */
export interface MatchRecord {
  id: string;
  orgCode: string;
  legacyCode: string;
  category: CategoryCode;
  subtype?: string;
  normalizedDescription: string;
  attributes: AttributeMap;
  baseUom: string | null;
  uomDimension: UomDimension;
  manufacturer?: string | null;
  partNumber?: string | null;
  embedding: number[];
  unitPriceInr?: number | null;
  unspsc?: string | null;
}

export interface SubstitutionRule {
  id?: string;
  category: MatchableCategory;
  attributeKey: string;
  fromValue: string;
  toValue: string;
  bidirectional: boolean;
  rationale: string;
}

export type AttrComparisonStatus = 'MATCH' | 'PARTIAL' | 'CONFLICT' | 'MISSING_A' | 'MISSING_B' | 'MISSING_BOTH' | 'VETO' | 'SUBSTITUTABLE';

export interface AttrComparison {
  key: string;
  label: string;
  group: AttrGroup;
  a: AttrValue | null;
  b: AttrValue | null;
  unit?: string;
  status: AttrComparisonStatus;
  score: number;
  weight: number;
  veto?: VetoKind;
  note?: string;
}

export interface VetoResult {
  rule: string; // e.g. VETO_PRESSURE_CLASS_MISMATCH
  kind: VetoKind;
  attribute: string;
  a: AttrValue;
  b: AttrValue;
  message: string;
}

export interface ComponentScores {
  semantic: number;
  attribute: number;
  specification: number;
  dimension: number;
  classification: number;
  uom: number;
  procurement: number | null;
  /** Diagnostics */
  cosine: number;
  jaroWinkler: number;
  levenshteinRatio: number;
  tokenJaccard: number;
}

export interface MatchResult {
  aId: string;
  bId: string;
  category: CategoryCode;
  rawScore: number;
  finalScore: number;
  components: ComponentScores;
  effectiveWeights: ScoringWeights;
  deterministic: 'MPN_EXACT' | 'ATTRIBUTE_FINGERPRINT' | null;
  vetoes: VetoResult[];
  substitutionsApplied: string[];
  comparisons: AttrComparison[];
  missingRequired: { a: string[]; b: string[] };
  matchType: MatchType;
  routing: Routing;
  reasonCodes: string[];
  explanation: string;
}
