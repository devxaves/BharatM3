'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Ban, Check, CircleDashed, Clock3, HelpCircle, Sparkles, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { cx, humanize } from '@/lib/format';
import { fastTransition, transition } from '@/lib/motion';

/**
 * Semantic status language — defined ONCE and reused wherever a confidence / match / decision badge appears.
 *   high   (teal-green)  → high confidence, approved, fast-track
 *   amber               → AI suggestion awaiting human judgement / needs attention
 *   veto   (muted red)   → vetoed, excluded, rejected
 *   neutral (grey)      → informational / superseded / not matched
 *   ai     (teal)       → AI-derived signal (semantic similarity etc.)
 */
export type Tone = 'high' | 'amber' | 'veto' | 'neutral' | 'ai' | 'primary';

const TONE: Record<Tone, string> = {
  high: 'bg-high-50 text-high-700 border-high-600/30',
  amber: 'bg-amber-50 text-amber-800 border-amber-500/40',
  veto: 'bg-veto-50 text-veto-700 border-veto-600/30',
  neutral: 'bg-grey-50 text-grey-600 border-grey-300',
  ai: 'bg-teal-50 text-teal-700 border-teal-600/30',
  primary: 'bg-primary-50 text-primary-800 border-primary-300/60',
};
const DOT: Record<Tone, string> = { high: 'bg-high-600', amber: 'bg-amber-500', veto: 'bg-veto-600', neutral: 'bg-grey-400', ai: 'bg-teal-600', primary: 'bg-primary-700' };

export function Badge({ tone = 'neutral', children, className, dot, title }: { tone?: Tone; children: ReactNode; className?: string; dot?: boolean; title?: string }) {
  return (
    <span title={title} className={cx('inline-flex h-5 items-center gap-1 whitespace-nowrap rounded-sm border px-1.5 text-micro font-semibold uppercase tracking-[0.04em]', TONE[tone], className)}>
      {dot && <span className={cx('h-1.5 w-1.5 rounded-full', DOT[tone])} />}
      {children}
    </span>
  );
}

export const MATCH_TONE: Record<string, Tone> = {
  IDENTICAL: 'high',
  DUPLICATE: 'high',
  NEAR_DUPLICATE: 'amber',
  FUNCTIONALLY_EQUIVALENT: 'amber',
  INSUFFICIENT_DATA: 'amber',
  RELATED_BUT_NOT_EQUIVALENT: 'veto',
  NOT_MATCHED: 'neutral',
};
const MATCH_LABEL: Record<string, string> = {
  IDENTICAL: 'Identical',
  DUPLICATE: 'Duplicate',
  NEAR_DUPLICATE: 'Near-duplicate',
  FUNCTIONALLY_EQUIVALENT: 'Functional equiv.',
  INSUFFICIENT_DATA: 'Insufficient data',
  RELATED_BUT_NOT_EQUIVALENT: 'Related · not equiv.',
  NOT_MATCHED: 'Not matched',
};

export function MatchTypeBadge({ type, vetoed }: { type: string; vetoed?: boolean }) {
  return (
    <Badge tone={vetoed ? 'veto' : MATCH_TONE[type] ?? 'neutral'} title={type}>
      {vetoed && <Ban size={10} strokeWidth={2.5} />}
      {MATCH_LABEL[type] ?? humanize(type)}
    </Badge>
  );
}

const STATUS: Record<string, { tone: Tone; icon: ReactNode; label: string }> = {
  PENDING: { tone: 'amber', icon: <Clock3 size={10} strokeWidth={2.5} />, label: 'Pending review' },
  NEEDS_INFO: { tone: 'amber', icon: <HelpCircle size={10} strokeWidth={2.5} />, label: 'Info requested' },
  APPROVED: { tone: 'high', icon: <Check size={10} strokeWidth={3} />, label: 'Approved' },
  REJECTED: { tone: 'veto', icon: <X size={10} strokeWidth={3} />, label: 'Rejected' },
  SUPERSEDED: { tone: 'neutral', icon: <CircleDashed size={10} strokeWidth={2.5} />, label: 'Resolved transitively' },
  ACTIVE: { tone: 'high', icon: <Check size={10} strokeWidth={3} />, label: 'Active' },
  REVERSED: { tone: 'neutral', icon: <CircleDashed size={10} strokeWidth={2.5} />, label: 'Reversed' },
  RETIRED: { tone: 'neutral', icon: <CircleDashed size={10} strokeWidth={2.5} />, label: 'Retired' },
};

