/**
 * Stage D embeddings.
 *
 * Default provider is a deterministic, dependency-free "hashed n-gram" embedding (signed feature hashing over
 * word unigrams, word bigrams and character trigrams, L2-normalised). It is not a neural model, but it is stable,
 * explainable, fast, and needs no network — satisfying PRD principle 6. When EMBEDDINGS_PROVIDER=openai and a key
 * is configured, text-embedding-3-small (dimensions=256) is used instead, with automatic fallback to local.
 */
import { KNOWN_MAKES } from './extract/common';

export const EMBEDDING_DIM = 256;

const NOISE = new Set(['OR', 'EQUIVALENT', 'MAKE', 'EQV', 'OEM', 'APPROVED', 'SIMILAR', 'NOS', 'WITH', 'SET', 'INCH', 'MM', 'TYPE']);
const MAKES = new Set(KNOWN_MAKES);

/**
 * Semantic signature used for embeddings: normalized description split on - and /, with vendor names and
 * procurement boiler-plate removed, so two CPSEs describing the same item converge on the same token bag.
 */
export function semanticTokens(normalized: string): string[] {
  return normalized
    .split(/[\s\-/,]+/)
    .map((t) => t.replace(/^[."#]+|[."#]+$/g, ''))
    .filter((t) => t && !NOISE.has(t) && !MAKES.has(t));
}
export const LOCAL_EMBEDDING_MODEL = 'bm3-hashed-ngram-v1 (local, 256d)';

function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function add(vec: Float64Array, feature: string, weight: number) {
  const h = fnv1a(feature);
  const idx = h % EMBEDDING_DIM;
  const sign = (h >>> 16) & 1 ? 1 : -1;
  vec[idx] += sign * weight;
}

export function localEmbedding(tokens: string[]): number[] {
  const vec = new Float64Array(EMBEDDING_DIM);
  const uniq = [...new Set(tokens)];
  for (const t of uniq) {
    const numeric = /\d/.test(t);
    add(vec, `w:${t}`, numeric ? 1.3 : 1.0);
    const padded = `^${t}$`;
    const grams = Math.max(1, padded.length - 2);
    for (let i = 0; i + 3 <= padded.length; i++) add(vec, `c:${padded.slice(i, i + 3)}`, 0.45 / Math.sqrt(grams));
  }
  for (let i = 0; i + 1 < tokens.length; i++) add(vec, `b:${tokens[i]}_${tokens[i + 1]}`, 0.35);
  let norm = 0;
  for (const v of vec) norm += v * v;
  norm = Math.sqrt(norm) || 1;
  return Array.from(vec, (v) => Math.round((v / norm) * 1e6) / 1e6);
}

export async function embedTexts(items: { text: string; tokens: string[] }[]): Promise<{ vectors: number[][]; model: string }> {
  const provider = process.env.EMBEDDINGS_PROVIDER ?? 'local';
  const key = process.env.OPENAI_API_KEY;
  if (provider === 'openai' && key && items.length) {
    try {
      const vectors: number[][] = [];
      for (let i = 0; i < items.length; i += 256) {
        const chunk = items.slice(i, i + 256);
        const res = await fetch('https://api.openai.com/v1/embeddings', {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
          body: JSON.stringify({ model: 'text-embedding-3-small', dimensions: EMBEDDING_DIM, input: chunk.map((c) => c.text) }),
          signal: AbortSignal.timeout(20_000),
        });
        if (!res.ok) throw new Error(`embeddings HTTP ${res.status}`);
        const json = (await res.json()) as { data: { embedding: number[] }[] };
        vectors.push(...json.data.map((d) => d.embedding));
      }
      return { vectors, model: 'openai/text-embedding-3-small (256d)' };
    } catch (err) {
      console.warn('[embeddings] provider failed, falling back to local:', (err as Error).message);
    }
  }
  return { vectors: items.map((i) => localEmbedding(i.tokens)), model: LOCAL_EMBEDDING_MODEL };
}
