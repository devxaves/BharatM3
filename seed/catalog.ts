/**
 * Synthetic CPSE material catalogue generator (PRD §9).
 *
 * 1. Builds a ground-truth catalogue of physical materials (bearings, valves, cables, fasteners, pumps).
 * 2. Renders each material into 1–5 CPSE-specific ERP records, each in that CPSE's own description dialect,
 *    unit conventions and code format — with deliberate noise: abbreviations, reordered words, missing attributes,
 *    mixed UOMs, 40-char SAP truncation, intra-CPSE duplicate codes, underspecified records and "false friends"
 *    (same text shape, different pressure class / grade / voltage / certification).
 * 3. Adds records with insufficient data and unclassifiable items (spares / consumables).
 *
 * Fully deterministic (seeded PRNG) so the seed is re-runnable and the evaluation reproducible.
 * All organisations' data is SYNTHETIC — no real CPSE records are used.
 */

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Rng = () => number;
const pick = <T,>(rng: Rng, xs: T[]): T => xs[Math.floor(rng() * xs.length)];
const chance = (rng: Rng, p: number) => rng() < p;

// ──────────────────────────────────────────────────────────────────────────────
// Organisations & source systems
// ──────────────────────────────────────────────────────────────────────────────
export interface OrgSeed {
  code: string;
  name: string;
  sector: string;
  ministry: string;
  hq: string;
  system: { name: string; type: string; version: string; client: string };
}

export const ORGS: OrgSeed[] = [
  { code: 'CPCL', name: 'Chennai Petroleum Corporation Ltd', sector: 'Oil & Gas — Refining', ministry: 'MoPNG', hq: 'Chennai', system: { name: 'CPCL SAP ECC', type: 'SAP_ECC', version: 'ECC 6.0 EHP8', client: '300' } },
  { code: 'NTPC', name: 'NTPC Ltd', sector: 'Power', ministry: 'Ministry of Power', hq: 'New Delhi', system: { name: 'NTPC S/4HANA', type: 'SAP_S4HANA', version: 'S/4HANA 2022 FPS02', client: '100' } },
  { code: 'SAIL', name: 'Steel Authority of India Ltd', sector: 'Steel', ministry: 'Ministry of Steel', hq: 'New Delhi', system: { name: 'SAIL SAP ECC (BSL/RSP)', type: 'SAP_ECC', version: 'ECC 6.0 EHP7', client: '500' } },
  { code: 'CIL', name: 'Coal India Ltd', sector: 'Mining', ministry: 'Ministry of Coal', hq: 'Kolkata', system: { name: 'CIL Oracle EBS', type: 'ORACLE_EBS', version: 'EBS R12.2', client: 'INV' } },
  { code: 'BHEL', name: 'Bharat Heavy Electricals Ltd', sector: 'Heavy Engineering', ministry: 'Ministry of Heavy Industries', hq: 'New Delhi', system: { name: 'BHEL S/4HANA', type: 'SAP_S4HANA', version: 'S/4HANA 2021', client: '200' } },
  { code: 'IOCL', name: 'Indian Oil Corporation Ltd', sector: 'Oil & Gas — Refining & Marketing', ministry: 'MoPNG', hq: 'New Delhi', system: { name: 'IOCL SAP (onboarding via file upload)', type: 'CSV', version: 'Excel/CSV extract', client: '—' } },
];
export const SEEDED_ORGS = ['CPCL', 'NTPC', 'SAIL', 'CIL', 'BHEL'] as const;
type OrgCode = (typeof SEEDED_ORGS)[number] | 'IOCL';

// ──────────────────────────────────────────────────────────────────────────────
// Ground-truth material specs
// ──────────────────────────────────────────────────────────────────────────────
interface BearingSpec { cat: 'BEARING'; type: 'DGBB' | 'CRB' | 'SRB' | 'TRB' | 'ACBB'; d: string; seal: '2RS' | 'ZZ' | 'OPEN'; clr: 'C3' | 'CN' | null; price: number }
interface ValveSpec { cat: 'VALVE'; type: 'GATE' | 'GLOBE' | 'BALL' | 'CHECK' | 'BUTTERFLY'; inch: string; cls: string; body: 'WCB' | 'A105' | 'CF8M' | 'CF8' | 'F316' | 'DI'; ends: 'RF' | 'SW' | 'NPT' | 'WAFER'; op: 'HW' | 'GEAR' | 'LEVER' | 'SELF'; std: string; fs?: boolean; price: number }
interface CableSpec { cat: 'CABLE'; type: 'POWER' | 'CONTROL'; kv: number; cores: number; sec: number; cond: 'AL' | 'CU'; ins: 'XLPE' | 'PVC'; arm: 'WIRE' | 'STRIP'; fire?: 'FRLS' | 'LSZH'; price: number }
interface FastenerSpec { cat: 'FASTENER'; type: 'BOLT' | 'STUD' | 'NUT'; dia: string; pitch?: number; len?: number; grade: string; finish: 'HDG' | 'ZP' | 'BLACK' | 'PTFE'; price: number }
interface PumpSpec { cat: 'PUMP'; type: 'CENTRIFUGAL' | 'SUBMERSIBLE'; flow: number; head: number; kw: number; moc: 'CI' | 'SS316' | 'SS304' | 'CS'; encl: 'FLP' | 'TEFC'; std: string; make: string; price: number }
export type Spec = BearingSpec | ValveSpec | CableSpec | FastenerSpec | PumpSpec;

export interface Material {
  key: string;
  spec: Spec;
  /** force presence in these orgs (demo clusters) */
  forceOrgs?: OrgCode[];
}

const DIMS: Record<string, [number, number, number]> = {
  '6204': [20, 47, 14], '6205': [25, 52, 15], '6206': [30, 62, 16], '6207': [35, 72, 17], '6208': [40, 80, 18], '6209': [45, 85, 19],
  '6210': [50, 90, 20], '6305': [25, 62, 17], '6306': [30, 72, 19], '6307': [35, 80, 21], '6308': [40, 90, 23], '6310': [50, 110, 27],
  '6312': [60, 130, 31], NU205: [25, 52, 15], NU206: [30, 62, 16], NU308: [40, 90, 23], NU310: [50, 110, 27], NJ308: [40, 90, 23],
  NU312: [60, 130, 31], '22210': [50, 90, 23], '22212': [60, 110, 28], '22216': [80, 140, 33], '22220': [100, 180, 46], '22312': [60, 130, 46],
  '30205': [25, 52, 16.25], '30208': [40, 80, 19.75], '30210': [50, 90, 21.75], '32210': [50, 90, 24.75], '7205': [25, 52, 15], '7308': [40, 90, 23], '7310': [50, 110, 27],
};

