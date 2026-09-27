import { canonicalDescription, generateCnmc, mergeAttributes, shortCode } from '@/lib/governance/cnmc';
import { computeAuditHash, GENESIS_HASH, stableStringify, type AuditBody } from '@/lib/governance/audit';
import { attrsOf } from '../helpers';
import type { AttributeMap } from '@/lib/matching/types';

const toMap = (o: Record<string, string | number>): AttributeMap => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { value: v, confidence: 1, source: 'regex' as const }]));

describe('Common National Material Code generator', () => {
  it('follows the PRD template for bearings', () => {
    const a = toMap(attrsOf('BRG,DGBB,6205,C3'));
    expect(generateCnmc('BEARING', a)).toBe('IN-MAT-BRG-DGBB-6205-C3-25X52X15');
    expect(canonicalDescription('BEARING', a)).toBe('BEARING, BALL, DEEP GROOVE, 6205, OPEN, C3 CLEARANCE, 25X52X15MM');
  });

  it('is deterministic: different CPSE dialects of the same valve produce the same code', () => {
    const x = generateCnmc('VALVE', toMap(attrsOf('VLV,GT,4",150#,WCB,RF')));
    const y = generateCnmc('VALVE', toMap(attrsOf('VALVE GATE DN100 PN20 WCB RF')));
    expect(x).toBe('IN-MAT-VLV-GATE-DN100-CL150-CS-WCB-RF');
    expect(y).toBe(x);
  });

  it('covers every category with a template', () => {
    expect(generateCnmc('CABLE', toMap(attrsOf('CABLE 1.1KV A2XFY 3.5CX95')))).toBe('IN-MAT-CBL-PWR-1.1KV-3.5CX95-AL-XLPE-SSA');
    expect(generateCnmc('FASTENER', toMap(attrsOf('BOLT,HEX,M16X80,GR8.8,HDG')))).toBe('IN-MAT-FST-HXBOLT-M16X2.0X80-8.8-HDG');
    expect(generateCnmc('PUMP', toMap(attrsOf('PUMP,CENT,50M3/HR,40MHD,7.5KW,FLP')))).toBe('IN-MAT-PMP-CENT-50M3H-40M-7.5KW-FLP');
  });

  it('ERP-safe short code fits SAP ECC 18-character MATNR', () => {
    expect(shortCode('BRG', 42)).toBe('NMC-BRG-000042');
    expect(shortCode('BRG', 42).length).toBeLessThanOrEqual(18);
  });

  it('merge refines an underspecified value with a compatible specific one', () => {
    const m = mergeAttributes([toMap({ armour: 'ARMOURED', body_material: 'CS' }), toMap({ armour: 'STRIP', body_material: 'CS-WCB' })]);
    expect(m.armour.value).toBe('STRIP');
    expect(m.body_material.value).toBe('CS-WCB');
  });

  it('inch fractions become decimals in the code', () => {
    expect(generateCnmc('FASTENER', toMap(attrsOf('STUD BOLT 5/8"UNC X 110 A193 B7 BLACK')))).toBe('IN-MAT-FST-STUD-0.625-11UNCX110-A193-B7-BLK');
  });

  it('merge never overwrites a conflicting value, only fills gaps', () => {
    const m = mergeAttributes([toMap({ seal_type: '2RS' }), toMap({ seal_type: 'ZZ', clearance: 'C3' })]);
    expect(m.seal_type.value).toBe('2RS');
    expect(m.clearance.value).toBe('C3');
  });
});

describe('hash-chained audit trail', () => {
  const body = (i: number): AuditBody => ({
    occurredAt: new Date(1_700_000_000_000 + i).toISOString(),
    actorId: null,
    actorName: 'x',
    actorRole: 'data_steward',
    action: 'RECOMMENDATION_APPROVED',
    entityType: 'match_recommendation',
    entityId: `r${i}`,
    reason: null,
    payload: { b: 2, a: 1 },
  });

  it('canonical JSON is key-order independent', () => {
    expect(stableStringify({ b: 1, a: { d: 1, c: 2 } })).toBe(stableStringify({ a: { c: 2, d: 1 }, b: 1 }));
  });

  it('any tampering changes every subsequent hash', () => {
    const h1 = computeAuditHash(GENESIS_HASH, body(1));
    const h2 = computeAuditHash(h1, body(2));
    const tampered = { ...body(1), reason: 'edited later' };
    const h1b = computeAuditHash(GENESIS_HASH, tampered);
    expect(h1b).not.toBe(h1);
    expect(computeAuditHash(h1b, body(2))).not.toBe(h2);
  });
});
