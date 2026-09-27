import { cosine } from './similarity';
import type { CategorySchema, MatchRecord } from './types';

/**
 * Stage A — blocking / candidate reduction.
 *
 * Candidates for a record are the union of
 *   (1) records sharing a category-specific blocking key (e.g. bearing designation, valve type+size), and
 *   (2) the K nearest neighbours by embedding cosine within the same category (pgvector KNN in the DB-backed
 *       engine; an in-memory equivalent is provided here for tests and offline evaluation).
 * Pairs across categories are never compared (category-aware matching, PRD principle 4).
 */
export function blockingKey(schema: CategorySchema, r: MatchRecord): string | null {
  const vals = schema.blockingKeys.map((k) => r.attributes[k]?.value);
  if (vals.some((v) => v === undefined)) return null;
  return `${schema.code}|${vals.join('|')}`;
}

export function pairKey(a: string, b: string) {
  return a < b ? `${a}::${b}` : `${b}::${a}`;
}

export function inMemoryCandidates(records: MatchRecord[], schema: CategorySchema, k: number): [MatchRecord, MatchRecord][] {
  const pairs = new Map<string, [MatchRecord, MatchRecord]>();
  const add = (a: MatchRecord, b: MatchRecord) => {
    if (a.id === b.id) return;
    const key = pairKey(a.id, b.id);
    if (!pairs.has(key)) pairs.set(key, a.id < b.id ? [a, b] : [b, a]);
  };
  const blocks = new Map<string, MatchRecord[]>();
  for (const r of records) {
    const bk = blockingKey(schema, r);
    if (!bk) continue;
    const list = blocks.get(bk) ?? [];
    list.push(r);
    blocks.set(bk, list);
  }
  for (const list of blocks.values()) for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) add(list[i], list[j]);

  for (const r of records) {
    const scored = records
      .filter((o) => o.id !== r.id)
      .map((o) => ({ o, s: cosine(r.embedding, o.embedding) }))
      .sort((x, y) => y.s - x.s)
      .slice(0, k);
    for (const { o } of scored) add(r, o);
  }
  return [...pairs.values()];
}
