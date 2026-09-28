'use client';

import { motion } from 'framer-motion';
import { Ban, Check, CircleSlash, Minus, Replace, ShieldAlert, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { Badge, CategoryChip, OrgChip, type Tone } from '@/components/ui/status';
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
                <span key={j} className="text-grey-400 font-bold">{p}</span>
              ) : (
                <span key={j} className={cx('rounded px-[2px] font-semibold', otherSet.has(p) ? 'bg-teal-100 text-teal-900 border border-teal-200' : 'text-grey-900 underline decoration-grey-300 decoration-dotted underline-offset-2')}>
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
    <div className="grid grid-cols-[120px_1fr] gap-2 py-1 text-caption">
      <dt className="text-grey-500 font-semibold">{label}</dt>
      <dd className="min-w-0 text-grey-900 font-medium">{children}</dd>
    </div>
  );
}

export function RecordCard({ r, other, side }: { r: RecordView; other: RecordView; side: 'A' | 'B' }) {
  return (
    <div className="min-w-0 rounded-xl border border-grey-200 bg-white shadow-card overflow-hidden">
      <div className="flex items-center gap-2.5 border-b border-grey-200/90 bg-grey-50 px-4 py-2.5">
        <span className="flex h-5 w-5 items-center justify-center rounded bg-primary-900 font-mono text-micro font-bold text-white shadow-2xs">{side}</span>
        <OrgChip code={r.org.code} />
        <span className="truncate text-caption font-bold text-grey-800">{r.org.name}</span>
        <span className="ml-auto font-mono text-caption font-bold text-primary-900 bg-primary-50 px-2 py-0.5 rounded border border-primary-200">{r.legacyCode}</span>
      </div>
      <div className="p-4 space-y-3">
        <div>
          <div className="text-micro font-semibold uppercase tracking-[0.08em] text-grey-500 mb-1">Raw ERP Description</div>
          <div className="rounded-lg border border-grey-200/80 bg-grey-50/70 p-2.5 font-mono text-caption font-semibold text-grey-900">
            {r.rawDescription}
            {r.rawLongText && <div className="mt-1 text-micro text-grey-500 font-normal">{r.rawLongText}</div>}
          </div>
        </div>

        <div>
          <div className="text-micro font-semibold uppercase tracking-[0.08em] text-teal-700 mb-1 flex items-center gap-1.5">
            Normalized · abbreviations expanded
          </div>
          <div className="min-h-[44px] rounded-lg border border-teal-100 bg-teal-50/30 p-2.5">
            <TokenText text={r.normalized} other={other.normalized} />
          </div>
          {r.expansions.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {r.expansions.slice(0, 8).map((e) => (
                <span key={e.term} className="rounded border border-grey-200 bg-white px-1.5 py-0.5 font-mono text-micro text-grey-700 shadow-2xs" title={`${e.kind.toLowerCase()} from dictionary`}>
                  <b className="text-grey-900">{e.term}</b> → {e.expansion}
                </span>
              ))}
            </div>
          )}
        </div>

        <dl className="mt-3 border-t border-grey-100 pt-2.5 divide-y divide-grey-100/60">
          <Field label="Category">
            <span className="inline-flex items-center gap-2">
              <CategoryChip code={r.category} long />
              <span className="text-micro font-bold text-grey-500">{(r.categoryConfidence * 100).toFixed(0)}% conf.</span>
            </span>
          </Field>
          <Field label="Unit of measure">
            <span className="font-mono font-bold text-grey-800">{r.rawUom ?? '—'}</span>
            {r.baseUom && r.rawUom?.toUpperCase() !== r.baseUom && <span className="text-teal-700 font-bold"> → {r.baseUom} (ISO)</span>}
          </Field>
          <Field label="Make / MPN">
            {r.manufacturer || r.partNumber ? (
              <span className="font-mono text-grey-900 font-semibold">
                {r.manufacturer ?? '—'} {r.partNumber && <span className="text-primary-800 bg-primary-50 px-1 rounded font-bold">{r.partNumber}</span>}
              </span>
            ) : (
              <span className="text-grey-400">not recorded</span>
            )}
          </Field>
          <Field label="Last PO">
            {r.lastPoPriceInr ? (
              <span className="font-semibold text-grey-900">
                {fmtInr(r.lastPoPriceInr, { compact: false })}
                {r.annualQty ? <span className="text-grey-500 font-normal"> ({r.annualQty} / yr)</span> : ''}
              </span>
            ) : (
              <span className="text-grey-400">no procurement history</span>
            )}
          </Field>
          <Field label="Completeness">
            <span className="inline-flex items-center gap-2">
              <span className="h-1.5 w-16 overflow-hidden rounded-full bg-grey-200">
                <span className="block h-full rounded-full bg-teal-600" style={{ width: `${r.completeness * 100}%` }} />
              </span>
              <span className="tabular font-bold text-grey-800">{(r.completeness * 100).toFixed(0)}%</span>
            </span>
          </Field>
          {r.mapping && (
            <Field label="Harmonised">
              <span className="font-mono font-bold text-high-800">{r.mapping.cnmc}</span>
            </Field>
          )}
        </dl>
      </div>
    </div>
  );
}