export function buildCatalogue(): Material[] {
  const m: Material[] = [];
  const add = (key: string, spec: Spec, forceOrgs?: OrgCode[]) => m.push({ key, spec, forceOrgs });

  // Bearings ────────────────────────────────────────────────────────────────
  const dg: [string, BearingSpec['seal'], BearingSpec['clr'], number][] = [
    ['6205', '2RS', 'C3', 420], ['6205', 'ZZ', 'C3', 390], ['6205', 'OPEN', 'C3', 350], ['6205', '2RS', 'CN', 400],
    ['6206', '2RS', 'C3', 560], ['6206', 'ZZ', 'C3', 520], ['6207', '2RS', 'C3', 760], ['6208', 'ZZ', 'C3', 940], ['6208', '2RS', 'C3', 980],
    ['6209', 'OPEN', 'C3', 1080], ['6210', '2RS', 'C3', 1350], ['6305', 'ZZ', 'C3', 690], ['6306', '2RS', 'C3', 880], ['6307', 'OPEN', 'C3', 1150],
    ['6308', '2RS', 'C3', 1480], ['6308', 'OPEN', 'C3', 1320], ['6310', 'OPEN', 'C3', 2350], ['6310', 'ZZ', 'C3', 2480], ['6312', 'OPEN', 'C3', 3900], ['6204', '2RS', 'CN', 310],
  ];
  for (const [d, seal, clr, price] of dg) add(`BRG-${d}-${seal}-${clr}`, { cat: 'BEARING', type: 'DGBB', d, seal, clr, price }, d === '6205' && seal === '2RS' && clr === 'C3' ? ['CPCL', 'NTPC', 'SAIL', 'CIL', 'BHEL'] : undefined);
  for (const [d, price] of [['NU205', 1900], ['NU206', 2300], ['NU308', 4600], ['NU310', 6900], ['NJ308', 4900], ['NU312', 9800]] as const)
    add(`BRG-${d}`, { cat: 'BEARING', type: 'CRB', d, seal: 'OPEN', clr: 'C3', price }, d === 'NU310' ? ['CPCL', 'NTPC', 'SAIL', 'BHEL'] : undefined);
  for (const [d, price] of [['22210', 7800], ['22212', 10400], ['22216', 18900], ['22220', 36500], ['22312', 24800]] as const)
    add(`BRG-${d}`, { cat: 'BEARING', type: 'SRB', d, seal: 'OPEN', clr: 'C3', price }, d === '22216' ? ['NTPC', 'SAIL', 'CIL', 'BHEL'] : undefined);
  for (const [d, price] of [['30205', 980], ['30208', 1900], ['30210', 2600], ['32210', 3100]] as const) add(`BRG-${d}`, { cat: 'BEARING', type: 'TRB', d, seal: 'OPEN', clr: null, price });
  for (const [d, price] of [['7205', 2100], ['7308', 5200], ['7310', 7400]] as const) add(`BRG-${d}`, { cat: 'BEARING', type: 'ACBB', d, seal: 'OPEN', clr: null, price });

  // Valves ──────────────────────────────────────────────────────────────────
  const gatePrice: Record<string, number> = { '2': 21000, '3': 32000, '4': 46000, '6': 78000, '8': 128000 };
  for (const inch of ['2', '3', '4', '6', '8'])
    add(`VLV-GATE-${inch}-150-WCB`, { cat: 'VALVE', type: 'GATE', inch, cls: '150', body: 'WCB', ends: 'RF', op: inch === '8' ? 'GEAR' : 'HW', std: 'API 600', price: gatePrice[inch] }, inch === '4' ? ['CPCL', 'NTPC', 'SAIL', 'CIL', 'BHEL'] : undefined);
  add('VLV-GATE-4-300-WCB', { cat: 'VALVE', type: 'GATE', inch: '4', cls: '300', body: 'WCB', ends: 'RF', op: 'HW', std: 'API 600', price: 64000 }, ['CPCL', 'NTPC', 'BHEL']);
  add('VLV-GATE-6-300-WCB', { cat: 'VALVE', type: 'GATE', inch: '6', cls: '300', body: 'WCB', ends: 'RF', op: 'HW', std: 'API 600', price: 108000 });
  add('VLV-GATE-2-150-CF8M', { cat: 'VALVE', type: 'GATE', inch: '2', cls: '150', body: 'CF8M', ends: 'RF', op: 'HW', std: 'API 600', price: 52000 }, ['CPCL', 'NTPC']);
  for (const inch of ['1/2', '3/4', '1', '1-1/2'])
    add(`VLV-GATE-${inch}-800-A105`, { cat: 'VALVE', type: 'GATE', inch, cls: '800', body: 'A105', ends: 'SW', op: 'HW', std: 'API 602', price: { '1/2': 2400, '3/4': 2900, '1': 3800, '1-1/2': 6200 }[inch]! });
  add('VLV-GATE-1-800-A105-NPT', { cat: 'VALVE', type: 'GATE', inch: '1', cls: '800', body: 'A105', ends: 'NPT', op: 'HW', std: 'API 602', price: 3700 });
  add('VLV-GATE-1-800-F316', { cat: 'VALVE', type: 'GATE', inch: '1', cls: '800', body: 'F316', ends: 'SW', op: 'HW', std: 'API 602', price: 9800 });
  for (const inch of ['2', '3', '4']) add(`VLV-GLOBE-${inch}-150-WCB`, { cat: 'VALVE', type: 'GLOBE', inch, cls: '150', body: 'WCB', ends: 'RF', op: 'HW', std: 'BS 1873', price: { '2': 26000, '3': 39000, '4': 56000 }[inch]! });
  add('VLV-GLOBE-2-300-WCB', { cat: 'VALVE', type: 'GLOBE', inch: '2', cls: '300', body: 'WCB', ends: 'RF', op: 'HW', std: 'BS 1873', price: 34000 });
  for (const inch of ['1', '2', '3', '4'])
    add(`VLV-BALL-${inch}-150-CF8M`, { cat: 'VALVE', type: 'BALL', inch, cls: '150', body: 'CF8M', ends: 'RF', op: inch === '4' ? 'GEAR' : 'LEVER', std: 'API 6D', fs: true, price: { '1': 14000, '2': 29000, '3': 47000, '4': 69000 }[inch]! }, inch === '2' ? ['CPCL', 'NTPC', 'SAIL', 'BHEL'] : undefined);
  add('VLV-BALL-2-150-CF8', { cat: 'VALVE', type: 'BALL', inch: '2', cls: '150', body: 'CF8', ends: 'RF', op: 'LEVER', std: 'API 6D', fs: true, price: 25000 }, ['SAIL', 'CIL']);
  add('VLV-BALL-3-300-WCB', { cat: 'VALVE', type: 'BALL', inch: '3', cls: '300', body: 'WCB', ends: 'RF', op: 'LEVER', std: 'API 6D', fs: true, price: 58000 });
  for (const inch of ['2', '4', '6']) add(`VLV-CHECK-${inch}-150-WCB`, { cat: 'VALVE', type: 'CHECK', inch, cls: '150', body: 'WCB', ends: 'RF', op: 'SELF', std: 'BS 1868', price: { '2': 17000, '4': 36000, '6': 61000 }[inch]! });
  add('VLV-CHECK-4-300-WCB', { cat: 'VALVE', type: 'CHECK', inch: '4', cls: '300', body: 'WCB', ends: 'RF', op: 'SELF', std: 'BS 1868', price: 49000 });
  for (const inch of ['6', '8', '10', '12']) add(`VLV-BFLY-${inch}-150-DI`, { cat: 'VALVE', type: 'BUTTERFLY', inch, cls: '150', body: 'DI', ends: 'WAFER', op: 'GEAR', std: 'API 609', price: { '6': 24000, '8': 33000, '10': 45000, '12': 61000 }[inch]! });

  // Cables ──────────────────────────────────────────────────────────────────
  for (const [sec, price] of [[25, 210], [35, 260], [50, 330], [70, 420], [95, 540], [120, 660], [185, 980], [240, 1260], [300, 1560]] as const)
    add(`CBL-1.1-3.5x${sec}-AL`, { cat: 'CABLE', type: 'POWER', kv: 1.1, cores: 3.5, sec, cond: 'AL', ins: 'XLPE', arm: 'STRIP', price }, sec === 95 ? ['CPCL', 'NTPC', 'SAIL', 'CIL', 'BHEL'] : sec === 240 ? ['NTPC', 'SAIL', 'CIL', 'BHEL'] : undefined);
  for (const [sec, price] of [[2.5, 120], [4, 165], [6, 225], [10, 340], [16, 520]] as const)
    add(`CBL-1.1-4x${sec}-CU`, { cat: 'CABLE', type: 'POWER', kv: 1.1, cores: 4, sec, cond: 'CU', ins: 'XLPE', arm: 'WIRE', price });
  add('CBL-1.1-4x16-AL', { cat: 'CABLE', type: 'POWER', kv: 1.1, cores: 4, sec: 16, cond: 'AL', ins: 'XLPE', arm: 'WIRE', price: 190 }, ['SAIL', 'CIL']);
  for (const [sec, price] of [[95, 1450], [185, 2150], [240, 2600], [300, 3100]] as const)
    add(`CBL-11-3x${sec}-AL`, { cat: 'CABLE', type: 'POWER', kv: 11, cores: 3, sec, cond: 'AL', ins: 'XLPE', arm: 'STRIP', price }, sec === 240 ? ['NTPC', 'CIL', 'BHEL'] : undefined);
  for (const [sec, price] of [[185, 1750], [240, 2150]] as const) add(`CBL-6.6-3x${sec}-AL`, { cat: 'CABLE', type: 'POWER', kv: 6.6, cores: 3, sec, cond: 'AL', ins: 'XLPE', arm: 'STRIP', price }, sec === 240 ? ['NTPC', 'SAIL'] : undefined);
  for (const [cores, sec, price] of [[4, 1.5, 95], [7, 1.5, 140], [12, 1.5, 210], [19, 1.5, 310], [4, 2.5, 125], [12, 2.5, 290]] as const)
    add(`CBL-CTRL-${cores}x${sec}`, { cat: 'CABLE', type: 'CONTROL', kv: 1.1, cores, sec, cond: 'CU', ins: 'PVC', arm: 'WIRE', fire: 'FRLS', price }, cores === 12 && sec === 1.5 ? ['CPCL', 'NTPC', 'SAIL', 'BHEL'] : undefined);
  add('CBL-CTRL-12x1.5-LSZH', { cat: 'CABLE', type: 'CONTROL', kv: 1.1, cores: 12, sec: 1.5, cond: 'CU', ins: 'PVC', arm: 'WIRE', fire: 'LSZH', price: 260 }, ['CPCL', 'NTPC']);

  // Fasteners ───────────────────────────────────────────────────────────────
  for (const [dia, len, price] of [['M12', 50, 18], ['M16', 60, 36], ['M16', 80, 42], ['M20', 80, 74], ['M20', 100, 86], ['M24', 120, 150]] as const)
    add(`FST-BOLT-${dia}x${len}-8.8-HDG`, { cat: 'FASTENER', type: 'BOLT', dia, len, grade: '8.8', finish: 'HDG', price }, dia === 'M16' && len === 80 ? ['CPCL', 'NTPC', 'SAIL', 'CIL', 'BHEL'] : undefined);
  add('FST-BOLT-M16x80-10.9-HDG', { cat: 'FASTENER', type: 'BOLT', dia: 'M16', len: 80, grade: '10.9', finish: 'HDG', price: 61 }, ['NTPC', 'BHEL']);
  add('FST-BOLT-M16x80-8.8-ZP', { cat: 'FASTENER', type: 'BOLT', dia: 'M16', len: 80, grade: '8.8', finish: 'ZP', price: 38 }, ['SAIL', 'CIL']);
  add('FST-BOLT-M12x50-SS304', { cat: 'FASTENER', type: 'BOLT', dia: 'M12', len: 50, grade: 'SS304', finish: 'BLACK', price: 55 }, ['CPCL', 'SAIL']);
  add('FST-BOLT-M12x50-SS316', { cat: 'FASTENER', type: 'BOLT', dia: 'M12', len: 50, grade: 'SS316', finish: 'BLACK', price: 78 }, ['CPCL', 'NTPC']);
  add('FST-BOLT-M20x1.5x80-8.8', { cat: 'FASTENER', type: 'BOLT', dia: 'M20', pitch: 1.5, len: 80, grade: '8.8', finish: 'HDG', price: 96 }, ['BHEL', 'NTPC']);
  for (const [dia, len, price] of [['1/2', 75, 48], ['5/8', 90, 72], ['5/8', 110, 84], ['3/4', 110, 118], ['3/4', 130, 132], ['7/8', 150, 196]] as const)
    add(`FST-STUD-${dia}x${len}-B7`, { cat: 'FASTENER', type: 'STUD', dia, len, grade: 'B7', finish: 'BLACK', price }, dia === '5/8' && len === 110 ? ['CPCL', 'NTPC', 'BHEL', 'SAIL'] : undefined);
  add('FST-STUD-5/8x110-B7-PTFE', { cat: 'FASTENER', type: 'STUD', dia: '5/8', len: 110, grade: 'B7', finish: 'PTFE', price: 118 }, ['CPCL', 'BHEL']);
  add('FST-STUD-M16x110-B7', { cat: 'FASTENER', type: 'STUD', dia: 'M16', len: 110, grade: 'B7', finish: 'BLACK', price: 80 }, ['NTPC', 'SAIL']);
  for (const [dia, grade, price] of [['M16', '8', 9], ['M20', '8', 15], ['M24', '10', 28]] as const)
    add(`FST-NUT-${dia}-${grade}`, { cat: 'FASTENER', type: 'NUT', dia, grade, finish: 'HDG', price });

  // Pumps ───────────────────────────────────────────────────────────────────
  const pumps: [string, PumpSpec][] = [
    ['PMP-C-25x32-SS316', { cat: 'PUMP', type: 'CENTRIFUGAL', flow: 25, head: 32, kw: 5.5, moc: 'SS316', encl: 'TEFC', std: 'ISO 5199', make: 'KSB', price: 185000 }],
    ['PMP-C-25x32-SS304', { cat: 'PUMP', type: 'CENTRIFUGAL', flow: 25, head: 32, kw: 5.5, moc: 'SS304', encl: 'TEFC', std: 'ISO 5199', make: 'KIRLOSKAR', price: 162000 }],
    ['PMP-C-50x40-CI-FLP', { cat: 'PUMP', type: 'CENTRIFUGAL', flow: 50, head: 40, kw: 7.5, moc: 'CI', encl: 'FLP', std: 'IS 5120', make: 'KIRLOSKAR', price: 142000 }],
    ['PMP-C-50x40-CI-TEFC', { cat: 'PUMP', type: 'CENTRIFUGAL', flow: 50, head: 40, kw: 7.5, moc: 'CI', encl: 'TEFC', std: 'IS 5120', make: 'KIRLOSKAR', price: 98000 }],
    ['PMP-C-50x40-SS316-TEFC', { cat: 'PUMP', type: 'CENTRIFUGAL', flow: 50, head: 40, kw: 7.5, moc: 'SS316', encl: 'TEFC', std: 'ISO 5199', make: 'KSB', price: 212000 }],
    ['PMP-C-100x50-CI', { cat: 'PUMP', type: 'CENTRIFUGAL', flow: 100, head: 50, kw: 22, moc: 'CI', encl: 'TEFC', std: 'IS 5120', make: 'KSB', price: 265000 }],
    ['PMP-C-200x40-CI', { cat: 'PUMP', type: 'CENTRIFUGAL', flow: 200, head: 40, kw: 37, moc: 'CI', encl: 'TEFC', std: 'IS 5120', make: 'WPIL', price: 410000 }],
    ['PMP-C-10x20-CI', { cat: 'PUMP', type: 'CENTRIFUGAL', flow: 10, head: 20, kw: 1.5, moc: 'CI', encl: 'TEFC', std: 'IS 5120', make: 'CROMPTON', price: 38000 }],
    ['PMP-C-150x80-CS-API', { cat: 'PUMP', type: 'CENTRIFUGAL', flow: 150, head: 80, kw: 55, moc: 'CS', encl: 'FLP', std: 'API 610', make: 'FLOWSERVE', price: 1450000 }],
    ['PMP-S-100x50', { cat: 'PUMP', type: 'SUBMERSIBLE', flow: 100, head: 50, kw: 22, moc: 'CI', encl: 'TEFC', std: 'IS 8034', make: 'KIRLOSKAR', price: 235000 }],
    ['PMP-S-200x60', { cat: 'PUMP', type: 'SUBMERSIBLE', flow: 200, head: 60, kw: 45, moc: 'CI', encl: 'TEFC', std: 'IS 8034', make: 'KSB', price: 520000 }],
  ];
  for (const [key, spec] of pumps)
    add(key, spec, key === 'PMP-C-50x40-CI-FLP' ? ['CPCL', 'NTPC', 'SAIL', 'BHEL'] : key === 'PMP-S-100x50' ? ['CIL', 'SAIL', 'NTPC'] : key === 'PMP-C-50x40-CI-TEFC' ? ['SAIL', 'CIL'] : undefined);

  return m;
}

