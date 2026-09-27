import { AttrBuilder, earliestRule, findMake } from './common';
import type { AttributeMap } from '../types';

/** ISO 15 / ISO 355 boundary dimensions (d × D × B, mm) for designations in common CPSE use. */
export const BEARING_DIMENSIONS: Record<string, [number, number, number]> = {
  '6200': [10, 30, 9], '6201': [12, 32, 10], '6202': [15, 35, 11], '6203': [17, 40, 12], '6204': [20, 47, 14],
  '6205': [25, 52, 15], '6206': [30, 62, 16], '6207': [35, 72, 17], '6208': [40, 80, 18], '6209': [45, 85, 19],
  '6210': [50, 90, 20], '6211': [55, 100, 21], '6212': [60, 110, 22], '6304': [20, 52, 15], '6305': [25, 62, 17],
  '6306': [30, 72, 19], '6307': [35, 80, 21], '6308': [40, 90, 23], '6309': [45, 100, 25], '6310': [50, 110, 27],
  '6312': [60, 130, 31], 'NU205': [25, 52, 15], 'NU206': [30, 62, 16], 'NU308': [40, 90, 23], 'NU310': [50, 110, 27],
  'NJ308': [40, 90, 23], 'NU312': [60, 130, 31], '22210': [50, 90, 23], '22212': [60, 110, 28], '22216': [80, 140, 33],
  '22220': [100, 180, 46], '22312': [60, 130, 46], '30205': [25, 52, 16.25], '30208': [40, 80, 19.75],
  '30210': [50, 90, 21.75], '32210': [50, 90, 24.75], '7205': [25, 52, 15], '7308': [40, 90, 23], '7310': [50, 110, 27],
};

const DESIGNATION_RE = /(?<![A-Z0-9.])(NUP|NU|NJ)?\s?(6[0-3]\d{2}|[23]\d{2}|2[23][23]\d{2}|3[02][23]\d{2}|7[23]\d{2})(?=[^0-9.]|$)/g;

function typeFromDesignation(d: string): string | null {
  if (/^(NU|NJ|NUP)/.test(d)) return 'CYLINDRICAL_ROLLER';
  if (/^6\d{3}$/.test(d)) return 'DEEP_GROOVE_BALL';
  if (/^2[23][23]\d{2}$/.test(d)) return 'SPHERICAL_ROLLER';
  if (/^3[02][23]\d{2}$/.test(d)) return 'TAPER_ROLLER';
  if (/^7[23]\d{2}$/.test(d)) return 'ANGULAR_CONTACT_BALL';
  return null;
}