const VERDICT: Record<AttrComparison['status'], { label: string; icon: ReactNode; cls: string; row?: string }> = {
  MATCH: { label: 'Match', icon: <Check size={13} strokeWidth={3} />, cls: 'text-high-800 font-bold' },
  PARTIAL: { label: 'Underspecified', icon: <TriangleAlert size={13} />, cls: 'text-amber-800 font-semibold' },
  SUBSTITUTABLE: { label: 'Substitution rule', icon: <Replace size={13} />, cls: 'text-amber-800 font-bold', row: 'bg-amber-50/70' },
  CONFLICT: { label: 'Conflict', icon: <CircleSlash size={13} />, cls: 'text-veto-800 font-bold', row: 'bg-veto-50/60' },
  VETO: { label: 'Hard veto', icon: <Ban size={13} strokeWidth={2.5} />, cls: 'text-veto-800 font-bold', row: 'bg-veto-100/70' },
  MISSING_A: { label: 'Not stated (A)', icon: <Minus size={13} />, cls: 'text-grey-500 font-medium' },
  MISSING_B: { label: 'Not stated (B)', icon: <Minus size={13} />, cls: 'text-grey-500 font-medium' },
  MISSING_BOTH: { label: '—', icon: null, cls: 'text-grey-300' },
};
const GROUP_LABEL: Record<string, string> = { attribute: 'Identity', specification: 'Spec / rating', dimension: 'Dimension', descriptive: 'Info' };

