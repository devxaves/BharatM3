import { DEFAULT_ENGINE_CONFIG } from '@/lib/matching/config';
import { classifyMatch, fuse, routeMatch } from '@/lib/matching/scoring';
import { compare, rec } from '../helpers';

describe('hybrid matching engine', () => {
  it('known duplicate pair (same OEM part number) → IDENTICAL / DUPLICATE, fast-track routed', () => {
    const a = rec('BRG,DGBB,6205-2RS,C3', { org: 'CPCL', manufacturer: 'SKF', partNumber: '6205-2RSH/C3', price: 420 });
    const b = rec('BRG,DGBB,6205-2RS,C3', { org: 'NTPC', manufacturer: 'SKF', partNumber: '6205-2RSH/C3', price: 445 });
    const r = compare(a, b);
    expect(r.deterministic).toBe('MPN_EXACT');
    expect(['IDENTICAL', 'DUPLICATE']).toContain(r.matchType);
    expect(r.finalScore).toBeGreaterThanOrEqual(0.95);
    expect(r.routing).toBe('AUTO_QUEUE');
    expect(r.reasonCodes).toEqual(expect.arrayContaining(['DETERMINISTIC_MPN_MATCH', 'CROSS_CPSE', 'PRICE_CONSISTENT']));
  });

  it('same material in two CPSE dialects → fingerprint match, at least NEAR_DUPLICATE', () => {
    const r = compare(rec('BEARING, BALL, DEEP GROOVE, 6205-2RS, C3 CLEARANCE, 25X52X15MM', { uom: 'NOS' }), rec('6205 2RS C3 BALL BRG', { uom: 'NO.' }));
    expect(r.deterministic).toBe('ATTRIBUTE_FINGERPRINT');
    expect(['DUPLICATE', 'NEAR_DUPLICATE']).toContain(r.matchType);
    expect(r.components.uom).toBe(1); // NOS and NO. both normalise to EA
  });

  it('sealed vs shielded bearing → FUNCTIONALLY_EQUIVALENT, never a duplicate', () => {
    const r = compare(rec('BEARING, BALL, DEEP GROOVE, 6205-2RS, C3 CLEARANCE'), rec('BEARING, BALL, DEEP GROOVE, 6205-ZZ, C3 CLEARANCE'));
    expect(r.matchType).toBe('FUNCTIONALLY_EQUIVALENT');
    expect(r.reasonCodes).toContain('ATTR_CONFLICT:SEAL_TYPE');
    expect(r.vetoes).toHaveLength(0);
  });

  it('different bearing size → size veto', () => {
    const r = compare(rec('BRG,DGBB,6205-2RS,C3'), rec('BRG,DGBB,6206-2RS,C3'));
    expect(r.vetoes.map((v) => v.rule)).toContain('VETO_SIZE_MISMATCH');
    expect(r.matchType).toBe('RELATED_BUT_NOT_EQUIVALENT');
  });

  it('missing required attribute → INSUFFICIENT_DATA, routed to unresolved queue', () => {
    const r = compare(rec('Ball Valve 2"'), rec('VALVE, BALL, 50NB, CLASS 150, A351 CF8M, FLANGED RF, API 6D'));
    expect(r.matchType).toBe('INSUFFICIENT_DATA');
    expect(r.routing).toBe('UNRESOLVED');
    expect(r.reasonCodes).toEqual(expect.arrayContaining(['MISSING_REQUIRED:PRESSURE_CLASS', 'MISSING_REQUIRED:BODY_MATERIAL']));
  });

  it('unit conversions make HP/LPM records comparable with kW/m³/h records', () => {
    const r = compare(rec('PUMP,CENT,50M3/HR,40MHD,7.5KW,FLP'), rec('Centrifugal Pump 833 LPM 40m Head 10HP Flameproof CI'));
    const flow = r.comparisons.find((c) => c.key === 'flow_m3h')!;
    const kw = r.comparisons.find((c) => c.key === 'motor_kw')!;
    expect(flow.status).toBe('MATCH');
    expect(kw.status).toBe('MATCH');
  });

  it('cable in KM vs M is UOM-convertible, not incompatible', () => {
    const r = compare(rec('CBL,PWR,1.1KV,3.5CX95SQMM,AL,XLPE,ARMD', { uom: 'M' }), rec('CABLE, POWER, 1.1KV, ALUMINIUM, XLPE, 3.5C X 95 SQ.MM, ARMOURED', { uom: 'KM' }));
    expect(r.reasonCodes).toContain('UOM_CONVERTIBLE');
    expect(r.components.uom).toBeCloseTo(0.9);
  });

  it('every result is explainable: reason codes + plain-language explanation', () => {
    const r = compare(rec('VLV,GT,4",150#,WCB,RF'), rec('4" GATE VALVE CAST STEEL WCB 150 LB RF ENDS'));
    expect(r.reasonCodes.length).toBeGreaterThan(3);
    expect(r.explanation.length).toBeGreaterThan(80);
    expect(r.explanation).toMatch(/attributes agree/);
  });

  it('missing procurement history is excluded and its weight redistributed (not fabricated)', () => {
    const r = compare(rec('BRG,DGBB,6205-2RS,C3'), rec('BRG,DGBB,6205-2RS,C3'));
    expect(r.components.procurement).toBeNull();
    expect(r.effectiveWeights.procurement).toBe(0);
    expect(r.reasonCodes).toContain('PROCUREMENT_HISTORY_UNAVAILABLE');
  });
});

describe('configurable thresholds & fusion', () => {
  it('fusion renormalises only unavailable components', () => {
    const { score, effective } = fuse({ semantic: 1, attribute: 1, specification: 1, dimension: 1, classification: 1, uom: 1, procurement: null }, DEFAULT_ENGINE_CONFIG.weights, 'renormalize');
    expect(score).toBeCloseTo(1);
    expect(effective.semantic).toBeCloseTo(0.316, 2);
  });

  it('"zero" policy keeps procurement at 0 as literally specified in the PRD', () => {
    const { score } = fuse({ semantic: 1, attribute: 1, specification: 1, dimension: 1, classification: 1, uom: 1, procurement: null }, DEFAULT_ENGINE_CONFIG.weights, 'zero');
    expect(score).toBeCloseTo(0.95);
  });

  it('thresholds are data, not magic numbers', () => {
    const strict = { ...DEFAULT_ENGINE_CONFIG, thresholds: { ...DEFAULT_ENGINE_CONFIG.thresholds, nearDuplicate: 0.95 } };
    const args = { score: 0.9, vetoed: false, insufficient: false, deterministic: null, textIdentical: false, identityDiffers: false };
    expect(classifyMatch({ ...args, config: DEFAULT_ENGINE_CONFIG })).toBe('NEAR_DUPLICATE');
    expect(classifyMatch({ ...args, config: strict })).toBe('FUNCTIONALLY_EQUIVALENT');
  });

  it('confidence routing: ≥0.95 auto-queue, 0.75–0.95 review, <0.75 unresolved', () => {
    expect(routeMatch('DUPLICATE', 0.97, DEFAULT_ENGINE_CONFIG)).toBe('AUTO_QUEUE');
    expect(routeMatch('NEAR_DUPLICATE', 0.9, DEFAULT_ENGINE_CONFIG)).toBe('REVIEW');
    expect(routeMatch('FUNCTIONALLY_EQUIVALENT', 0.72, DEFAULT_ENGINE_CONFIG)).toBe('UNRESOLVED');
    expect(routeMatch('RELATED_BUT_NOT_EQUIVALENT', 0.8, DEFAULT_ENGINE_CONFIG)).toBe('NONE');
  });
});
