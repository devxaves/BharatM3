'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { motion } from 'framer-motion';
import { ArrowRight, ExternalLink, Eye, Search, Undo2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { MappingRows, type Mapping } from '@/components/mappings/mapping-rows';
import { DataTable } from '@/components/ui/data-table';
import { Button, Dialog, DialogSection, LoadingBar, PageHeader, Panel, Stat } from '@/components/ui/primitives';
import { Badge, CategoryChip, MatchTypeBadge, OrgChip, StatusBadge } from '@/components/ui/status';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/client/api';
import { useSession } from '@/lib/client/session';
import { cx, fmtDate, fmtDateTime, fmtInr, humanize } from '@/lib/format';
import { fadeUp } from '@/lib/motion';

interface Canon {
  id: string;
  cnmc: string;
  shortCode: string;
  description: string;
  category: string;
  unspsc: string | null;
  baseUom: string | null;
  status: string;
  version: number;
  value: number | null;
  createdAt: string;
  mappings: number;
  orgs: string[];
}

interface Hit {
  rawId: string;
  org: string;
  legacyCode: string;
  description: string;
  canonicalId: string | null;
  cnmc: string | null;
  canonicalDescription: string | null;
  sim?: number;
}

function CanonicalDetailModal({
  canon,
  mappings,
  onClose,
  onReverse,
  canReverse,
}: {
  canon: Canon;
  mappings: Mapping[];
  onClose: () => void;
  onReverse: (m: Mapping) => void;
  canReverse: boolean;
}) {
  const prices = mappings.map((m) => m.price).filter((p): p is number => !!p);

  return (
    <Dialog
      open
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <span>{canon.description}</span>
          <StatusBadge status={canon.status} />
        </div>
      }
      subtitle={<span className="font-mono font-bold text-primary-800">{canon.cnmc}</span>}
      width={860}
      footer={
        <div className="flex w-full items-center justify-between">
          <Link
            href={`/canonical/${canon.id}`}
            className="inline-flex items-center gap-1.5 text-caption font-medium text-teal-700 hover:underline"
          >
            Open dedicated canonical page <ExternalLink size={13} />
          </Link>
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      }
    >
      <div className="space-y-4 text-dense">
        {/* Identifiers Grid */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 rounded-md border border-grey-200 bg-grey-50 p-3">
          <Stat label="ERP Short Code" value={<span className="font-mono text-caption">{canon.shortCode}</span>} hint="SAP ECC safe" />
          <Stat label="UNSPSC" value={<span className="font-mono text-caption">{canon.unspsc ?? '—'}</span>} />
          <Stat label="Category" value={<CategoryChip code={canon.category} />} />
          <Stat label="Base UOM · Ver." value={<span className="font-mono text-caption">{canon.baseUom ?? 'EA'} · v{canon.version}</span>} />
        </div>

        {/* Mapped Legacy Codes */}
        <DialogSection
          title={`Mapped Legacy Codes (${mappings.length} from ${canon.orgs.length} CPSEs)`}
          subtitle="Additive & reversible cross-references across enterprise catalogs"
        >
          <MappingRows rows={mappings} onReverse={onReverse} canReverse={canReverse} />
          {prices.length > 1 && (
            <div className="mt-2 border-t border-grey-200 pt-2 text-caption text-grey-600">
              Price dispersion across CPSEs: <b>{fmtInr(Math.min(...prices), { compact: false })}</b> to <b>{fmtInr(Math.max(...prices), { compact: false })}</b> (
              {(((Math.max(...prices) - Math.min(...prices)) / Math.min(...prices)) * 100).toFixed(0)}% spread)
            </div>
          )}
        </DialogSection>
      </div>
    </Dialog>
  );
}

function MappingsInner() {
  const router = useRouter();
  const params = useSearchParams();
  const q = params.get('q') ?? '';
  const [term, setTerm] = useState(q);
  useEffect(() => setTerm(q), [q]);
  const qc = useQueryClient();
  const toast = useToast();
  const { can } = useSession();
  const [reverse, setReverse] = useState<Mapping | null>(null);
  const [reason, setReason] = useState('');
  const [filter, setFilter] = useState('');
  const [selectedCanon, setSelectedCanon] = useState<Canon | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['canonical'],
    queryFn: () => api<{ canonical: Canon[]; mappings: Mapping[] }>('/api/canonical'),
  });

  const lookup = useQuery({
    queryKey: ['lookup', q],
    queryFn: () => api<{ exact: Hit[]; fuzzy: Hit[] }>(`/api/mappings/lookup?q=${encodeURIComponent(q)}`),
    enabled: !!q,
  });

  const byCanon = useMemo(() => {
    const m = new Map<string, Mapping[]>();
    for (const x of data?.mappings ?? []) m.set(x.canonicalId, [...(m.get(x.canonicalId) ?? []), x]);
    return m;
  }, [data]);

  const rev = useMutation({
    mutationFn: () => api(`/api/mappings/${reverse!.id}/reverse`, { method: 'POST', json: { reason } }),
    onSuccess: () => {
      toast({ kind: 'success', title: 'Mapping reversed', body: 'The row is retained with status REVERSED; nothing was deleted.' });
      setReverse(null);
      setReason('');
      qc.invalidateQueries();
    },
    onError: (e: Error) => toast({ kind: 'error', title: 'Could not reverse', body: e.message }),
  });

  const cols = useMemo<ColumnDef<Canon>[]>(
    () => [
      {
        accessorKey: 'cnmc',
        header: 'Common National Material Code',
        cell: (c) => (
          <div className="max-w-[420px]">
            <div className="block truncate font-mono text-caption font-bold text-primary-800" title={c.row.original.cnmc}>
              {c.row.original.cnmc}
            </div>
            <div className="truncate text-micro text-grey-500" title={c.row.original.description}>
              {c.row.original.description}
            </div>
          </div>
        ),
      },
      {
        accessorKey: 'shortCode',
        header: 'ERP code',
        size: 130,
        cell: (c) => <span className="font-mono text-caption">{c.getValue<string>()}</span>,
      },
      {
        accessorKey: 'category',
        header: 'Cat.',
        size: 60,
        cell: (c) => <CategoryChip code={c.getValue<string>()} />,
      },
      {
        accessorKey: 'unspsc',
        header: 'UNSPSC',
        size: 90,
        cell: (c) => <span className="font-mono text-caption text-grey-600">{c.getValue<string>() ?? '—'}</span>,
      },
      {
        accessorKey: 'orgs',
        header: 'CPSEs',
        size: 180,
        sortingFn: (a, b) => a.original.orgs.length - b.original.orgs.length,
        cell: (c) => (
          <span className="flex flex-wrap gap-0.5">
            {c.row.original.orgs.map((o) => (
              <OrgChip key={o} code={o} />
            ))}
          </span>
        ),
      },
      {
        accessorKey: 'mappings',
        header: 'Mapped codes',
        size: 100,
        meta: { align: 'right' },
        cell: (c) => <span className="tabular font-semibold text-primary-900">{c.getValue<number>()}</span>,
      },
      {
        accessorKey: 'status',
        header: 'Status',
        size: 90,
        cell: (c) => <StatusBadge status={c.getValue<string>()} />,
      },
      {
        id: 'detail',
        header: '',
        size: 70,
        cell: (c) => (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setSelectedCanon(c.row.original);
            }}
            className="inline-flex items-center gap-1 text-caption text-teal-700 hover:underline"
          >
            <Eye size={12} /> Detail
          </button>
        ),
      },
    ],
    [],
  );

  const hits = lookup.data ? [...lookup.data.exact, ...lookup.data.fuzzy] : [];
  const reachedCodes = (data?.canonical ?? []).reduce((s, c) => s + c.mappings, 0);

  return (
    <div className="space-y-3">
      <PageHeader
        eyebrow="Material Register"
        title="National codes & mappings"
        description="Cross-reference CPSE legacy items to Common National Material Codes (CNMC)."
      />

      <Panel>
        <form
          className="flex items-center gap-2 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            router.replace(`/mappings?q=${encodeURIComponent(term.trim())}`);
          }}
        >
          <div className="relative flex-1">
            <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-grey-400" />
            <input
              className="input h-9 pl-8 text-body"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Search legacy code, CNMC, or item description..."
              aria-label="Lookup"
            />
          </div>
          <Button variant="primary" type="submit">
            Search
          </Button>
        </form>

        {q && (
          <motion.div {...fadeUp} className="border-t border-grey-200">
            {lookup.isLoading ? (
              <LoadingBar label="Searching cross-CPSE mappings" />
            ) : hits.length === 0 ? (
              <div className="px-4 py-6 text-center text-dense text-grey-500">No legacy code or description matches “{q}”.</div>
            ) : (
              <div className="divide-y divide-grey-100">
                {hits.slice(0, 10).map((h) => {
                  const siblings = h.canonicalId ? byCanon.get(h.canonicalId) ?? [] : [];
                  return (
                    <div key={h.rawId} className="grid grid-cols-1 gap-2 px-4 py-3 sm:grid-cols-[1fr_1.4fr]">
                      <div>
                        <div className="flex items-center gap-2">
                          <OrgChip code={h.org} />
                          <span className="font-mono text-dense font-semibold text-primary-800">{h.legacyCode}</span>
                          {h.sim !== undefined ? <Badge tone="ai">similarity {h.sim.toFixed(2)}</Badge> : <Badge tone="primary">exact match</Badge>}
                        </div>
                        <div className="mt-1 font-mono text-caption text-grey-700">{h.description}</div>
                      </div>
                      <div>
                        {h.cnmc ? (
                          <>
                            <div className="flex items-center gap-2">
                              <ArrowRight size={13} className="text-high-600" />
                              <Link
                                href={`/canonical/${h.canonicalId}`}
                                className="font-mono text-dense font-bold text-high-700 hover:underline"
                              >
                                {h.cnmc}
                              </Link>
                            </div>
                            <div className="text-caption text-grey-600">{h.canonicalDescription}</div>
                            <div className="mt-1 flex flex-wrap gap-1">
                              {siblings
                                .filter((s) => s.status === 'ACTIVE' && s.rawId !== h.rawId)
                                .map((s) => (
                                  <span key={s.id} className="inline-flex items-center gap-1 rounded border border-grey-200 bg-grey-25 px-1.5 py-0.5">
                                    <OrgChip code={s.org} /> <span className="font-mono text-micro">{s.legacyCode}</span>
                                  </span>
                                ))}
                            </div>
                          </>
                        ) : (
                          <div className="text-caption text-grey-500">Not yet harmonised — check review queue for candidates.</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </motion.div>
        )}
      </Panel>

      <Panel
        className="mt-3"
        title={`National material register · ${data?.canonical.length ?? 0} codes covering ${reachedCodes} legacy codes`}
        actions={
          <input
            className="input h-7 w-64"
            placeholder="Filter register…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            aria-label="Filter register"
          />
        }
      >
        {isLoading ? (
          <LoadingBar label="Loading national register" />
        ) : (
          <DataTable
            data={data?.canonical ?? []}
            columns={cols}
            globalFilter={filter}
            getRowId={(r) => r.id}
            pageSize={30}
            initialSorting={[{ id: 'mappings', desc: true }]}
            onRowClick={(r) => setSelectedCanon(r)}
            maxHeight="calc(100vh - 330px)"
          />
        )}
      </Panel>

      {/* Row-Click Canonical Detail Dialog */}
      {selectedCanon && (
        <CanonicalDetailModal
          canon={selectedCanon}
          mappings={byCanon.get(selectedCanon.id) ?? []}
          onClose={() => setSelectedCanon(null)}
          onReverse={(m) => setReverse(m)}
          canReverse={can('mappings:reverse')}
        />
      )}

      {/* Reversal Confirmation Dialog */}
      <Dialog
        open={!!reverse}
        onClose={() => setReverse(null)}
        title="Reverse legacy mapping"
        footer={
          <>
            <Button variant="ghost" onClick={() => setReverse(null)}>
              Cancel
            </Button>
            <Button variant="danger" disabled={reason.trim().length < 5 || rev.isPending} onClick={() => rev.mutate()}>
              Reverse mapping
            </Button>
          </>
        }
      >
        {reverse && (
          <div className="space-y-3 text-dense">
            <p className="text-caption text-grey-700 leading-relaxed">
              <OrgChip code={reverse.org} /> <span className="font-mono font-semibold">{reverse.legacyCode}</span> will be detached from its national code. The mapping record is retained with status <b>REVERSED</b> and your reason is logged to the audit trail.
            </p>
            <div>
              <label className="field-label">Reason for reversal (required)</label>
              <textarea
                className="input h-20 py-1.5"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Source CPSE confirmed different engineering drawing revision"
              />
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}

export default function MappingsPage() {
  return (
    <Suspense fallback={<LoadingBar label="Loading mappings…" />}>
      <MappingsInner />
    </Suspense>
  );
}
