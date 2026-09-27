'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowRight,
  Ban,
  Check,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Columns,
  Eye,
  HelpCircle,
  Layers,
  PencilLine,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import {
  AttributeDiff,
  ReasonCodes,
  RecordCard,
  ScoreBreakdown,
  VetoPanel,
} from '@/components/review/comparison';
import { Button, Dialog, Empty, Kbd, LoadingBar, PageHeader, Panel, Tabs } from '@/components/ui/primitives';
import {
  AiTag,
  CategoryChip,
  ConfidenceMeter,
  MatchTypeBadge,
  OrgChip,
  ROUTING_LABEL,
  StatusBadge,
} from '@/components/ui/status';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/client/api';
import { useSession } from '@/lib/client/session';
import type { QueueItem, RecommendationDetail } from '@/lib/client/types';
import { cx, fmtDateTime, humanize } from '@/lib/format';
import { fastTransition, transition } from '@/lib/motion';

type Tab = 'FAST_TRACK' | 'FULL_REVIEW' | 'UNRESOLVED' | 'VETOED' | 'DECIDED';

const TAB_HELP: Record<Tab, string> = {
  FAST_TRACK: 'Score ≥ 0.95 with deterministic identity. Fast approval with one-click direct actions.',
  FULL_REVIEW: 'Score 0.75–0.95: near-duplicates & functional equivalents. Compare attributes before deciding.',
  UNRESOLVED: 'Score < 0.75 or required attributes missing. Routed for CPSE data enrichment.',
  VETOED: 'High-similarity pairs blocked by deterministic safety rules (pressure class, voltage, alloy).',
  DECIDED: 'Historical record of steward decisions.',
};

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

  const titles = {
    REJECT: 'Reject recommendation',
    REQUEST_INFO: 'Request information from source CPSE',
    EDIT: 'Edit canonical description & approve',
  };

  const presets =
    kind === 'REJECT'
      ? [
          'Attributes differ materially — retain as separate materials',
          'Not interchangeable for the intended service duty',
          'Different OEM specification / drawing reference',
        ]
      : kind === 'REQUEST_INFO'
        ? [
            'Provide pressure rating and body material from the PO specification',
            'Confirm size / designation from OEM datasheet',
            'Confirm conductor material and voltage grade',
          ]
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
            onClick={() =>
              onSubmit(
                kind === 'EDIT'
                  ? { action: 'EDIT', note: note || undefined, edits: { description: desc.trim().toUpperCase() } }
                  : { action: kind, note: note.trim() },
              )
            }
          >
            {kind === 'REJECT' ? 'Reject & log reason' : kind === 'EDIT' ? 'Save edit & approve' : 'Send request'}
          </Button>
        </>
      }
    >
      {kind === 'EDIT' && (
        <div className="mb-3">
          <label className="field-label">Canonical description (noun, modifier, attributes…)</label>
          <textarea
            className="input h-20 py-1.5 font-mono text-caption"
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
          />
          <p className="mt-1 text-caption text-grey-500">
            The CNMC is regenerated from attributes by template; only the human-readable description is edited here.
          </p>
        </div>
      )}
      <label className="field-label">
        {kind === 'REJECT' ? 'Reason (required — written to audit trail)' : kind === 'EDIT' ? 'Note (optional)' : 'What is needed (required)'}
      </label>
      <textarea
        className="input h-20 py-1.5"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Type or pick a standard reason…"
        autoFocus={kind !== 'EDIT'}
      />
      {presets.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {presets.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setNote(p)}
              className="rounded border border-grey-200 px-2 py-0.5 text-caption text-grey-600 hover:border-grey-400 hover:text-grey-900"
            >
              {p}
            </button>
          ))}
        </div>
      )}
    </Dialog>
  );
}

