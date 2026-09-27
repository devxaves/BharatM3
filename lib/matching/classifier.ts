import type { CategoryCode } from './types';

/**
 * Stage 3 — rule-based category classifier (PRD §7.5: keyword classifier acceptable for MVP).
 *
 * Head-noun aware: text after "FOR" is treated as context, not the item itself, so
 * "BEARING FOR CONVEYOR PULLEY" → BEARING, while "IMPELLER FOR PUMP" → UNCLASSIFIED (spare part).
 */

interface Signal {
  re: RegExp;
  weight: number;
  label: string;
}

const SIGNALS: Record<Exclude<CategoryCode, 'UNCLASSIFIED'>, Signal[]> = {
  BEARING: [
    { re: /\bBEARING\b/, weight: 4, label: 'noun:BEARING' },
    { re: /\b(DEEP GROOVE|SPHERICAL ROLLER|CYLINDRICAL ROLLER|TAPER ROLLER|ANGULAR CONTACT)\b/, weight: 2, label: 'bearing-family keyword' },
    { re: /(?<![A-Z0-9.])(6[0-3]\d{2}|NU\s?[23]\d{2}|NJ\s?[23]\d{2}|2[23][23]\d{2}|3[02][23]\d{2}|7[23]\d{2})(?=[^0-9.]|$)/, weight: 2, label: 'ISO bearing designation' },
    { re: /(2RS|ZZ|2Z|DDU|LLU)\b|(?<![A-Z0-9])C[34](?![A-Z0-9])/, weight: 1, label: 'seal/clearance suffix' },
  ],
  VALVE: [
    { re: /\bVALVE\b/, weight: 4, label: 'noun:VALVE' },
    { re: /\b(GATE|GLOBE|BUTTERFLY|CHECK|PLUG|NEEDLE)\b/, weight: 1.5, label: 'valve-type keyword' },
    { re: /\b(CLASS\s*\d{3,4}|\d{3,4}\s*(#|LBS?\b)|PN\s*\d{2,3})/, weight: 1, label: 'pressure rating' },
    { re: /\bAPI\s*(600|602|6D|609|594|608)\b|\bBS\s*(1873|1868|5352)\b/, weight: 1.5, label: 'valve design standard' },
    { re: /\b(WCB|A105|CF8M?|LCB)\b/, weight: 1, label: 'valve body material' },
  ],
  CABLE: [
    { re: /\bCABLE\b/, weight: 4, label: 'noun:CABLE' },
    { re: /\b(SQMM|CORE|CORES)\b|\d\s*C(?:ORE)?\s*X\s*\d/, weight: 1.5, label: 'conductor geometry' },
    { re: /\b(CROSS LINKED POLYETHYLENE|XLPE|ARMOURED|UNARMOURED)\b/, weight: 1, label: 'insulation/armour' },
    { re: /\b\d+(\.\d+)?\s*KV\b|\b\d{3,5}\s*V\b/, weight: 1, label: 'voltage grade' },
    { re: /\bA?(2X|Y)(W|F)?Y\b/, weight: 2, label: 'IS 7098 cable code' },
  ],
  FASTENER: [
    { re: /\b(BOLT|NUT|WASHER|STUD|SCREW)\b/, weight: 4, label: 'noun:fastener' },
    { re: /\bM\d{1,2}(\s*X\s*\d|\b)/, weight: 1.5, label: 'metric thread' },
    { re: /\b(8\.8|10\.9|12\.9|B7|2H|A193|A194)\b/, weight: 1.5, label: 'fastener grade' },
    { re: /\b\d(\/\d)?"?\s*-?\s*(\d{1,2}\s*)?UNC\b/, weight: 1.5, label: 'unified thread' },
  ],
  PUMP: [
    { re: /\bPUMP\b/, weight: 4, label: 'noun:PUMP' },
    { re: /\b(CENTRIFUGAL|SUBMERSIBLE|RECIPROCATING|DEWATERING|DOSING)\b/, weight: 1.5, label: 'pump-type keyword' },
    { re: /M3\/H|\bLPM\b|\bGPM\b/, weight: 1.5, label: 'flow unit' },
    { re: /\bHEAD\b|\d\s*M\s*HD\b|\bTDH\b/, weight: 1, label: 'head' },
  ],
};

/** Nouns indicating a spare part / consumable that is not itself one of the five material families. */
const NON_CATEGORY_HEADS =
  /\b(IMPELLER|HOUSING|PLUMMER BLOCK|SPINDLE|SEAL KIT|GLAND|SLEEVE|SHAFT|COUPLING|GASKET|V-?BELT|BELT|GREASE|HOSE|HELMET|GLOVES?|LUG|GLAND KIT|CABLE TIE|SPARES?|REPAIR KIT|O-?RING|DIAPHRAGM|BUSH)\b/;

const COMPOUND_SPARE = /\b(BEARING|VALVE|PUMP|CABLE)\s+(HOUSING|SPINDLE|SHAFT|IMPELLER|SEAL KIT|SPARES?|GLAND|SLEEVE|COUPLING|REPAIR KIT|LUGS?|GLAND KIT|BUSH|TIES?|CASING|SEAT)\b/;

export interface ClassificationResult {
  category: CategoryCode;
  confidence: number;
  scores: Record<string, number>;
  reasons: string[];
}

export function classifyMaterial(normalizedText: string): ClassificationResult {
  const reasons: string[] = [];
  const forIdx = normalizedText.search(/\bFOR\b/);
  const head = forIdx > 0 ? normalizedText.slice(0, forIdx) : normalizedText;
  if (forIdx > 0) reasons.push(`context after "FOR" ignored: "${normalizedText.slice(forIdx).slice(0, 40)}"`);

  const scores: Record<string, number> = {};
  const hits: Record<string, string[]> = {};
  for (const [cat, signals] of Object.entries(SIGNALS)) {
    let s = 0;
    hits[cat] = [];
    for (const sig of signals) {
      if (sig.re.test(head)) {
        s += sig.weight;
        hits[cat].push(sig.label);
      }
    }
    scores[cat] = s;
  }

  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [topCat, top] = ranked[0];
  const second = ranked[1]?.[1] ?? 0;

  const spare = head.match(NON_CATEGORY_HEADS);
  const hasNoun = hits[topCat]?.some((h) => h.startsWith('noun:'));
  const compound = head.match(COMPOUND_SPARE);
  if (compound) {
    reasons.push(`compound noun "${compound[0]}" denotes a component of a ${compound[1].toLowerCase()}, not the item itself`);
    return { category: 'UNCLASSIFIED', confidence: 0.85, scores, reasons };
  }

  if (spare && (!hasNoun || head.indexOf(spare[0]) < head.search(/\b(BEARING|VALVE|CABLE|BOLT|NUT|STUD|WASHER|SCREW|PUMP)\b/))) {
    reasons.push(`head noun "${spare[0]}" is a spare/consumable outside the five governed families`);
    return { category: 'UNCLASSIFIED', confidence: 0.8, scores, reasons };
  }
  if (top < 3.5) {
    reasons.push(`insufficient category evidence (best ${topCat} = ${top.toFixed(1)})`);
    return { category: 'UNCLASSIFIED', confidence: Math.max(0.2, top / 10), scores, reasons };
  }

  const margin = (top - second) / top;
  const confidence = Math.round(Math.min(0.99, 0.55 + 0.35 * margin + 0.02 * Math.min(top, 5)) * 100) / 100;
  reasons.push(`${topCat}: ${hits[topCat].join(', ')}`);
  if (second > 0) reasons.push(`runner-up ${ranked[1][0]} (${second.toFixed(1)})`);
  return { category: topCat as CategoryCode, confidence, scores, reasons };
}