// ──────────────────────────────────────────────────────────────────────────────
// Renderers — one ERP dialect per CPSE
// ──────────────────────────────────────────────────────────────────────────────
export interface RenderedRecord {
  description: string;
  longText?: string;
  uom: string;
  manufacturer?: string;
  partNumber?: string;
  materialGroup: string;
}

const inchToNb: Record<string, number> = { '1/2': 15, '3/4': 20, '1': 25, '1-1/2': 40, '2': 50, '3': 80, '4': 100, '6': 150, '8': 200, '10': 250, '12': 300 };
const classToPn: Record<string, string> = { '150': 'PN20', '300': 'PN50', '600': 'PN100' };
const bearingMakes = ['SKF', 'FAG', 'NSK', 'NBC', 'TIMKEN'];

function bearingMpn(make: string, s: BearingSpec): string {
  const d = s.d;
  const clr = s.clr ?? '';
  if (s.type !== 'DGBB') {
    if (make === 'SKF') return { CRB: `${d} ECP/C3`, SRB: `${d} E/C3`, TRB: `${d} J2/Q`, ACBB: `${d} BECBP` }[s.type] ?? d;
    if (make === 'FAG') return { CRB: `${d}-E-XL-TVP2-C3`, SRB: `${d}-E1-XL-C3`, TRB: `${d}-XL`, ACBB: `${d}-B-XL-TVP` }[s.type] ?? d;
    return d;
  }
  switch (make) {
    case 'SKF':
      return s.seal === '2RS' ? `${d}-2RSH${clr ? '/' + clr : ''}` : s.seal === 'ZZ' ? `${d}-2Z${clr ? '/' + clr : ''}` : `${d}${clr ? '/' + clr : ''}`;
    case 'FAG':
      return s.seal === '2RS' ? `${d}-2RSR${clr ? '-' + clr : ''}` : s.seal === 'ZZ' ? `${d}-2ZR${clr ? '-' + clr : ''}` : `${d}${clr ? '-' + clr : ''}`;
    case 'NSK':
      return s.seal === '2RS' ? `${d}DDU${clr}` : s.seal === 'ZZ' ? `${d}ZZ${clr}` : `${d}${clr}`;
    default:
      return `${d}${s.seal !== 'OPEN' ? ' ' + s.seal : ''}${clr ? ' ' + clr : ''}`;
  }
}

