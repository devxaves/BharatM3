import type { SubstitutionRule } from '@/lib/matching/types';

/** Engineering-approved substitution rules — the only way around a hard exclusion (PRD §6). */
export const SUBSTITUTION_RULES_SEED: (SubstitutionRule & { approvedBy: string })[] = [
  {
    category: 'PUMP',
    attributeKey: 'moc',
    fromValue: 'SS304',
    toValue: 'SS316',
    bidirectional: false,
    rationale: 'SS316 wetted parts exceed SS304 corrosion resistance for water/utility service (CPCL Mech. Engg. std. ME-PMP-07)',
    approvedBy: 'Chief Engineer (Rotating Equipment), CPCL',
  },
  {
    category: 'FASTENER',
    attributeKey: 'grade',
    fromValue: '8.8',
    toValue: '10.9',
    bidirectional: false,
    rationale: 'Property class 10.9 may replace 8.8 in non-structural, non-sour, non-HDG-critical joints subject to hydrogen-embrittlement check',
    approvedBy: 'Head — Materials Engineering, BHEL',
  },
  {
    category: 'VALVE',
    attributeKey: 'body_material',
    fromValue: 'CS-WCB',
    toValue: 'CS-WCC',
    bidirectional: false,
    rationale: 'A216 WCC has higher tensile strength with the same P-number; acceptable replacement for WCB per ASME B16.34 Group 1.1',
    approvedBy: 'Piping Material Specialist, NTPC',
  },
  {
    category: 'VALVE',
    attributeKey: 'body_material',
    fromValue: 'SS316',
    toValue: 'SS316L',
    bidirectional: true,
    rationale: 'Dual-certified 316/316L castings are common; L-grade acceptable where design temperature < 425 °C',
    approvedBy: 'Piping Material Specialist, NTPC',
  },
];

/** Illustrative UNSPSC (v26) subset used for classification_master. */
export const CLASSIFICATION_SEED: { category: string; subtype: string | null; unspscCode: string; unspscTitle: string }[] = [
  { category: 'BEARING', subtype: null, unspscCode: '31171500', unspscTitle: 'Bearings' },
  { category: 'BEARING', subtype: 'DEEP_GROOVE_BALL', unspscCode: '31171504', unspscTitle: 'Ball bearings' },
  { category: 'BEARING', subtype: 'ANGULAR_CONTACT_BALL', unspscCode: '31171504', unspscTitle: 'Ball bearings' },
  { category: 'BEARING', subtype: 'CYLINDRICAL_ROLLER', unspscCode: '31171505', unspscTitle: 'Roller bearings' },
  { category: 'BEARING', subtype: 'SPHERICAL_ROLLER', unspscCode: '31171505', unspscTitle: 'Roller bearings' },
  { category: 'BEARING', subtype: 'TAPER_ROLLER', unspscCode: '31171505', unspscTitle: 'Roller bearings' },
  { category: 'VALVE', subtype: null, unspscCode: '40141600', unspscTitle: 'Valves' },
  { category: 'VALVE', subtype: 'GATE', unspscCode: '40141609', unspscTitle: 'Gate valves' },
  { category: 'VALVE', subtype: 'GLOBE', unspscCode: '40141610', unspscTitle: 'Globe valves' },
  { category: 'VALVE', subtype: 'BALL', unspscCode: '40141607', unspscTitle: 'Ball valves' },
  { category: 'VALVE', subtype: 'CHECK', unspscCode: '40141604', unspscTitle: 'Check valves' },
  { category: 'VALVE', subtype: 'BUTTERFLY', unspscCode: '40141608', unspscTitle: 'Butterfly valves' },
  { category: 'CABLE', subtype: null, unspscCode: '26121600', unspscTitle: 'Electrical cable and accessories' },
  { category: 'CABLE', subtype: 'POWER', unspscCode: '26121636', unspscTitle: 'Power cable' },
  { category: 'CABLE', subtype: 'CONTROL', unspscCode: '26121641', unspscTitle: 'Control cable' },
  { category: 'CABLE', subtype: 'INSTRUMENTATION', unspscCode: '26121643', unspscTitle: 'Instrumentation cable' },
  { category: 'FASTENER', subtype: null, unspscCode: '31161600', unspscTitle: 'Bolts' },
  { category: 'FASTENER', subtype: 'HEX_BOLT', unspscCode: '31161620', unspscTitle: 'Hex bolts' },
  { category: 'FASTENER', subtype: 'STUD_BOLT', unspscCode: '31161622', unspscTitle: 'Stud bolts' },
  { category: 'FASTENER', subtype: 'HEX_NUT', unspscCode: '31161700', unspscTitle: 'Nuts' },
  { category: 'FASTENER', subtype: 'WASHER', unspscCode: '31161800', unspscTitle: 'Washers' },
  { category: 'PUMP', subtype: null, unspscCode: '40151500', unspscTitle: 'Pumps' },
  { category: 'PUMP', subtype: 'CENTRIFUGAL', unspscCode: '40151514', unspscTitle: 'Centrifugal pumps' },
  { category: 'PUMP', subtype: 'SUBMERSIBLE', unspscCode: '40151520', unspscTitle: 'Submersible pumps' },
  { category: 'PUMP', subtype: 'RECIPROCATING', unspscCode: '40151511', unspscTitle: 'Reciprocating pumps' },
];

export const ROLES_SEED = [
  { code: 'data_entry', name: 'Data Entry Operator', permissions: ['records:read', 'ingest:write', 'dashboard:read', 'mappings:read'] },
  { code: 'data_steward', name: 'Data Steward', permissions: ['records:read', 'ingest:write', 'dashboard:read', 'mappings:read', 'review:decide', 'matching:run'] },
  { code: 'admin', name: 'MDM Administrator', permissions: ['records:read', 'ingest:write', 'dashboard:read', 'mappings:read', 'review:decide', 'matching:run', 'config:write', 'dictionary:write', 'mappings:reverse', 'audit:read'] },
  { code: 'auditor', name: 'Auditor (read-only)', permissions: ['records:read', 'dashboard:read', 'mappings:read', 'audit:read'] },
] as const;

/** Fictional platform users (names are illustrative). */
export const USERS_SEED = [
  { key: 'steward', name: 'Anjali Menon', email: 'anjali.menon@steward.bharatm3.demo', role: 'data_steward', org: 'CPCL', designation: 'Sr. Manager (Materials) — Data Steward' },
  { key: 'steward2', name: 'Suresh K. Patnaik', email: 'suresh.patnaik@steward.bharatm3.demo', role: 'data_steward', org: 'NTPC', designation: 'DGM (C&M) — Data Steward' },
  { key: 'entry', name: 'R. Venkatesh', email: 'venkatesh.r@entry.bharatm3.demo', role: 'data_entry', org: 'CPCL', designation: 'Officer (Materials Codification)' },
  { key: 'admin', name: 'Kavitha Raghunathan', email: 'kavitha.r@admin.bharatm3.demo', role: 'admin', org: 'CPCL', designation: 'Chief Manager (IT-ERP) — MDM Administrator' },
  { key: 'auditor', name: 'Pradeep Sharma', email: 'pradeep.sharma@audit.bharatm3.demo', role: 'auditor', org: 'CPCL', designation: 'Dy. General Manager (Internal Audit)' },
] as const;