/** Status badge whose transition (e.g. pending → approved) is animated so a decision feels acknowledged. */
export function StatusBadge({ status }: { status: string }) {
  const s = STATUS[status] ?? { tone: 'neutral' as Tone, icon: null, label: humanize(status) };
  return (
    <span className="relative inline-flex">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span key={status} initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1, transition }} exit={{ opacity: 0, scale: 0.9, transition: fastTransition }}>
          <Badge tone={s.tone}>
            {s.icon}
            {s.label}
          </Badge>
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

export const ROUTING_LABEL: Record<string, string> = { AUTO_QUEUE: 'Fast-track', REVIEW: 'Full review', UNRESOLVED: 'Unresolved', NONE: 'No action' };

export function scoreTone(score: number, vetoed?: boolean): Tone {
  if (vetoed) return 'veto';
  if (score >= 0.95) return 'high';
  if (score >= 0.75) return 'amber';
  return 'neutral';
}

/** Compact horizontal confidence meter with threshold ticks at 0.75 and 0.95. */
export function ConfidenceMeter({ score, vetoed, width = 88, showValue = true }: { score: number; vetoed?: boolean; width?: number; showValue?: boolean }) {
  const tone = scoreTone(score, vetoed);
  const fill = { high: 'bg-high-600', amber: 'bg-amber-500', veto: 'bg-veto-600', neutral: 'bg-grey-400', ai: 'bg-teal-600', primary: 'bg-primary-700' }[tone];
  return (
    <span className="inline-flex items-center gap-2" title={`Confidence ${(score * 100).toFixed(1)}%${vetoed ? ' — vetoed by hard exclusion rule' : ''}`}>
      <span className="relative h-1.5 overflow-hidden rounded-full bg-grey-100" style={{ width }}>
        <motion.span className={cx('absolute inset-y-0 left-0 rounded-full', fill)} initial={{ width: 0 }} animate={{ width: `${Math.max(2, score * 100)}%` }} transition={transition} />
        <span className="absolute inset-y-0 w-px bg-white" style={{ left: '75%' }} />
        <span className="absolute inset-y-0 w-px bg-white" style={{ left: '95%' }} />
      </span>
      {showValue && <span className={cx('tabular font-mono text-caption', vetoed ? 'text-veto-700 line-through decoration-veto-600/50' : 'text-grey-800')}>{score.toFixed(3)}</span>}
    </span>
  );
}

export function AiTag({ children = 'AI suggestion' }: { children?: ReactNode }) {
  return (
    <Badge tone="ai">
      <Sparkles size={10} strokeWidth={2.5} />
      {children}
    </Badge>
  );
}

const CAT_SHORT: Record<string, string> = { BEARING: 'BRG', VALVE: 'VLV', CABLE: 'CBL', FASTENER: 'FST', PUMP: 'PMP', UNCLASSIFIED: 'UNC', PENDING: '…' };
export function CategoryChip({ code, long }: { code: string; long?: boolean }) {
  return (
    <span className={cx('inline-flex h-5 items-center rounded-sm border px-1.5 font-mono text-micro font-medium', code === 'UNCLASSIFIED' ? 'border-dashed border-grey-400 text-grey-500' : 'border-primary-200 bg-primary-50 text-primary-800')}>
      {long ? humanize(code) : CAT_SHORT[code] ?? code}
    </span>
  );
}

export function OrgChip({ code }: { code: string }) {
  return <span className="inline-flex h-5 min-w-[40px] items-center justify-center rounded-sm bg-primary-900 px-1.5 font-mono text-micro font-semibold tracking-wide text-white">{code}</span>;
}
