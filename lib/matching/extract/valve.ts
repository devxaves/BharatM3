import { AttrBuilder, earliestRule, findMake, firstRule, parseInch } from './common';
import type { AttributeMap } from '../types';

/** NPS (inch) → DN (mm) per ASME B36.10 / ISO 6708. */
export const NPS_TO_DN: Record<string, number> = {
  '0.25': 8, '0.375': 10, '0.5': 15, '0.75': 20, '1': 25, '1.25': 32, '1.5': 40, '2': 50, '2.5': 65, '3': 80,
  '4': 100, '5': 125, '6': 150, '8': 200, '10': 250, '12': 300, '14': 350, '16': 400, '18': 450, '20': 500, '24': 600,
};
const VALID_DN = new Set(Object.values(NPS_TO_DN));

/** ISO 7005 / ASME B16.34 PN designations that correspond to ASME classes. */
const PN_TO_CLASS: Record<string, string> = { '20': '150', '50': '300', '68': '400', '100': '600', '150': '900', '250': '1500', '420': '2500' };

export function extractValve(text: string, fields: { manufacturer?: string | null } = {}): AttributeMap {
  const b = new AttrBuilder();

  const type = earliestRule(text, [
    [/\bGATE\b/, 'GATE'],
    [/\bGLOBE\b/, 'GLOBE'],
    [/\bBALL\b/, 'BALL'],
    [/\bCHECK\b/, 'CHECK'],
    [/\bBUTTERFLY\b/, 'BUTTERFLY'],
    [/\bPLUG\b/, 'PLUG'],
    [/\bNEEDLE\b/, 'NEEDLE'],
  ]);
  if (type) b.set('valve_type', type.value, 0.95, 'dictionary', type.raw);

  // Size: inch forms, NB (mm), DN
  const inch = /(?<![0-9./])(\d{1,2}[- ]\d\/\d|\d\/\d|\d{1,2}(?:\.\d{1,2})?)\s*(?:"|IN\b|INCH(?:ES)?\b|NPS\b)/.exec(text);
  const nb = /(?<![0-9.])(\d{2,4})\s*(?:MM\s*)?(?:NB\b|NOMINAL BORE)/.exec(text) ?? /(?:NB|NOMINAL BORE)\s*(\d{2,4})\b/.exec(text);
  const dn = /\bDN\s*(\d{2,4})\b/.exec(text);
  if (dn && VALID_DN.has(Number(dn[1]))) b.set('size_dn', Number(dn[1]), 0.97, 'regex', dn[0]);
  else if (nb && VALID_DN.has(Number(nb[1]))) b.set('size_dn', Number(nb[1]), 0.95, 'regex', nb[0]);
  else if (inch) {
    const v = parseInch(inch[1]);
    const mapped = v !== null ? NPS_TO_DN[String(v)] : undefined;
    if (mapped) b.set('size_dn', mapped, 0.93, 'regex', inch[0]);
  }

  // Pressure class
  const cls =
    /(?:CLASS|CL)\s*(150|300|400|600|800|900|1500|2500)\b/.exec(text) ??
    /(?<![0-9.])(150|300|400|600|800|900|1500|2500)\s*(?:#|LBS?\b|LB\.)/.exec(text) ??
    /\b(?:ANSI|ASME)\s*(150|300|600|900|1500)\b/.exec(text);
  const pn = /\bPN\s*(\d{2,3})\b/.exec(text);
  if (cls) b.set('pressure_class', cls[1], 0.96, 'regex', cls[0]);
  else if (pn) {
    const mapped = PN_TO_CLASS[pn[1]];
    b.set('pressure_class', mapped ?? `PN${pn[1]}`, mapped ? 0.9 : 0.85, mapped ? 'lookup' : 'regex', pn[0]);
  }

  // Body material — most specific first
  const body = firstRule(text, [
    [/\bCF8M\b|A351\s*(?:GR(?:ADE)?\s*)?CF8M|\bF316L?\b|SS\s?316L?\b|STAINLESS STEEL\s*316/, 'SS316'],
    [/\bCF8\b|A351\s*(?:GR(?:ADE)?\s*)?CF8\b|\bF304L?\b|SS\s?304L?\b|STAINLESS STEEL\s*304/, 'SS304'],
    [/\bWCC\b/, 'CS-WCC'],
    [/\bWCB\b/, 'CS-WCB'],
    [/\bA\s?105N?\b/, 'CS-A105'],
    [/\bLCB\b|A352/, 'LTCS-LCB'],
    [/\bLF2\b|A350/, 'LTCS-LF2'],
    [/\bF11\b|\bWC6\b/, 'AS-WC6'],
    [/DUCTILE IRON|SG IRON/, 'DI'],
    [/CAST IRON|\bIS\s*210\b|\bFG\s?260\b/, 'CI'],
    [/GUN METAL|BRONZE/, 'BRONZE'],
    [/CARBON STEEL|CAST STEEL|FORGED STEEL|\bSTEEL BODY\b/, 'CS'],
    [/STAINLESS STEEL/, 'SS'],
  ]);
  if (body) b.set('body_material', body.value, ['CS', 'SS'].includes(body.value) ? 0.6 : 0.94, 'regex', body.raw);

  const ends = firstRule(text, [
    [/RAISED FACE|\bRF\b/, 'FLANGED_RF'],
    [/FLAT FACE|\bFF\b/, 'FLANGED_FF'],
    [/RING TYPE JOINT|\bRTJ\b/, 'FLANGED_RTJ'],
    [/BUTT WELD/, 'BUTT_WELD'],
    [/SOCKET WELD/, 'SOCKET_WELD'],
    [/SCREWED|THREADED|\bNPT\b|\bBSP\b/, 'SCREWED'],
    [/\bWAFER\b/, 'WAFER'],
    [/\bLUG(GED)? TYPE\b/, 'LUG'],
    [/FLANGED|\bFLG\b/, 'FLANGED'],
  ]);
  if (ends) b.set('end_connection', ends.value, ends.value === 'FLANGED' ? 0.7 : 0.93, 'regex', ends.raw);

  const op = firstRule(text, [
    [/GEAR OPERATED|GEAR BOX|GEARBOX|BEVEL GEAR/, 'GEAR'],
    [/MOTOR OPERATED|ACTUATOR|PNEUMATIC|ELECTRIC ACTUATED/, 'ACTUATED'],
    [/LEVER/, 'LEVER'],
    [/HANDWHEEL|HAND WHEEL/, 'HANDWHEEL'],
  ]);
  if (op) b.set('operation', op.value, 0.9, 'regex', op.raw);

  const std = /\b(API)\s*(600|602|6D|609|594|608|623|598)\b|\b(BS)\s*(1873|1868|5352|5351|5153)\b|\b(IS)\s*(14846|778|13095)\b/.exec(text);
  if (std) {
    const v = std[1] ? `API ${std[2]}` : std[3] ? `BS ${std[4]}` : `IS ${std[6]}`;
    b.set('design_standard', v, 0.95, 'regex', std[0]);
  }

  const trim = firstRule(text, [
    [/\bTRIM\s*(?:NO\.?\s*)?(\d{1,2})\b/, 'TRIM'],
    [/13\s?%?\s?CR\b/, '13CR'],
    [/STELLITE|HARD ?FACED/, 'STELLITE'],
  ]);
  if (trim) {
    const v = trim.value === 'TRIM' ? `API TRIM ${/(\d{1,2})/.exec(trim.raw)?.[1]}` : trim.value;
    b.set('trim', v, 0.85, 'regex', trim.raw);
  }

  const fire = firstRule(text, [
    [/NON[\s-]*FIRE[\s-]*SAFE/, 'NONE'],
    [/FIRE[\s-]*SAFE|API\s*607|API\s*6FA/, 'API 607'],
  ]);
  if (fire) b.set('fire_safe', fire.value, 0.93, 'regex', fire.raw);

  const make = findMake(text, fields.manufacturer);
  if (make) b.set('manufacturer', make.value, make.source === 'field' ? 1 : 0.85, make.source);

  return b.attrs;
}
