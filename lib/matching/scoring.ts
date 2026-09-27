import { compareAttributes, groupScore } from './compare';
import { evaluateHardExclusions } from './exclusions';
import { attributeFingerprint, missingRequired } from './extract';
import { clamp01, cosine, jaroWinkler, levenshteinRatio, r3, sortedTokenJW, tokenJaccard } from './similarity';
import type {
  AttrComparison,
  CategorySchema,
  ComponentScores,
  EngineConfig,
  MatchRecord,
  MatchResult,
  MatchType,
  Routing,
  ScoringWeights,
  SubstitutionRule,
} from './types';
import { uomCompatibility } from '@/lib/ingestion/uom';

export interface PairContext {
  schema: CategorySchema;
  config: EngineConfig;
  substitutionRules: SubstitutionRule[];
}

const alnum = (s?: string | null) => (s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const TYPE_KEY: Record<string, string> = { BEARING: 'bearing_type', VALVE: 'valve_type', CABLE: 'cable_type', FASTENER: 'fastener_type', PUMP: 'pump_type' };

/** Stage B — deterministic rules. */
export function deterministicMatch(a: MatchRecord, b: MatchRecord, schema: CategorySchema): MatchResult['deterministic'] {
  if (a.partNumber && b.partNumber && a.manufacturer && b.manufacturer && alnum(a.partNumber) === alnum(b.partNumber) && alnum(a.manufacturer) === alnum(b.manufacturer)) {
    return 'MPN_EXACT';
  }
  const fa = attributeFingerprint(schema, a.attributes);
  if (fa && fa === attributeFingerprint(schema, b.attributes)) return 'ATTRIBUTE_FINGERPRINT';
  return null;
}

/** Stage C + D — lexical fuzzy scores fused with the (calibrated) embedding cosine into semantic_similarity. */
export function semanticComponent(a: MatchRecord, b: MatchRecord, config: EngineConfig) {
  const ta = a.normalizedDescription.split(' ');
  const tb = b.normalizedDescription.split(' ');
  const cos = cosine(a.embedding, b.embedding);
  const { floor, ceil } = config.semanticCalibration;
  const calibrated = clamp01((cos - floor) / (ceil - floor));
  const jw = sortedTokenJW(ta, tb);
  const lev = levenshteinRatio(a.normalizedDescription, b.normalizedDescription);
  const jac = tokenJaccard(ta, tb);
  const fuzzy = 0.5 * jw + 0.25 * lev + 0.25 * jac;
  return { semantic: clamp01(0.65 * calibrated + 0.35 * Math.max(fuzzy, jaroWinkler(a.normalizedDescription, b.normalizedDescription) * 0.9)), cos, jw, lev, jac };
}

function procurementSimilarity(a: MatchRecord, b: MatchRecord): number | null {
  if (!a.unitPriceInr || !b.unitPriceInr) return null;
  const ratio = Math.abs(Math.log(a.unitPriceInr / b.unitPriceInr));
  return clamp01(1 - ratio / Math.log(2.5));
}

function classificationSimilarity(a: MatchRecord, b: MatchRecord): number {
  if (a.category !== b.category) return 0;
  const key = TYPE_KEY[a.category];
  const sa = key ? a.attributes[key]?.value : undefined;
  const sb = key ? b.attributes[key]?.value : undefined;
  if (sa === undefined || sb === undefined) return 0.8;
  return sa === sb ? 1 : 0.4;
}

/** Stage E — weighted fusion with transparent renormalisation of unavailable components. */
export function fuse(components: Record<keyof ScoringWeights, number | null>, weights: ScoringWeights, policy: EngineConfig['missingHistoryPolicy']) {
  const keys = Object.keys(weights) as (keyof ScoringWeights)[];
  const available = keys.filter((k) => components[k] !== null);
  const total = policy === 'renormalize' ? available.reduce((s, k) => s + weights[k], 0) : keys.reduce((s, k) => s + weights[k], 0);
  const effective = Object.fromEntries(keys.map((k) => [k, components[k] === null && policy === 'renormalize' ? 0 : r3(weights[k] / total)])) as unknown as ScoringWeights;
  const score = keys.reduce((s, k) => s + (components[k] ?? 0) * (weights[k] / total) * (components[k] === null && policy === 'renormalize' ? 0 : 1), 0);
  return { score: clamp01(score), effective };
}

export function classifyMatch(args: {
  score: number;
  vetoed: boolean;
  insufficient: boolean;
  deterministic: MatchResult['deterministic'];
  textIdentical: boolean;
  identityDiffers: boolean;
  config: EngineConfig;
}): MatchType {
  const t = args.config.thresholds;
  if (args.vetoed) return 'RELATED_BUT_NOT_EQUIVALENT';
  if (args.insufficient) return 'INSUFFICIENT_DATA';
  if (args.identityDiffers) {
    if (args.score >= t.functional) return 'FUNCTIONALLY_EQUIVALENT';
    return args.score >= t.related ? 'RELATED_BUT_NOT_EQUIVALENT' : 'NOT_MATCHED';
  }
  if (args.score >= t.duplicate) {
    if (args.deterministic === 'MPN_EXACT' || (args.deterministic && args.textIdentical)) return 'IDENTICAL';
    if (args.deterministic) return 'DUPLICATE';
    return 'NEAR_DUPLICATE';
  }
  if (args.score >= t.nearDuplicate) return 'NEAR_DUPLICATE';
  // Identity fingerprint agrees and nothing conflicts: the wording differs, the material does not.
  if (args.score >= t.functional && args.deterministic) return 'NEAR_DUPLICATE';
  if (args.score >= t.functional) return 'FUNCTIONALLY_EQUIVALENT';
  if (args.score >= t.related) return 'RELATED_BUT_NOT_EQUIVALENT';
  return 'NOT_MATCHED';
}

export function routeMatch(type: MatchType, score: number, config: EngineConfig): Routing {
  const t = config.thresholds;
  switch (type) {
    case 'IDENTICAL':
    case 'DUPLICATE':
      return score >= t.autoQueue ? 'AUTO_QUEUE' : 'REVIEW';
    case 'NEAR_DUPLICATE':
    case 'FUNCTIONALLY_EQUIVALENT':
      return score >= t.review ? 'REVIEW' : 'UNRESOLVED';
    case 'INSUFFICIENT_DATA':
      return 'UNRESOLVED';
    default:
      return 'NONE';
  }
}

const fmt = (v: unknown, unit?: string) => `${v}${unit && typeof v === 'number' ? ` ${unit}` : ''}`;
const lc = (s: string) => s.toLowerCase().replace(/_/g, ' ');

export function buildExplanation(r: Omit<MatchResult, 'explanation' | 'reasonCodes'>, a: MatchRecord, b: MatchRecord): string {
  const compared = r.comparisons.filter((c) => c.weight > 0 && c.status !== 'MISSING_BOTH');
  const agree = compared.filter((c) => c.status === 'MATCH');
  const conflicts = compared.filter((c) => c.status === 'CONFLICT' || c.status === 'VETO');
  const partial = compared.filter((c) => c.status === 'PARTIAL' || c.status === 'SUBSTITUTABLE');
  const missing = compared.filter((c) => c.status === 'MISSING_A' || c.status === 'MISSING_B');
  const parts: string[] = [];

  const typeVal = a.attributes[TYPE_KEY[a.category]]?.value ?? b.attributes[TYPE_KEY[b.category]]?.value;
  parts.push(`Both records are classified as ${lc(a.category)}${typeVal ? ` (${lc(String(typeVal))})` : ''}; ${agree.length} of ${compared.length} compared attributes agree.`);

  if (r.vetoes.length) {
    parts.push(`Hard exclusion: ${r.vetoes.map((v) => v.message).join(' ')}`);
  }
  if (conflicts.length && !r.vetoes.length) {
    parts.push(`They differ on ${conflicts.map((c) => `${c.label.toLowerCase()} (${fmt(c.a, c.unit)} vs ${fmt(c.b, c.unit)})`).join(', ')}.`);
  }
  if (r.substitutionsApplied.length) parts.push(`An approved substitution rule applies: ${r.substitutionsApplied.join('; ')}.`);
  if (partial.length) parts.push(`Partially compatible: ${partial.map((c) => `${c.label.toLowerCase()} (${fmt(c.a, c.unit)} vs ${fmt(c.b, c.unit)})`).join(', ')}.`);
  if (missing.length) parts.push(`Not stated on one side: ${missing.map((c) => c.label.toLowerCase()).join(', ')}.`);
  if (r.missingRequired.a.length || r.missingRequired.b.length) {
    const m = [...new Set([...r.missingRequired.a, ...r.missingRequired.b])].join(', ');
    parts.push(`Required attributes missing (${m}) — the source CPSE must enrich the record before equivalence can be confirmed.`);
  }
  const s = r.components;
  parts.push(`Description similarity after abbreviation expansion is ${s.semantic >= 0.85 ? 'high' : s.semantic >= 0.6 ? 'moderate' : 'low'} (${s.semantic.toFixed(2)}).`);
  if (s.uom === 0) parts.push(`Units of measure are not convertible (${a.baseUom ?? '?'} vs ${b.baseUom ?? '?'}); a stocking-unit decision is needed.`);
  if (r.deterministic === 'MPN_EXACT') parts.push(`Manufacturer part number is identical (${a.manufacturer} ${a.partNumber}).`);
  if (r.deterministic === 'ATTRIBUTE_FINGERPRINT') parts.push('All identity attributes produce the same fingerprint.');
  parts.push(`Classified ${r.matchType.replace(/_/g, ' ')} at ${(r.finalScore * 100).toFixed(1)}% → ${r.routing === 'AUTO_QUEUE' ? 'fast-track approval queue' : r.routing === 'REVIEW' ? 'full steward review' : r.routing === 'UNRESOLVED' ? 'unresolved queue' : 'no action (logged for audit)'}.`);
  return parts.join(' ');
}

export function buildReasonCodes(r: Omit<MatchResult, 'explanation' | 'reasonCodes'>, a: MatchRecord, b: MatchRecord, textIdentical: boolean, uomReason: string): string[] {
  const codes: string[] = [];
  if (r.deterministic === 'MPN_EXACT') codes.push('DETERMINISTIC_MPN_MATCH');
  if (r.deterministic === 'ATTRIBUTE_FINGERPRINT') codes.push('ATTRIBUTE_FINGERPRINT_MATCH');
  if (textIdentical) codes.push('TEXT_IDENTICAL_AFTER_NORMALIZATION');
  const sem = r.components.semantic;
  codes.push(sem >= 0.85 ? 'SEMANTIC_HIGH' : sem >= 0.6 ? 'SEMANTIC_MODERATE' : 'SEMANTIC_LOW');
  for (const v of r.vetoes) codes.push(v.rule);
  for (const c of r.comparisons) {
    if (c.weight === 0) continue;
    if (c.status === 'CONFLICT') codes.push(`ATTR_CONFLICT:${c.key.toUpperCase()}`);
    if (c.status === 'PARTIAL') codes.push(`ATTR_UNDERSPECIFIED:${c.key.toUpperCase()}`);
    if (c.status === 'MISSING_A' || c.status === 'MISSING_B') codes.push(`ATTR_MISSING:${c.key.toUpperCase()}`);
    if (c.status === 'SUBSTITUTABLE') codes.push(`SUBSTITUTION_RULE_APPLIED:${c.key.toUpperCase()}`);
  }
  if (r.comparisons.filter((c) => c.weight > 0 && c.status !== 'MISSING_BOTH').every((c) => c.status === 'MATCH')) codes.push('ATTRIBUTES_ALL_MATCH');
  for (const k of new Set([...r.missingRequired.a, ...r.missingRequired.b])) codes.push(`MISSING_REQUIRED:${k.toUpperCase()}`);
  codes.push(uomReason);
  codes.push(r.components.procurement === null ? 'PROCUREMENT_HISTORY_UNAVAILABLE' : r.components.procurement >= 0.7 ? 'PRICE_CONSISTENT' : 'PRICE_DIVERGENT');
  codes.push(a.orgCode === b.orgCode ? 'SAME_CPSE_DUPLICATE' : 'CROSS_CPSE');
  const ma = a.attributes.manufacturer?.value;
  const mb = b.attributes.manufacturer?.value;
  if (ma && mb && ma !== mb) codes.push('MANUFACTURER_DIFFERS');
  if (r.comparisons.some((c) => c.status === 'CONFLICT' || c.status === 'SUBSTITUTABLE')) codes.push('IDENTITY_OR_SPEC_DIFFERS');
  return codes;
}

/** Full pair evaluation: Stages B → E, then exclusion layer, classification, routing and explanation. */
export function matchPair(a: MatchRecord, b: MatchRecord, ctx: PairContext): MatchResult {
  const { schema, config } = ctx;
  const comparisons: AttrComparison[] = compareAttributes(schema, a.attributes, b.attributes);

  // Stage 6 — exclusions (evaluated independently of the score)
  const excl = evaluateHardExclusions(schema, a.attributes, b.attributes, ctx.substitutionRules);
  for (const v of excl.vetoes) {
    const c = comparisons.find((x) => x.key === v.attribute);
    if (c) c.status = 'VETO';
  }
  for (const s of excl.substitutions) {
    const c = comparisons.find((x) => x.key === s.attribute);
    if (c) {
      c.status = 'SUBSTITUTABLE';
      c.score = 0.5;
      c.note = s.direction;
    }
  }

  const sem = semanticComponent(a, b, config);
  const uom = uomCompatibility({ code: a.baseUom, dimension: a.uomDimension }, { code: b.baseUom, dimension: b.uomDimension });
  const procurement = procurementSimilarity(a, b);
  const componentsRaw = {
    semantic: sem.semantic,
    attribute: groupScore(comparisons, 'attribute'),
    specification: groupScore(comparisons, 'specification'),
    dimension: groupScore(comparisons, 'dimension'),
    classification: classificationSimilarity(a, b),
    uom: uom.score,
    procurement,
  };
  const fused = fuse(componentsRaw, config.weights, config.missingHistoryPolicy);
  const deterministic = deterministicMatch(a, b, schema);
  const missing = { a: missingRequired(schema, a.attributes), b: missingRequired(schema, b.attributes) };
  const vetoed = excl.vetoes.length > 0;
  const textIdentical = a.normalizedDescription === b.normalizedDescription;
  const identityDiffers = comparisons.some((c) => (c.status === 'CONFLICT' || c.status === 'SUBSTITUTABLE') && schema.fields.find((f) => f.key === c.key)?.identity);

  const rawScore = r3(fused.score);
  const finalScore = vetoed ? r3(Math.min(rawScore, config.thresholds.functional - 0.01)) : rawScore;
  const matchType = classifyMatch({ score: rawScore, vetoed, insufficient: missing.a.length + missing.b.length > 0, deterministic, textIdentical, identityDiffers, config });
  const routing = routeMatch(matchType, finalScore, config);

  const components: ComponentScores = {
    semantic: r3(sem.semantic),
    attribute: r3(componentsRaw.attribute ?? 0),
    specification: r3(componentsRaw.specification ?? 0),
    dimension: r3(componentsRaw.dimension ?? 0),
    classification: r3(componentsRaw.classification),
    uom: r3(uom.score),
    procurement: procurement === null ? null : r3(procurement),
    cosine: r3(sem.cos),
    jaroWinkler: r3(sem.jw),
    levenshteinRatio: r3(sem.lev),
    tokenJaccard: r3(sem.jac),
  };

  const base: Omit<MatchResult, 'explanation' | 'reasonCodes'> = {
    aId: a.id,
    bId: b.id,
    category: a.category,
    rawScore,
    finalScore,
    components,
    effectiveWeights: fused.effective,
    deterministic,
    vetoes: excl.vetoes,
    substitutionsApplied: excl.substitutions.map((s) => `${s.attribute}: ${s.direction} — ${s.rule.rationale}`),
    comparisons,
    missingRequired: missing,
    matchType,
    routing,
  };
  return { ...base, reasonCodes: buildReasonCodes(base, a, b, textIdentical, uom.reason), explanation: buildExplanation(base, a, b) };
}
