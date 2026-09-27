import { isGenericOf } from '@/lib/matching/compare';
import type { AttributeMap, MatchableCategory } from '@/lib/matching/types';

/**
 * Stage 10 — Common National Material Code generator.
 *
 * Dual identity (PRD §7.13):
 *   • CNMC  — human-readable, template-generated semantic code, e.g. IN-MAT-BRG-DGBB-6205-2RS-C3-25X52X15
 *   • UUID  — immutable internal id (DB primary key), never reused
 * plus an 18-character ERP-safe short code (NMC-BRG-000042) that fits the SAP ECC MATNR limit.
 * Descriptions come from a noun–modifier template (ISO 8000 style), never from free-text LLM output.
 */

const v = (a: AttributeMap, k: string) => a[k]?.value;
const FRACTIONS: Record<string, string> = { '1/4': '0.25', '3/8': '0.375', '1/2': '0.5', '5/8': '0.625', '3/4': '0.75', '7/8': '0.875' };
/** Code-safe segment: inch fractions become decimals (5/8 → 0.625), everything else outside [A-Z0-9.-] is dropped. */
const s = (x: unknown) =>
  String(x)
    .toUpperCase()
    .replace(/(\d+)-(\d\/\d)/g, (_, w, f) => String(Number(w) + Number(FRACTIONS[f] ?? 0)))
    .replace(/\d\/\d/g, (f) => FRACTIONS[f] ?? f.replace('/', '.'))
    .replace(/[^A-Z0-9.-]/g, '');
const num = (x: unknown) => {
  const n = Number(x);
  if (!Number.isFinite(n)) return String(x);
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
};

const BEARING_ABBR: Record<string, string> = { DEEP_GROOVE_BALL: 'DGBB', CYLINDRICAL_ROLLER: 'CRB', SPHERICAL_ROLLER: 'SRB', TAPER_ROLLER: 'TRB', ANGULAR_CONTACT_BALL: 'ACBB' };
const BEARING_WORDS: Record<string, string> = {
  DEEP_GROOVE_BALL: 'BALL, DEEP GROOVE',
  CYLINDRICAL_ROLLER: 'ROLLER, CYLINDRICAL',
  SPHERICAL_ROLLER: 'ROLLER, SPHERICAL',
  TAPER_ROLLER: 'ROLLER, TAPERED',
  ANGULAR_CONTACT_BALL: 'BALL, ANGULAR CONTACT',
};
const END_ABBR: Record<string, string> = { FLANGED_RF: 'RF', FLANGED_FF: 'FF', FLANGED_RTJ: 'RTJ', BUTT_WELD: 'BW', SOCKET_WELD: 'SW', SCREWED: 'SCRD', WAFER: 'WFR', LUG: 'LUG', FLANGED: 'FLG' };
const END_WORDS: Record<string, string> = { FLANGED_RF: 'FLANGED RF', FLANGED_FF: 'FLANGED FF', FLANGED_RTJ: 'FLANGED RTJ', BUTT_WELD: 'BUTT WELD ENDS', SOCKET_WELD: 'SOCKET WELD ENDS', SCREWED: 'SCREWED NPT', WAFER: 'WAFER TYPE', LUG: 'LUG TYPE', FLANGED: 'FLANGED' };
export const DN_TO_NPS: Record<number, string> = { 15: '1/2', 20: '3/4', 25: '1', 32: '1-1/4', 40: '1-1/2', 50: '2', 65: '2-1/2', 80: '3', 100: '4', 125: '5', 150: '6', 200: '8', 250: '10', 300: '12', 350: '14', 400: '16', 450: '18', 500: '20', 600: '24' };
const MATERIAL_WORDS: Record<string, string> = { 'CS-WCB': 'ASTM A216 WCB', 'CS-WCC': 'ASTM A216 WCC', 'CS-A105': 'ASTM A105', SS316: 'SS316 (CF8M)', SS304: 'SS304 (CF8)', 'LTCS-LCB': 'ASTM A352 LCB', 'LTCS-LF2': 'ASTM A350 LF2', CI: 'CAST IRON', CS: 'CARBON STEEL', DI: 'DUCTILE IRON' };
const FASTENER_WORDS: Record<string, string> = { HEX_BOLT: 'BOLT, HEX HEAD', STUD_BOLT: 'STUD BOLT', HEX_NUT: 'NUT, HEX', WASHER: 'WASHER, PLAIN', SOCKET_HEAD_CAP_SCREW: 'SCREW, SOCKET HEAD CAP', SCREW: 'SCREW' };
const FASTENER_ABBR: Record<string, string> = { HEX_BOLT: 'HXBOLT', STUD_BOLT: 'STUD', HEX_NUT: 'HXNUT', WASHER: 'WSHR', SOCKET_HEAD_CAP_SCREW: 'SHCS', SCREW: 'SCRW' };
const FINISH_ABBR: Record<string, string> = { HDG: 'HDG', ZINC_PLATED: 'ZP', PTFE_COATED: 'PTFE', BLACK: 'BLK', CADMIUM: 'CD' };
const PUMP_ABBR: Record<string, string> = { CENTRIFUGAL: 'CENT', SUBMERSIBLE: 'SUBM', RECIPROCATING: 'RECP', GEAR: 'GEAR', SCREW: 'SCRW' };
const CABLE_ABBR: Record<string, string> = { POWER: 'PWR', CONTROL: 'CTL', INSTRUMENTATION: 'INS' };
const ARMOUR_WORDS: Record<string, string> = { WIRE: 'STEEL WIRE ARMOURED', STRIP: 'STEEL STRIP ARMOURED', UNARMOURED: 'UNARMOURED', ARMOURED: 'ARMOURED' };
const ARMOUR_ABBR: Record<string, string> = { WIRE: 'SWA', STRIP: 'SSA', UNARMOURED: 'UNARM', ARMOURED: 'ARM' };

