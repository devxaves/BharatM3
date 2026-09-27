'use client';

import { motion } from 'framer-motion';
import { Ban, Check, CircleSlash, Minus, Replace, ShieldAlert, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { Badge, CategoryChip, OrgChip } from '@/components/ui/status';
import type { RecordView, RecommendationDetail } from '@/lib/client/types';
import { cx, fmtInr, humanize } from '@/lib/format';
import { staggerChild, staggerParent, transition } from '@/lib/motion';
import type { AttrComparison } from '@/lib/matching/types';

const fmtVal = (v: unknown, unit?: string) => (v === null || v === undefined ? null : `${String(v).replace(/_/g, ' ')}${unit && typeof v === 'number' ? ` ${unit}` : ''}`);

/** Normalized description with tokens shared by both records tinted teal (AI-derived similarity signal). */
function TokenText({ text, other }: { text: string; other: string }) {
  const otherSet = new Set(other.split(/[\s\-/]+/));
  return (
    <span className="font-mono text-caption leading-[1.7]">
      {text.split(' ').map((tok, i) => {
        const parts = tok.split(/([-/])/);
        return (
          <span key={i}>
            {parts.map((p, j) =>
              p === '-' || p === '/' ? (
                <span key={j} className="text-grey-400">{p}</span>
              ) : (
                <span key={j} className={cx('rounded-sm px-[1px]', otherSet.has(p) ? 'bg-teal-50 text-teal-800' : 'text-grey-900 underline decoration-grey-300 decoration-dotted underline-offset-2')}>
                  {p}
                </span>
              ),
            )}{' '}
          </span>
        );
      })}
    </span>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[112px_1fr] gap-2 py-[3px] text-caption">
      <dt className="text-grey-500">{label}</dt>
      <dd className="min-w-0 text-grey-800">{children}</dd>
    </div>
  );
}

export function RecordCard({ r, other, side }: { r: RecordView; other: RecordView; side: 'A' | 'B' }) {
  return (
    <div className="min-w-0 rounded-md border border-grey-200 bg-white">
      <div className="flex items-center gap-2 border-b border-grey-200 bg-grey-25 px-3 py-2">
        <span className="flex h-5 w-5 items-center justify-center rounded-sm bg-grey-200 font-mono text-micro font-semibold text-grey-700">{side}</span>
        <OrgChip code={r.org.code} />
        <span className="truncate text-caption text-grey-600">{r.org.name}</span>
        <span className="ml-auto font-mono text-dense font-medium text-primary-800">{r.legacyCode}</span>
      </div>
      <div className="px-3 py-2.5">
        <div className="eyebrow mb-1">As held in {r.org.code} ERP</div>
        <div className="rounded-sm bg-grey-50 px-2 py-1.5 font-mono text-caption text-grey-900">
          {r.rawDescription}
          {r.rawLongText && <div className="mt-0.5 text-grey-500">{r.rawLongText}</div>}
        </div>
        <div className="eyebrow mb-1 mt-2.5 flex items-center gap-1.5">Normalized · abbreviations expanded</div>
        <div className="min-h-[40px]">
          <TokenText text={r.normalized} other={other.normalized} />
        </div>
        {r.expansions.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {r.expansions.slice(0, 8).map((e) => (
              <span key={e.term} className="rounded-sm border border-grey-200 px-1 font-mono text-micro text-grey-600" title={`${e.kind.toLowerCase()} from dictionary`}>
                {e.term}→{e.expansion}
              </span>
            ))}
          </div>
        )}
        <dl className="mt-2.5 border-t border-grey-100 pt-2">
          <Field label="Category">
            <span className="inline-flex items-center gap-1.5">
              <CategoryChip code={r.category} long /> <span className="text-grey-500">conf. {(r.categoryConfidence * 100).toFixed(0)}%</span>
            </span>
          </Field>
          <Field label="Unit of measure">
            <span className="font-mono">{r.rawUom ?? '—'}</span>
            {r.baseUom && r.rawUom?.toUpperCase() !== r.baseUom && <span className="text-grey-500"> → {r.baseUom}</span>}
          </Field>
          <Field label="Make / MPN">
            {r.manufacturer || r.partNumber ? (
              <span className="font-mono">
                {r.manufacturer ?? '—'} {r.partNumber && <span className="text-primary-800">{r.partNumber}</span>}
              </span>
            ) : (
              <span className="text-grey-400">not recorded</span>
            )}
          </Field>
          <Field label="Last PO">{r.lastPoPriceInr ? `${fmtInr(r.lastPoPriceInr, { compact: false })}${r.annualQty ? ` × ${r.annualQty} / yr` : ''}` : <span className="text-grey-400">no procurement history</span>}</Field>
          <Field label="Completeness">
            <span className="inline-flex items-center gap-2">
              <span className="h-1.5 w-16 overflow-hidden rounded-full bg-grey-100">
                <span className="block h-full rounded-full bg-primary-600" style={{ width: `${r.completeness * 100}%` }} />
              </span>
              <span className="tabular">{(r.completeness * 100).toFixed(0)}%</span>
            </span>
          </Field>
          {r.mapping && (
            <Field label="Harmonised">
              <span className="font-mono text-high-700">{r.mapping.cnmc}</span>
            </Field>
          )}
        </dl>
      </div>
    </div>
  );
}

