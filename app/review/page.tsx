'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, Ban, Check, CheckCheck, HelpCircle, Layers, PencilLine, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { AttributeDiff, ReasonCodes, RecordCard, ScoreBreakdown, VetoPanel } from '@/components/review/comparison';
import { Button, Dialog, Empty, Kbd, LoadingBar, Tabs } from '@/components/ui/primitives';
import { AiTag, CategoryChip, ConfidenceMeter, MatchTypeBadge, OrgChip, ROUTING_LABEL, StatusBadge } from '@/components/ui/status';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/client/api';
import { useSession } from '@/lib/client/session';
import type { QueueItem, RecommendationDetail } from '@/lib/client/types';
import { cx, fmtDateTime, humanize } from '@/lib/format';
import { fastTransition, transition } from '@/lib/motion';

type Tab = 'FAST_TRACK' | 'FULL_REVIEW' | 'UNRESOLVED' | 'VETOED' | 'DECIDED';
const TAB_HELP: Record<Tab, string> = {
  FAST_TRACK: 'Score ≥ 0.95 with deterministic identity (same OEM part or attribute fingerprint). Lightweight approval — still logged per item.',
  FULL_REVIEW: 'Score 0.75–0.95: near-duplicates and functionally-equivalent candidates. Compare attributes before deciding.',
  UNRESOLVED: 'Score < 0.75 or required attributes missing. Usually needs enrichment from the source CPSE.',
  VETOED: 'High-similarity pairs blocked by a hard exclusion rule. Read-only — shown for transparency.',
  DECIDED: 'Most recent steward decisions.',
};

function QueueRow({ it, active, onSelect, checked, onCheck, showCheck }: { it: QueueItem; active: boolean; onSelect: () => void; checked: boolean; onCheck: (v: boolean) => void; showCheck: boolean }) {
  return (
    <motion.li layout="position" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, height: 0, transition: fastTransition }} transition={fastTransition}>
      <div
        role="button"
        tabIndex={0}
        onClick={onSelect}
        onKeyDown={(e) => e.key === 'Enter' && onSelect()}
        className={cx(
          'group relative flex cursor-pointer gap-2 border-b border-grey-100 px-3 py-2 transition-colors duration-150',
          active ? 'bg-primary-50 shadow-[inset_3px_0_0_rgb(var(--c-primary-700))]' : 'hover:bg-grey-50',
        )}
      >
        {showCheck && (
          <input
            type="checkbox"
            className="mt-1 accent-[rgb(var(--c-primary-700))]"
            checked={checked}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => onCheck(e.target.checked)}
            aria-label="Select for bulk approval"
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <OrgChip code={it.aOrg} />
            <span className="text-grey-400">↔</span>
            <OrgChip code={it.bOrg} />
            <CategoryChip code={it.category} />
            <span className="ml-auto">
              <MatchTypeBadge type={it.matchType} vetoed={it.vetoed} />
            </span>
          </div>
          <div className="mt-1 truncate font-mono text-micro text-grey-700" title={it.aDesc}>
            {it.aDesc}
          </div>
          <div className="truncate font-mono text-micro text-grey-500" title={it.bDesc}>
            {it.bDesc}
          </div>
          <div className="mt-1 flex items-center justify-between">
            <ConfidenceMeter score={it.vetoed ? it.rawScore : it.score} vetoed={it.vetoed} width={80} />
            {it.status !== 'PENDING' ? <StatusBadge status={it.status} /> : it.taskStatus === 'NEEDS_INFO' ? <StatusBadge status="NEEDS_INFO" /> : null}
          </div>
        </div>
      </div>
    </motion.li>
  );
}

