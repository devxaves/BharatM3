import type { AttributeMap, CategoryCode, CategorySchema } from '../types';
import { extractBearing } from './bearing';
import { extractCable } from './cable';
import { extractFastener } from './fastener';
import { extractPump } from './pump';
import { extractValve } from './valve';

export interface ExtractionInput {
  text: string; // normalized (expanded) description + long text
  manufacturer?: string | null;
  partNumber?: string | null;
}

/** Stage 4 — category-specific attribute extraction. */
export function extractAttributes(category: CategoryCode, input: ExtractionInput): AttributeMap {
  const t = input.text.toUpperCase();
  switch (category) {
    case 'BEARING':
      return extractBearing(t, input);
    case 'VALVE':
      return extractValve(t, input);
    case 'CABLE':
      return extractCable(t, input);
    case 'FASTENER':
      return extractFastener(t);
    case 'PUMP':
      return extractPump(t, input);
    default:
      return {};
  }
}

export function missingRequired(schema: CategorySchema | undefined, attrs: AttributeMap): string[] {
  if (!schema) return [];
  return schema.fields.filter((f) => f.required && !(f.key in attrs)).map((f) => f.key);
}

/** Share of scored schema fields that were extracted (0–1). */
export function completeness(schema: CategorySchema | undefined, attrs: AttributeMap): number {
  if (!schema) return 0;
  const scored = schema.fields.filter((f) => f.weight > 0);
  if (!scored.length) return 0;
  const w = scored.reduce((s, f) => s + f.weight, 0);
  const got = scored.filter((f) => f.key in attrs).reduce((s, f) => s + f.weight, 0);
  return Math.round((got / w) * 100) / 100;
}

/** Deterministic identity fingerprint over identity fields (Stage B). Null if any required field is missing. */
export function attributeFingerprint(schema: CategorySchema | undefined, attrs: AttributeMap): string | null {
  if (!schema) return null;
  const parts: string[] = [];
  for (const f of schema.fields.filter((x) => x.identity)) {
    const v = attrs[f.key]?.value;
    if (v === undefined) {
      if (f.required) return null;
      parts.push(`${f.key}=∅`);
    } else parts.push(`${f.key}=${String(v)}`);
  }
  return `${schema.code}|${parts.join('|')}`;
}