const VERDICT: Record<AttrComparison['status'], { label: string; icon: ReactNode; cls: string; row?: string }> = {
  MATCH: { label: 'Match', icon: <Check size={12} strokeWidth={3} />, cls: 'text-high-700' },
  PARTIAL: { label: 'Underspecified', icon: <TriangleAlert size={12} />, cls: 'text-amber-700' },
  SUBSTITUTABLE: { label: 'Substitution rule', icon: <Replace size={12} />, cls: 'text-amber-700', row: 'bg-amber-50/60' },
  CONFLICT: { label: 'Conflict', icon: <CircleSlash size={12} />, cls: 'text-veto-700', row: 'bg-veto-50/50' },
  VETO: { label: 'Hard veto', icon: <Ban size={12} strokeWidth={2.5} />, cls: 'text-veto-700 font-semibold', row: 'bg-veto-50' },
  MISSING_A: { label: 'Not stated (A)', icon: <Minus size={12} />, cls: 'text-grey-500' },
  MISSING_B: { label: 'Not stated (B)', icon: <Minus size={12} />, cls: 'text-grey-500' },
  MISSING_BOTH: { label: '—', icon: null, cls: 'text-grey-300' },
};
const GROUP_LABEL: Record<string, string> = { attribute: 'Identity', specification: 'Spec / rating', dimension: 'Dimension', descriptive: 'Info' };

