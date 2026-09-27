/**
 * MANDATORY (PRD §11 step 7) — the platform's core credibility claim.
 * Two valves whose descriptions are near-identical but whose pressure class differs must NEVER be recommended
 * as equivalent, however high the text / semantic similarity.
 */
import { DEFAULT_CATEGORY_SCHEMAS } from '@/lib/matching/categories';
import { evaluateHardExclusions } from '@/lib/matching/exclusions';
import { compare, rec } from '../helpers';

describe('hard exclusion: pressure class mismatch', () => {
  const a = rec('VALVE, GATE, 100NB, CLASS 150, A216 WCB, FLANGED RF, HANDWHEEL, API 600', { org: 'NTPC' });
  const b = rec('VALVE, GATE, 100NB, CLASS 300, A216 WCB, FLANGED RF, HANDWHEEL, API 600', { org: 'CPCL' });

  it('the pair is textually almost identical (this is the false friend)', () => {
    const r = compare(a, b);
    expect(r.components.semantic).toBeGreaterThan(0.85);
    expect(r.rawScore).toBeGreaterThan(0.8);
  });

  it('is vetoed to RELATED_BUT_NOT_EQUIVALENT regardless of score', () => {
    const r = compare(a, b);
    expect(r.vetoes.map((v) => v.rule)).toContain('VETO_PRESSURE_CLASS_MISMATCH');
    expect(r.matchType).toBe('RELATED_BUT_NOT_EQUIVALENT');
    expect(r.finalScore).toBeLessThan(0.7);
    expect(r.routing).toBe('NONE');
    expect(r.reasonCodes).toContain('VETO_PRESSURE_CLASS_MISMATCH');
    expect(r.explanation).toMatch(/Pressure class differs \(150 vs 300\)/);
  });

  it('holds when the rating is written differently (150# vs PN50 = class 300)', () => {
    const r = compare(rec('VLV,GT,4",150#,WCB,RF'), rec('VALVE GATE DN100 PN50 WCB RF'));
    expect(r.matchType).toBe('RELATED_BUT_NOT_EQUIVALENT');
    expect(r.vetoes[0].rule).toBe('VETO_PRESSURE_CLASS_MISMATCH');
  });

  it('the exclusion layer is a discrete function, independent of scoring', () => {
    const out = evaluateHardExclusions(DEFAULT_CATEGORY_SCHEMAS.VALVE, a.attributes, b.attributes, []);
    expect(out.vetoes).toHaveLength(1);
    expect(out.vetoes[0]).toMatchObject({ kind: 'PRESSURE_CLASS', attribute: 'pressure_class', a: '150', b: '300' });
  });

  it('does not veto when the class is merely unknown on one side — routes to INSUFFICIENT_DATA instead', () => {
    const e = rec('VALVE, GATE, 100NB, A216 WCB, FLANGED RF');
    expect(evaluateHardExclusions(DEFAULT_CATEGORY_SCHEMAS.VALVE, a.attributes, e.attributes, []).vetoes).toHaveLength(0);
    expect(compare(a, e).matchType).toBe('INSUFFICIENT_DATA');
  });

  it('PN20 is recognised as ASME class 150 and is NOT vetoed', () => {
    const r = compare(a, rec('VALVE GATE DN100 PN20 WCB RF API 600'));
    expect(r.vetoes).toHaveLength(0);
    expect(['IDENTICAL', 'DUPLICATE', 'NEAR_DUPLICATE']).toContain(r.matchType);
  });
});