function DecisionDialog({
  kind,
  rec,
  onClose,
  onSubmit,
  busy,
}: {
  kind: 'REJECT' | 'REQUEST_INFO' | 'EDIT' | null;
  rec: RecommendationDetail;
  onClose: () => void;
  onSubmit: (body: { action: string; note?: string; edits?: { description?: string } }) => void;
  busy: boolean;
}) {
  const [note, setNote] = useState('');
  const [desc, setDesc] = useState(rec.proposedDescription ?? '');
  useEffect(() => {
    setNote('');
    setDesc(rec.proposedDescription ?? '');
  }, [kind, rec.id, rec.proposedDescription]);
  if (!kind) return null;
  const titles = { REJECT: 'Reject recommendation', REQUEST_INFO: 'Request information from source CPSE', EDIT: 'Edit canonical description & approve' };
  const presets =
    kind === 'REJECT'
      ? ['Attributes differ materially — retain as separate materials', 'Not interchangeable for the intended service duty', 'Different OEM specification / drawing reference']
      : kind === 'REQUEST_INFO'
        ? ['Provide pressure rating and body material from the PO specification', 'Confirm size / designation from OEM datasheet', 'Confirm conductor material and voltage grade']
        : [];
  const valid = kind === 'EDIT' ? desc.trim().length >= 8 : note.trim().length >= 5;
  return (
    <Dialog
      open
      onClose={onClose}
      title={titles[kind]}
      width={560}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant={kind === 'REJECT' ? 'danger' : kind === 'EDIT' ? 'approve' : 'primary'}
            disabled={!valid || busy}
            onClick={() => onSubmit(kind === 'EDIT' ? { action: 'EDIT', note: note || undefined, edits: { description: desc.trim().toUpperCase() } } : { action: kind, note: note.trim() })}
          >
            {kind === 'REJECT' ? 'Reject & log reason' : kind === 'EDIT' ? 'Save edit & approve' : 'Send request'}
          </Button>
        </>
      }
    >
      {kind === 'EDIT' && (
        <div className="mb-3">
          <label className="field-label">Canonical description (noun, modifier, attributes…)</label>
          <textarea className="input h-20 py-1.5 font-mono text-caption" value={desc} onChange={(e) => setDesc(e.target.value)} />
          <p className="mt-1 text-caption text-grey-500">The CNMC is regenerated from attributes by template; only the human-readable description is edited here.</p>
        </div>
      )}
      <label className="field-label">{kind === 'REJECT' ? 'Reason (required — written to the audit trail)' : kind === 'EDIT' ? 'Note (optional)' : 'What is needed (required)'}</label>
      <textarea className="input h-20 py-1.5" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Type or pick a standard reason…" autoFocus={kind !== 'EDIT'} />
      {presets.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {presets.map((p) => (
            <button key={p} onClick={() => setNote(p)} className="rounded border border-grey-200 px-2 py-0.5 text-caption text-grey-600 hover:border-grey-400 hover:text-grey-900">
              {p}
            </button>
          ))}
        </div>
      )}
    </Dialog>
  );
}