/** The attribute diff — revealed row by row so the explanation is shown, not dumped. */
export function AttributeDiff({ rec }: { rec: RecommendationDetail }) {
  const rows = rec.attributeDiff.filter((c) => c.status !== 'MISSING_BOTH');
  const count = (s: AttrComparison['status'][]) => rows.filter((r) => s.includes(r.status) && r.weight > 0).length;
  return (
    <div className="rounded-md border border-grey-200 bg-white">
      <div className="flex items-center justify-between border-b border-grey-200 px-3 py-2">
        <h3 className="panel-title">Attribute comparison</h3>
        <div className="flex items-center gap-3 text-caption">
          <span className="text-high-700">{count(['MATCH'])} match</span>
          <span className="text-amber-700">{count(['PARTIAL', 'SUBSTITUTABLE'])} partial</span>
          <span className="text-veto-700">{count(['CONFLICT', 'VETO'])} conflict</span>
          <span className="text-grey-500">{count(['MISSING_A', 'MISSING_B'])} not stated</span>
        </div>
      </div>
      <table className="w-full text-dense">
        <thead>
          <tr className="text-left text-micro uppercase tracking-[0.06em] text-grey-500">
            <th className="w-[26%] px-3 py-1.5 font-semibold">Attribute</th>
            <th className="w-[27%] px-3 py-1.5 font-semibold">Record A · {rec.a.org.code}</th>
            <th className="w-[27%] px-3 py-1.5 font-semibold">Record B · {rec.b.org.code}</th>
            <th className="px-3 py-1.5 font-semibold">Verdict</th>
          </tr>
        </thead>
        <motion.tbody key={rec.id} variants={staggerParent} initial="initial" animate="animate">
          {rows.map((c) => {
            const v = VERDICT[c.status];
            const aSrc = rec.a.attributes[c.key];
            const bSrc = rec.b.attributes[c.key];
            return (
              <motion.tr key={c.key} variants={staggerChild} className={cx('border-t border-grey-100', v.row)}>
                <td className="px-3 py-1.5">
                  <div className="font-medium text-grey-900">{c.label}</div>
                  <div className="text-micro uppercase tracking-[0.05em] text-grey-400">
                    {GROUP_LABEL[c.group]}
                    {c.veto && <span className="ml-1.5 text-veto-600" title="Safety-critical: mismatch triggers a hard veto">· safety-critical</span>}
                  </div>
                </td>
                {[{ v: c.a, s: aSrc }, { v: c.b, s: bSrc }].map((x, i) => (
                  <td key={i} className="px-3 py-1.5">
                    {fmtVal(x.v, c.unit) ? (
                      <span className="font-mono text-caption text-grey-900" title={x.s ? `source: ${x.s.source}${x.s.raw ? ` ("${x.s.raw}")` : ''} · confidence ${(x.s.confidence * 100).toFixed(0)}%` : undefined}>
                        {fmtVal(x.v, c.unit)}
                        {x.s && x.s.source !== 'regex' && x.s.source !== 'dictionary' && <span className="ml-1 text-micro text-grey-400">({x.s.source})</span>}
                      </span>
                    ) : (
                      <span className="text-caption text-grey-400">not stated</span>
                    )}
                  </td>
                ))}
                <td className="px-3 py-1.5">
                  <span className={cx('inline-flex items-center gap-1 text-caption', v.cls)}>
                    {v.icon}
                    {v.label}
                  </span>
                  {c.note && c.status !== 'MATCH' && <div className="text-micro text-grey-500">{c.note}</div>}
                </td>
              </motion.tr>
            );
          })}
        </motion.tbody>
      </table>
    </div>
  );
}

export function VetoPanel({ rec }: { rec: RecommendationDetail }) {
  if (!rec.vetoes.length) return null;
  return (
    <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0, transition }} className="rounded-md border border-veto-600/40 bg-veto-50 px-3.5 py-3">
      <div className="flex items-center gap-2 text-dense font-semibold text-veto-700">
        <ShieldAlert size={16} /> Hard exclusion rule — equivalence blocked
      </div>
      <p className="mt-1 text-caption text-veto-700/90">
        The raw similarity score was <b className="tabular">{rec.rawScore.toFixed(3)}</b>, but a safety-critical attribute differs. The exclusion layer runs after scoring and overrides it; this pair
        can never be approved as equivalent unless engineering approves a substitution rule.
      </p>
      <ul className="mt-2 space-y-1">
        {rec.vetoes.map((v) => (
          <li key={v.rule + v.attribute} className="flex gap-2 text-caption text-grey-800">
            <Badge tone="veto">{v.rule.replace('VETO_', '').replace(/_/g, ' ')}</Badge>
            <span>{v.message}</span>
          </li>
        ))}
      </ul>
    </motion.div>
  );
}

const COMPONENTS: { key: keyof RecommendationDetail['effectiveWeights']; label: string; ai?: boolean }[] = [
  { key: 'semantic', label: 'Semantic + fuzzy text', ai: true },
  { key: 'attribute', label: 'Identity attributes' },
  { key: 'specification', label: 'Specification / rating' },
  { key: 'dimension', label: 'Dimensions' },
  { key: 'classification', label: 'Classification' },
  { key: 'uom', label: 'UOM compatibility' },
  { key: 'procurement', label: 'Procurement history' },
];