function renderBearing(org: OrgCode, s: BearingSpec, rng: Rng, make: string): RenderedRecord {
  const [bi, od, w] = DIMS[s.d] ?? [0, 0, 0];
  const sealDash = s.seal === 'OPEN' ? '' : `-${s.seal}`;
  const clr = s.clr && chance(rng, org === 'CIL' || org === 'SAIL' ? 0.8 : 0.95) ? s.clr : null;
  const typeWords = { DGBB: 'BALL, DEEP GROOVE', CRB: 'ROLLER, CYLINDRICAL', SRB: 'ROLLER, SPHERICAL', TRB: 'ROLLER, TAPER', ACBB: 'BALL, ANGULAR CONTACT' }[s.type];
  const mixed = { DGBB: 'Deep Groove Ball Bearing', CRB: 'Cylindrical Roller Bearing', SRB: 'Spherical Roller Bearing', TRB: 'Taper Roller Bearing', ACBB: 'Angular Contact Ball Bearing' }[s.type];
  const withMpn = chance(rng, 0.55);
  const base = { manufacturer: withMpn ? make : undefined, partNumber: withMpn ? bearingMpn(make, s) : undefined, materialGroup: 'BRG' };
  switch (org) {
    case 'CPCL':
      return { ...base, description: `BRG,${s.type},${s.d}${sealDash}${clr ? ',' + clr : ''}`, longText: withMpn ? `${make} ${bearingMpn(make, s)} OR EQUIVALENT` : undefined, uom: 'EA', materialGroup: 'M1203' };
    case 'NTPC':
      return { ...base, description: `BEARING, ${typeWords}, ${s.d}${sealDash}${clr ? `, ${clr} CLEARANCE` : ''}, ${bi}X${od}X${w}MM`, uom: pick(rng, ['NOS', 'EA']), materialGroup: 'MBRG01' };
    case 'SAIL': {
      const sealTxt = s.seal === 'OPEN' ? '' : ` ${s.seal}`;
      const name = s.type === 'DGBB' && chance(rng, 0.5) ? 'Ball Bearing' : mixed;
      return { ...base, description: `${name} ${s.d}${sealTxt}${clr ? ' ' + clr : ''}${withMpn ? ` Make ${make}` : ''}`, uom: pick(rng, ['PC', 'PCS', 'NOS']), materialGroup: '31-BRG' };
    }
    case 'CIL': {
      const short = { DGBB: 'BALL BRG', CRB: 'CYL RLR BRG', SRB: 'SPH RLR BRG', TRB: 'TPR RLR BRG', ACBB: 'ANG CONT BRG' }[s.type];
      return { ...base, description: `${s.d}${s.seal === 'OPEN' ? '' : ' ' + s.seal}${clr ? ' ' + clr : ''} ${short}`, uom: 'NO.', materialGroup: 'ME.BRG' };
    }
    case 'BHEL':
    case 'IOCL': {
      const bSeal = s.seal === '2RS' ? '-2RS1' : s.seal === 'ZZ' ? '-2Z' : '';
      if (org === 'IOCL') return { ...base, description: `BEARING ${s.type === 'DGBB' ? 'BALL' : mixed.toUpperCase().replace(' BEARING', '')} ${s.d}${s.seal === 'OPEN' ? '' : ' ' + s.seal}${clr ? ' ' + clr : ''}`, uom: 'EA', materialGroup: 'BRG-01' };
      return { ...base, description: `${s.type} ${s.d}${bSeal}${clr ? '/' + clr : ''} (ID${bi} OD${od} W${w})`, uom: 'EA', materialGroup: 'B0312' };
    }
  }
}