/** The attribute diff — revealed row by row so the explanation is shown, not dumped. */
export function AttributeDiff({ rec }: { rec: RecommendationDetail }) {
  const rows = rec.attributeDiff.filter((c) => c.status !== 'MISSING_BOTH');
  const count = (s: AttrComparison['status'][]) => rows.filter((r) => s.includes(r.status) && r.weight > 0).length;
  return (
    <div className="rounded-xl border border-grey-200 bg-white shadow-card overflow-hidden">
      <div className="flex items-center justify-between border-b border-grey-200/90 bg-grey-50/70 px-4 py-3">
        <h3 className="panel-title">Governed Attribute Comparison</h3>
        <div className="flex items-center gap-3 text-caption font-bold">
          <span className="text-high-800 bg-high-50 px-2 py-0.5 rounded border border-high-200">{count(['MATCH'])} match</span>
          <span className="text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">{count(['PARTIAL', 'SUBSTITUTABLE'])} partial</span>
          <span className="text-veto-800 bg-veto-50 px-2 py-0.5 rounded border border-veto-200">{count(['CONFLICT', 'VETO'])} conflict</span>
          <span className="text-grey-500">{count(['MISSING_A', 'MISSING_B'])} not stated</span>
        </div>
      </div>
      <table className="w-full text-dense">
        <thead>
          <tr className="border-b border-grey-200 bg-grey-50/50 text-left text-micro font-semibold uppercase tracking-[0.08em] text-grey-500">
            <th className="w-[26%] px-4 py-2 font-bold">Attribute</th>
            <th className="w-[27%] px-4 py-2 font-bold">Record A · {rec.a.org.code}</th>
            <th className="w-[27%] px-4 py-2 font-bold">Record B · {rec.b.org.code}</th>
            <th className="px-4 py-2 font-bold">Verdict</th>
          </tr>
        </thead>
        <motion.tbody key={rec.id} variants={staggerParent} initial="initial" animate="animate">
          {rows.map((c) => {
            const v = VERDICT[c.status];
            const aSrc = rec.a.attributes[c.key];
            const bSrc = rec.b.attributes[c.key];
            return (
              <motion.tr key={c.key} variants={staggerChild} className={cx('border-t border-grey-100', v.row)}>
                <td className="px-4 py-2.5">
                  <div className="font-bold text-grey-900">{c.label}</div>
                  <div className="text-micro font-semibold uppercase tracking-[0.08em] text-grey-400">
                    {GROUP_LABEL[c.group]}
                    {c.veto && <span className="ml-1.5 text-veto-700 font-bold" title="Safety-critical: mismatch triggers a hard veto">· safety-critical</span>}
                  </div>
                </td>
                {[{ v: c.a, s: aSrc }, { v: c.b, s: bSrc }].map((x, i) => (
                  <td key={i} className="px-4 py-2.5">
                    {fmtVal(x.v, c.unit) ? (
                      <span className="font-mono text-caption font-bold text-grey-900" title={x.s ? `source: ${x.s.source}${x.s.raw ? ` ("${x.s.raw}")` : ''} · confidence ${(x.s.confidence * 100).toFixed(0)}%` : undefined}>
                        {fmtVal(x.v, c.unit)}
                        {x.s && x.s.source !== 'regex' && x.s.source !== 'dictionary' && <span className="ml-1 text-micro text-grey-500 font-normal">({x.s.source})</span>}
                      </span>
                    ) : (
                      <span className="text-caption text-grey-400 italic">not stated</span>
                    )}
                  </td>
                ))}
                <td className="px-4 py-2.5">
                  <span className={cx('inline-flex items-center gap-1.5 text-caption', v.cls)}>
                    {v.icon}
                    {v.label}
                  </span>
                  {c.note && c.status !== 'MATCH' && <div className="text-micro text-grey-600 font-normal mt-0.5">{c.note}</div>}
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
  if (!rec.vetoes?.length) return null;
  return (
    <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0, transition }} className="rounded-xl border-2 border-veto-600 bg-veto-50 p-4 shadow-sm">
      <div className="flex items-center gap-2 text-dense font-bold text-veto-800">
        <ShieldAlert size={18} /> Hard Exclusion Rule Triggered — Equivalence Blocked
      </div>
      <p className="mt-1 text-caption text-veto-900 leading-relaxed font-medium">
        Despite high text and lexical similarity, deterministic engineering safety rules blocked automated harmonization to prevent plant safety hazards.
      </p>
      <div className="mt-3 space-y-2">
        {rec.vetoes.map((v, i) => (
          <div key={i} className="rounded-lg border border-veto-300 bg-white p-3 text-caption shadow-2xs">
            <div className="font-bold text-veto-900">{v.rule}</div>
            <div className="mt-0.5 text-grey-600">{v.message}</div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

export function ScoreBreakdown({ rec }: { rec: RecommendationDetail }) {
  const c = rec.componentScores;
  const scores = [
    { label: 'Semantic Similarity', val: c?.semantic ?? 0, weight: '30%' },
    { label: 'Core Attributes', val: c?.attribute ?? 0, weight: '35%' },
    { label: 'Specifications', val: c?.specification ?? 0, weight: '15%' },
    { label: 'Dimensions', val: c?.dimension ?? 0, weight: '10%' },
    { label: 'Classification & UOM', val: c?.classification ?? 0, weight: '10%' },
  ];

  return (
    <div className="rounded-xl border border-grey-200 bg-white p-4 shadow-card space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="panel-title">Multi-Signal Score Breakdown</h3>
        <span className="font-mono text-caption font-bold text-primary-900 bg-primary-50 px-2 py-0.5 rounded border border-primary-200">
          Composite: {((rec.finalScore ?? 0) * 100).toFixed(1)}%
        </span>
      </div>
      <div className="space-y-2.5">
        {scores.map((s) => (
          <div key={s.label} className="grid grid-cols-[140px_1fr_48px] items-center gap-3 text-caption">
            <span className="truncate text-grey-700 font-semibold">{s.label}</span>
            <div className="h-2 overflow-hidden rounded-full bg-grey-100">
              <div
                className="h-full rounded-full bg-teal-600 transition-all duration-500"
                style={{ width: `${Math.max(2, (s.val ?? 0) * 100)}%` }}
              />
            </div>
            <span className="tabular font-mono text-micro font-bold text-grey-800 text-right">
              {((s.val ?? 0) * 100).toFixed(0)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function reasonTone(code: string): Tone {
  if (code.startsWith('VETO_')) return 'veto';
  if (code.includes('MATCH') || code.includes('EXACT') || code.includes('EQUIVALENT')) return 'high';
  if (code.includes('CONFLICT') || code.includes('DIFF') || code.includes('PARTIAL') || code.includes('SUBSTITUTABLE')) return 'amber';
  return 'neutral';
}

export function ReasonCodes({ codes }: { codes: string[] }) {
  if (!codes?.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {codes.map((c) => (
        <Badge key={c} tone={reasonTone(c)} className="!normal-case font-mono !tracking-normal">
          {c}
        </Badge>
      ))}
    </div>
  );
}
