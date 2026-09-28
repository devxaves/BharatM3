'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowRight,
  Check,
  CircleAlert,
  Download,
  Eye,
  FileSpreadsheet,
  GripVertical,
  Loader2,
  RotateCcw,
  Upload,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useCallback, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { Button, Dialog, DialogSection, Empty, PageHeader, Panel, SummaryCard } from '@/components/ui/primitives';
import { Badge, CategoryChip, OrgChip } from '@/components/ui/status';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/client/api';
import { useSession } from '@/lib/client/session';
import { cx, fmtDateTime, humanize } from '@/lib/format';
import { expand, fadeUp, transition } from '@/lib/motion';

interface Target {
  key: string;
  label: string;
  required: boolean;
  hint: string;
}
interface Parsed {
  fileName: string;
  headers: string[];
  rows: Record<string, string>[];
  rowCount: number;
  suggestion: Record<string, string>;
  targets: Target[];
}
interface Validation {
  rows: number;
  valid: number;
  missing: Record<string, number>;
  inFileDuplicates: number;
  alreadyIngested: number;
  insufficient: number;
  categories: Record<string, number>;
  abbreviations: { term: string; expansion: string; count: number }[];
  uomIssues: { raw: string; flag: string; count: number; normalizedTo: string | null }[];
  samples: { legacyCode: string; description: string; normalized: string; category: string; flags: string[] }[];
}
type StageKey = 'ingest' | 'normalize' | 'classify' | 'match';
type StageState = { status: 'idle' | 'running' | 'done' | 'error'; result?: Record<string, unknown>; ms?: number; error?: string };

const STAGES: { key: StageKey; title: string; desc: string }[] = [
  { key: 'ingest', title: 'Ingestion', desc: 'Idempotent load into raw_material_records — legacy data is never modified' },
  { key: 'normalize', title: 'Normalization', desc: 'Text clean-up, abbreviation expansion (versioned dictionary), UOM standardisation' },
  { key: 'classify', title: 'Classification & extraction', desc: 'Category routing, category-specific attribute extraction, embeddings' },
  { key: 'match', title: 'Hybrid matching', desc: 'Blocking + vector KNN → deterministic → fuzzy → semantic → fusion → safety vetoes → routing' },
];

function StepHead({ n, title, done, active, children }: { n: number; title: string; done?: boolean; active?: boolean; children?: ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span
        className={cx(
          'flex h-6 w-6 items-center justify-center rounded-full font-mono text-caption font-semibold transition-colors duration-200',
          done ? 'bg-high-600 text-white' : active ? 'bg-primary-800 text-white' : 'bg-grey-200 text-grey-600',
        )}
      >
        {done ? <Check size={13} strokeWidth={3} /> : n}
      </span>
      <h2 className="text-lead font-display font-semibold text-grey-900">{title}</h2>
      {children}
    </div>
  );
}

