import type { AttributeMap, AttrValue, ExtractedAttribute } from '../types';

export class AttrBuilder {
  readonly attrs: AttributeMap = {};

  set(key: string, value: AttrValue | null | undefined, confidence: number, source: ExtractedAttribute['source'], raw?: string) {
    if (value === null || value === undefined || value === '' || (typeof value === 'number' && !Number.isFinite(value))) return this;
    const existing = this.attrs[key];
    if (!existing || existing.confidence < confidence) this.attrs[key] = { value, confidence, source, raw };
    return this;
  }

  has(key: string) {
    return key in this.attrs;
  }

  get(key: string) {
    return this.attrs[key]?.value;
  }
}

/** First matching rule wins (rules are ordered most-specific first). */
export function firstRule<T>(text: string, rules: [RegExp, T][]): { value: T; raw: string } | null {
  for (const [re, value] of rules) {
    const m = re.exec(text);
    if (m) return { value, raw: m[0] };
  }
  return null;
}

/** Earliest occurrence in the text wins (useful for "GATE VALVE … BALL SEAT"). */
export function earliestRule<T>(text: string, rules: [RegExp, T][]): { value: T; raw: string } | null {
  let best: { value: T; raw: string; index: number } | null = null;
  for (const [re, value] of rules) {
    const m = re.exec(text);
    if (m && (best === null || m.index < best.index)) best = { value, raw: m[0], index: m.index };
  }
  return best ? { value: best.value, raw: best.raw } : null;
}

/** Parse "1-1/2", "1 1/2", "1/2", "1.5", "4" → inches as a number. */
export function parseInch(s: string): number | null {
  const t = s.trim().replace(/\s+/g, ' ');
  let m = /^(\d+)[- ](\d+)\/(\d+)$/.exec(t);
  if (m) return Number(m[1]) + Number(m[2]) / Number(m[3]);
  m = /^(\d+)\/(\d+)$/.exec(t);
  if (m) return Number(m[1]) / Number(m[2]);
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export const round = (n: number, dp = 2) => Math.round(n * 10 ** dp) / 10 ** dp;

export const KNOWN_MAKES = [
  'SKF', 'FAG', 'NSK', 'NBC', 'TIMKEN', 'ZKL', 'NTN', 'KOYO', 'SCHAEFFLER',
  'L&T', 'AUDCO', 'KSB', 'KIRLOSKAR', 'VIRGO', 'MICROFINISH', 'BDK', 'OSWAL', 'LEADER',
  'POLYCAB', 'HAVELLS', 'KEI', 'FINOLEX', 'UNIVERSAL', 'GLOSTER',
  'UNBRAKO', 'TVS', 'LPS', 'SUNDRAM',
  'FLOWSERVE', 'SULZER', 'GRUNDFOS', 'CROMPTON', 'WPIL', 'BEACON', 'MATHER', 'JYOTI',
];

export function findMake(text: string, field?: string | null): { value: string; source: 'field' | 'dictionary' } | null {
  if (field && field.trim()) return { value: field.trim().toUpperCase(), source: 'field' };
  for (const mk of KNOWN_MAKES) {
    const re = new RegExp(`(?<![A-Z0-9])${mk}(?![A-Z0-9])`);
    if (re.test(text)) return { value: mk, source: 'dictionary' };
  }
  return null;
}