const bodyText = (body: ValveSpec['body'], style: 'short' | 'full' | 'words' | 'generic') => {
  const map = {
    WCB: { short: 'WCB', full: 'A216 WCB', words: 'CAST STEEL WCB', generic: 'CS' },
    A105: { short: 'A105', full: 'ASTM A105', words: 'FORGED STEEL A105', generic: 'FORGED STEEL' },
    CF8M: { short: 'CF8M', full: 'A351 CF8M', words: 'SS316 CF8M', generic: 'SS316' },
    CF8: { short: 'CF8', full: 'A351 CF8', words: 'SS304 CF8', generic: 'SS304' },
    F316: { short: 'F316', full: 'ASTM A182 F316', words: 'SS316 FORGED', generic: 'SS 316' },
    DI: { short: 'DI', full: 'DUCTILE IRON', words: 'DUCTILE IRON', generic: 'DI' },
  } as const;
  return map[body][style];
};
const endText = (e: ValveSpec['ends'], style: 'abbr' | 'full') => (style === 'abbr' ? { RF: 'RF', SW: 'SW', NPT: 'SCRD NPT', WAFER: 'WAFER' }[e] : { RF: 'FLANGED RF', SW: 'SOCKET WELD', NPT: 'SCREWED NPT', WAFER: 'WAFER TYPE' }[e]);
const vType = { GATE: 'GT', GLOBE: 'GLB', BALL: 'BALL', CHECK: 'NRV', BUTTERFLY: 'BFLY' } as const;

function renderValve(org: OrgCode, s: ValveSpec, rng: Rng): RenderedRecord {
  const nb = inchToNb[s.inch];
  const opAbbr = { HW: 'HW', GEAR: 'GO', LEVER: 'LVR', SELF: '' }[s.op];
  const opFull = { HW: 'HANDWHEEL', GEAR: 'GEAR OPERATED', LEVER: 'LEVER OPERATED', SELF: 'SWING TYPE' }[s.op];
  const fs = s.fs ? (org === 'CPCL' ? ',FIRE SAFE' : ', FIRE SAFE API 607') : '';
  const mg = { CPCL: 'M1105', NTPC: 'MVLV02', SAIL: '44-VLV', CIL: 'ME.VLV', BHEL: 'V0201', IOCL: 'VLV-02' }[org];
  switch (org) {
    case 'CPCL': {
      const typeTok = s.type === 'BUTTERFLY' ? 'BFV' : `VLV,${vType[s.type]}`;
      return { description: `${typeTok},${s.inch}",${s.cls}#,${bodyText(s.body, 'short')},${endText(s.ends, 'abbr')}`, longText: `${s.std}${s.op !== 'SELF' ? ', ' + opAbbr + ' OPERATED' : ''}${fs}`, uom: 'EA', materialGroup: mg };
    }
    case 'NTPC':
      return { description: `VALVE, ${s.type}, ${nb}NB, CLASS ${s.cls}, ${bodyText(s.body, 'full')}, ${endText(s.ends, 'full')}, ${opFull}, ${s.std}${fs}`, uom: 'NOS', materialGroup: mg };
    case 'SAIL': {
      const t = s.type.charAt(0) + s.type.slice(1).toLowerCase();
      const body = chance(rng, 0.3) ? bodyText(s.body, 'generic') : bodyText(s.body, 'short');
      return { description: `${t} Valve ${s.inch}" ${s.cls}# ${body} ${s.ends === 'RF' ? 'Flanged RF' : endText(s.ends, 'full').toLowerCase()}`, uom: pick(rng, ['NOS', 'PC']), materialGroup: mg };
    }
    case 'CIL':
      return { description: `${s.inch}" ${s.type} VALVE ${bodyText(s.body, 'words')} ${s.cls} LB ${endText(s.ends, 'abbr')} ENDS`, uom: 'NO.', materialGroup: mg };
    case 'BHEL':
    case 'IOCL': {
      const rating = classToPn[s.cls] ?? `CL${s.cls}`;
      if (org === 'IOCL') return { description: `${s.type} VALVE ${s.inch} INCH ${s.cls}# ${bodyText(s.body, 'full')} ${endText(s.ends, 'full')}`, longText: s.std, uom: 'EA', materialGroup: mg };
      return { description: `VALVE ${s.type} DN${nb} ${rating} ${bodyText(s.body, 'short')} ${endText(s.ends, 'abbr')}`, longText: `${s.std}${fs}`, uom: 'EA', materialGroup: mg };
    }
  }
}

const cableCode = (s: CableSpec) => `${s.cond === 'AL' ? 'A' : ''}${s.ins === 'XLPE' ? '2X' : 'Y'}${s.arm === 'WIRE' ? 'W' : 'F'}Y`;
const kvText = (kv: number) => (kv === 1.1 ? '1.1KV' : `${kv}KV`);