export function generateCnmc(category: MatchableCategory, a: AttributeMap): string {
  const parts: string[] = ['IN', 'MAT'];
  switch (category) {
    case 'BEARING':
      parts.push('BRG', BEARING_ABBR[String(v(a, 'bearing_type'))] ?? 'GEN', s(v(a, 'designation') ?? 'NA'));
      if (v(a, 'seal_type') && v(a, 'seal_type') !== 'OPEN') parts.push(s(v(a, 'seal_type')));
      if (v(a, 'clearance')) parts.push(s(v(a, 'clearance')));
      if (v(a, 'bore_mm')) parts.push(`${num(v(a, 'bore_mm'))}X${num(v(a, 'outer_diameter_mm'))}X${num(v(a, 'width_mm'))}`);
      break;
    case 'VALVE':
      parts.push('VLV', s(v(a, 'valve_type') ?? 'GEN'), `DN${v(a, 'size_dn') ?? 'NA'}`, `CL${s(v(a, 'pressure_class') ?? 'NA')}`, s(v(a, 'body_material') ?? 'NA'));
      if (v(a, 'end_connection')) parts.push(END_ABBR[String(v(a, 'end_connection'))] ?? s(v(a, 'end_connection')));
      if (v(a, 'fire_safe') === 'API 607') parts.push('FS');
      break;
    case 'CABLE':
      parts.push(
        'CBL',
        CABLE_ABBR[String(v(a, 'cable_type'))] ?? 'GEN',
        `${num(v(a, 'voltage_grade_kv') ?? 0)}KV`,
        `${num(v(a, 'cores') ?? 0)}CX${num(v(a, 'cross_section_sqmm') ?? 0)}`,
        s(v(a, 'conductor') ?? 'NA'),
        s(v(a, 'insulation') ?? 'NA'),
      );
      if (v(a, 'armour')) parts.push(ARMOUR_ABBR[String(v(a, 'armour'))] ?? 'ARM');
      if (v(a, 'fire_performance')) parts.push(s(v(a, 'fire_performance')));
      break;
    case 'FASTENER':
      parts.push('FST', FASTENER_ABBR[String(v(a, 'fastener_type'))] ?? 'GEN', s(v(a, 'thread') ?? 'NA') + (v(a, 'length_mm') ? `X${num(v(a, 'length_mm'))}` : ''), s(v(a, 'grade') ?? 'NA'));
      if (v(a, 'finish')) parts.push(FINISH_ABBR[String(v(a, 'finish'))] ?? s(v(a, 'finish')));
      break;
    case 'PUMP':
      parts.push('PMP', PUMP_ABBR[String(v(a, 'pump_type'))] ?? 'GEN', `${num(v(a, 'flow_m3h') ?? 0)}M3H`, `${num(v(a, 'head_m') ?? 0)}M`);
      if (v(a, 'motor_kw')) parts.push(`${num(v(a, 'motor_kw'))}KW`);
      if (v(a, 'moc')) parts.push(s(v(a, 'moc')));
      if (v(a, 'motor_enclosure') === 'FLP') parts.push('FLP');
      break;
  }
  return parts.join('-');
}

