import { AttrBuilder, findMake, firstRule } from './common';
import type { AttributeMap } from '../types';

/**
 * Decode IS 7098 / IS 1554 cable type codes, e.g.
 *   A2XWY → Aluminium, XLPE, round-wire armour, PVC sheath
 *   2XFY  → Copper, XLPE, flat-strip armour, PVC sheath
 *   YWY   → Copper, PVC, wire armour, PVC sheath
 */
export function decodeCableCode(code: string) {
  const m = /^(A)?(2X|Y)(W|F)?(Y)$/.exec(code);
  if (!m) return null;
  return {
    conductor: m[1] ? 'AL' : 'CU',
    insulation: m[2] === '2X' ? 'XLPE' : 'PVC',
    armour: m[3] === 'W' ? 'WIRE' : m[3] === 'F' ? 'STRIP' : 'UNARMOURED',
  };
}

export function extractCable(text: string, fields: { manufacturer?: string | null } = {}): AttributeMap {
  const b = new AttrBuilder();

  const codeMatch = /(?<![A-Z0-9])(A?(?:2X|Y)(?:W|F)?Y)(?![A-Z0-9])/.exec(text);
  const decoded = codeMatch ? decodeCableCode(codeMatch[1]) : null;
  if (decoded && codeMatch) {
    b.set('conductor', decoded.conductor, 0.9, 'lookup', codeMatch[1]);
    b.set('insulation', decoded.insulation, 0.9, 'lookup', codeMatch[1]);
    b.set('armour', decoded.armour, 0.9, 'lookup', codeMatch[1]);
  }

  // Geometry: "3.5CX95", "3.5 CORE X 95 SQMM", "4C X 16", or split "95 SQMM … 3.5 CORE"
  const geo = /(?<![0-9.])(\d{1,2}(?:\.5)?)\s*(?:C|CORE|CORES)\s*X\s*(\d{1,3}(?:\.\d{1,2})?)(?:\s*SQMM)?/.exec(text);
  if (geo) {
    b.set('cores', Number(geo[1]), 0.96, 'regex', geo[0]);
    b.set('cross_section_sqmm', Number(geo[2]), 0.96, 'regex', geo[0]);
  } else {
    const cores = /(?<![0-9.])(\d{1,2}(?:\.5)?)\s*(?:C|CORE|CORES)(?![A-Z0-9])/.exec(text);
    const sec = /(?<![0-9.])(\d{1,3}(?:\.\d{1,2})?)\s*SQMM/.exec(text);
    if (cores) b.set('cores', Number(cores[1]), 0.9, 'regex', cores[0]);
    if (sec) b.set('cross_section_sqmm', Number(sec[1]), 0.92, 'regex', sec[0]);
  }

  // Voltage grade in kV. "6.35/11KV" → 11 ; "1100V" → 1.1 ; "LOW TENSION" → 1.1 (derived)
  const pair = /(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\s*KV\b/.exec(text);
  const kv = /(?<![0-9./])(\d+(?:\.\d+)?)\s*KV\b/.exec(text);
  const v = /(?<![0-9./])(\d{3,5})\s*V\b/.exec(text);
  if (pair) b.set('voltage_grade_kv', Number(pair[2]), 0.95, 'regex', pair[0]);
  else if (kv) b.set('voltage_grade_kv', Number(kv[1]), 0.96, 'regex', kv[0]);
  else if (v) b.set('voltage_grade_kv', Math.round((Number(v[1]) / 1000) * 100) / 100, 0.9, 'regex', v[0]);
  else if (/LOW TENSION/.test(text)) b.set('voltage_grade_kv', 1.1, 0.6, 'derived', 'LOW TENSION');

  const cond = firstRule(text, [
    [/ALUMINIUM|\bALU?\b/, 'AL'],
    [/COPPER|\bCU\b/, 'CU'],
  ]);
  if (cond) b.set('conductor', cond.value, 0.95, 'dictionary', cond.raw);

  const ins = firstRule(text, [
    [/CROSS LINKED POLYETHYLENE|\bXLPE\b/, 'XLPE'],
    [/\bEPR\b/, 'EPR'],
    [/\bPVC\b/, 'PVC'],
  ]);
  if (ins) b.set('insulation', ins.value, 0.93, 'dictionary', ins.raw);

  const arm = firstRule(text, [
    [/UNARMOURED|UN-ARMOURED/, 'UNARMOURED'],
    [/STRIP ARMOURED|FLAT STRIP|STRIP ARMOUR/, 'STRIP'],
    [/WIRE ARMOURED|ROUND WIRE|ARMOURED WIRE|WIRE ARMOUR/, 'WIRE'],
    [/ARMOURED/, 'ARMOURED'],
  ]);
  if (arm) b.set('armour', arm.value, arm.value === 'ARMOURED' ? 0.65 : 0.92, 'dictionary', arm.raw);

  const fire = firstRule(text, [
    [/FIRE RETARDANT LOW SMOKE HALOGEN|\bFRLSH\b/, 'FRLSH'],
    [/FIRE RETARDANT LOW SMOKE|\bFRLS\b/, 'FRLS'],
    [/LOW SMOKE ZERO HALOGEN|\bLSZH\b/, 'LSZH'],
    [/FIRE SURVIVAL|\bFS\b CABLE/, 'FIRE_SURVIVAL'],
  ]);
  if (fire) b.set('fire_performance', fire.value, 0.94, 'dictionary', fire.raw);

  const std = /\bIS\s*(7098|1554|694)(?:\s*[-(]?\s*(?:PART|PT)?\s*([123I]{1,2}))?/.exec(text);
  if (std) {
    const part = std[2] ? `-${std[2].replace(/^I$/, '1').replace(/^II$/, '2')}` : '';
    b.set('standard', `IS ${std[1]}${part}`, 0.93, 'regex', std[0]);
  }

  const typeKw = firstRule(text, [
    [/\bPOWER\b/, 'POWER'],
    [/\bCONTROL\b/, 'CONTROL'],
    [/INSTRUMENTATION|\bSIGNAL\b/, 'INSTRUMENTATION'],
  ]);
  if (typeKw) b.set('cable_type', typeKw.value, 0.95, 'dictionary', typeKw.raw);
  else {
    const sec = Number(b.get('cross_section_sqmm') ?? 0);
    const cores = Number(b.get('cores') ?? 0);
    const kvv = Number(b.get('voltage_grade_kv') ?? 0);
    const insul = b.get('insulation');
    if (sec >= 4 || kvv >= 3.3 || insul === 'XLPE') b.set('cable_type', 'POWER', 0.75, 'derived');
    else if (sec > 0 && sec <= 2.5 && (insul === 'PVC' || cores >= 5)) b.set('cable_type', 'CONTROL', 0.72, 'derived');
  }

  // IS 1554-1 control cables are 1.1 kV grade by definition when no voltage is stated.
  if (!b.has('voltage_grade_kv') && b.get('cable_type') === 'CONTROL') b.set('voltage_grade_kv', 1.1, 0.6, 'derived', 'IS 1554-1 control cable default');

  const make = findMake(text, fields.manufacturer);
  if (make) b.set('manufacturer', make.value, make.source === 'field' ? 1 : 0.85, make.source);

  return b.attrs;
}