export function extractBearing(text: string, fields: { manufacturer?: string | null; partNumber?: string | null } = {}): AttributeMap {
  const b = new AttrBuilder();

  // Designation — prefer one whose prefix/family is coherent. Scan all candidates.
  const candidates: string[] = [];
  for (const m of text.matchAll(DESIGNATION_RE)) {
    const prefix = m[1] ?? '';
    const num = m[2];
    if (prefix) candidates.push(prefix + num);
    else if (num.length >= 4) candidates.push(num);
  }
  const designation = candidates.find((c) => BEARING_DIMENSIONS[c]) ?? candidates[0];
  if (designation) b.set('designation', designation, BEARING_DIMENSIONS[designation] ? 0.97 : 0.8, 'regex', designation);

  const typeKw = earliestRule(text, [
    [/DEEP GROOVE/, 'DEEP_GROOVE_BALL'],
    [/SPHERICAL ROLLER/, 'SPHERICAL_ROLLER'],
    [/CYLINDRICAL ROLLER/, 'CYLINDRICAL_ROLLER'],
    [/TAPER ROLLER/, 'TAPER_ROLLER'],
    [/ANGULAR CONTACT/, 'ANGULAR_CONTACT_BALL'],
  ]);
  const derivedType = designation ? typeFromDesignation(designation) : null;
  if (typeKw) b.set('bearing_type', typeKw.value, 0.95, 'dictionary', typeKw.raw);
  else if (derivedType) b.set('bearing_type', derivedType, /BALL/.test(text) || !derivedType.includes('BALL') ? 0.88 : 0.8, 'derived', designation);

  // Explicit dimensions win over lookup: "25X52X15", "ID25 OD52 W15", "25 X 52 X 15 MM"
  const dimX = /(?<![0-9.])(\d{1,3}(?:\.\d+)?)\s*X\s*(\d{2,3}(?:\.\d+)?)\s*X\s*(\d{1,2}(?:\.\d+)?)\s*(?:MM)?(?![0-9])/.exec(text);
  const dimLabels = /\bID\s*(\d{1,3}(?:\.\d+)?)\s*(?:MM)?\s+OD\s*(\d{2,3}(?:\.\d+)?)\s*(?:MM)?\s+(?:W|WIDTH|THK|B)\s*(\d{1,2}(?:\.\d+)?)/.exec(text);
  const dm = dimX ?? dimLabels;
  if (dm) {
    b.set('bore_mm', Number(dm[1]), 0.95, 'regex', dm[0]);
    b.set('outer_diameter_mm', Number(dm[2]), 0.95, 'regex', dm[0]);
    b.set('width_mm', Number(dm[3]), 0.95, 'regex', dm[0]);
  } else if (designation && BEARING_DIMENSIONS[designation]) {
    const [d, D, B] = BEARING_DIMENSIONS[designation];
    b.set('bore_mm', d, 0.9, 'lookup', designation);
    b.set('outer_diameter_mm', D, 0.9, 'lookup', designation);
    b.set('width_mm', B, 0.9, 'lookup', designation);
  }

  const seal = earliestRule(text, [
    [/(?<![A-Z])(2RS[1RHZ]?H?|DDU|LLU|2RZ)(?=C\d|[^A-Z]|$)/, '2RS'],
    [/DOUBLE (RUBBER )?SEAL(ED)?|SEALED BOTH SIDES|RUBBER SEALED/, '2RS'],
    [/(?<![A-Z])(ZZ|2ZR?|Z Z)(?=C\d|[^A-Z]|$)/, 'ZZ'],
    [/DOUBLE SHIELD(ED)?|METAL SHIELD(ED)?/, 'ZZ'],
    [/\bOPEN\b/, 'OPEN'],
  ]);
  if (seal) b.set('seal_type', seal.value, 0.93, 'regex', seal.raw);
  // ISO 15 convention: a designation without a seal/shield suffix denotes an open bearing.
  else if (designation) b.set('seal_type', 'OPEN', 0.72, 'derived', 'no seal suffix');

  const clr = earliestRule(text, [
    [/(?:^|[^A-Z0-9]|DDU|LLU|RS1|RSH|RS|ZZ|2Z|[0-9])(C[2345])(?![A-Z0-9])/, 'C'],
    [/\bCN\b|NORMAL CLEARANCE/, 'CN'],
  ]);
  if (clr) {
    const v = clr.value === 'CN' ? 'CN' : (/(C[2345])/.exec(clr.raw)?.[1] ?? null);
    if (v) b.set('clearance', v, 0.92, 'regex', clr.raw.trim());
  }

  const cage = earliestRule(text, [
    [/BRASS CAGE|MACHINED BRASS|(?<=\d)MA?\b/, 'BRASS'],
    [/POLYAMIDE|TN9|TVH|NYLON CAGE/, 'POLYAMIDE'],
    [/STEEL CAGE|PRESSED STEEL/, 'STEEL'],
  ]);
  if (cage) b.set('cage', cage.value, 0.8, 'regex', cage.raw);

  const make = findMake(text, fields.manufacturer);
  if (make) b.set('manufacturer', make.value, make.source === 'field' ? 1 : 0.85, make.source);

  return b.attrs;
}