function ComparisonModal({
  id,
  onClose,
  onDecided,
  onNext,
  onPrev,
  hasPrev,
  hasNext,
}: {
  id: string;
  onClose: () => void;
  onDecided: () => void;
  onNext?: () => void;
  onPrev?: () => void;
  hasPrev?: boolean;
  hasNext?: boolean;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const { can } = useSession();
  const { data: rec, isLoading } = useQuery({
    queryKey: ['rec', id],
    queryFn: () => api<RecommendationDetail>(`/api/review/${id}`),
  });
  const [dialog, setDialog] = useState<'REJECT' | 'REQUEST_INFO' | 'EDIT' | null>(null);

  const decide = useMutation({
    mutationFn: (body: { action: string; note?: string; edits?: { description?: string } }) =>
      api<{ status: string; canonical: { cnmc: string; created: boolean; id: string } | null; superseded?: number }>(
        `/api/review/${id}/decision`,
        { method: 'POST', json: body },
      ),
    onSuccess: async (r) => {
      setDialog(null);
      await qc.invalidateQueries({ queryKey: ['rec', id] });
      qc.invalidateQueries({ queryKey: ['queue'] });
      qc.invalidateQueries({ queryKey: ['session'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      if (r.status === 'APPROVED') {
        toast({
          kind: 'success',
          title: r.canonical?.created ? 'Canonical material created' : 'Legacy codes mapped',
          body: (
            <span className="font-mono">
              {r.canonical?.cnmc}
              {r.superseded ? ` · ${r.superseded} related pair(s) resolved` : ''}
            </span>
          ),
        });
      } else if (r.status === 'REJECTED') {
        toast({
          kind: 'info',
          title: 'Recommendation rejected',
          body: 'Reason recorded in audit trail. No canonical material was created.',
        });
      } else {
        toast({
          kind: 'info',
          title: 'Information requested',
          body: 'Task moved to “info requested”.',
        });
      }
      setTimeout(onDecided, 400);
    },
    onError: (e: Error) => toast({ kind: 'error', title: 'Decision not recorded', body: e.message }),
  });

  const pending = rec && ['PENDING', 'NEEDS_INFO'].includes(rec.status);
  const approvable =
    !!rec && pending && !rec.vetoed && ['IDENTICAL', 'DUPLICATE', 'NEAR_DUPLICATE', 'FUNCTIONALLY_EQUIVALENT'].includes(rec.matchType);
  const canDecide = can('review:decide');

  const onKey = useCallback(
    (e: KeyboardEvent) => {
      if (!rec || dialog || ['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName) || e.metaKey || e.ctrlKey) return;
      if (e.key === 'Escape') onClose();
      if (!canDecide || !pending) return;
      if (e.key === 'a' && approvable) decide.mutate({ action: 'APPROVE' });
      if (e.key === 'e' && approvable) setDialog('EDIT');
      if (e.key === 'r') setDialog('REJECT');
      if (e.key === 'i') setDialog('REQUEST_INFO');
    },
    [rec, dialog, canDecide, pending, approvable, decide, onClose],
  );

  useEffect(() => {
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onKey]);

  if (isLoading || !rec) {
    return (
      <Dialog open onClose={onClose} title="Loading candidate pair…" width={920}>
        <LoadingBar label="Loading side-by-side comparison" />
      </Dialog>
    );
  }

  const joining = rec.a.mapping ?? rec.b.mapping;

  return (
    <Dialog
      open
      onClose={onClose}
      title={
        <div className="flex items-center gap-3">
          <span>
            {humanize(rec.categoryCode)} · {rec.a.org.code}{' '}
            <span className="font-mono text-caption text-grey-500">{rec.a.legacyCode}</span> ↔ {rec.b.org.code}{' '}
            <span className="font-mono text-caption text-grey-500">{rec.b.legacyCode}</span>
          </span>
        </div>
      }
      subtitle={
        <span className="flex items-center gap-2 text-caption">
          <MatchTypeBadge type={rec.matchType} vetoed={rec.vetoed} />
          <StatusBadge status={rec.status} />
          <span>{ROUTING_LABEL[rec.routing]} queue</span>
        </span>
      }
      width="960px"
      footer={
        <div className="flex w-full items-center justify-between">
          <div className="flex items-center gap-2">
            {onPrev && (
              <Button size="sm" variant="ghost" disabled={!hasPrev} onClick={onPrev} icon={<ChevronLeft size={13} />}>
                Prev
              </Button>
            )}
            {onNext && (
              <Button size="sm" variant="ghost" disabled={!hasNext} onClick={onNext} icon={<ChevronRight size={13} />}>
                Next
              </Button>
            )}
            <span className="hidden text-caption text-grey-500 sm:inline ml-2">
              Keys: <Kbd>A</Kbd> approve · <Kbd>E</Kbd> edit · <Kbd>R</Kbd> reject
            </span>
          </div>

          <div className="flex items-center gap-2">
            {pending && canDecide ? (
              <>
                <Button variant="danger" size="sm" kbd="R" icon={<X size={13} />} disabled={decide.isPending} onClick={() => setDialog('REJECT')}>
                  Reject
                </Button>
                <Button size="sm" kbd="I" icon={<HelpCircle size={13} />} disabled={decide.isPending} onClick={() => setDialog('REQUEST_INFO')}>
                  Request info
                </Button>
                <Button size="sm" kbd="E" icon={<PencilLine size={13} />} disabled={!approvable || decide.isPending} onClick={() => setDialog('EDIT')}>
                  Edit & approve
                </Button>
                <Button
                  variant="approve"
                  size="sm"
                  kbd="A"
                  icon={<Check size={13} />}
                  disabled={!approvable || decide.isPending}
                  onClick={() => decide.mutate({ action: 'APPROVE' })}
                >
                  Approve
                </Button>
              </>
            ) : (
              <Button variant="outline" size="sm" onClick={onClose}>
                Close
              </Button>
            )}
          </div>
        </div>
      }
    >
      <div className="space-y-4 text-dense">
        <VetoPanel rec={rec} />

        {/* Side-by-side records */}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <RecordCard r={rec.a} other={rec.b} side="A" />
          <RecordCard r={rec.b} other={rec.a} side="B" />
        </div>

        {/* Attribute Diff */}
        <AttributeDiff rec={rec} />

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <ScoreBreakdown rec={rec} />

          <div className="space-y-3">
            <div className="rounded-md border border-grey-200 bg-white p-3 shadow-panel">
              <h4 className="eyebrow mb-1">AI Recommendation Reasoning</h4>
              <p className="text-dense leading-relaxed text-grey-800">{rec.explanation}</p>
              <div className="mt-2">
                <ReasonCodes codes={rec.reasonCodes} />
              </div>
            </div>

            {rec.proposedCnmc && !rec.vetoed && (
              <div className="rounded-md border border-primary-200 bg-primary-50 p-3">
                <div className="flex items-center justify-between">
                  <h4 className="eyebrow !text-primary-800 font-semibold">
                    {joining ? 'Joins Existing National Code' : rec.status === 'APPROVED' ? 'Common National Material Code' : 'Proposed National Code'}
                  </h4>
                  <Layers size={14} className="text-primary-600" />
                </div>
                <div className="mt-1 break-all font-mono text-dense font-bold text-primary-900">{rec.proposedCnmc}</div>
                <div className="mt-0.5 text-caption text-grey-700">{rec.proposedDescription}</div>
              </div>
            )}
          </div>
        </div>

        {rec.history.length > 0 && (
          <div className="rounded-md border border-grey-200 bg-white p-3 shadow-panel">
            <h4 className="eyebrow mb-1.5">Decision Audit History</h4>
            <ol className="space-y-1 text-caption">
              {rec.history.map((h) => (
                <li key={h.seq} className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-grey-500">{fmtDateTime(h.occurredAt)}</span>
                  <span className="font-medium text-grey-800">{h.action.replace(/_/g, ' ').toLowerCase()}</span>
                  <span className="text-grey-600">by {h.actorName}</span>
                  {h.reason && <span className="text-grey-700">— “{h.reason}”</span>}
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>

      <DecisionDialog kind={dialog} rec={rec} onClose={() => setDialog(null)} onSubmit={(b) => decide.mutate(b)} busy={decide.isPending} />
    </Dialog>
  );
}

function ReviewInner() {
  const router = useRouter();
  const params = useSearchParams();
  const qc = useQueryClient();
  const toast = useToast();
  const { can } = useSession();
  const tab = (params.get('tab') as Tab) ?? 'FULL_REVIEW';
  const activeDialogId = params.get('compare');
  const [checked, setChecked] = useState<Set<string>>(new Set());

  const { data, isLoading } = useQuery({
    queryKey: ['queue', tab],
    queryFn: () => api<{ items: QueueItem[]; counts: Record<string, number> }>(`/api/review?tab=${tab}`),
  });

  const items = useMemo(() => data?.items ?? [], [data]);

  const goTab = (t: Tab) => {
    const p = new URLSearchParams();
    p.set('tab', t);
    router.replace(`/review?${p.toString()}`);
  };

  const openComparison = (id: string) => {
    const p = new URLSearchParams(params.toString());
    p.set('compare', id);
    router.replace(`/review?${p.toString()}`);
  };

  const closeComparison = () => {
    const p = new URLSearchParams(params.toString());
    p.delete('compare');
    router.replace(`/review?${p.toString()}`);
  };

  const activeIndex = items.findIndex((x) => x.id === activeDialogId);

  const decideDirect = useMutation({
    mutationFn: ({ id, action, note }: { id: string; action: string; note?: string }) =>
      api<{ status: string; canonical: { cnmc: string; created: boolean; id: string } | null; superseded?: number }>(
        `/api/review/${id}/decision`,
        { method: 'POST', json: { action, note } },
      ),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['queue'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['session'] });
      if (r.status === 'APPROVED') {
        toast({
          kind: 'success',
          title: 'Pair approved',
          body: <span className="font-mono">{r.canonical?.cnmc}</span>,
        });
      } else {
        toast({ kind: 'info', title: 'Pair rejected', body: 'Logged in audit trail.' });
      }
    },
    onError: (e: Error) => toast({ kind: 'error', title: 'Action failed', body: e.message }),
  });

  const bulk = useMutation({
    mutationFn: (ids: string[]) => api<{ approved: number; failed: number }>('/api/review/bulk', { method: 'POST', json: { ids } }),
    onSuccess: (r) => {
      toast({
        kind: r.failed ? 'info' : 'success',
        title: `${r.approved} fast-track pair(s) approved`,
        body: r.failed ? `${r.failed} skipped (already resolved or conflicting)` : 'Each approval is logged individually.',
      });
      setChecked(new Set());
      qc.invalidateQueries();
    },
    onError: (e: Error) => toast({ kind: 'error', title: 'Bulk approval failed', body: e.message }),
  });

  const counts = data?.counts ?? {};
  const canDecide = can('review:decide');

  return (
    <div className="space-y-3">
      <PageHeader
        eyebrow="Steward Workbench"
        title="Review queue"
        description="Verify AI candidate matches, resolve attribute diffs, and approve canonical codes."
        actions={
          tab === 'FAST_TRACK' && canDecide && items.length > 0 ? (
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="approve"
                disabled={!checked.size || bulk.isPending}
                onClick={() => bulk.mutate([...checked])}
                icon={<CheckCheck size={13} />}
              >
                Approve {checked.size || ''} selected
              </Button>
            </div>
          ) : undefined
        }
      />

      <Panel>
        <div className="px-3 pt-2">
          <Tabs<Tab>
            value={tab}
            onChange={goTab}
            items={[
              { value: 'FAST_TRACK', label: 'Fast-track', count: counts.FAST_TRACK, tone: 'amber' },
              { value: 'FULL_REVIEW', label: 'Review', count: counts.FULL_REVIEW, tone: 'amber' },
              { value: 'UNRESOLVED', label: 'Unresolved', count: counts.UNRESOLVED, tone: 'amber' },
              { value: 'VETOED', label: 'Safety Vetoed', count: counts.VETOED, tone: 'veto' },
              { value: 'DECIDED', label: 'Decided' },
            ]}
          />
        </div>

        <div className="border-b border-grey-200 bg-grey-25 px-4 py-2 text-caption text-grey-600">
          {TAB_HELP[tab]}
        </div>

        {tab === 'FAST_TRACK' && canDecide && items.length > 0 && (
          <div className="flex items-center justify-between border-b border-grey-200 bg-white px-4 py-2">
            <label className="flex items-center gap-2 text-caption font-medium text-grey-700">
              <input
                type="checkbox"
                className="accent-[rgb(var(--c-primary-700))]"
                checked={checked.size === items.length}
                onChange={(e) => setChecked(e.target.checked ? new Set(items.map((i) => i.id)) : new Set())}
              />
              Select all {items.length} fast-track pairs
            </label>
            <span className="text-micro text-grey-500">Fast-track items match deterministically with score ≥ 0.95</span>
          </div>
        )}

        {isLoading ? (
          <LoadingBar label="Loading candidate pairs" />
        ) : items.length === 0 ? (
          <Empty title="Queue is clear">
            No items in this queue. New ingestions and matching runs will populate candidates here automatically.
          </Empty>
        ) : (
          <div className="divide-y divide-grey-100">
            {items.map((it) => {
              const approvable =
                it.status === 'PENDING' &&
                !it.vetoed &&
                ['IDENTICAL', 'DUPLICATE', 'NEAR_DUPLICATE', 'FUNCTIONALLY_EQUIVALENT'].includes(it.matchType);

              return (
                <div
                  key={it.id}
                  onClick={() => openComparison(it.id)}
                  className="group flex flex-col gap-2 p-3.5 transition-colors hover:bg-grey-50 cursor-pointer sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    {tab === 'FAST_TRACK' && canDecide && (
                      <input
                        type="checkbox"
                        className="mt-1 accent-[rgb(var(--c-primary-700))]"
                        checked={checked.has(it.id)}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) =>
                          setChecked((s) => {
                            const n = new Set(s);
                            if (e.target.checked) n.add(it.id);
                            else n.delete(it.id);
                            return n;
                          })
                        }
                        aria-label="Select pair"
                      />
                    )}

                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <OrgChip code={it.aOrg} />
                        <span className="text-grey-400 font-mono text-micro">↔</span>
                        <OrgChip code={it.bOrg} />
                        <CategoryChip code={it.category} />
                        <MatchTypeBadge type={it.matchType} vetoed={it.vetoed} />
                        <ConfidenceMeter score={it.vetoed ? it.rawScore : it.score} vetoed={it.vetoed} width={75} />
                        {it.status !== 'PENDING' && <StatusBadge status={it.status} />}
                      </div>

                      <div className="font-mono text-caption text-grey-900 line-clamp-1" title={it.aDesc}>
                        <span className="text-grey-500 mr-1.5">{it.aOrg}:</span>
                        {it.aDesc}
                      </div>
                      <div className="font-mono text-caption text-grey-600 line-clamp-1" title={it.bDesc}>
                        <span className="text-grey-500 mr-1.5">{it.bOrg}:</span>
                        {it.bDesc}
                      </div>
                    </div>
                  </div>

                  {/* Direct One-Click Actions on Row (No mandatory dialog required to act!) */}
                  <div className="flex shrink-0 items-center gap-2 pt-2 sm:pt-0" onClick={(e) => e.stopPropagation()}>
                    {it.status === 'PENDING' && canDecide ? (
                      <>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => openComparison(it.id)}
                          icon={<Columns size={13} />}
                          title="Open detailed side-by-side comparison"
                        >
                          Compare
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => openComparison(it.id)}
                          icon={<X size={13} />}
                          title="Reject recommendation"
                        >
                          Reject
                        </Button>
                        <Button
                          size="sm"
                          variant="approve"
                          disabled={!approvable || decideDirect.isPending}
                          onClick={() => decideDirect.mutate({ id: it.id, action: 'APPROVE' })}
                          icon={<Check size={13} />}
                          title="Direct 1-Click Approve"
                        >
                          Approve
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openComparison(it.id)}
                        icon={<Eye size={13} />}
                      >
                        View details
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      {/* Detail-on-Demand Comparison Dialog */}
      {activeDialogId && (
        <ComparisonModal
          id={activeDialogId}
          onClose={closeComparison}
          onDecided={() => {
            qc.invalidateQueries({ queryKey: ['queue'] });
            closeComparison();
          }}
          hasPrev={activeIndex > 0}
          hasNext={activeIndex < items.length - 1}
          onPrev={() => activeIndex > 0 && openComparison(items[activeIndex - 1].id)}
          onNext={() => activeIndex < items.length - 1 && openComparison(items[activeIndex + 1].id)}
        />
      )}
    </div>
  );
}

export default function ReviewPage() {
  return (
    <Suspense fallback={<LoadingBar label="Loading review queue…" />}>
      <ReviewInner />
    </Suspense>
  );
}
