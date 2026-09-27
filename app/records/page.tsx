'use client';

import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { ChevronRight, Eye } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useMemo, useState } from 'react';
import { DataTable } from '@/components/ui/data-table';
import { Dialog, DialogSection, LoadingBar, PageHeader, Panel, Segmented } from '@/components/ui/primitives';
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
  raw: {
    rawLongText: string | null;
    rawManufacturer: string | null;
    rawPartNumber: string | null;
    rawMaterialGroup: string | null;
    lastPoPriceInr: number | null;
    annualQty: number | null;
    ingestedAt: string;
    rawPayload: Record<string, unknown> | null;
  };
  norm: {
    cleanedText: string;
    normalizedDescription: string;
    expansions: { term: string; expansion: string; kind: string }[];
    classifierReasons: string[];
    attributes: AttributeMap;
    qualityFlags: string[];
    proposedDescription: string | null;
    embeddingModel: string | null;
    pipelineVersion: string;
    categoryConfidence: number;
  } | null;
  org: { name: string };
  system: { name: string; version: string } | null;
  batch: { fileName: string } | null;
  mapping: { canonical: { id: string; cnmc: string; canonicalDescription: string } } | null;
  recommendations: { id: string; type: string; score: number; status: string; vetoed: boolean }[];
}

function RecordDetailDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['record', id],
    queryFn: () => api<Detail>(`/api/records/${id}`),
  });

  if (isLoading || !data) {
    return (
      <Dialog open onClose={onClose} title="Loading record lineage…" width={760}>
        <LoadingBar label="Fetching extracted attributes and ERP lineage" />
      </Dialog>
    );
  }

  const n = data.norm;

  return (
    <Dialog
      open
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <span>{data.org.name} Material Record</span>
          <span className="font-mono text-caption text-primary-800">
            {data.raw.rawPartNumber ? `MPN: ${data.raw.rawPartNumber}` : ''}
          </span>
        </div>
      }
      subtitle={`Ingested from ${data.batch?.fileName ?? 'batch'} · ${fmtDateTime(data.raw.ingestedAt)}`}
      width={780}
    >
      <div className="space-y-4 text-dense">
        {/* Top Header Card */}
        <div className="rounded-md border border-grey-200 bg-grey-50 p-3">
          <div className="eyebrow mb-1">Raw ERP Description</div>
          <div className="font-mono text-dense font-semibold text-grey-900">{data.norm?.cleanedText ?? '—'}</div>
          {n?.proposedDescription && (
            <div className="mt-2 border-t border-grey-200 pt-1.5">
              <div className="eyebrow mb-0.5">Standardised Description (Template)</div>
              <div className="font-mono text-caption text-primary-800 font-medium">{n.proposedDescription}</div>
            </div>
          )}
        </div>

        {/* Extracted Attributes Table */}
        <DialogSection title="Extracted Governed Attributes" subtitle="Parsed by domain regex & NLP extractors">
          {n && Object.keys(n.attributes).length ? (
            <table className="w-full text-caption">
              <thead>
                <tr className="border-b border-grey-200 text-left text-micro uppercase tracking-wider text-grey-500">
                  <th className="py-1">Attribute</th>
                  <th className="py-1">Extracted Value</th>
                  <th className="py-1 text-right">Confidence</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(n.attributes).map(([k, a]) => (
                  <tr key={k} className="border-b border-grey-100">
                    <td className="py-1.5 font-medium text-grey-700">{humanize(k)}</td>
                    <td className="py-1.5 font-mono text-grey-900 font-semibold">{String(a.value)}</td>
                    <td className="py-1.5 text-right font-mono text-micro text-grey-500">
                      {(a.confidence * 100).toFixed(0)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-caption text-grey-500">No governed attributes extracted (unclassified or incomplete record).</p>
          )}
        </DialogSection>

        {/* Normalization Details */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <DialogSection title="Abbreviations Expanded">
            <div className="flex flex-wrap gap-1.5">
              {n?.expansions.length ? (
                n.expansions.map((e) => (
                  <span key={e.term} className="rounded border border-grey-200 bg-white px-2 py-0.5 font-mono text-micro text-grey-800">
                    <b>{e.term}</b> → {e.expansion}
                  </span>
                ))
              ) : (
                <span className="text-caption text-grey-400">None</span>
              )}
            </div>
          </DialogSection>

          <DialogSection title="Quality Flags">
            <div className="flex flex-wrap gap-1.5">
              {n?.qualityFlags.length ? (
                n.qualityFlags.map((f) => (
                  <Badge
                    key={f}
                    tone={f.startsWith('MISSING_REQUIRED') || f.startsWith('UOM_DIM') ? 'amber' : 'neutral'}
                    className="!normal-case font-mono"
                  >
                    {f}
                  </Badge>
                ))
              ) : (
                <span className="text-caption text-grey-400">No quality flags</span>
              )}
            </div>
          </DialogSection>
        </div>

        {/* Source & Purchase Order Metadata */}
        <DialogSection title="Source ERP & Purchase History">
          <div className="grid grid-cols-2 gap-3 text-caption">
            <div>
              <span className="text-grey-500">Manufacturer / Make:</span>{' '}
              <span className="font-mono font-medium text-grey-900">{data.raw.rawManufacturer ?? '—'}</span>
            </div>
            <div>
              <span className="text-grey-500">Material Group:</span>{' '}
              <span className="font-mono font-medium text-grey-900">{data.raw.rawMaterialGroup ?? '—'}</span>
            </div>
            <div>
              <span className="text-grey-500">Last PO Price:</span>{' '}
              <span className="font-medium text-grey-900">
                {data.raw.lastPoPriceInr ? fmtInr(data.raw.lastPoPriceInr, { compact: false }) : 'No history'}
              </span>
            </div>
            <div>
              <span className="text-grey-500">Annual Procurement Qty:</span>{' '}
              <span className="font-mono font-medium text-grey-900">{data.raw.annualQty ? `${data.raw.annualQty} units/yr` : '—'}</span>
            </div>
          </div>
        </DialogSection>

        {/* AI Recommendations involving this record */}
        {data.recommendations.length > 0 && (
          <DialogSection title="AI Match Recommendations Involving This Record">
            <div className="space-y-1.5">
              {data.recommendations.map((r) => (
                <Link
                  key={r.id}
                  href={`/review?tab=${r.vetoed ? 'VETOED' : r.status === 'PENDING' ? 'FULL_REVIEW' : 'DECIDED'}&compare=${r.id}`}
                  className="flex items-center justify-between rounded border border-grey-200 bg-white p-2 hover:bg-grey-50"
                  onClick={onClose}
                >
                  <div className="flex items-center gap-2">
                    <MatchTypeBadge type={r.type} vetoed={r.vetoed} />
                    <ConfidenceMeter score={r.score} vetoed={r.vetoed} width={60} />
                    <StatusBadge status={r.status} />
                  </div>
                  <span className="flex items-center gap-1 text-caption text-teal-700 font-medium">
                    Inspect in Review Queue <ChevronRight size={13} />
                  </span>
                </Link>
              ))}
            </div>
          </DialogSection>
        )}
      </div>
    </Dialog>
  );
}

function RecordsInner() {
  const params = useSearchParams();
  const batch = params.get('batch');
  const catParam = params.get('cat');
  const { data, isLoading } = useQuery({
    queryKey: ['records'],
    queryFn: () => api<{ records: Row[] }>('/api/records'),
  });

  const [q, setQ] = useState('');
  const [org, setOrg] = useState('ALL');
  const [cat, setCat] = useState(catParam ?? 'ALL');
  const [status, setStatus] = useState<'all' | 'mapped' | 'unmapped' | 'pending' | 'insufficient'>('all');
  const [activeRecordId, setActiveRecordId] = useState<string | null>(null);

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
      {
        accessorKey: 'org',
        header: 'CPSE',
        size: 70,
        cell: (c) => <OrgChip code={c.getValue<string>()} />,
      },
      {
        accessorKey: 'legacyCode',
        header: 'Legacy code',
        size: 140,
        cell: (c) => <span className="font-mono text-caption text-primary-800 font-medium">{c.getValue<string>()}</span>,
      },
      {
        accessorKey: 'raw',
        header: 'Description (as held in ERP)',
        cell: (c) => (
          <div className="max-w-[360px]">
            <div className="truncate font-mono text-caption text-grey-900" title={c.row.original.raw}>
              {c.row.original.raw}
            </div>
            <div className="truncate text-micro text-grey-500" title={c.row.original.normalized ?? ''}>
              {c.row.original.normalized}
            </div>
          </div>
        ),
      },
      {
        accessorKey: 'category',
        header: 'Category',
        size: 90,
        cell: (c) => (c.getValue<string>() ? <CategoryChip code={c.getValue<string>()} /> : null),
      },
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
              {changed && <span className="text-grey-400 font-sans"> →{r.baseUom}</span>}
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
          return <span className={cx('tabular font-medium', v < 0.6 ? 'text-amber-800' : 'text-grey-700')}>{(v * 100).toFixed(0)}%</span>;
        },
      },
      {
        id: 'status',
        header: 'Harmonisation',
        accessorFn: (r) => r.cnmc ?? (r.pendingReviews ? `~pending ${r.pendingReviews}` : '~'),
        cell: (c) => {
          const r = c.row.original;
          if (r.cnmc) {
            return (
              <Link
                onClick={(e) => e.stopPropagation()}
                href={`/canonical/${r.canonicalId}`}
                className="block max-w-[240px] truncate font-mono text-micro text-high-700 hover:underline font-semibold"
                title={r.cnmc}
              >
                {r.cnmc}
              </Link>
            );
          }
          if (r.missing?.length) return <Badge tone="amber">Insufficient data</Badge>;
          if (r.category === 'UNCLASSIFIED') return <Badge tone="neutral">Unclassified</Badge>;
          if (r.pendingReviews) return <Badge tone="amber">{r.pendingReviews} in review</Badge>;
          return <span className="text-caption text-grey-400">unique so far</span>;
        },
      },
      {
        id: 'action',
        header: '',
        size: 70,
        cell: (c) => (
          <button
            type="button"
            onClick={() => setActiveRecordId(c.row.original.id)}
            className="inline-flex items-center gap-1 text-caption text-teal-700 hover:underline"
          >
            <Eye size={12} /> Detail
          </button>
        ),
      },
    ],
    [],
  );

  return (
    <div className="space-y-3">
      <PageHeader
        eyebrow="Material Catalog"
        title="Material records"
        description="Ingested ERP items with normalized specifications and extracted engineering parameters."
      />

      <Panel
        title={batch ? 'Records in selected batch' : `All CPSE records (${rows.length})`}
        actions={
          <div className="flex items-center gap-2">
            <input
              className="input h-7 w-60"
              placeholder="Filter code / description…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="Filter records"
            />
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
          <DataTable
            data={rows}
            columns={cols}
            globalFilter={q}
            getRowId={(r) => r.id}
            onRowClick={(r) => setActiveRecordId(r.id)}
            pageSize={40}
            maxHeight="calc(100vh - 280px)"
          />
        )}
      </Panel>

      {/* Row-Click Detail Dialog */}
      {activeRecordId && (
        <RecordDetailDialog id={activeRecordId} onClose={() => setActiveRecordId(null)} />
      )}
    </div>
  );
}

export default function RecordsPage() {
  return (
    <Suspense fallback={<LoadingBar label="Loading material records…" />}>
      <RecordsInner />
    </Suspense>
  );
}
