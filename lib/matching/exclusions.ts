import { compareValues } from './compare';
import type { AttributeMap, CategorySchema, SubstitutionRule, VetoKind, VetoResult } from './types';

export const VETO_RULE_IDS: Record<VetoKind, string> = {
  PRESSURE_CLASS: 'VETO_PRESSURE_CLASS_MISMATCH',
  MATERIAL_GRADE: 'VETO_MATERIAL_GRADE_MISMATCH',
  VOLTAGE: 'VETO_VOLTAGE_MISMATCH',
  CERTIFICATION: 'VETO_CERTIFICATION_MISMATCH',
  THREAD: 'VETO_THREAD_MISMATCH',
  SIZE: 'VETO_SIZE_MISMATCH',
};

const WHY: Record<VetoKind, string> = {
  PRESSURE_CLASS: 'a lower-rated component cannot be installed in a higher-pressure service',
  MATERIAL_GRADE: 'material grade governs corrosion resistance, temperature limits and weldability',
  VOLTAGE: 'insulation is rated for a specific system voltage; substitution is an electrical safety hazard',
  CERTIFICATION: 'certification (fire-safe / flameproof / fire-performance) is a statutory or safety requirement',
  THREAD: 'mismatched threads cannot be assembled and may strip under load',
  SIZE: 'physical size / designation differs, so the parts are not dimensionally interchangeable',
};

export interface ExclusionOutcome {
  vetoes: VetoResult[];
  substitutions: { attribute: string; rule: SubstitutionRule; direction: string }[];
}

/**
 * Stage 6 — hard exclusion rules layer (PRD principle 3).
 *
 * Runs AFTER scoring and is independent of it: any confirmed mismatch on a safety-critical attribute vetoes the
 * match, however high the text / semantic score. The only escape hatch is an explicit, category-scoped entry in
 * `substitution_rules` approved by engineering.
 * Unknown values (attribute missing on one side) never veto — they are routed to review / INSUFFICIENT_DATA instead.
 */
export function evaluateHardExclusions(schema: CategorySchema, a: AttributeMap, b: AttributeMap, rules: SubstitutionRule[] = []): ExclusionOutcome {
  const vetoes: VetoResult[] = [];
  const substitutions: ExclusionOutcome['substitutions'] = [];

  for (const field of schema.fields) {
    if (!field.veto) continue;
    const va = a[field.key]?.value;
    const vb = b[field.key]?.value;
    if (va === undefined || vb === undefined) continue;
    const cmp = compareValues(field, va, vb);
    if (cmp.status !== 'CONFLICT') continue;

    const sa = String(va).toUpperCase();
    const sb = String(vb).toUpperCase();
    const rule = rules.find(
      (r) =>
        r.category === schema.code &&
        r.attributeKey === field.key &&
        ((r.fromValue.toUpperCase() === sa && r.toValue.toUpperCase() === sb) || (r.fromValue.toUpperCase() === sb && r.toValue.toUpperCase() === sa)),
    );
    if (rule) {
      const dir = rule.bidirectional ? 'interchangeable' : `${rule.toValue} may replace ${rule.fromValue} (one-way)`;
      substitutions.push({ attribute: field.key, rule, direction: dir });
      continue;
    }

    const unit = field.unit ? ` ${field.unit}` : '';
    vetoes.push({
      rule: VETO_RULE_IDS[field.veto],
      kind: field.veto,
      attribute: field.key,
      a: va,
      b: vb,
      message: `${field.label} differs (${va}${unit} vs ${vb}${unit}): ${WHY[field.veto]}. Equivalence blocked regardless of similarity score.`,
    });
  }
  return { vetoes, substitutions };
}