function renderCable(org: OrgCode, s: CableSpec, rng: Rng): RenderedRecord {
  const typeAbbr = s.type === 'POWER' ? 'PWR' : 'CTRL';
  const fire = s.fire ? `,${s.fire}` : '';
  const std = s.kv >= 3.3 ? 'IS 7098-2' : s.ins === 'XLPE' ? 'IS 7098-1' : 'IS 1554-1';
  const mg = { CPCL: 'E2301', NTPC: 'ECBL01', SAIL: '52-CBL', CIL: 'EL.CBL', BHEL: 'C0401', IOCL: 'CBL-01' }[org];
  switch (org) {
    case 'CPCL':
      return { description: `CBL,${typeAbbr},${kvText(s.kv)},${s.cores}CX${s.sec}SQMM,${s.cond},${s.ins},ARMD${fire}`.slice(0, 40), longText: `${std}, ${s.arm === 'WIRE' ? 'GSWA' : 'GSFA'}${s.fire ? ', ' + s.fire + ' OUTER SHEATH' : ''}`, uom: 'M', materialGroup: mg };
    case 'NTPC':
      return { description: `CABLE, ${s.type}, ${kvText(s.kv)}, ${s.cond === 'AL' ? 'ALUMINIUM' : 'COPPER'}, ${s.ins}, ${s.cores}C X ${s.sec} SQ.MM, ${s.arm === 'WIRE' ? 'WIRE ARMOURED' : 'STRIP ARMOURED'}${s.fire ? ', ' + s.fire : ''}, ${std}`, uom: 'KM', materialGroup: mg };
    case 'SAIL': {
      const lvl = s.kv >= 3.3 ? `HT ${s.kv}KV` : 'LT';
      return { description: `${s.type === 'POWER' ? lvl + ' Power' : 'Control'} Cable ${s.cores} Core ${s.sec} sqmm ${s.cond === 'AL' ? 'Al' : 'Cu'} ${s.ins} Armoured${s.fire ? ' ' + s.fire : ''}`, uom: pick(rng, ['MTR', 'M']), materialGroup: mg };
    }
    case 'CIL':
      return { description: `${s.sec} SQMM ${s.cores} CORE ${s.cond === 'AL' ? 'ALU' : 'CU'} ${s.ins} ARMOURED ${s.type} CABLE ${Math.round(s.kv * 1000)}V${s.fire ? ' ' + s.fire : ''}`, uom: 'RM', materialGroup: mg };
    case 'BHEL':
    case 'IOCL':
      if (org === 'IOCL') return { description: `${s.type} CABLE ${s.cores}C X ${s.sec} SQMM ${s.cond} ${s.ins} ARMOURED ${kvText(s.kv)}${s.fire ? ' ' + s.fire : ''}`, uom: 'M', materialGroup: mg };
      return { description: `CABLE ${kvText(s.kv)} ${cableCode(s)} ${s.cores}CX${s.sec}${s.fire ? ' ' + s.fire : ''}`, longText: std, uom: 'MT', materialGroup: mg };
  }
}

function renderFastener(org: OrgCode, s: FastenerSpec, rng: Rng): RenderedRecord {
  const isMetric = s.dia.startsWith('M');
  const thread = isMetric ? `${s.dia}${s.pitch ? 'X' + s.pitch : ''}` : `${s.dia}"`;
  const mg = { CPCL: 'M1402', NTPC: 'MFST01', SAIL: '38-FST', CIL: 'ME.FST', BHEL: 'F0101', IOCL: 'FST-01' }[org];
  const finishAbbr = { HDG: 'HDG', ZP: 'ZP', BLACK: 'BLK', PTFE: 'PTFE COATED' }[s.finish];
  const finishFull = { HDG: 'HOT DIP GALVANISED', ZP: 'ZINC PLATED', BLACK: 'BLACK', PTFE: 'PTFE COATED' }[s.finish];
  const gradeTxt = s.grade.startsWith('SS') ? s.grade : s.grade === 'B7' ? 'A193 B7' : s.type === 'NUT' ? `GR ${s.grade}` : `GR${s.grade}`;
  const stdTxt = s.type === 'BOLT' ? 'IS 1364' : s.type === 'NUT' ? 'IS 1364' : 'ASTM A193';

  if (s.type === 'STUD') {
    const unc = isMetric ? thread : `${s.dia}"UNC`;
    switch (org) {
      case 'CPCL':
        return { description: `STUD,${unc}X${s.len},A193 B7,W/2 NUTS 2H${s.finish === 'PTFE' ? ',PTFE' : ''}`, uom: 'EA', materialGroup: mg };
      case 'NTPC':
        return { description: `STUD BOLT, ${isMetric ? thread : s.dia + ' INCH UNC'}, LENGTH ${s.len} MM, ASTM A193 GR B7, WITH 2 NOS A194 2H NUTS${s.finish === 'PTFE' ? ', PTFE COATED' : ''}`, uom: 'NOS', materialGroup: mg };
      case 'SAIL':
        return { description: `Stud Bolt ${isMetric ? thread : s.dia + '"'} x ${s.len}mm B7 with nuts${s.finish === 'PTFE' ? ' Xylan coated' : ''}`, uom: pick(rng, ['NOS', 'SET']), materialGroup: mg };
      case 'CIL':
        return { description: `STUD BOLT ${isMetric ? thread : s.dia + '"'} X ${s.len} MM A193 B7 BLACK`, uom: 'NO.', materialGroup: mg };
      default:
        return { description: `STUD BOLT ${unc} X ${s.len} A193 B7 W/ 2 NUTS A194 2H${s.finish === 'PTFE' ? ' PTFE COATED' : ''}`, uom: 'EA', materialGroup: mg };
    }
  }
  if (s.type === 'NUT') {
    switch (org) {
      case 'CPCL':
        return { description: `NUT,HEX,${s.dia},GR${s.grade},${finishAbbr}`, uom: 'EA', materialGroup: mg };
      case 'NTPC':
        return { description: `NUT, HEX, ${s.dia}, PROPERTY CLASS ${s.grade}, ${finishFull}, ${stdTxt}`, uom: 'NOS', materialGroup: mg };
      case 'SAIL':
        return { description: `Hex Nut ${s.dia} Gr.${s.grade} Galv.`, uom: pick(rng, ['KG', 'NOS']), materialGroup: mg };
      case 'CIL':
        return { description: `${s.dia} HEX NUT CLASS ${s.grade} ${finishAbbr}`, uom: 'NO.', materialGroup: mg };
      default:
        return { description: `HEX NUT ${s.dia} CLASS ${s.grade} ${finishAbbr} ISO 4032`, uom: 'EA', materialGroup: mg };
    }
  }
  switch (org) {
    case 'CPCL':
      return { description: `BOLT,HEX,${thread}X${s.len},${gradeTxt},${finishAbbr}`, uom: 'EA', materialGroup: mg };
    case 'NTPC':
      return { description: `BOLT, HEX HEAD, ${thread} X ${s.len} MM, ${s.grade.startsWith('SS') ? 'STAINLESS STEEL ' + s.grade.slice(2) : 'PROPERTY CLASS ' + s.grade}, ${finishFull}, ${stdTxt}`, uom: 'NOS', materialGroup: mg };
    case 'SAIL':
      return { description: `Hex Bolt ${thread}x${s.len} ${s.grade.startsWith('SS') ? s.grade : s.grade + ' Gr.'} ${s.finish === 'HDG' ? 'Galv.' : s.finish === 'ZP' ? 'Zinc Plated' : ''}`.trim(), uom: pick(rng, ['KG', 'NOS', 'NOS']), materialGroup: mg };
    case 'CIL':
      return { description: `HHB ${thread} X ${s.len} ${s.grade.startsWith('SS') ? s.grade : s.grade} ${finishAbbr}`, uom: 'NO.', materialGroup: mg };
    case 'BHEL':
      return { description: `HEX BOLT ${s.dia}X${s.pitch ?? { M12: 1.75, M16: 2.0, M20: 2.5, M24: 3.0 }[s.dia] ?? ''}X${s.len} ${s.grade.startsWith('SS') ? s.grade : 'CL ' + s.grade} ${finishAbbr} ISO 4014`, uom: 'EA', materialGroup: mg };
    case 'IOCL':
      return { description: `BOLT HEX ${thread} X ${s.len}MM GR ${s.grade} ${finishFull}`, uom: 'NOS', materialGroup: mg };
  }
}