function ColumnMapper({ parsed, mapping, setMapping }: { parsed: Parsed; mapping: Record<string, string>; setMapping: (m: Record<string, string>) => void }) {
  const [over, setOver] = useState<string | null>(null);
  const colFor = (target: string) => Object.entries(mapping).find(([, t]) => t === target)?.[0];
  const assign = (col: string, target: string) => {
    const next = { ...mapping };
    for (const k of Object.keys(next)) if (next[k] === target) next[k] = '';
    next[col] = target;
    setMapping(next);
  };
  const onDrop = (e: DragEvent, target: string) => {
    e.preventDefault();
    setOver(null);
    const col = e.dataTransfer.getData('text/column');
    if (col) assign(col, target);
  };
  const sample = (col: string) => parsed.rows.slice(0, 3).map((r) => r[col]).filter(Boolean).join(' · ');
  const unmappedCols = parsed.headers.filter((h) => !mapping[h]);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
      <div className="min-w-0">
        <div className="eyebrow mb-1.5">Source columns — drag onto a target field</div>
        <div className="space-y-1">
          {parsed.headers.map((h) => (
            <div
              key={h}
              draggable
              onDragStart={(e) => e.dataTransfer.setData('text/column', h)}
              className={cx('flex cursor-grab items-center gap-2 rounded border bg-white px-2 py-1.5 active:cursor-grabbing text-caption', mapping[h] ? 'border-high-600/30 bg-high-50/40' : 'border-grey-300 hover:border-grey-400')}
            >
              <GripVertical size={13} className="text-grey-400" />
              <div className="min-w-0 flex-1">
                <div className="font-medium text-grey-900">{h}</div>
                <div className="truncate font-mono text-micro text-grey-500">{sample(h) || '—'}</div>
              </div>
              {mapping[h] ? <Badge tone="high">{parsed.targets.find((t) => t.key === mapping[h])?.label}</Badge> : <span className="text-micro text-grey-400">unmapped</span>}
            </div>
          ))}
        </div>
        {unmappedCols.length > 0 && <p className="mt-2 text-caption text-grey-500">Unmapped columns are preserved verbatim in raw_payload.</p>}
      </div>

      <div className="min-w-0">
        <div className="eyebrow mb-1.5">UniMat target schema</div>
        <div className="space-y-1">
          {parsed.targets.map((t) => {
            const col = colFor(t.key);
            return (
              <div
                key={t.key}
                onDragOver={(e) => {
                  e.preventDefault();
                  setOver(t.key);
                }}
                onDragLeave={() => setOver(null)}
                onDrop={(e) => onDrop(e, t.key)}
                className={cx(
                  'grid grid-cols-[minmax(0,170px)_minmax(0,1fr)] items-center gap-2 rounded border px-2 py-1.5 transition-colors duration-150',
                  over === t.key ? 'border-teal-600 bg-teal-50' : col ? 'border-grey-200 bg-white' : t.required ? 'border-dashed border-amber-500 bg-amber-50/50' : 'border-dashed border-grey-300 bg-grey-25',
                )}
              >
                <div>
                  <div className="text-dense font-medium text-grey-900">
                    {t.label} {t.required && <span className="text-amber-700 font-bold">*</span>}
                  </div>
                  <div className="text-micro text-grey-500">{t.hint}</div>
                </div>
                <select
                  className={cx('input h-7', col ? 'font-medium text-primary-800' : 'text-grey-500')}
                  value={col ?? ''}
                  onChange={(e) => {
                    const next = { ...mapping };
                    for (const k of Object.keys(next)) if (next[k] === t.key) next[k] = '';
                    if (e.target.value) next[e.target.value] = t.key;
                    setMapping(next);
                  }}
                  aria-label={`Source column for ${t.label}`}
                >
                  <option value="">— drop or choose a column —</option>
                  {parsed.headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function QualityReportSummary({ v, onViewFull }: { v: Validation; onViewFull: () => void }) {
  return (
    <motion.div {...fadeUp} className="space-y-3">
      {/* Glanceable Summary Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <div className="rounded-xl border border-grey-200 border-l-4 border-l-high-600 bg-white p-3.5 shadow-card">
          <div className="text-micro font-semibold uppercase tracking-[0.08em] text-grey-500">Valid Rows</div>
          <div className="font-display text-lead font-bold text-high-800 tabular">{v.valid} / {v.rows}</div>
          <div className="text-micro font-medium text-grey-500 mt-0.5">Passed schema checks</div>
        </div>

        <div className="rounded-xl border border-grey-200 border-l-4 border-l-primary-800 bg-white p-3.5 shadow-card">
          <div className="text-micro font-semibold uppercase tracking-[0.08em] text-grey-500">Already Ingested</div>
          <div className="font-display text-lead font-bold text-grey-900 tabular">{v.alreadyIngested}</div>
          <div className="text-micro font-medium text-grey-500 mt-0.5">Will be skipped (idempotent)</div>
        </div>

        <div className={cx('rounded-xl border border-l-4 p-3.5 shadow-card', v.inFileDuplicates > 0 ? 'border-amber-300 border-l-amber-500 bg-amber-50/60' : 'border-grey-200 border-l-grey-400 bg-white')}>
          <div className="text-micro font-semibold uppercase tracking-[0.08em] text-grey-500">In-file Duplicates</div>
          <div className="font-display text-lead font-bold text-amber-900 tabular">{v.inFileDuplicates}</div>
          <div className="text-micro font-medium text-grey-500 mt-0.5">Duplicate legacy codes</div>
        </div>

        <div className={cx('rounded-xl border border-l-4 p-3.5 shadow-card', v.insufficient > 0 ? 'border-amber-300 border-l-amber-500 bg-amber-50/60' : 'border-grey-200 border-l-grey-400 bg-white')}>
          <div className="text-micro font-semibold uppercase tracking-[0.08em] text-grey-500">Insufficient Data</div>
          <div className="font-display text-lead font-bold text-amber-900 tabular">{v.insufficient}</div>
          <div className="text-micro font-medium text-grey-500 mt-0.5">Missing required field</div>
        </div>

        <div className={cx('rounded-xl border border-l-4 p-3.5 shadow-card', v.uomIssues.length > 0 ? 'border-teal-300 border-l-teal-600 bg-teal-50/60' : 'border-grey-200 border-l-grey-400 bg-white')}>
          <div className="text-micro font-semibold uppercase tracking-[0.08em] text-grey-500">UOM Inconsistencies</div>
          <div className="font-display text-lead font-bold text-teal-900 tabular">{v.uomIssues.reduce((s, x) => s + x.count, 0)}</div>
          <div className="text-micro font-medium text-grey-500 mt-0.5">Non-canonical units</div>
        </div>
      </div>

      <div className="flex items-center justify-between rounded-xl border border-grey-200 bg-grey-50/80 px-4 py-3 shadow-2xs">
        <div className="text-caption font-medium text-grey-800">
          <b className="text-grey-900">{v.abbreviations.length}</b> abbreviations detected · <b className="text-grey-900">{Object.keys(v.categories).length}</b> material categories routed
        </div>
        <Button size="sm" variant="outline" icon={<Eye size={13} />} onClick={onViewFull}>
          View full quality report
        </Button>
      </div>
    </motion.div>
  );
}

function QualityReportModal({ v, open, onClose }: { v: Validation; open: boolean; onClose: () => void }) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Data-Quality & Normalization Report"
      subtitle={`${v.rows} extract rows evaluated against UniMat schemas`}
      width={760}
      footer={
        <Button variant="outline" size="sm" onClick={onClose}>
          Close report
        </Button>
      }
    >
      <div className="space-y-4 text-dense">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <DialogSection title="Missing Fields">
            {Object.entries(v.missing).map(([k, n]) => (
              <div key={k} className="flex justify-between py-0.5 text-caption">
                <span className="text-grey-600">{humanize(k.replace(/([A-Z])/g, '_$1'))}</span>
                <span className={cx('tabular font-mono', n > 0 && (k === 'legacyCode' || k === 'description') ? 'font-bold text-veto-700' : 'text-grey-800')}>{n}</span>
              </div>
            ))}
          </DialogSection>

          <DialogSection title={`Abbreviations (${v.abbreviations.length})`}>
            <div className="flex max-h-36 flex-wrap gap-1 overflow-y-auto">
              {v.abbreviations.map((a) => (
                <span key={a.term} className="rounded border border-grey-200 bg-white px-1.5 py-0.5 font-mono text-micro text-grey-800">
                  {a.term} → {a.expansion} <span className="text-grey-400">×{a.count}</span>
                </span>
              ))}
            </div>
          </DialogSection>

          <DialogSection title="UOM Inconsistencies">
            {v.uomIssues.length === 0 ? (
              <div className="text-caption text-grey-500">All units are standard ISO.</div>
            ) : (
              <table className="w-full text-caption">
                <tbody>
                  {v.uomIssues.map((u) => (
                    <tr key={u.raw + u.flag} className="border-b border-grey-100">
                      <td className="py-0.5 font-mono">{u.raw}</td>
                      <td className="py-0.5 text-grey-500">→ {u.normalizedTo ?? '?'}</td>
                      <td className="py-0.5 text-right font-mono text-micro text-amber-800">×{u.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </DialogSection>
        </div>

        <DialogSection title="Category Routing Preview">
          <div className="flex flex-wrap gap-2">
            {Object.entries(v.categories).map(([c, n]) => (
              <span key={c} className="inline-flex items-center gap-1.5 rounded border border-grey-200 bg-white px-2 py-1 text-caption">
                <CategoryChip code={c} /> <b className="font-mono">{n} records</b>
              </span>
            ))}
          </div>
        </DialogSection>

        <DialogSection title="Normalization Sample Preview">
          <table className="dt">
            <thead>
              <tr>
                <th>Legacy Code</th>
                <th>Source ERP Description</th>
                <th>Normalized Result</th>
                <th>Category</th>
              </tr>
            </thead>
            <tbody>
              {v.samples.map((s) => (
                <tr key={s.legacyCode}>
                  <td className="font-mono text-caption text-primary-800 font-semibold">{s.legacyCode}</td>
                  <td className="font-mono text-caption text-grey-700">{s.description}</td>
                  <td className="font-mono text-caption font-bold text-grey-900">{s.normalized}</td>
                  <td><CategoryChip code={s.category} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </DialogSection>
      </div>
    </Dialog>
  );
}

function StageRow({ s, st, index }: { s: (typeof STAGES)[number]; st: StageState; index: number }) {
  const r = st.result ?? {};
  let summary: ReactNode = null;
  if (st.status === 'done') {
    if (s.key === 'ingest') summary = `${r.inserted} new records · ${r.skippedDuplicates} already present (skipped) · ${r.rejected} rejected`;
    if (s.key === 'normalize') summary = `${r.normalized} records normalized · ${r.abbreviationsExpanded} abbreviations expanded · ${r.uomIssues} UOM issues fixed`;
    if (s.key === 'classify')
      summary = (
        <span className="inline-flex flex-wrap items-center gap-1.5">
          {Object.entries((r.byCategory as Record<string, number>) ?? {}).map(([c, n]) => (
            <span key={c} className="inline-flex items-center gap-1">
              <CategoryChip code={c} />
              {n}
            </span>
          ))}
          <span>· {String(r.attributesExtracted)} attributes · {String(r.insufficient)} insufficient</span>
        </span>
      );
    if (s.key === 'match')
      summary = (
        <span className="inline-flex flex-wrap items-center gap-2">
          {String(r.pairsEvaluated)} pairs scored → {String(r.recommendationsWritten)} recommendations ·
          {Object.entries((r.byMatchType as Record<string, number>) ?? {}).map(([k, n]) => (
            <span key={k} className="font-mono text-micro">
              {k.replace(/_/g, ' ').toLowerCase()} {n}
            </span>
          ))}
        </span>
      );
  }

  return (
    <motion.li initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0, transition: { ...transition, delay: index * 0.05 } }} className="relative flex gap-3 pb-4 last:pb-0">
      {index < STAGES.length - 1 && <span className={cx('absolute left-[11px] top-7 h-[calc(100%-22px)] w-0.5 transition-colors duration-300', st.status === 'done' ? 'bg-high-600' : 'bg-grey-200')} />}
      <span
        className={cx(
          'relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors duration-200',
          st.status === 'done' ? 'border-high-600 bg-high-600 text-white' : st.status === 'running' ? 'border-teal-600 bg-white text-teal-600' : st.status === 'error' ? 'border-veto-600 bg-veto-50 text-veto-600' : 'border-grey-300 bg-white text-grey-400',
        )}
      >
        {st.status === 'done' ? <Check size={12} strokeWidth={3} /> : st.status === 'running' ? <Loader2 size={12} className="animate-spin" /> : st.status === 'error' ? <X size={12} /> : <span className="font-mono text-micro">{index + 1}</span>}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={cx('text-dense font-semibold', st.status === 'idle' ? 'text-grey-500' : 'text-grey-900')}>{s.title}</span>
          {st.ms !== undefined && <span className="font-mono text-micro text-grey-400">{(st.ms / 1000).toFixed(2)} s</span>}
        </div>
        <div className="text-caption text-grey-500">{s.desc}</div>
        {st.status === 'running' && (
          <div className="mt-1.5 h-1 w-64 overflow-hidden rounded-full bg-grey-100">
            <motion.div className="h-full w-1/3 rounded-full bg-teal-600" animate={{ x: ['-100%', '300%'] }} transition={{ duration: 1, repeat: Infinity, ease: 'easeInOut' }} />
          </div>
        )}
        <AnimatePresence>
          {summary && (
            <motion.div {...expand} className="overflow-hidden">
              <div className="mt-1 text-caption text-grey-800">{summary}</div>
            </motion.div>
          )}
        </AnimatePresence>
        {st.error && <div className="mt-1 text-caption text-veto-700">{st.error}</div>}
      </div>
    </motion.li>
  );
}

export default function IngestPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const { can } = useSession();
  const { data: meta } = useQuery({
    queryKey: ['batches'],
    queryFn: () =>
      api<{
        batches: {
          id: string;
          org: string;
          fileName: string;
          rowCount: number;
          inserted: number;
          skipped: number;
          rejected: number;
          status: string;
          createdAt: string;
          createdBy: string | null;
        }[];
        organizations: { id: string; code: string; name: string; sector: string }[];
      }>('/api/ingest/batches'),
  });

  const [orgId, setOrgId] = useState('');
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [validation, setValidation] = useState<Validation | null>(null);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [stages, setStages] = useState<Record<StageKey, StageState>>({
    ingest: { status: 'idle' },
    normalize: { status: 'idle' },
    classify: { status: 'idle' },
    match: { status: 'idle' },
  });
  const [batchId, setBatchId] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const running = Object.values(stages).some((s) => s.status === 'running');
  const finished = stages.match.status === 'done';

  const reset = () => {
    setParsed(null);
    setMapping({});
    setValidation(null);
    setBatchId(null);
    setReportModalOpen(false);
    setStages({
      ingest: { status: 'idle' },
      normalize: { status: 'idle' },
      classify: { status: 'idle' },
      match: { status: 'idle' },
    });
  };

  const parse = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append('file', file);
      return api<Parsed>('/api/ingest/parse', { method: 'POST', body: fd });
    },
    onSuccess: (p) => {
      reset();
      setParsed(p);
      setMapping(p.suggestion);
      if (!orgId && /IOCL/i.test(p.fileName)) {
        setOrgId(meta?.organizations.find((o) => o.code === 'IOCL')?.id ?? '');
      }
    },
    onError: (e: Error) => toast({ kind: 'error', title: 'Could not read file', body: e.message }),
  });

  const validate = useMutation({
    mutationFn: () => api<Validation>('/api/ingest/validate', { method: 'POST', json: { orgId, mapping, rows: parsed!.rows } }),
    onSuccess: setValidation,
    onError: (e: Error) => toast({ kind: 'error', title: 'Validation failed', body: e.message }),
  });

  const loadSample = async (ext: 'csv' | 'xlsx') => {
    const res = await fetch(`/samples/IOCL_material_extract.${ext}`);
    const blob = await res.blob();
    parse.mutate(new File([blob], `IOCL_material_extract.${ext}`));
  };

  const runPipeline = useCallback(async () => {
    if (!parsed) return;
    const set = (k: StageKey, s: StageState) => setStages((x) => ({ ...x, [k]: s }));
    let id: string;
    try {
      set('ingest', { status: 'running' });
      const t0 = performance.now();
      const r = await api<Record<string, unknown> & { batchId: string }>('/api/ingest/commit', {
        method: 'POST',
        json: { orgId, fileName: parsed.fileName, mapping, rows: parsed.rows },
      });
      id = r.batchId;
      setBatchId(id);
      set('ingest', { status: 'done', result: r, ms: performance.now() - t0 });
    } catch (e) {
      set('ingest', { status: 'error', error: (e as Error).message });
      return;
    }
    for (const k of ['normalize', 'classify', 'match'] as const) {
      try {
        set(k, { status: 'running' });
        const t0 = performance.now();
        const r = await api<Record<string, unknown>>(`/api/pipeline/${k}`, { method: 'POST', json: { batchId: id } });
        set(k, { status: 'done', result: r, ms: performance.now() - t0 });
      } catch (e) {
        set(k, { status: 'error', error: (e as Error).message });
        return;
      }
    }
    qc.invalidateQueries();
    toast({ kind: 'success', title: 'Pipeline complete', body: 'New recommendations are waiting in the review queue.' });
  }, [parsed, orgId, mapping, qc, toast]);

  const requiredMapped = parsed ? parsed.targets.filter((t) => t.required).every((t) => Object.values(mapping).includes(t.key)) : false;
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDrag(false);
    const f = e.dataTransfer.files?.[0];
    if (f) parse.mutate(f);
  };

  return (
    <div className="space-y-3">
      <PageHeader
        eyebrow="Data Ingestion"
        title="Ingest catalog extract"
        description="Upload CPSE material master extracts (CSV or Excel) to run normalization and matching."
        actions={
          <div className="flex items-center gap-2">
            <a
              href="/samples/IOCL_material_extract.csv"
              download
              className="inline-flex h-8 items-center gap-1.5 rounded border border-grey-300 bg-white px-3 text-caption font-medium text-grey-800 hover:bg-grey-50 transition-colors"
            >
              <Download size={13} /> Sample CSV
            </a>
            <a
              href="/samples/IOCL_material_extract.xlsx"
              download
              className="inline-flex h-8 items-center gap-1.5 rounded border border-grey-300 bg-white px-3 text-caption font-medium text-grey-800 hover:bg-grey-50 transition-colors"
            >
              <Download size={13} /> Sample XLSX
            </a>
          </div>
        }
      />

      {!can('ingest:write') && (
        <div className="mb-3 flex items-center gap-2 rounded border border-amber-500/40 bg-amber-50 px-3 py-2 text-dense text-amber-800">
          <CircleAlert size={15} /> Your current role is read-only. Switch to Data Entry, Data Steward or Admin to ingest files.
        </div>
      )}

      <div className="grid grid-cols-12 gap-3">
        <div className="col-span-12 lg:col-span-8 min-w-0 space-y-3">
          <Panel>
            <div className="space-y-3 p-4">
              <StepHead n={1} title="Source organisation & file" done={!!parsed && !!orgId} active />
              <div className="grid grid-cols-1 gap-3 2xl:grid-cols-[280px_1fr]">
                <div>
                  <label className="field-label" htmlFor="org">CPSE</label>
                  <select id="org" className="input max-w-md" value={orgId} onChange={(e) => setOrgId(e.target.value)}>
                    <option value="">Select organisation…</option>
                    {meta?.organizations.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.code} — {o.name}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-caption text-grey-500">IOCL has not contributed data yet — use the sample extract to onboard it.</p>
                </div>

                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDrag(true);
                  }}
                  onDragLeave={() => setDrag(false)}
                  onDrop={onDrop}
                  className={cx(
                    'flex items-center gap-4 rounded-md border-2 border-dashed px-4 py-3 transition-colors duration-150',
                    drag ? 'border-teal-600 bg-teal-50' : 'border-grey-300 bg-grey-25',
                  )}
                >
                  <FileSpreadsheet size={28} className="text-grey-400" />
                  <div className="flex-1 min-w-0">
                    <div className="text-dense font-medium text-grey-900 truncate">
                      {parsed ? parsed.fileName : 'Drop a .csv / .xlsx extract here'}
                    </div>
                    <div className="text-caption text-grey-500">
                      {parsed ? `${parsed.rowCount} rows · ${parsed.headers.length} columns detected` : 'or pick a file — up to 10 MB'}
                    </div>
                  </div>
                  <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={(e) => e.target.files?.[0] && parse.mutate(e.target.files[0])} data-testid="file-input" />
                  <Button size="sm" icon={<Upload size={13} />} onClick={() => fileRef.current?.click()} disabled={!can('ingest:write') || parse.isPending}>
                    Choose file
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => loadSample('csv')} disabled={!can('ingest:write') || parse.isPending}>
                    Load IOCL sample
                  </Button>
                </div>
              </div>
            </div>
          </Panel>

          <AnimatePresence>
            {parsed && (
              <motion.div {...fadeUp}>
                <Panel>
                  <div className="space-y-3 p-4">
                    <StepHead n={2} title="Map columns to the target schema" done={requiredMapped} active>
                      <span className="ml-auto text-caption text-grey-500">Suggested automatically from header names</span>
                    </StepHead>
                    <ColumnMapper parsed={parsed} mapping={mapping} setMapping={(m) => { setMapping(m); setValidation(null); }} />
                    <div className="flex justify-end gap-2 pt-2">
                      <Button variant="ghost" icon={<RotateCcw size={13} />} onClick={reset}>
                        Start over
                      </Button>
                      <Button variant="primary" disabled={!requiredMapped || !orgId || validate.isPending} onClick={() => validate.mutate()}>
                        {validate.isPending ? 'Checking…' : 'Check data quality'} <ArrowRight size={14} />
                      </Button>
                    </div>
                  </div>
                </Panel>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {validation && (
              <motion.div {...fadeUp}>
                <Panel>
                  <div className="space-y-3 p-4">
                    <StepHead n={3} title="Data-quality summary" done={!!batchId} active />
                    <QualityReportSummary v={validation} onViewFull={() => setReportModalOpen(true)} />
                  </div>
                </Panel>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="col-span-12 lg:col-span-4 min-w-0 space-y-3">
          <Panel title="Harmonisation pipeline" subtitle="Each stage is a separate, observable step">
            <div className="p-4">
              <ol>
                {STAGES.map((s, i) => (
                  <StageRow key={s.key} s={s} st={stages[s.key]} index={i} />
                ))}
              </ol>
              <div className="mt-4 flex flex-wrap gap-2 border-t border-grey-200 pt-3">
                {!finished ? (
                  <Button variant="primary" className="w-full" disabled={!validation || running || !!batchId || !can('ingest:write')} onClick={runPipeline}>
                    {running ? 'Running…' : 'Run ingestion pipeline'}
                  </Button>
                ) : (
                  <>
                    <Link
                      href="/review?tab=FULL_REVIEW"
                      className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded border border-primary-900 bg-primary-800 px-3 text-dense font-medium text-white hover:bg-primary-900"
                    >
                      Review queue <ArrowRight size={14} />
                    </Link>
                    <Link
                      href={`/records?batch=${batchId}`}
                      className="inline-flex h-8 flex-1 items-center justify-center rounded border border-grey-300 bg-white px-3 text-dense text-grey-800 hover:bg-grey-50"
                    >
                      View batch records
                    </Link>
                  </>
                )}
              </div>
            </div>
          </Panel>
        </div>
      </div>

      <Panel className="mt-3" title="Ingestion history">
        {!meta?.batches.length ? (
          <Empty title="No batches yet" />
        ) : (
          <table className="dt">
            <thead>
              <tr>
                <th>When</th>
                <th>CPSE</th>
                <th>File</th>
                <th className="text-right">Rows</th>
                <th className="text-right">New</th>
                <th className="text-right">Skipped</th>
                <th>Stage reached</th>
                <th>By</th>
              </tr>
            </thead>
            <tbody>
              {meta.batches.map((b, i) => (
                <tr key={b.id} className={cx(i % 2 === 1 && 'dt-zebra')}>
                  <td className="whitespace-nowrap text-caption text-grey-600">{fmtDateTime(b.createdAt)}</td>
                  <td><OrgChip code={b.org} /></td>
                  <td>
                    <Link href={`/records?batch=${b.id}`} className="font-mono text-caption text-primary-800 hover:underline">{b.fileName}</Link>
                  </td>
                  <td className="tabular text-right">{b.rowCount}</td>
                  <td className="tabular text-right font-medium text-high-700">{b.inserted}</td>
                  <td className="tabular text-right text-grey-500">{b.skipped}</td>
                  <td><Badge tone={b.status === 'MATCHED' ? 'high' : 'neutral'}>{humanize(b.status)}</Badge></td>
                  <td className="text-caption text-grey-600">{b.createdBy ?? 'seed'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      {/* Full Quality Report Dialog */}
      {validation && (
        <QualityReportModal
          v={validation}
          open={reportModalOpen}
          onClose={() => setReportModalOpen(false)}
        />
      )}
    </div>
  );
}
