import type { CategorySchema, MatchableCategory } from './types';

/**
 * Default category attribute schemas (v1).
 *
 * These are the SEED values for the `category_attribute_schemas` table. At runtime the engine reads
 * schemas from the database so weights / required flags / veto families are tunable without a deploy.
 *
 * group:
 *   attribute     → functional identity (type, seal, end connection…)     → attribute_similarity
 *   specification → ratings, grades, standards, certifications            → specification_similarity
 *   dimension     → physical sizes                                          → dimension_similarity
 *   descriptive   → shown to stewards, never scored (e.g. manufacturer)
 */
export const DEFAULT_CATEGORY_SCHEMAS: Record<MatchableCategory, CategorySchema> = {
  BEARING: {
    code: 'BEARING',
    name: 'Bearings',
    cnmcPrefix: 'BRG',
    defaultUnspsc: '31171500',
    expectedUomDimension: 'COUNT',
    blockingKeys: ['designation'],
    fields: [
      { key: 'bearing_type', label: 'Bearing type', group: 'attribute', type: 'text', weight: 3, required: true, identity: true },
      { key: 'designation', label: 'ISO designation', group: 'attribute', type: 'text', weight: 4, required: true, identity: true, veto: 'SIZE' },
      { key: 'seal_type', label: 'Seal / shield', group: 'attribute', type: 'text', weight: 2, required: false, identity: true },
      { key: 'bore_mm', label: 'Bore', group: 'dimension', type: 'number', unit: 'mm', weight: 3, required: false, identity: false, tolerance: 0.001 },
      { key: 'outer_diameter_mm', label: 'Outer diameter', group: 'dimension', type: 'number', unit: 'mm', weight: 3, required: false, identity: false, tolerance: 0.001 },
      { key: 'width_mm', label: 'Width', group: 'dimension', type: 'number', unit: 'mm', weight: 2, required: false, identity: false, tolerance: 0.01 },
      { key: 'clearance', label: 'Radial clearance', group: 'specification', type: 'text', weight: 3, required: false, identity: true },
      { key: 'cage', label: 'Cage material', group: 'specification', type: 'text', weight: 1, required: false, identity: false },
      { key: 'manufacturer', label: 'Make', group: 'descriptive', type: 'text', weight: 0, required: false, identity: false },
    ],
  },
  VALVE: {
    code: 'VALVE',
    name: 'Valves',
    cnmcPrefix: 'VLV',
    defaultUnspsc: '40141600',
    expectedUomDimension: 'COUNT',
    blockingKeys: ['valve_type', 'size_dn'],
    fields: [
      { key: 'valve_type', label: 'Valve type', group: 'attribute', type: 'text', weight: 3, required: true, identity: true },
      { key: 'end_connection', label: 'End connection', group: 'attribute', type: 'text', weight: 2, required: false, identity: true },
      { key: 'operation', label: 'Operation', group: 'attribute', type: 'text', weight: 1, required: false, identity: false },
      { key: 'size_dn', label: 'Nominal size', group: 'dimension', type: 'number', unit: 'DN', weight: 3, required: true, identity: true, veto: 'SIZE', tolerance: 0 },
      { key: 'pressure_class', label: 'Pressure class', group: 'specification', type: 'text', weight: 3, required: true, identity: true, veto: 'PRESSURE_CLASS' },
      { key: 'body_material', label: 'Body material', group: 'specification', type: 'text', weight: 3, required: true, identity: true, veto: 'MATERIAL_GRADE' },
      { key: 'trim', label: 'Trim', group: 'specification', type: 'text', weight: 1, required: false, identity: false },
      { key: 'design_standard', label: 'Design standard', group: 'specification', type: 'text', weight: 1, required: false, identity: false },
      { key: 'fire_safe', label: 'Fire-safe certification', group: 'specification', type: 'text', weight: 2, required: false, identity: false, veto: 'CERTIFICATION' },
      { key: 'manufacturer', label: 'Make', group: 'descriptive', type: 'text', weight: 0, required: false, identity: false },
    ],
  },
  CABLE: {
    code: 'CABLE',
    name: 'Cables',
    cnmcPrefix: 'CBL',
    defaultUnspsc: '26121600',
    expectedUomDimension: 'LENGTH',
    blockingKeys: ['cross_section_sqmm', 'cores'],
    fields: [
      { key: 'cable_type', label: 'Cable type', group: 'attribute', type: 'text', weight: 2, required: true, identity: true },
      { key: 'armour', label: 'Armour', group: 'attribute', type: 'text', weight: 2, required: false, identity: true },
      { key: 'cores', label: 'Cores', group: 'dimension', type: 'number', weight: 3, required: true, identity: true, veto: 'SIZE', tolerance: 0 },
      { key: 'cross_section_sqmm', label: 'Cross-section', group: 'dimension', type: 'number', unit: 'mm²', weight: 3, required: true, identity: true, veto: 'SIZE', tolerance: 0 },
      { key: 'voltage_grade_kv', label: 'Voltage grade', group: 'specification', type: 'number', unit: 'kV', weight: 3, required: true, identity: true, veto: 'VOLTAGE', tolerance: 0 },
      { key: 'conductor', label: 'Conductor', group: 'specification', type: 'text', weight: 3, required: true, identity: true, veto: 'MATERIAL_GRADE' },
      { key: 'insulation', label: 'Insulation', group: 'specification', type: 'text', weight: 2, required: false, identity: true },
      { key: 'fire_performance', label: 'Fire performance', group: 'specification', type: 'text', weight: 2, required: false, identity: false, veto: 'CERTIFICATION' },
      { key: 'standard', label: 'Standard', group: 'specification', type: 'text', weight: 1, required: false, identity: false },
    ],
  },
  FASTENER: {
    code: 'FASTENER',
    name: 'Fasteners',
    cnmcPrefix: 'FST',
    defaultUnspsc: '31161600',
    expectedUomDimension: 'COUNT',
    blockingKeys: ['fastener_type', 'thread_size'],
    fields: [
      { key: 'fastener_type', label: 'Fastener type', group: 'attribute', type: 'text', weight: 3, required: true, identity: true },
      { key: 'finish', label: 'Finish / coating', group: 'attribute', type: 'text', weight: 1.5, required: false, identity: true },
      { key: 'thread', label: 'Thread', group: 'specification', type: 'text', weight: 3, required: true, identity: true, veto: 'THREAD' },
      { key: 'grade', label: 'Grade / property class', group: 'specification', type: 'text', weight: 3, required: true, identity: true, veto: 'MATERIAL_GRADE' },
      { key: 'standard', label: 'Standard', group: 'specification', type: 'text', weight: 0.5, required: false, identity: false },
      { key: 'thread_size', label: 'Nominal diameter', group: 'dimension', type: 'text', weight: 0, required: false, identity: false },
      { key: 'length_mm', label: 'Length', group: 'dimension', type: 'number', unit: 'mm', weight: 3, required: false, identity: true, veto: 'SIZE', tolerance: 0.001 },
    ],
  },
  PUMP: {
    code: 'PUMP',
    name: 'Pumps',
    cnmcPrefix: 'PMP',
    defaultUnspsc: '40151500',
    expectedUomDimension: 'COUNT',
    blockingKeys: ['pump_type'],
    fields: [
      { key: 'pump_type', label: 'Pump type', group: 'attribute', type: 'text', weight: 3, required: true, identity: true },
      { key: 'flow_m3h', label: 'Rated flow', group: 'dimension', type: 'number', unit: 'm³/h', weight: 3, required: true, identity: true, tolerance: 0.03 },
      { key: 'head_m', label: 'Rated head', group: 'dimension', type: 'number', unit: 'm', weight: 3, required: true, identity: true, tolerance: 0.03 },
      { key: 'motor_kw', label: 'Motor rating', group: 'specification', type: 'number', unit: 'kW', weight: 2, required: false, identity: true, tolerance: 0.03 },
      { key: 'moc', label: 'Material of construction', group: 'specification', type: 'text', weight: 2, required: false, identity: true, veto: 'MATERIAL_GRADE' },
      { key: 'motor_enclosure', label: 'Motor enclosure / hazardous area', group: 'specification', type: 'text', weight: 2, required: false, identity: true, veto: 'CERTIFICATION' },
      { key: 'design_standard', label: 'Design standard', group: 'specification', type: 'text', weight: 1, required: false, identity: false },
      { key: 'manufacturer', label: 'Make', group: 'descriptive', type: 'text', weight: 0, required: false, identity: false },
    ],
  },
};

export const MATCHABLE_CATEGORIES = Object.keys(DEFAULT_CATEGORY_SCHEMAS) as MatchableCategory[];

export const CATEGORY_META: Record<string, { label: string; short: string }> = {
  BEARING: { label: 'Bearings', short: 'BRG' },
  VALVE: { label: 'Valves', short: 'VLV' },
  CABLE: { label: 'Cables', short: 'CBL' },
  FASTENER: { label: 'Fasteners', short: 'FST' },
  PUMP: { label: 'Pumps', short: 'PMP' },
  UNCLASSIFIED: { label: 'Unclassified', short: 'UNC' },
};
