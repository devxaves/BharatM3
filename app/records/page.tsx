'use client';

import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useMemo, useState } from 'react';
import { DataTable } from '@/components/ui/data-table';
import { LoadingBar, PageHeader, Panel, Segmented } from '@/components/ui/primitives';
import { Badge, CategoryChip, ConfidenceMeter, MatchTypeBadge, OrgChip, StatusBadge } from '@/components/ui/status';
import { api } from '@/lib/client/api';
import { cx, fmtDateTime, fmtInr, humanize } from '@/lib/format';
import type { AttributeMap } from '@/lib/matching/types';

interface Row {
  id: string;
  org: string;
  legacyCode: string;
  raw: string;
  uom: string | null;
  normalized: string | null;
  category: string | null;
  categoryConfidence: number | null;
  baseUom: string | null;
  completeness: number | null;
  flags: string[] | null;
  missing: string[] | null;
  cnmc: string | null;
  canonicalId: string | null;
  batchId: string | null;
  pendingReviews: number;
}

interface Detail {
  raw: { rawLongText: string | null; rawManufacturer: string | null; rawPartNumber: string | null; rawMaterialGroup: string | null; lastPoPriceInr: number | null; annualQty: number | null; ingestedAt: string; rawPayload: Record<string, unknown> | null };
  norm: { cleanedText: string; normalizedDescription: string; expansions: { term: string; expansion: string; kind: string }[]; classifierReasons: string[]; attributes: AttributeMap; qualityFlags: string[]; proposedDescription: string | null; embeddingModel: string | null; pipelineVersion: string; categoryConfidence: number } | null;
  org: { name: string };
  system: { name: string; version: string } | null;
  batch: { fileName: string } | null;
  mapping: { canonical: { id: string; cnmc: string; canonicalDescription: string } } | null;
  recommendations: { id: string; type: string; score: number; status: string; vetoed: boolean }[];
}