export function canonicalDescription(category: MatchableCategory, a: AttributeMap): string {
  const out: string[] = [];
  switch (category) {
    case 'BEARING':
      out.push('BEARING', BEARING_WORDS[String(v(a, 'bearing_type'))] ?? 'GENERAL', String(v(a, 'designation') ?? ''));
      if (v(a, 'seal_type') === '2RS') out.push('DOUBLE SEALED 2RS');
      if (v(a, 'seal_type') === 'ZZ') out.push('DOUBLE SHIELDED ZZ');
      if (v(a, 'seal_type') === 'OPEN') out.push('OPEN');
      if (v(a, 'clearance')) out.push(`${v(a, 'clearance')} CLEARANCE`);
      if (v(a, 'bore_mm')) out.push(`${num(v(a, 'bore_mm'))}X${num(v(a, 'outer_diameter_mm'))}X${num(v(a, 'width_mm'))}MM`);
      if (v(a, 'cage')) out.push(`${v(a, 'cage')} CAGE`);
      break;
    case 'VALVE': {
      const dn = Number(v(a, 'size_dn'));
      out.push(
        'VALVE',
        String(v(a, 'valve_type') ?? 'GENERAL'),
        `${DN_TO_NPS[dn] ?? '?'}IN (DN${dn || '?'})`,
        `CLASS ${v(a, 'pressure_class') ?? '?'}`,
        MATERIAL_WORDS[String(v(a, 'body_material'))] ?? String(v(a, 'body_material') ?? ''),
      );
      if (v(a, 'end_connection')) out.push(END_WORDS[String(v(a, 'end_connection'))] ?? String(v(a, 'end_connection')));
      if (v(a, 'operation')) out.push(v(a, 'operation') === 'HANDWHEEL' ? 'HANDWHEEL' : `${v(a, 'operation')} OPERATED`);
      if (v(a, 'trim')) out.push(`TRIM ${String(v(a, 'trim')).replace('API TRIM ', '')}`);
      if (v(a, 'fire_safe') === 'API 607') out.push('FIRE SAFE API 607');
      if (v(a, 'design_standard')) out.push(String(v(a, 'design_standard')));
      break;
    }
    case 'CABLE':
      out.push(
        'CABLE',
        String(v(a, 'cable_type') ?? 'GENERAL'),
        `${num(v(a, 'voltage_grade_kv') ?? '?')}KV`,
        `${num(v(a, 'cores') ?? '?')}C X ${num(v(a, 'cross_section_sqmm') ?? '?')} SQMM`,
        v(a, 'conductor') === 'AL' ? 'ALUMINIUM' : v(a, 'conductor') === 'CU' ? 'COPPER' : '',
        String(v(a, 'insulation') ?? ''),
      );
      if (v(a, 'armour')) out.push(ARMOUR_WORDS[String(v(a, 'armour'))] ?? '');
      if (v(a, 'fire_performance')) out.push(String(v(a, 'fire_performance')));
      if (v(a, 'standard')) out.push(String(v(a, 'standard')));
      break;
    case 'FASTENER':
      out.push(FASTENER_WORDS[String(v(a, 'fastener_type'))] ?? 'FASTENER', `${v(a, 'thread') ?? '?'}${v(a, 'length_mm') ? ` X ${num(v(a, 'length_mm'))}MM` : ''}`, `GRADE ${v(a, 'grade') ?? '?'}`);
      if (v(a, 'finish')) out.push(String(v(a, 'finish')).replace(/_/g, ' '));
      if (v(a, 'standard')) out.push(String(v(a, 'standard')));
      break;
    case 'PUMP':
      out.push('PUMP', String(v(a, 'pump_type') ?? 'GENERAL'), `${num(v(a, 'flow_m3h') ?? '?')} M3/H @ ${num(v(a, 'head_m') ?? '?')} M HEAD`);
      if (v(a, 'motor_kw')) out.push(`${num(v(a, 'motor_kw'))} KW`);
      if (v(a, 'motor_enclosure')) out.push(v(a, 'motor_enclosure') === 'FLP' ? 'FLAMEPROOF MOTOR' : 'TEFC MOTOR');
      if (v(a, 'moc')) out.push(`MOC ${v(a, 'moc')}`);
      if (v(a, 'design_standard')) out.push(String(v(a, 'design_standard')));
      break;
  }
  return out.filter(Boolean).join(', ').replace(/_/g, ' ');
}

export function shortCode(prefix: string, seq: number): string {
  return `NMC-${prefix}-${String(seq).padStart(6, '0')}`;
}

/**
 * Merge attributes of records being unified: first-seen value per key is kept (the anchor record),
 * higher-confidence evidence for the SAME value upgrades confidence; gaps are filled from other records.
 * A conflicting value is never silently overwritten.
 */
export function mergeAttributes(sets: AttributeMap[]): AttributeMap {
  const out: AttributeMap = {};
  for (const set of sets) {
    for (const [k, attr] of Object.entries(set)) {
      if (k === 'manufacturer') continue;
      const cur = out[k];
      if (!cur) out[k] = attr;
      else if (String(cur.value) === String(attr.value) && attr.confidence > cur.confidence) out[k] = attr;
      // an underspecified value (CS, ARMOURED, FLANGED…) is refined by a compatible specific one (CS-WCB, STRIP, FLANGED_RF)
      else if (isGenericOf(String(cur.value).toUpperCase(), String(attr.value).toUpperCase())) out[k] = attr;
    }
  }
  return out;
}
