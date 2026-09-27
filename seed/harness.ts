/* Scratch harness: in-memory end-to-end run over the seed dataset (no DB). Used while tuning. */
import { DICTIONARY_SEED } from '@/lib/ingestion/dictionary-seed';
import { processRecord } from '@/lib/ingestion/process';
import { inMemoryCandidates } from '@/lib/matching/candidates';
import { DEFAULT_CATEGORY_SCHEMAS, MATCHABLE_CATEGORIES } from '@/lib/matching/categories';
import { DEFAULT_ENGINE_CONFIG } from '@/lib/matching/config';
import { localEmbedding, semanticTokens } from '@/lib/matching/embedding';
import { matchPair } from '@/lib/matching/scoring';
import type { MatchRecord, SubstitutionRule } from '@/lib/matching/types';
import { generateSeedRecords } from './catalog';
import { SUBSTITUTION_RULES_SEED } from './reference-data';

const recs = generateSeedRecords();
console.log('records', recs.length);
const processed = recs.map((r, i) => ({ r, p: processRecord({ legacyCode: r.legacyCode, description: r.description, longText: r.longText, uom: r.uom, manufacturer: r.manufacturer, partNumber: r.partNumber }, { dictionary: DICTIONARY_SEED }), id: `r${String(i).padStart(4, '0')}` }));

const catCounts: Record<string, number> = {};
for (const x of processed) catCounts[x.p.category] = (catCounts[x.p.category] ?? 0) + 1;
console.log('categories', catCounts);

const wrongCat = processed.filter((x) => {
  const t = x.r.truthKey.split('-')[0];
  const exp = { BRG: 'BEARING', VLV: 'VALVE', CBL: 'CABLE', FST: 'FASTENER', PMP: 'PUMP' }[t];
  return exp && exp !== x.p.category;
});
console.log('misclassified', wrongCat.length, wrongCat.slice(0, 10).map((x) => `${x.r.description} -> ${x.p.category}`));
const missing = processed.filter((x) => x.p.missingRequired.length && !x.r.truthKey.startsWith('INSUFF') && x.p.category !== 'UNCLASSIFIED');
console.log('unexpected missing-required', missing.length);
for (const x of missing.slice(0, 25)) console.log('  ', x.r.org, '|', x.r.description, '|', x.r.longText ?? '', '→', x.p.missingRequired.join(','), JSON.stringify(Object.fromEntries(Object.entries(x.p.attributes).map(([k, v]) => [k, v.value]))));

const mrs: (MatchRecord & { truth: string })[] = processed.map((x) => ({
  id: x.id,
  orgCode: x.r.org,
  legacyCode: x.r.legacyCode,
  category: x.p.category,
  normalizedDescription: x.p.normalized,
  attributes: x.p.attributes,
  baseUom: x.p.uom.baseCode,
  uomDimension: x.p.uom.dimension,
  manufacturer: x.r.manufacturer,
  partNumber: x.r.partNumber,
  embedding: localEmbedding(semanticTokens(x.p.normalized)),
  unitPriceInr: x.r.unitPriceInr,
  truth: x.r.truthKey,
}));

const types: Record<string, number> = {};
let tp = 0, fp = 0, fn = 0;
const fps: string[] = [];
const fns: string[] = [];
const truthPairs = new Set<string>();
for (const cat of MATCHABLE_CATEGORIES) {
  const rs = mrs.filter((m) => m.category === cat);
  for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) if (rs[i].truth === rs[j].truth) truthPairs.add(`${rs[i].id}::${rs[j].id}`);
  const pairs = inMemoryCandidates(rs, DEFAULT_CATEGORY_SCHEMAS[cat], DEFAULT_ENGINE_CONFIG.knnCandidates);
  for (const [a, b] of pairs) {
    const res = matchPair(a, b, { schema: DEFAULT_CATEGORY_SCHEMAS[cat], config: DEFAULT_ENGINE_CONFIG, substitutionRules: SUBSTITUTION_RULES_SEED as SubstitutionRule[] });
    types[res.matchType] = (types[res.matchType] ?? 0) + 1;
    const same = (a as any).truth === (b as any).truth;
    const positive = ['IDENTICAL', 'DUPLICATE', 'NEAR_DUPLICATE'].includes(res.matchType);
    if (positive && same) tp++;
    if (positive && !same) { fp++; fps.push(`${res.matchType} ${res.finalScore} | ${a.normalizedDescription} || ${b.normalizedDescription} | ${res.reasonCodes.filter(c=>c.startsWith('ATTR')).join(',')}`); }
    if (!positive && same && res.matchType !== 'INSUFFICIENT_DATA') { fn++; fns.push(`${res.matchType} ${res.finalScore} | ${a.normalizedDescription} || ${b.normalizedDescription} | ${res.reasonCodes.filter(c=>c.startsWith('ATTR')||c.startsWith('VETO')).join(',')}`); }
  }
}
console.log('match types', types);
console.log(`precision ${(tp / (tp + fp)).toFixed(3)} tp=${tp} fp=${fp} fn(evaluated)=${fn} truthPairs=${truthPairs.size}`);
console.log('FP sample'); fps.slice(0, 15).forEach((s) => console.log('  ', s));
console.log('FN sample'); fns.slice(0, 25).forEach((s) => console.log('  ', s));