function RecordDetail({ id }: { id: string }) {
  const { data } = useQuery({ queryKey: ['record', id], queryFn: () => api<Detail>(`/api/records/${id}`) });
  if (!data) return <div className="py-4 text-caption text-grey-500">Loading record…</div>;
  const n = data.norm;
  return (
    <div className="grid grid-cols-[1.2fr_1fr_1fr] gap-5 text-caption">
      <div>
        <div className="eyebrow mb-1">Extracted attributes</div>
        {n && Object.keys(n.attributes).length ? (
          <table className="w-full">
            <tbody>
              {Object.entries(n.attributes).map(([k, a]) => (
                <tr key={k} className="border-b border-grey-200/70">
                  <td className="py-1 pr-2 text-grey-500">{humanize(k)}</td>
                  <td className="py-1 font-mono text-grey-900">{String(a.value)}</td>
                  <td className="py-1 text-right text-micro text-grey-400">
                    {a.source} · {(a.confidence * 100).toFixed(0)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="text-grey-500">No governed attributes (unclassified record).</div>
        )}
        {n?.proposedDescription && (
          <div className="mt-2">
            <div className="eyebrow mb-0.5">Standardised description (template)</div>
            <div className="font-mono text-primary-800">{n.proposedDescription}</div>
          </div>
        )}
      </div>
      <div className="space-y-2">
        <div>
          <div className="eyebrow mb-0.5">Classifier evidence</div>
          <ul className="list-disc pl-4 text-grey-700">{n?.classifierReasons.map((r) => <li key={r}>{r}</li>)}</ul>
        </div>
        <div>
          <div className="eyebrow mb-0.5">Abbreviations expanded</div>
          <div className="flex flex-wrap gap-1">
            {n?.expansions.length ? n.expansions.map((e) => <span key={e.term} className="rounded-sm border border-grey-200 bg-white px-1 font-mono text-micro">{e.term}→{e.expansion}</span>) : <span className="text-grey-400">none</span>}
          </div>
        </div>
        <div>
          <div className="eyebrow mb-0.5">Quality flags</div>
          <div className="flex flex-wrap gap-1">{n?.qualityFlags.map((f) => <Badge key={f} tone={f.startsWith('MISSING_REQUIRED') || f.startsWith('UOM_DIM') ? 'amber' : 'neutral'} className="!normal-case">{f}</Badge>)}</div>
        </div>
      </div>
      <div className="space-y-2">
        <div>
          <div className="eyebrow mb-0.5">Source</div>
          <div className="text-grey-700">
            {data.org.name} · {data.system?.name} ({data.system?.version})
          </div>
          <div className="text-grey-500">
            {data.batch?.fileName} · ingested {fmtDateTime(data.raw.ingestedAt)}
          </div>
          <div className="mt-1 text-grey-700">
            Make/MPN: <span className="font-mono">{data.raw.rawManufacturer ?? '—'} {data.raw.rawPartNumber ?? ''}</span> · Group <span className="font-mono">{data.raw.rawMaterialGroup ?? '—'}</span>
          </div>
          <div className="text-grey-700">Last PO: {data.raw.lastPoPriceInr ? `${fmtInr(data.raw.lastPoPriceInr, { compact: false })}${data.raw.annualQty ? ` × ${data.raw.annualQty}/yr` : ' (qty not provided)'}` : 'no history'}</div>
          <div className="text-micro text-grey-400">
            pipeline {n?.pipelineVersion} · {n?.embeddingModel}
          </div>
        </div>
        <div>
          <div className="eyebrow mb-0.5">AI recommendations involving this record</div>
          {data.recommendations.length === 0 && <div className="text-grey-500">None — no candidate above the storage threshold.</div>}
          {data.recommendations.map((r) => (
            <Link key={r.id} href={`/review?tab=${r.vetoed ? 'VETOED' : r.status === 'PENDING' ? 'FULL_REVIEW' : 'DECIDED'}&id=${r.id}`} className="flex items-center gap-2 py-0.5 hover:underline">
              <MatchTypeBadge type={r.type} vetoed={r.vetoed} />
              <ConfidenceMeter score={r.score} vetoed={r.vetoed} width={50} />
              <StatusBadge status={r.status} />
              <ChevronRight size={12} className="text-grey-400" />
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

function RecordsInner() {
  const params = useSearchParams();
  const batch = params.get('batch');
  const { data, isLoading } = useQuery({ queryKey: ['records'], queryFn: () => api<{ records: Row[] }>('/api/records') });
  const [q, setQ] = useState('');
  const [org, setOrg] = useState('ALL');
  const [cat, setCat] = useState('ALL');
  const [status, setStatus] = useState<'all' | 'mapped' | 'unmapped' | 'pending' | 'insufficient'>('all');

  const rows = useMemo(() => {
    let r = data?.records ?? [];
    if (batch) r = r.filter((x) => x.batchId === batch);
    if (org !== 'ALL') r = r.filter((x) => x.org === org);
    if (cat !== 'ALL') r = r.filter((x) => x.category === cat);
    if (status === 'mapped') r = r.filter((x) => x.cnmc);
    if (status === 'unmapped') r = r.filter((x) => !x.cnmc);
    if (status === 'pending') r = r.filter((x) => x.pendingReviews > 0);
    if (status === 'insufficient') r = r.filter((x) => (x.missing?.length ?? 0) > 0);
    return r;
  }, [data, org, cat, status, batch]);

  const orgs = useMemo(() => [...new Set((data?.records ?? []).map((r) => r.org))].sort(), [data]);
  const cols = useMemo<ColumnDef<Row>[]>(
    () => [
      { accessorKey: 'org', header: 'CPSE', size: 70, cell: (c) => <OrgChip code={c.getValue<string>()} /> },
      { accessorKey: 'legacyCode', header: 'Legacy code', size: 150, cell: (c) => <span className="font-mono text-caption text-primary-800">{c.getValue<string>()}</span> },
      {
        accessorKey: 'raw',
        header: 'Description (as held in ERP)',
        cell: (c) => (
          <div className="max-w-[360px]">
            <div className="truncate font-mono text-caption text-grey-900" title={c.row.original.raw}>{c.row.original.raw}</div>
            <div className="truncate text-micro text-grey-500" title={c.row.original.normalized ?? ''}>{c.row.original.normalized}</div>
          </div>
        ),
      },
      { accessorKey: 'category', header: 'Category', size: 90, cell: (c) => (c.getValue<string>() ? <CategoryChip code={c.getValue<string>()} /> : null) },
      {
        accessorKey: 'uom',
        header: 'UOM',
        size: 80,
        cell: (c) => {
          const r = c.row.original;
          const changed = r.baseUom && r.uom?.toUpperCase() !== r.baseUom;
          return (
            <span className="font-mono text-caption">
              {r.uom ?? '—'}
              {changed && <span className="text-grey-400"> →{r.baseUom}</span>}
            </span>
          );
        },
      },
      {
        accessorKey: 'completeness',
        header: 'Complete',
        size: 80,
        meta: { align: 'right' },
        cell: (c) => {
          const v = c.getValue<number | null>() ?? 0;
          return <span className={cx('tabular', v < 0.6 ? 'text-amber-800' : 'text-grey-700')}>{(v * 100).toFixed(0)}%</span>;
        },
      },
      {
        id: 'status',
        header: 'Harmonisation',
        accessorFn: (r) => r.cnmc ?? (r.pendingReviews ? `~pending ${r.pendingReviews}` : '~'),
        cell: (c) => {
          const r = c.row.original;
          if (r.cnmc)
            return (
              <Link onClick={(e) => e.stopPropagation()} href={`/canonical/${r.canonicalId}`} className="block max-w-[260px] truncate font-mono text-micro text-high-700 hover:underline" title={r.cnmc}>
                {r.cnmc}
              </Link>
            );
          if (r.missing?.length) return <Badge tone="amber">Insufficient data</Badge>;
          if (r.category === 'UNCLASSIFIED') return <Badge tone="neutral">Unclassified</Badge>;
          if (r.pendingReviews) return <Badge tone="amber">{r.pendingReviews} awaiting review</Badge>;
          return <span className="text-caption text-grey-400">unique so far</span>;
        },
      },
    ],
    [],
  );

  return (
    <div>
      <PageHeader
        eyebrow="Material data"
        title="Material records"
        description="Every legacy record exactly as ingested from each CPSE ERP — untouched — alongside its normalized form, extracted attributes and harmonisation status. Click a row for the full lineage."
      />
      <Panel
        title={batch ? 'Records in selected batch' : 'All CPSE records'}
        actions={
          <div className="flex items-center gap-2">
            <input className="input h-7 w-64" placeholder="Filter code / description…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filter records" />
            <select className="input h-7 w-28" value={org} onChange={(e) => setOrg(e.target.value)} aria-label="CPSE">
              <option value="ALL">All CPSEs</option>
              {orgs.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
            <select className="input h-7 w-36" value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Category">
              <option value="ALL">All categories</option>
              {['BEARING', 'VALVE', 'CABLE', 'FASTENER', 'PUMP', 'UNCLASSIFIED'].map((c) => (
                <option key={c} value={c}>
                  {humanize(c)}
                </option>
              ))}
            </select>
            <Segmented
              value={status}
              onChange={setStatus}
              items={[
                { value: 'all', label: 'All' },
                { value: 'mapped', label: 'Mapped' },
                { value: 'unmapped', label: 'Unmapped' },
                { value: 'pending', label: 'In review' },
                { value: 'insufficient', label: 'Insufficient' },
              ]}
            />
          </div>
        }
      >
        {isLoading ? (
          <LoadingBar label="Loading records" />
        ) : (
          <DataTable data={rows} columns={cols} globalFilter={q} getRowId={(r) => r.id} renderExpanded={(r) => <RecordDetail id={r.id} />} pageSize={40} maxHeight="calc(100vh - 290px)" footerNote={batch ? 'filtered to one ingestion batch' : undefined} />
        )}
      </Panel>
    </div>
  );
}

export default function RecordsPage() {
  return (
    <Suspense fallback={<LoadingBar />}>
      <RecordsInner />
    </Suspense>
  );
}
