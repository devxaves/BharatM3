import type { DictionaryEntry } from './dictionary-seed';

export interface Expansion {
  term: string;
  expansion: string;
  kind: DictionaryEntry['kind'];
}

export interface NormalizedText {
  cleaned: string;
  normalized: string;
  tokens: string[];
  expansions: Expansion[];
}

/**
 * Stage 2a — lexical cleanup. Keeps characters that carry engineering meaning:
 *   /  (fractions 1/2", W/O)   .  (decimals 3.5C, 1.1KV)   -  (6205-2RS)   #  (150#)   " (inch)
 */
export function cleanText(input: string): string {
  let s = (input ?? '').toUpperCase();
  s = s.replace(/[‐‑–—]/g, '-');
  s = s.replace(/''/g, '"').replace(/[″”“]/g, '"').replace(/[’‘`']/g, ' ');
  s = s.replace(/[,;:|()[\]{}*_]+/g, ' ');
  // separate trailing periods used as delimiters ("GR. 8.8" keeps the decimal)
  s = s.replace(/\.(?=\s|$)/g, ' ');
  s = s.replace(/\s*=\s*/g, '=');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

interface CompiledDictionary {
  re: RegExp | null;
  lookup: Map<string, DictionaryEntry>;
}

const cache = new WeakMap<DictionaryEntry[], Map<string, CompiledDictionary>>();

function compile(dictionary: DictionaryEntry[], category: string | null): CompiledDictionary {
  let perDict = cache.get(dictionary);
  if (!perDict) {
    perDict = new Map();
    cache.set(dictionary, perDict);
  }
  const key = category ?? '__generic__';
  const hit = perDict.get(key);
  if (hit) return hit;

  const applicable = dictionary.filter((d) => d.category === null || d.category === category);
  const lookup = new Map<string, DictionaryEntry>();
  for (const d of applicable) {
    const k = d.term.toUpperCase();
    // category-scoped entries override generic ones
    if (!lookup.has(k) || d.category) lookup.set(k, d);
  }
  const terms = [...lookup.keys()].sort((a, b) => b.length - a.length);
  const re = terms.length ? new RegExp(`(?<![A-Z0-9])(${terms.map(escapeRe).join('|')})(?![A-Z0-9])`, 'g') : null;
  const compiled = { re, lookup };
  perDict.set(key, compiled);
  return compiled;
}

/**
 * Stage 2b — abbreviation expansion + synonym canonicalisation.
 * Single left-to-right pass with longest-term-first alternation so an expansion is never re-expanded.
 * Synonyms are applied in a second pass against the expanded text.
 */
export function expandText(cleaned: string, dictionary: DictionaryEntry[], category: string | null = null) {
  const expansions: Expansion[] = [];
  const abbreviations = dictionary.filter((d) => d.kind === 'ABBREVIATION');
  const synonyms = dictionary.filter((d) => d.kind === 'SYNONYM');

  const run = (text: string, entries: DictionaryEntry[]) => {
    const { re, lookup } = compile(entries, category);
    if (!re) return text;
    return text.replace(re, (m) => {
      const e = lookup.get(m);
      if (!e || e.expansion === m) return m;
      if (!expansions.some((x) => x.term === e.term)) expansions.push({ term: e.term, expansion: e.expansion, kind: e.kind });
      return e.expansion;
    });
  };

  let out = run(cleaned, abbreviations);
  out = run(out, synonyms);
  out = out.replace(/\s+/g, ' ').trim();
  return { text: out, expansions };
}

const STOPWORDS = new Set(['OF', 'FOR', 'THE', 'AND', 'TO', 'AS', 'PER', 'WITH', 'IN', 'ON', 'MAKE', 'TYPE', 'SIZE', 'SUITABLE', 'NEW', 'ITEM', 'MATERIAL']);

export function tokenize(text: string): string[] {
  return text
    .split(/\s+/)
    .map((t) => t.replace(/^[-/.]+|[-/.]+$/g, ''))
    .filter((t) => t.length > 0 && !STOPWORDS.has(t));
}

/** Remove repeated words while preserving order ("BEARING DEEP GROOVE BALL BEARING 6205" → one BEARING). */
export function dedupeWords(text: string): string {
  const seen = new Set<string>();
  return text
    .split(' ')
    .filter((w) => {
      if (!/^[A-Z]{3,}$/.test(w)) return true;
      if (seen.has(w)) return false;
      seen.add(w);
      return true;
    })
    .join(' ');
}

export function normalizeDescription(raw: string, dictionary: DictionaryEntry[], category: string | null = null): NormalizedText {
  const cleaned = cleanText(raw);
  const { text, expansions } = expandText(cleaned, dictionary, category);
  const normalized = dedupeWords(text);
  return { cleaned, normalized, tokens: tokenize(normalized), expansions };
}