function renderPump(org: OrgCode, s: PumpSpec, rng: Rng): RenderedRecord {
  const hp = Math.round(s.kw / 0.746);
  const lpm = Math.round((s.flow * 1000) / 60);
  const encl = s.encl === 'FLP' ? 'FLP' : 'TEFC';
  const mg = { CPCL: 'M1601', NTPC: 'MPMP01', SAIL: '41-PMP', CIL: 'ME.PMP', BHEL: 'P0105', IOCL: 'PMP-01' }[org];
  const withMake = chance(rng, 0.6);
  const base = { manufacturer: withMake ? s.make : undefined, materialGroup: mg };
  const t = s.type === 'CENTRIFUGAL' ? 'CENT' : 'SUBM';
  switch (org) {
    case 'CPCL':
      return { ...base, description: `PUMP,${t},${s.flow}M3/HR,${s.head}MHD,${s.kw}KW,${encl}`, longText: `MOC ${s.moc}, ${s.std}`, uom: 'EA' };
    case 'NTPC':
      return { ...base, description: `PUMP, ${s.type}, ${s.flow} M3/H, ${s.head} M HEAD, ${s.kw} KW ${s.encl === 'FLP' ? 'FLAMEPROOF' : 'TEFC'} MOTOR, MOC ${s.moc}, ${s.std}`, uom: 'NOS' };
    case 'SAIL':
      return { ...base, description: `${s.type === 'CENTRIFUGAL' ? 'Centrifugal' : 'Submersible'} Pump ${lpm} LPM ${s.head}m Head ${hp}HP ${s.encl === 'FLP' ? 'Flameproof' : 'TEFC'} ${s.moc}`, uom: pick(rng, ['SET', 'NOS']) };
    case 'CIL':
      return { ...base, description: `${s.type === 'SUBMERSIBLE' ? 'DEWATERING PUMP SUBMERSIBLE' : 'CENTRIFUGAL PUMP'} ${s.flow}M3/HR ${s.head}M HEAD ${s.kw}KW ${s.encl === 'FLP' ? 'FLP' : 'SAFE AREA'} MOC ${s.moc}`, uom: 'NO.' };
    default:
      return { ...base, description: `${s.type} PUMP SET Q=${s.flow} M3/H H=${s.head} M ${s.kw}KW ${encl} ${s.moc} ${s.std}`, uom: 'EA' };
  }
}

