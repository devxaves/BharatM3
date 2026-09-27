'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { motion } from 'framer-motion';
import { ArrowRight, Search, Undo2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { DataTable } from '@/components/ui/data-table';
import { Button, Dialog, LoadingBar, PageHeader, Panel } from '@/components/ui/primitives';
import { Badge, CategoryChip, MatchTypeBadge, OrgChip, StatusBadge } from '@/components/ui/status';
import { useToast } from '@/components/ui/toast';
import { MappingRows, type Mapping } from '@/components/mappings/mapping-rows';
import { api } from '@/lib/client/api';
import { useSession } from '@/lib/client/session';
import { cx, fmtDate, fmtInr } from '@/lib/format';
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

  const { data, isLoading } = useQuery({ queryKey: ['canonical'], queryFn: () => api<{ canonical: Canon[]; mappings: Mapping[] }>('/api/canonical') });
  const lookup = useQuery({ queryKey: ['lookup', q], queryFn: () => api<{ exact: Hit[]; fuzzy: Hit[] }>(`/api/mappings/lookup?q=${encodeURIComponent(q)}`), enabled: !!q });
  const byCanon = useMemo(() => {
    const m = new Map<string, Mapping[]>();
    for (const x of data?.mappings ?? []) m.set(x.canonicalId, [...(m.get(x.canonicalId) ?? []), x]);
    return m;
  }, [data]);

  const rev = useMutation({
    mutationFn: () => api(`/api/mappings/${reverse!.id}/reverse`, { method: 'POST', json: { reason } }),
    onSuccess: () => {
      toast({ kind: 'success', title: 'Mapping reversed', body: 'The row is kept with status REVERSED; nothing was deleted.' });
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
            <Link onClick={(e) => e.stopPropagation()} href={`/canonical/${c.row.original.id}`} className="block truncate font-mono text-caption font-medium text-primary-800 hover:underline" title={c.row.original.cnmc}>
              {c.row.original.cnmc}
            </Link>
            <div className="truncate text-micro text-grey-500" title={c.row.original.description}>{c.row.original.description}</div>
          </div>
        ),
      },
      { accessorKey: 'shortCode', header: 'ERP code', size: 130, cell: (c) => <span className="font-mono text-caption">{c.getValue<string>()}</span> },
      { accessorKey: 'category', header: 'Cat.', size: 60, cell: (c) => <CategoryChip code={c.getValue<string>()} /> },
      { accessorKey: 'unspsc', header: 'UNSPSC', size: 90, cell: (c) => <span className="font-mono text-caption text-grey-600">{c.getValue<string>()}</span> },
      {
        accessorKey: 'orgs',
        header: 'CPSEs',
        size: 200,
        sortingFn: (a, b) => a.original.orgs.length - b.original.orgs.length,
        cell: (c) => (
          <span className="flex flex-wrap gap-0.5">
            {c.row.original.orgs.map((o) => (
              <OrgChip key={o} code={o} />
            ))}
          </span>
        ),
      },
      { accessorKey: 'mappings', header: 'Legacy codes', size: 90, meta: { align: 'right' }, cell: (c) => <span className="tabular font-medium">{c.getValue<number>()}</span> },
      { accessorKey: 'createdAt', header: 'Created', size: 100, cell: (c) => <span className="text-caption text-grey-600">{fmtDate(c.getValue<string>())}</span> },
      { accessorKey: 'status', header: 'Status', size: 90, cell: (c) => <StatusBadge status={c.getValue<string>()} /> },
    ],
    [],
  );

  const hits = lookup.data ? [...lookup.data.exact, ...lookup.data.fuzzy] : [];
  const reachedCodes = (data?.canonical ?? []).reduce((s, c) => s + c.mappings, 0);

  return (
    <div>
      <PageHeader
        eyebrow="One Nation – One Material Code"
        title="National codes & legacy mappings"
        description="Look up any CPSE legacy code to find its Common National Material Code and every sibling code in other CPSEs. Mappings are many-to-one, additive and reversible — legacy codes are never renumbered or deleted."
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
            <input className="input h-9 pl-8 text-body" value={term} onChange={(e) => setTerm(e.target.value)} placeholder="e.g. 10004127 · CIL/ME/BRG/… · IN-MAT-BRG-DGBB-6205 · “gate valve 4 inch 150”" aria-label="Lookup" />
          </div>
          <Button variant="primary" type="submit">
            Look up
          </Button>
          <span className="text-caption text-grey-500">exact code match + pg_trgm fuzzy text search</span>
        </form>
        {q && (
          <motion.div {...fadeUp} className="border-t border-grey-200">
            {lookup.isLoading ? (
              <LoadingBar label="Searching" />
            ) : hits.length === 0 ? (
              <div className="px-4 py-6 text-center text-dense text-grey-500">No legacy code or description matches “{q}”.</div>
            ) : (
              <div className="divide-y divide-grey-100">
                {hits.slice(0, 12).map((h) => {
                  const siblings = h.canonicalId ? byCanon.get(h.canonicalId) ?? [] : [];
                  return (
                    <div key={h.rawId} className="grid grid-cols-[1fr_1.4fr] gap-4 px-4 py-2.5">
                      <div>
                        <div className="flex items-center gap-2">
                          <OrgChip code={h.org} />
                          <span className="font-mono text-dense font-medium text-primary-800">{h.legacyCode}</span>
                          {h.sim !== undefined ? <Badge tone="ai">text sim {h.sim.toFixed(2)}</Badge> : <Badge tone="primary">code match</Badge>}
                        </div>
                        <div className="mt-0.5 font-mono text-caption text-grey-700">{h.description}</div>
                      </div>
                      <div>
                        {h.cnmc ? (
                          <>
                            <div className="flex items-center gap-2">
                              <ArrowRight size={13} className="text-high-600" />
                              <Link href={`/canonical/${h.canonicalId}`} className="font-mono text-dense font-semibold text-high-700 hover:underline">
                                {h.cnmc}
                              </Link>
                            </div>
                            <div className="text-caption text-grey-600">{h.canonicalDescription}</div>
                            <div className="mt-1 flex flex-wrap gap-1.5">
                              {siblings
                                .filter((s) => s.status === 'ACTIVE' && s.rawId !== h.rawId)
                                .map((s) => (
                                  <span key={s.id} className="inline-flex items-center gap-1 rounded-sm border border-grey-200 bg-grey-25 px-1 py-0.5">
                                    <OrgChip code={s.org} /> <span className="font-mono text-micro">{s.legacyCode}</span>
                                  </span>
                                ))}
                            </div>
                          </>
                        ) : (
                          <div className="text-caption text-grey-500">Not yet harmonised — check the review queue for pending recommendations.</div>
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
        actions={<input className="input h-7 w-64" placeholder="Filter register…" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter register" />}
      >
        {isLoading ? (
          <LoadingBar />
        ) : (
          <DataTable
            data={data?.canonical ?? []}
            columns={cols}
            globalFilter={filter}
            getRowId={(r) => r.id}
            pageSize={30}
            initialSorting={[{ id: 'mappings', desc: true }]}
            renderExpanded={(c) => <MappingRows rows={byCanon.get(c.id) ?? []} canReverse={can('mappings:reverse')} onReverse={setReverse} />}
            maxHeight="calc(100vh - 330px)"
          />
        )}
      </Panel>

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
            <p>
              <OrgChip code={reverse.org} /> <span className="font-mono">{reverse.legacyCode}</span> will be detached from its national code. The mapping row is retained with status <b>REVERSED</b> and your reason is written to the audit trail.
            </p>
            <div>
              <label className="field-label">Reason</label>
              <textarea className="input h-20 py-1.5" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Source CPSE confirmed different drawing revision" />
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}

export default function MappingsPage() {
  return (
    <Suspense fallback={<LoadingBar />}>
      <MappingsInner />
    </Suspense>
  );
}