function Workspace({ id, onDecided }: { id: string; onDecided: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { can } = useSession();
  const { data: rec, isLoading } = useQuery({ queryKey: ['rec', id], queryFn: () => api<RecommendationDetail>(`/api/review/${id}`) });
  const [dialog, setDialog] = useState<'REJECT' | 'REQUEST_INFO' | 'EDIT' | null>(null);

  const decide = useMutation({
    mutationFn: (body: { action: string; note?: string; edits?: { description?: string } }) => api<{ status: string; canonical: { cnmc: string; created: boolean; id: string } | null; superseded?: number }>(`/api/review/${id}/decision`, { method: 'POST', json: body }),
    onSuccess: async (r) => {
      setDialog(null);
      await qc.invalidateQueries({ queryKey: ['rec', id] });
      qc.invalidateQueries({ queryKey: ['queue'] });
      qc.invalidateQueries({ queryKey: ['session'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      if (r.status === 'APPROVED')
        toast({ kind: 'success', title: r.canonical?.created ? 'Canonical material created' : 'Legacy codes mapped', body: <span className="font-mono">{r.canonical?.cnmc}{r.superseded ? ` · ${r.superseded} related pair(s) resolved` : ''}</span> });
      else if (r.status === 'REJECTED') toast({ kind: 'info', title: 'Recommendation rejected', body: 'Reason recorded in the audit trail. No canonical material was created.' });
      else toast({ kind: 'info', title: 'Information requested', body: 'Task moved to “info requested”.' });
      setTimeout(onDecided, 650);
    },
    onError: (e: Error) => toast({ kind: 'error', title: 'Decision not recorded', body: e.message }),
  });

  const pending = rec && ['PENDING', 'NEEDS_INFO'].includes(rec.status);
  const approvable = !!rec && pending && !rec.vetoed && ['IDENTICAL', 'DUPLICATE', 'NEAR_DUPLICATE', 'FUNCTIONALLY_EQUIVALENT'].includes(rec.matchType);
  const canDecide = can('review:decide');

  const onKey = useCallback(
    (e: KeyboardEvent) => {
      if (!rec || dialog || ['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName) || e.metaKey || e.ctrlKey) return;
      if (!canDecide || !pending) return;
      if (e.key === 'a' && approvable) decide.mutate({ action: 'APPROVE' });
      if (e.key === 'e' && approvable) setDialog('EDIT');
      if (e.key === 'r') setDialog('REJECT');
      if (e.key === 'i') setDialog('REQUEST_INFO');
    },
    [rec, dialog, canDecide, pending, approvable, decide],
  );
  useEffect(() => {
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onKey]);

  if (isLoading || !rec) return <LoadingBar label="Loading comparison" />;
  const joining = rec.a.mapping ?? rec.b.mapping;

  return (
    <motion.div key={rec.id} initial={{ opacity: 0 }} animate={{ opacity: 1, transition }} className="flex min-h-full flex-col">
      <div className="flex-1 space-y-3 p-4">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <MatchTypeBadge type={rec.matchType} vetoed={rec.vetoed} />
              <StatusBadge status={rec.status} />
              <span className="text-caption text-grey-500">
                {ROUTING_LABEL[rec.routing]} queue{rec.deterministicRule && <> · deterministic: <span className="font-mono">{rec.deterministicRule}</span></>}
              </span>
            </div>
            <h2 className="mt-1.5 text-title">
              {humanize(rec.categoryCode)} · {rec.a.org.code} <span className="font-mono text-dense text-grey-500">{rec.a.legacyCode}</span> ↔ {rec.b.org.code}{' '}
              <span className="font-mono text-dense text-grey-500">{rec.b.legacyCode}</span>
            </h2>
          </div>
          <div className="text-right">
            <div className="eyebrow">{rec.vetoed ? 'Raw score (vetoed)' : 'Confidence'}</div>
            <div className={cx('font-display text-display tabular', rec.vetoed ? 'text-veto-700 line-through decoration-2' : rec.finalScore >= 0.95 ? 'text-high-700' : rec.finalScore >= 0.75 ? 'text-amber-700' : 'text-grey-700')}>
              {(rec.vetoed ? rec.rawScore : rec.finalScore).toFixed(3)}
            </div>
            <div className="mt-0.5 flex justify-end">
              <AiTag>{rec.modelVersion?.matcherVersion ?? 'AI suggestion'}</AiTag>
            </div>
          </div>
        </div>

        <VetoPanel rec={rec} />

        {/* Side-by-side records */}
        <div className="grid grid-cols-2 gap-3">
          <RecordCard r={rec.a} other={rec.b} side="A" />
          <RecordCard r={rec.b} other={rec.a} side="B" />
        </div>

        <AttributeDiff rec={rec} />

        <div className="grid grid-cols-[1.1fr_1fr] gap-3">
          <ScoreBreakdown rec={rec} />
          <div className="space-y-3">
            <div className="rounded-md border border-grey-200 bg-white px-3 py-2.5">
              <h3 className="panel-title mb-1.5">Why the engine says this</h3>
              <p className="text-dense leading-relaxed text-grey-800">{rec.explanation}</p>
              <div className="mt-2">
                <ReasonCodes codes={rec.reasonCodes} />
              </div>
            </div>
            {rec.proposedCnmc && !rec.vetoed && (
              <div className="rounded-md border border-primary-200 bg-primary-50 px-3 py-2.5">
                <div className="flex items-center justify-between">
                  <h3 className="panel-title !text-primary-800">{joining ? 'Joins existing national code' : rec.status === 'APPROVED' ? 'Common National Material Code' : 'Proposed Common National Material Code'}</h3>
                  <Layers size={14} className="text-primary-600" />
                </div>
                <div className="mt-1 break-all font-mono text-dense font-semibold text-primary-900">{rec.proposedCnmc}</div>
                <div className="mt-0.5 text-caption text-grey-700">{rec.proposedDescription}</div>
                {rec.cluster.length > 0 && (
                  <div className="mt-2 border-t border-primary-200 pt-1.5 text-caption text-grey-600">
                    Currently {rec.cluster.length} legacy code{rec.cluster.length > 1 ? 's' : ''}:{' '}
                    {rec.cluster.map((c) => (
                      <span key={c.rawId} className="mr-1.5 whitespace-nowrap font-mono text-micro">
                        {c.org}:{c.legacyCode}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {(rec.decisionNote || rec.history.length > 0) && (
          <div className="rounded-md border border-grey-200 bg-white px-3 py-2.5">
            <h3 className="panel-title mb-1.5">Decision history</h3>
            {rec.history.length === 0 && <div className="text-caption text-grey-500">No decisions yet.</div>}
            <ol className="space-y-1">
              {rec.history.map((h) => (
                <li key={h.seq} className="flex gap-3 text-caption">
                  <span className="w-36 shrink-0 font-mono text-grey-500">{fmtDateTime(h.occurredAt)}</span>
                  <span className="font-medium text-grey-800">{h.action.replace(/_/g, ' ').toLowerCase()}</span>
                  <span className="text-grey-600">by {h.actorName}</span>
                  {h.reason && <span className="text-grey-700">— “{h.reason}”</span>}
                  <span className="ml-auto font-mono text-micro text-grey-400" title={h.hash}>
                    #{h.seq} {h.hash.slice(0, 10)}…
                  </span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>

      {/* Sticky decision bar */}
      <div className="sticky bottom-0 z-10 flex items-center gap-2 border-t border-grey-200 bg-white/95 px-4 py-2.5 backdrop-blur-[2px]">
        {pending && canDecide ? (
          <>
            <Button variant="approve" kbd="A" icon={<Check size={14} />} disabled={!approvable || decide.isPending} onClick={() => decide.mutate({ action: 'APPROVE' })} title={!approvable ? 'Vetoed / insufficient-data pairs cannot be approved' : undefined}>
              Approve
            </Button>
            <Button kbd="E" icon={<PencilLine size={14} />} disabled={!approvable || decide.isPending} onClick={() => setDialog('EDIT')}>
              Edit & approve
            </Button>
            <Button kbd="I" icon={<HelpCircle size={14} />} disabled={decide.isPending} onClick={() => setDialog('REQUEST_INFO')}>
              Request info
            </Button>
            <Button variant="danger" kbd="R" icon={<X size={14} />} disabled={decide.isPending} onClick={() => setDialog('REJECT')}>
              Reject
            </Button>
            <span className="ml-auto hidden text-caption text-grey-500 2xl:inline">
              Hash-chained to the audit trail · <Kbd>J</Kbd>/<Kbd>K</Kbd> move
            </span>
          </>
        ) : (
          <span className="flex items-center gap-2 text-caption text-grey-600">
            {rec.vetoed ? <Ban size={14} className="text-veto-600" /> : <CheckCheck size={14} className="text-high-600" />}
            {rec.vetoed
              ? 'Vetoed pairs are informational — no decision is possible.'
              : !canDecide && pending
                ? 'Your role cannot decide recommendations. Switch to a Data Steward in the top bar.'
                : `Decided ${rec.decidedAt ? fmtDateTime(rec.decidedAt) : ''}${rec.decidedByName ? ` by ${rec.decidedByName}` : ''}${rec.decisionNote ? ` — “${rec.decisionNote}”` : ''}`}
            {rec.status === 'APPROVED' && rec.proposedCnmc && (
              <Link href={`/mappings?q=${encodeURIComponent(rec.proposedCnmc)}`} className="ml-2 inline-flex items-center gap-1 text-teal-700 hover:underline">
                View mapping <ArrowRight size={12} />
              </Link>
            )}
          </span>
        )}
      </div>
      <DecisionDialog kind={dialog} rec={rec} onClose={() => setDialog(null)} onSubmit={(b) => decide.mutate(b)} busy={decide.isPending} />
    </motion.div>
  );
}

function ReviewInner() {
  const router = useRouter();
  const params = useSearchParams();
  const qc = useQueryClient();
  const toast = useToast();
  const { can } = useSession();
  const tab = (params.get('tab') as Tab) ?? 'FULL_REVIEW';
  const selected = params.get('id');
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const { data, isLoading } = useQuery({ queryKey: ['queue', tab], queryFn: () => api<{ items: QueueItem[]; counts: Record<string, number> }>(`/api/review?tab=${tab}`) });
  const items = useMemo(() => data?.items ?? [], [data]);

  const go = useCallback((next: { tab?: Tab; id?: string | null }) => {
    const p = new URLSearchParams();
    p.set('tab', next.tab ?? tab);
    const id = next.id === undefined ? selected : next.id;
    if (id) p.set('id', id);
    router.replace(`/review?${p.toString()}`, { scroll: false });
  }, [router, tab, selected]);

  useEffect(() => {
    if (!selected && items.length) go({ id: items[0].id });
  }, [selected, items, go]);
  useEffect(() => setChecked(new Set()), [tab]);

  const move = useCallback(
    (d: 1 | -1) => {
      const i = items.findIndex((x) => x.id === selected);
      const n = items[Math.min(items.length - 1, Math.max(0, i + d))];
      if (n) go({ id: n.id });
    },
    [items, selected, go],
  );
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName) || document.querySelector('[role=dialog]')) return;
      if (e.key === 'j') move(1);
      if (e.key === 'k') move(-1);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [move]);

  const afterDecision = useCallback(async () => {
    const fresh = await qc.fetchQuery({ queryKey: ['queue', tab], queryFn: () => api<{ items: QueueItem[] }>(`/api/review?tab=${tab}`) });
    const idx = items.findIndex((x) => x.id === selected);
    const next = fresh.items.find((x, i) => i >= idx && x.id !== selected) ?? fresh.items[0];
    if (next && tab !== 'DECIDED' && tab !== 'VETOED') go({ id: next.id });
  }, [qc, tab, items, selected, go]);

  const bulk = useMutation({
    mutationFn: (ids: string[]) => api<{ approved: number; failed: number }>('/api/review/bulk', { method: 'POST', json: { ids } }),
    onSuccess: (r) => {
      toast({ kind: r.failed ? 'info' : 'success', title: `${r.approved} fast-track pair(s) approved`, body: r.failed ? `${r.failed} skipped (already resolved or conflicting)` : 'Each approval is logged individually.' });
      setChecked(new Set());
      qc.invalidateQueries();
    },
    onError: (e: Error) => toast({ kind: 'error', title: 'Bulk approval failed', body: e.message }),
  });

  const counts = data?.counts ?? {};
  return (
    <div className="-mx-6 -mb-12 -mt-5 flex h-[calc(100vh-var(--topbar-h))]">
      <aside className="flex w-[400px] shrink-0 flex-col border-r border-grey-200 bg-white">
        <div className="px-4 pb-0 pt-4">
          <div className="eyebrow">Data steward workbench</div>
          <h1 className="text-title">Review queue</h1>
        </div>
        <div className="mt-2 px-2">
          <Tabs<Tab>
            value={tab}
            onChange={(t) => go({ tab: t, id: null })}
            items={[
              { value: 'FAST_TRACK', label: 'Fast-track', count: counts.FAST_TRACK, tone: 'amber' },
              { value: 'FULL_REVIEW', label: 'Review', count: counts.FULL_REVIEW, tone: 'amber' },
              { value: 'UNRESOLVED', label: 'Unresolved', count: counts.UNRESOLVED, tone: 'amber' },
              { value: 'VETOED', label: 'Vetoed', count: counts.VETOED, tone: 'veto' },
              { value: 'DECIDED', label: 'Decided' },
            ]}
          />
        </div>
        <div className="border-b border-grey-200 bg-grey-25 px-4 py-2 text-caption text-grey-600">{TAB_HELP[tab]}</div>
        {tab === 'FAST_TRACK' && can('review:decide') && items.length > 0 && (
          <div className="flex items-center gap-2 border-b border-grey-200 px-4 py-1.5">
            <label className="flex items-center gap-1.5 text-caption text-grey-600">
              <input type="checkbox" className="accent-[rgb(var(--c-primary-700))]" checked={checked.size === items.length} onChange={(e) => setChecked(e.target.checked ? new Set(items.map((i) => i.id)) : new Set())} />
              Select all
            </label>
            <Button size="sm" variant="approve" className="ml-auto" disabled={!checked.size || bulk.isPending} onClick={() => bulk.mutate([...checked])} icon={<CheckCheck size={13} />}>
              Approve {checked.size || ''} selected
            </Button>
          </div>
        )}
        <div className="scroll-thin flex-1 overflow-y-auto">
          {isLoading ? (
            <LoadingBar label="Loading queue" />
          ) : items.length === 0 ? (
            <Empty title="Queue is clear">No items in this queue. New ingestions and matching runs add work here automatically.</Empty>
          ) : (
            <ul>
              <AnimatePresence initial={false}>
                {items.map((it) => (
                  <QueueRow
                    key={it.id}
                    it={it}
                    active={it.id === selected}
                    onSelect={() => go({ id: it.id })}
                    showCheck={tab === 'FAST_TRACK' && can('review:decide')}
                    checked={checked.has(it.id)}
                    onCheck={(v) =>
                      setChecked((s) => {
                        const n = new Set(s);
                        if (v) n.add(it.id);
                        else n.delete(it.id);
                        return n;
                      })
                    }
                  />
                ))}
              </AnimatePresence>
            </ul>
          )}
        </div>
      </aside>
      <section className="scroll-thin min-w-0 flex-1 overflow-y-auto bg-grey-50">
        {selected ? <Workspace key={selected} id={selected} onDecided={afterDecision} /> : <Empty title="Select a pair to review" />}
      </section>
    </div>
  );
}

export default function ReviewPage() {
  return (
    <Suspense fallback={<LoadingBar />}>
      <ReviewInner />
    </Suspense>
  );
}
