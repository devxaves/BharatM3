import { compare, rec } from '../helpers';

describe('hard exclusions — other safety-critical families', () => {
  it('blocks material grade mismatch (SS316 vs SS304 ball valves)', () => {
    const r = compare(rec('VALVE, BALL, 50NB, CLASS 150, A351 CF8M, FLANGED RF, API 6D'), rec('VALVE, BALL, 50NB, CLASS 150, A351 CF8, FLANGED RF, API 6D'));
    expect(r.vetoes.map((v) => v.rule)).toEqual(['VETO_MATERIAL_GRADE_MISMATCH']);
    expect(r.matchType).toBe('RELATED_BUT_NOT_EQUIVALENT');
  });

  it('blocks voltage grade mismatch (11 kV vs 6.6 kV)', () => {
    const r = compare(
      rec('CABLE, POWER, 11KV, ALUMINIUM, XLPE, 3C X 240 SQ.MM, STRIP ARMOURED', { uom: 'M' }),
      rec('CABLE, POWER, 6.6KV, ALUMINIUM, XLPE, 3C X 240 SQ.MM, STRIP ARMOURED', { uom: 'M' }),
    );
    expect(r.vetoes.map((v) => v.rule)).toContain('VETO_VOLTAGE_MISMATCH');
    expect(r.matchType).toBe('RELATED_BUT_NOT_EQUIVALENT');
  });

  it('blocks conductor material mismatch (Cu vs Al, decoded from IS 7098 type codes)', () => {
    const r = compare(rec('CABLE 1.1KV 2XWY 4CX16', { uom: 'M' }), rec('CABLE 1.1KV A2XWY 4CX16', { uom: 'M' }));
    expect(r.vetoes.map((v) => v.rule)).toContain('VETO_MATERIAL_GRADE_MISMATCH');
  });

  it('blocks fire-performance certification mismatch (FRLS vs LSZH)', () => {
    const r = compare(rec('CBL,CTRL,1.1KV,12CX1.5SQMM,CU,PVC,ARMD,FRLS', { uom: 'M' }), rec('CBL,CTRL,1.1KV,12CX1.5SQMM,CU,PVC,ARMD,LSZH', { uom: 'M' }));
    expect(r.vetoes.map((v) => v.rule)).toContain('VETO_CERTIFICATION_MISMATCH');
  });

  it('blocks hazardous-area certification mismatch (flameproof vs TEFC pump motor)', () => {
    const r = compare(rec('PUMP,CENT,50M3/HR,40MHD,7.5KW,FLP'), rec('PUMP,CENT,50M3/HR,40MHD,7.5KW,TEFC'));
    expect(r.vetoes.map((v) => v.rule)).toContain('VETO_CERTIFICATION_MISMATCH');
    expect(r.matchType).toBe('RELATED_BUT_NOT_EQUIVALENT');
  });

  it('blocks thread mismatch (M20 coarse vs M20 x 1.5 fine)', () => {
    const r = compare(rec('BOLT, HEX HEAD, M20 X 80 MM, PROPERTY CLASS 8.8, HOT DIP GALVANISED'), rec('HEX BOLT M20X1.5X80 CL 8.8 HDG'));
    expect(r.vetoes.map((v) => v.rule)).toContain('VETO_THREAD_MISMATCH');
  });

  it('blocks the metric-vs-unified false friend (M16 vs 5/8" UNC stud)', () => {
    const r = compare(rec('STUD BOLT M16 X 110 MM A193 B7 BLACK'), rec('STUD BOLT 5/8"UNC X 110 A193 B7 BLACK'));
    expect(r.vetoes.map((v) => v.rule)).toContain('VETO_THREAD_MISMATCH');
  });

  it('an approved substitution rule lifts the veto but still requires human review (8.8 → 10.9)', () => {
    const r = compare(rec('BOLT,HEX,M16X80,GR8.8,HDG'), rec('BOLT,HEX,M16X80,GR10.9,HDG'));
    expect(r.vetoes).toHaveLength(0);
    expect(r.reasonCodes).toContain('SUBSTITUTION_RULE_APPLIED:GRADE');
    expect(r.matchType).toBe('FUNCTIONALLY_EQUIVALENT');
    expect(['REVIEW', 'UNRESOLVED']).toContain(r.routing);
  });

  it('without that substitution rule the same pair is vetoed', () => {
    const r = compare(rec('BOLT,HEX,M16X80,GR8.8,HDG'), rec('BOLT,HEX,M16X80,GR10.9,HDG'), []);
    expect(r.vetoes.map((v) => v.rule)).toContain('VETO_MATERIAL_GRADE_MISMATCH');
  });
});