export function renderMaterial(org: OrgCode, spec: Spec, rng: Rng): RenderedRecord {
  switch (spec.cat) {
    case 'BEARING':
      return renderBearing(org, spec, rng, pick(rng, spec.type === 'TRB' ? ['TIMKEN', 'SKF', 'NBC'] : bearingMakes));
    case 'VALVE':
      return renderValve(org, spec, rng);
    case 'CABLE':
      return renderCable(org, spec, rng);
    case 'FASTENER':
      return renderFastener(org, spec, rng);
    case 'PUMP':
      return renderPump(org, spec, rng);
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Records that cannot be confidently matched
// ──────────────────────────────────────────────────────────────────────────────
export const INSUFFICIENT_RECORDS: { org: OrgCode; description: string; uom: string; truth: string }[] = [
  { org: 'CIL', description: 'BEARING FOR CONVEYOR PULLEY', uom: 'NO.', truth: 'INSUFF-1' },
  { org: 'SAIL', description: 'Ball Bearing for motor NDE side', uom: 'NOS', truth: 'INSUFF-2' },
  { org: 'CPCL', description: 'BRG,ROLLER,AS PER OEM', uom: 'EA', truth: 'INSUFF-3' },
  { org: 'SAIL', description: 'Ball Valve 2"', uom: 'NOS', truth: 'INSUFF-4' },
  { org: 'CIL', description: 'GATE VALVE AS PER DRG NO 4411-22-003', uom: 'NO.', truth: 'INSUFF-5' },
  { org: 'NTPC', description: 'VALVE, GLOBE, 80NB', uom: 'NOS', truth: 'INSUFF-6' },
  { org: 'BHEL', description: 'VALVE GATE DN100 WCB', uom: 'EA', truth: 'INSUFF-7' },
  { org: 'CIL', description: 'ARMOURED CABLE 4 CORE', uom: 'RM', truth: 'INSUFF-8' },
  { org: 'SAIL', description: 'Power Cable 95 sqmm', uom: 'MTR', truth: 'INSUFF-9' },
  { org: 'CPCL', description: 'CBL,CTRL,12C,ARMD', uom: 'M', truth: 'INSUFF-10' },
  { org: 'CIL', description: 'BOLT M16', uom: 'KG', truth: 'INSUFF-11' },
  { org: 'SAIL', description: 'Stud bolt with nuts as reqd', uom: 'KG', truth: 'INSUFF-12' },
  { org: 'NTPC', description: 'BOLT, HEX HEAD, M20 X 100 MM', uom: 'NOS', truth: 'INSUFF-13' },
  { org: 'CIL', description: 'PUMP CENTRIFUGAL 7.5KW', uom: 'NO.', truth: 'INSUFF-14' },
  { org: 'SAIL', description: 'Dewatering Pump Submersible 22 KW', uom: 'SET', truth: 'INSUFF-15' },
  { org: 'BHEL', description: 'CENTRIFUGAL PUMP SET 50 M3/H', uom: 'EA', truth: 'INSUFF-16' },
  { org: 'CPCL', description: 'VLV,BALL,1",CF8M', uom: 'EA', truth: 'INSUFF-17' },
  { org: 'NTPC', description: 'BEARING, ROLLER, SPHERICAL', uom: 'NOS', truth: 'INSUFF-18' },
];

export const UNCLASSIFIED_RECORDS: { org: OrgCode; description: string; uom: string }[] = [
  { org: 'CPCL', description: 'GASKET,SPIRAL WOUND,4",150#,SS316/GRAPH', uom: 'EA' },
  { org: 'NTPC', description: 'GASKET, SPIRAL WOUND, 100NB, CLASS 150, SS316 WITH GRAPHITE FILLER', uom: 'NOS' },
  { org: 'SAIL', description: 'V-Belt B-54', uom: 'NOS' },
  { org: 'CIL', description: 'V BELT B 54 SECTION', uom: 'NO.' },
  { org: 'NTPC', description: 'GREASE, LITHIUM BASED, EP2', uom: 'KG' },
  { org: 'CPCL', description: 'GREASE,LITHIUM,EP-2,18KG PAIL', uom: 'EA' },
  { org: 'BHEL', description: 'MECHANICAL SEAL FOR PUMP 50MM SHAFT', uom: 'EA' },
  { org: 'SAIL', description: 'Impeller for pump KSB ETA 50-200', uom: 'NOS' },
  { org: 'CIL', description: 'BEARING HOUSING SN 510', uom: 'NO.' },
  { org: 'CPCL', description: 'CABLE GLAND,1.5",DOUBLE COMPRESSION', uom: 'EA' },
  { org: 'NTPC', description: 'O-RING, 50 X 3 MM, VITON', uom: 'NOS' },
  { org: 'CIL', description: 'HOSE PIPE 1" RUBBER 10 BAR', uom: 'RM' },
  { org: 'SAIL', description: 'Safety Helmet ISI marked', uom: 'NOS' },
  { org: 'BHEL', description: 'VALVE SPINDLE FOR 4" GATE VALVE', uom: 'EA' },
  { org: 'NTPC', description: 'PUMP SPARES KIT AS PER OEM LIST', uom: 'SET' },
  { org: 'CPCL', description: 'COUPLING,PIN BUSH,FOR PUMP', uom: 'EA' },
];

// ──────────────────────────────────────────────────────────────────────────────
// Legacy code formats per CPSE
// ──────────────────────────────────────────────────────────────────────────────
export function makeCodeFactory(rng: Rng) {
  const counters: Record<string, number> = { CPCL: 10004000, NTPC: 2100345000, SAIL: 5106030000, CIL: 400, BHEL: 3100200000, IOCL: 8000100 };
  const catSeg: Record<string, string> = { BEARING: 'BRG', VALVE: 'VLV', CABLE: 'CBL', FASTENER: 'FST', PUMP: 'PMP', UNCLASSIFIED: 'GEN' };
  return (org: OrgCode, cat: string) => {
    counters[org] += 1 + Math.floor(rng() * 37);
    const n = counters[org];
    switch (org) {
      case 'CPCL':
        return String(n);
      case 'NTPC':
        return String(n);
      case 'SAIL':
        return String(n);
      case 'CIL':
        return `CIL/ME/${catSeg[cat] ?? 'GEN'}/${String(n).padStart(5, '0')}`;
      case 'BHEL':
        return `B${n}`;
      case 'IOCL':
        return `P${String(n).padStart(8, '0')}`;
    }
  };
}

export interface SeedRecord {
  org: OrgCode;
  legacyCode: string;
  description: string;
  longText?: string;
  uom: string;
  manufacturer?: string;
  partNumber?: string;
  materialGroup: string;
  unitPriceInr?: number;
  annualQty?: number;
  truthKey: string;
}

/** Generates the full synthetic dataset for the five seeded CPSEs. */
export function generateSeedRecords(seed = 26099): SeedRecord[] {
  const rng = mulberry32(seed);
  const code = makeCodeFactory(rng);
  const out: SeedRecord[] = [];
  const catalogue = buildCatalogue();
  const orgs = [...SEEDED_ORGS];

  for (const mat of catalogue) {
    let chosen: OrgCode[];
    if (mat.forceOrgs) chosen = mat.forceOrgs;
    else {
      const r = rng();
      const k = r < 0.06 ? 1 : r < 0.22 ? 2 : r < 0.55 ? 3 : r < 0.85 ? 4 : 5;
      chosen = [...orgs].sort(() => rng() - 0.5).slice(0, k);
    }
    for (const org of chosen) {
      const rendered = renderMaterial(org, mat.spec, rng);
      const hasHistory = rng() < 0.6;
      const qtyBase = mat.spec.cat === 'CABLE' ? 800 : mat.spec.cat === 'FASTENER' ? 1500 : mat.spec.cat === 'PUMP' ? 2 : mat.spec.cat === 'VALVE' ? 12 : 40;
      const rec: SeedRecord = {
        org,
        legacyCode: code(org, mat.spec.cat),
        ...rendered,
        unitPriceInr: hasHistory ? Math.round(mat.spec.price * (0.86 + rng() * 0.32)) : undefined,
        annualQty: hasHistory ? Math.max(1, Math.round(qtyBase * (0.4 + rng() * 1.6))) : undefined,
        truthKey: mat.key,
      };
      out.push(rec);
      // Intra-CPSE duplicate: same material created twice (e.g. pre/post ERP migration) — ~9%
      if (rng() < 0.12) {
        const dup = { ...rec, legacyCode: code(org, mat.spec.cat), unitPriceInr: undefined, annualQty: undefined };
        if (rng() < 0.5) {
          const r2 = renderMaterial(org, mat.spec, rng);
          Object.assign(dup, r2);
        }
        out.push(dup);
      }
    }
  }
  for (const r of INSUFFICIENT_RECORDS) out.push({ org: r.org, legacyCode: code(r.org, 'GEN'), description: r.description, uom: r.uom, materialGroup: 'MISC', truthKey: r.truth });
  UNCLASSIFIED_RECORDS.forEach((r, i) => out.push({ org: r.org, legacyCode: code(r.org, 'UNCLASSIFIED'), description: r.description, uom: r.uom, materialGroup: 'MISC', truthKey: `UNC-${Math.floor(i / 2)}` }));
  return out;
}

/** IOCL onboarding file used for the live upload demo (different column names on purpose). */
export function generateIoclSample(seed = 777): Record<string, string>[] {
  const rng = mulberry32(seed);
  const code = makeCodeFactory(rng);
  const cat = buildCatalogue();
  const wanted = [
    'BRG-6205-2RS-C3', 'BRG-6206-2RS-C3', 'BRG-6308-2RS-C3', 'BRG-NU310', 'BRG-22216', 'BRG-6205-ZZ-C3',
    'VLV-GATE-4-150-WCB', 'VLV-GATE-4-300-WCB', 'VLV-GATE-2-150-WCB', 'VLV-BALL-2-150-CF8M', 'VLV-GLOBE-3-150-WCB', 'VLV-CHECK-4-150-WCB', 'VLV-GATE-1-800-A105',
    'CBL-1.1-3.5x95-AL', 'CBL-1.1-3.5x240-AL', 'CBL-11-3x240-AL', 'CBL-CTRL-12x1.5', 'CBL-1.1-4x16-CU',
    'FST-BOLT-M16x80-8.8-HDG', 'FST-STUD-5/8x110-B7', 'FST-BOLT-M20x80-8.8-HDG', 'FST-BOLT-M12x50-SS316',
    'PMP-C-50x40-CI-FLP', 'PMP-C-100x50-CI',
  ];
  const rows: Record<string, string>[] = [];
  for (const key of wanted) {
    const mat = cat.find((c) => c.key === key)!;
    const r = renderMaterial('IOCL', mat.spec, rng);
    rows.push({
      'Material No.': code('IOCL', mat.spec.cat),
      'Material Description': r.description,
      'Long Text': r.longText ?? '',
      'Base Unit': r.uom,
      'Mfr Name': r.manufacturer ?? '',
      'Mfr Part No.': r.partNumber ?? '',
      'Matl Group': r.materialGroup,
      'Last PO Rate (INR)': String(Math.round(mat.spec.price * (0.9 + rng() * 0.25))),
    });
  }
  rows.push({ 'Material No.': code('IOCL', 'GEN'), 'Material Description': 'GASKET SPIRAL WOUND 2" 300# SS316', 'Long Text': '', 'Base Unit': 'EA', 'Mfr Name': '', 'Mfr Part No.': '', 'Matl Group': 'GSK-01', 'Last PO Rate (INR)': '640' });
  rows.push({ 'Material No.': code('IOCL', 'GEN'), 'Material Description': 'VALVE BALL', 'Long Text': 'AS PER P&ID', 'Base Unit': 'EA', 'Mfr Name': '', 'Mfr Part No.': '', 'Matl Group': 'VLV-02', 'Last PO Rate (INR)': '' });
  return rows;
}
