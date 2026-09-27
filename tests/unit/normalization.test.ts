import { DICTIONARY_SEED } from '@/lib/ingestion/dictionary-seed';
import { cleanText, normalizeDescription } from '@/lib/ingestion/normalize';
import { normalizeUom, uomCompatibility } from '@/lib/ingestion/uom';
import { classifyMaterial } from '@/lib/matching/classifier';

describe('abbreviation dictionary', () => {
  it('ships 100+ curated industrial terms', () => {
    expect(DICTIONARY_SEED.length).toBeGreaterThanOrEqual(100);
    expect(new Set(DICTIONARY_SEED.map((d) => `${d.term}|${d.category}`)).size).toBe(DICTIONARY_SEED.length);
  });

  it.each([
    ['VLV,GT,4",150#,WCB,RF', 'VALVE GATE 4" 150# WCB RAISED FACE'],
    ['SS BOLT W/ NUT', 'STAINLESS STEEL BOLT WITH NUT'],
    ['CBL,PWR,ARMD,XLPE', 'CABLE POWER ARMOURED CROSS LINKED POLYETHYLENE'],
    ['NRV 2" CS FLGD', 'CHECK VALVE 2" CARBON STEEL FLANGED'],
    ['BRG,DGBB,6205', 'BEARING DEEP GROOVE BALL 6205'],
    ['HHB M16 HDG', 'HEX HEAD BOLT M16 HOT DIP GALVANISED'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeDescription(input, DICTIONARY_SEED).normalized).toBe(expected);
  });

  it('category-scoped abbreviations only apply after classification (HD = HEAD for pumps)', () => {
    expect(normalizeDescription('PUMP 40M HD', DICTIONARY_SEED, null).normalized).toBe('PUMP 40M HD');
    expect(normalizeDescription('PUMP 40M HD', DICTIONARY_SEED, 'PUMP').normalized).toBe('PUMP 40M HEAD');
  });

  it('records every expansion for the data-quality report', () => {
    const r = normalizeDescription('VLV,GT,CS,RF', DICTIONARY_SEED);
    expect(r.expansions.map((e) => e.term)).toEqual(['VLV', 'GT', 'CS', 'RF']);
  });

  it('keeps engineering punctuation: fractions, decimals, inch marks, ratings', () => {
    expect(cleanText('Valve 1-1/2″ 150#, 3.5C (x) ')).toBe('VALVE 1-1/2" 150# 3.5C X');
  });
});

describe('UOM normalization', () => {
  it.each([
    ['NOS', 'EA'], ['PCS', 'EA'], ['NO.', 'EA'], ['ST', 'EA'], ['MTR', 'M'], ['RM', 'M'], ['KM', 'KM'], ['KGS', 'KG'],
  ])('%s → %s', (raw, code) => expect(normalizeUom(raw, null).code).toBe(code));

  it('resolves the MT ambiguity by category context', () => {
    expect(normalizeUom('MT', 'LENGTH').code).toBe('M');
    expect(normalizeUom('MT', 'COUNT').code).toBe('TO');
    expect(normalizeUom('MT', 'LENGTH').flags).toContain('UOM_AMBIGUOUS_MT');
  });

  it('flags dimension mismatch (fasteners bought by KG)', () => {
    expect(normalizeUom('KG', 'COUNT').flags).toContain('UOM_DIMENSION_MISMATCH');
    expect(uomCompatibility({ code: 'KG', dimension: 'MASS' }, { code: 'EA', dimension: 'COUNT' }).score).toBe(0);
  });
});

describe('category classifier', () => {
  it.each([
    ['BEARING DEEP GROOVE BALL 6205', 'BEARING'],
    ['DEEP GROOVE BALL BEARING 6206-2RS1/C3', 'BEARING'],
    ['VALVE GATE 4" 150#', 'VALVE'],
    ['CABLE 1.1KV A2XFY 3.5CX95', 'CABLE'],
    ['HEX HEAD BOLT M16 X 80', 'FASTENER'],
    ['PUMP CENTRIFUGAL 50 M3/H', 'PUMP'],
    ['BEARING FOR CONVEYOR PULLEY', 'BEARING'],
    ['IMPELLER FOR PUMP KSB', 'UNCLASSIFIED'],
    ['BEARING HOUSING SN 510', 'UNCLASSIFIED'],
    ['GASKET SPIRAL WOUND 4" 150# SS316', 'UNCLASSIFIED'],
    ['VALVE SPINDLE FOR 4" GATE VALVE', 'UNCLASSIFIED'],
  ])('%s → %s', (text, cat) => expect(classifyMaterial(text).category).toBe(cat));
});
