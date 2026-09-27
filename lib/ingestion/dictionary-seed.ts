/**
 * Seed abbreviation & synonym dictionary (version 1).
 * Curated from common Indian CPSE SAP short-text conventions (40-char MAKTX constraint),
 * IS / ASME / API nomenclature and plant stores practice.
 *
 * kind:
 *   ABBREVIATION → expanded in the normalized description (e.g. VLV → VALVE)
 *   SYNONYM      → rewritten to the canonical vocabulary (e.g. NON RETURN VALVE → CHECK VALVE)
 * category: when set, the entry only applies once the record is classified into that category
 *           (resolves ambiguous abbreviations such as HD = HEAD in pumps).
 */
export interface DictionaryEntry {
  term: string;
  expansion: string;
  kind: 'ABBREVIATION' | 'SYNONYM';
  category: string | null;
}

const A = (term: string, expansion: string, category: string | null = null): DictionaryEntry => ({ term, expansion, kind: 'ABBREVIATION', category });
const S = (term: string, expansion: string, category: string | null = null): DictionaryEntry => ({ term, expansion, kind: 'SYNONYM', category });

export const DICTIONARY_SEED: DictionaryEntry[] = [
  // ── Generic material nouns
  A('BRG', 'BEARING'), A('BRGS', 'BEARING'), A('BRNG', 'BEARING'), A('BEARINGS', 'BEARING'),
  A('VLV', 'VALVE'), A('VLVS', 'VALVE'), A('V/V', 'VALVE'), A('VALVES', 'VALVE'),
  A('CBL', 'CABLE'), A('CABL', 'CABLE'), A('CABLES', 'CABLE'),
  A('PMP', 'PUMP'), A('PUMPSET', 'PUMP SET'),
  A('BLT', 'BOLT'), A('BOLTS', 'BOLT'), A('HHB', 'HEX HEAD BOLT'), A('WSHR', 'WASHER'), A('WASHR', 'WASHER'),
  A('SCRW', 'SCREW'), A('SHCS', 'SOCKET HEAD CAP SCREW'), A('NUTS', 'NUT'), A('STUDS', 'STUD'),
  // ── Bearings
  A('DGBB', 'DEEP GROOVE BALL BEARING'), A('DG', 'DEEP GROOVE'), A('SRB', 'SPHERICAL ROLLER BEARING'),
  A('SPH', 'SPHERICAL'), A('CRB', 'CYLINDRICAL ROLLER BEARING'), A('CYL', 'CYLINDRICAL'), A('TRB', 'TAPER ROLLER BEARING'),
  A('TPR', 'TAPER'), A('ACBB', 'ANGULAR CONTACT BALL BEARING'), A('ANG', 'ANGULAR'), A('CONT', 'CONTACT', 'BEARING'),
  A('RLR', 'ROLLER'), A('BRS', 'BRASS'), A('BRZ', 'BRONZE'), A('POLYAMIDE', 'POLYAMIDE'),
  // ── Valves
  A('GT', 'GATE'), A('GLB', 'GLOBE'), A('BFV', 'BUTTERFLY VALVE'), A('BTFY', 'BUTTERFLY'), A('BTRFLY', 'BUTTERFLY'),
  A('NRV', 'NON RETURN VALVE'), A('CHK', 'CHECK'), A('NB', 'NOMINAL BORE'), A('RF', 'RAISED FACE'), A('FF', 'FLAT FACE'),
  A('RTJ', 'RING TYPE JOINT'), A('FLGD', 'FLANGED'), A('FLG', 'FLANGED'), A('FLGE', 'FLANGED'), A('FLNG', 'FLANGED'),
  A('BW', 'BUTT WELD'), A('BWE', 'BUTT WELD'), A('SW', 'SOCKET WELD'), A('SWE', 'SOCKET WELD'), A('SCRD', 'SCREWED'),
  A('THRD', 'THREADED'), A('HW', 'HANDWHEEL'), A('H/W', 'HANDWHEEL'), A('GO', 'GEAR OPERATED', 'VALVE'), A('GR OPTD', 'GEAR OPERATED'),
  A('LO', 'LEVER OPERATED', 'VALVE'), A('LVR', 'LEVER'), A('MOV', 'MOTOR OPERATED VALVE'), A('ACTR', 'ACTUATOR'),
  A('FB', 'FULL BORE', 'VALVE'), A('RB', 'REDUCED BORE', 'VALVE'), A('SCH', 'SCHEDULE'), A('TRM', 'TRIM'),
  // ── Materials
  A('CS', 'CARBON STEEL'), A('SS', 'STAINLESS STEEL'), A('CI', 'CAST IRON'), A('DI', 'DUCTILE IRON'), A('MS', 'MILD STEEL'),
  A('GI', 'GALVANISED IRON'), A('LTCS', 'LOW TEMPERATURE CARBON STEEL'), A('GM', 'GUN METAL'),
  A('CU', 'COPPER'), A('AL', 'ALUMINIUM'), A('ALU', 'ALUMINIUM'), A('ALUM', 'ALUMINIUM'), A('CST STL', 'CAST STEEL'),
  // ── Cables
  A('PWR', 'POWER'), A('CTRL', 'CONTROL'), A('CNTRL', 'CONTROL'), A('INSTR', 'INSTRUMENTATION'), A('INST', 'INSTRUMENTATION', 'CABLE'),
  A('ARMD', 'ARMOURED'), A('ARMRD', 'ARMOURED'), A('ARM', 'ARMOURED', 'CABLE'), A('UNARMD', 'UNARMOURED'),
  A('SWA', 'STEEL WIRE ARMOURED'), A('GSWA', 'STEEL WIRE ARMOURED'), A('GSFA', 'STEEL STRIP ARMOURED'), A('STRIP ARMD', 'STEEL STRIP ARMOURED'),
  A('FRLS', 'FIRE RETARDANT LOW SMOKE'), A('FRLSH', 'FIRE RETARDANT LOW SMOKE HALOGEN'), A('LSZH', 'LOW SMOKE ZERO HALOGEN'),
  A('XLPE', 'CROSS LINKED POLYETHYLENE'), A('COND', 'CONDUCTOR'), A('INSUL', 'INSULATED'), A('HT', 'HIGH TENSION', 'CABLE'),
  A('LT', 'LOW TENSION', 'CABLE'), A('SQ.MM', 'SQMM'), A('SQ MM', 'SQMM'), A('SQ. MM', 'SQMM'), A('MM2', 'SQMM'),
  // ── Fasteners
  A('HDG', 'HOT DIP GALVANISED'), A('GALV', 'GALVANISED'), A('ZP', 'ZINC PLATED'), A('ZN PLTD', 'ZINC PLATED'), A('PLTD', 'PLATED'),
  A('BLK', 'BLACK'), A('GR', 'GRADE'), A('GR.', 'GRADE'), A('PROP CL', 'PROPERTY CLASS'), A('W/', 'WITH'), A('W/O', 'WITHOUT'),
  // ── Pumps
  A('CENT', 'CENTRIFUGAL'), A('CENTF', 'CENTRIFUGAL'), A('CENTRI', 'CENTRIFUGAL'), A('SUBM', 'SUBMERSIBLE'), A('SUBMERS', 'SUBMERSIBLE'),
  A('RECIP', 'RECIPROCATING'), A('DWT', 'DEWATERING'), A('MOC', 'MATERIAL OF CONSTRUCTION'), A('FLP', 'FLAMEPROOF'),
  A('TEFC', 'TOTALLY ENCLOSED FAN COOLED'), A('MOT', 'MOTOR'), A('HD', 'HEAD', 'PUMP'), A('CAP', 'CAPACITY', 'PUMP'),
  A('M3/HR', 'M3/H'), A('CUM/HR', 'M3/H'), A('M3PH', 'M3/H'), A('MECH SEAL', 'MECHANICAL SEAL'), A('M/SEAL', 'MECHANICAL SEAL'),
  A('GLD PKG', 'GLAND PACKING'),
  // ── General purchasing / stores vocabulary
  A('ASSY', 'ASSEMBLY'), A('SPL', 'SPECIAL'), A('STD', 'STANDARD'), A('SPEC', 'SPECIFICATION'), A('DRG', 'DRAWING'),
  A('MFR', 'MANUFACTURER'), A('MFG', 'MANUFACTURER'), A('MK', 'MAKE'), A('DIA', 'DIAMETER'), A('THK', 'THICKNESS'),
  A('LG', 'LENGTH'), A('LGTH', 'LENGTH'), A('QTY', 'QUANTITY'), A('APPROX', 'APPROXIMATELY'), A('EQUIV', 'EQUIVALENT'),
  A('EQV', 'EQUIVALENT'), A('REQD', 'REQUIRED'), A('ACC', 'ACCORDING'),
  // ── Synonyms → canonical vocabulary
  S('NON RETURN VALVE', 'CHECK VALVE'), S('SWING CHECK', 'CHECK'), S('HEXAGONAL', 'HEX'), S('HEXAGON', 'HEX'),
  S('GALVANIZED', 'GALVANISED'), S('ALUMINUM', 'ALUMINIUM'), S('ARMORED', 'ARMOURED'), S('TAPERED', 'TAPER'),
  S('DEEP GROOVE BALL BEARING BEARING', 'DEEP GROOVE BALL BEARING'), S('BALL BEARING DEEP GROOVE', 'DEEP GROOVE BALL BEARING'),
  S('PUMP SET', 'PUMP'), S('PUMPING SET', 'PUMP'), S('METER', 'METRE'), S('CENTRES', 'CENTERS'),
];