export function ScoreBreakdown({ rec }: { rec: RecommendationDetail }) {
  const s = rec.componentScores;
  return (
    <div className="rounded-md border border-grey-200 bg-white">
      <div className="flex items-center justify-between border-b border-grey-200 px-3 py-2">
        <h3 className="panel-title">Score fusion</h3>
        <span className="font-mono text-caption text-grey-500">Σ w·s = {rec.rawScore.toFixed(3)}</span>
      </div>
      <div className="px-3 py-2">
        {COMPONENTS.map((c) => {
          const val = s[c.key] as number | null;
          const w = rec.effectiveWeights[c.key];
          const unavailable = val === null || w === 0;
          return (
            <div key={c.key} className="grid grid-cols-[150px_44px_1fr_52px] items-center gap-2 py-[5px] text-caption">
              <span className={cx('flex items-center gap-1', unavailable ? 'text-grey-400' : 'text-grey-700')}>
                {c.label}
                {c.ai && <span className="rounded-sm bg-teal-50 px-1 font-mono text-[10px] font-semibold text-teal-700">AI</span>}
              </span>
              <span className="tabular font-mono text-micro text-grey-500">w {w.toFixed(2)}</span>
              <span className="relative h-2 overflow-hidden rounded-sm bg-grey-100">
                {!unavailable && (
                  <motion.span
                    key={rec.id}
                    className={cx('absolute inset-y-0 left-0 rounded-sm', c.ai ? 'bg-teal-600' : 'bg-primary-600')}
                    initial={{ width: 0 }}
                    animate={{ width: `${(val ?? 0) * 100}%` }}
                    transition={transition}
                  />
                )}
                {unavailable && <span className="absolute inset-0 flex items-center pl-1.5 text-[10px] text-grey-400">unavailable — weight redistributed</span>}
              </span>
              <span className="tabular text-right font-mono text-grey-800">{unavailable ? '—' : (val ?? 0).toFixed(2)}</span>
            </div>
          );
        })}
        <div className="mt-1.5 grid grid-cols-4 gap-2 border-t border-grey-100 pt-2 text-micro text-grey-500">
          <span title="pgvector cosine on embeddings">cosine <b className="font-mono text-grey-700">{s.cosine.toFixed(2)}</b></span>
          <span title="Jaro-Winkler on sorted tokens">J-W <b className="font-mono text-grey-700">{s.jaroWinkler.toFixed(2)}</b></span>
          <span title="Levenshtein ratio">Lev <b className="font-mono text-grey-700">{s.levenshteinRatio.toFixed(2)}</b></span>
          <span title="Token Jaccard">Jaccard <b className="font-mono text-grey-700">{s.tokenJaccard.toFixed(2)}</b></span>
        </div>
      </div>
    </div>
  );
}

export function reasonTone(code: string) {
  if (code.startsWith('VETO_')) return 'veto' as const;
  if (/^(ATTR_CONFLICT|ATTR_MISSING|ATTR_UNDERSPECIFIED|MISSING_REQUIRED|UOM_INCOMPATIBLE|PRICE_DIVERGENT|SUBSTITUTION|IDENTITY)/.test(code)) return 'amber' as const;
  if (/^(DETERMINISTIC|ATTRIBUTE_FINGERPRINT|ATTRIBUTES_ALL|TEXT_IDENTICAL|SEMANTIC_HIGH|UOM_SAME|PRICE_CONSISTENT)/.test(code)) return 'high' as const;
  if (code.startsWith('SEMANTIC')) return 'ai' as const;
  return 'neutral' as const;
}

export function ReasonCodes({ codes }: { codes: string[] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {codes.map((c) => (
        <Badge key={c} tone={reasonTone(c)} className="!normal-case !tracking-normal font-mono !font-medium">
          {c}
        </Badge>
      ))}
    </div>
  );
}

export { humanize };
