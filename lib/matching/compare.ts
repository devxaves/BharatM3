import type { AttrComparison, AttrValue, AttributeField, AttributeMap, CategorySchema } from './types';

/** Generic-vs-specific pairs that are compatible but underspecified (e.g. "CS" vs "CS-WCB", "ARMOURED" vs "WIRE"). */
export function isGenericOf(generic: string, specific: string): boolean {
  if (generic === specific) return false;
  if (specific.startsWith(`${generic}-`) || specific.startsWith(`${generic}_`)) return true;
  if (generic === 'SS' && /^SS\d{3}/.test(specific)) return true;
  if (generic === 'ARMOURED' && ['WIRE', 'STRIP'].includes(specific)) return true;
  return false;
}

export function compareValues(field: AttributeField, a: AttrValue | undefined, b: AttrValue | undefined): Pick<AttrComparison, 'status' | 'score' | 'note'> {
  if (a === undefined && b === undefined) return { status: 'MISSING_BOTH', score: 0 };
  if (a === undefined) return { status: 'MISSING_A', score: 0.5, note: 'not stated in record A' };
  if (b === undefined) return { status: 'MISSING_B', score: 0.5, note: 'not stated in record B' };

  if (field.type === 'number') {
    const x = Number(a);
    const y = Number(b);
    const denom = Math.max(Math.abs(x), Math.abs(y)) || 1;
    const rel = Math.abs(x - y) / denom;
    const tol = field.tolerance ?? 0;
    if (rel <= tol + 1e-9) return { status: 'MATCH', score: 1, note: rel > 0 ? `within ±${Math.round(tol * 100)}% tolerance` : undefined };
    if (rel <= tol * 3 + 0.02) return { status: 'PARTIAL', score: 0.5, note: `differs by ${(rel * 100).toFixed(1)}%` };
    return { status: 'CONFLICT', score: 0, note: `differs by ${(rel * 100).toFixed(0)}%` };
  }

  const sa = String(a).toUpperCase();
  const sb = String(b).toUpperCase();
  if (sa === sb) return { status: 'MATCH', score: 1 };
  if (isGenericOf(sa, sb) || isGenericOf(sb, sa)) return { status: 'PARTIAL', score: 0.6, note: 'one record is underspecified' };
  return { status: 'CONFLICT', score: 0 };
}

export function compareAttributes(schema: CategorySchema, a: AttributeMap, b: AttributeMap): AttrComparison[] {
  return schema.fields.map((f) => {
    const va = a[f.key]?.value;
    const vb = b[f.key]?.value;
    const r = compareValues(f, va, vb);
    return {
      key: f.key,
      label: f.label,
      group: f.group,
      a: va ?? null,
      b: vb ?? null,
      unit: f.unit,
      status: r.status,
      score: r.score,
      weight: f.weight,
      veto: f.veto,
      note: r.note,
    };
  });
}

/** Weighted mean of comparable fields in a group; null when nothing in the group is comparable. */
export function groupScore(comparisons: AttrComparison[], group: AttrComparison['group']): number | null {
  const rows = comparisons.filter((c) => c.group === group && c.weight > 0 && c.status !== 'MISSING_BOTH');
  const w = rows.reduce((s, c) => s + c.weight, 0);
  if (!w) return null;
  return rows.reduce((s, c) => s + c.weight * c.score, 0) / w;
}
