'use client';

import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Info } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { MappingRows, type Mapping } from '@/components/mappings/mapping-rows';
import { CountUp } from '@/components/ui/count-up';
import { DataTable } from '@/components/ui/data-table';
import { LoadingBar, PageHeader, Panel, Segmented } from '@/components/ui/primitives';
import { CategoryChip, OrgChip } from '@/components/ui/status';
import { api } from '@/lib/client/api';
import { fmtInr } from '@/lib/format';

interface Opp {
  id: string;
  cnmc: string;
  description: string;
  category: string;
  baseUom: string | null;
  orgs: number;
  codes: number;
  orgCodes: string[];
  spend: number;
  qty: number;
  minPrice: number | null;
  maxPrice: number | null;
  estSaving: number;
  priceSpread: number | null;
}

export default function OpportunitiesPage() {
  const [min, setMin] = useState<'2' | '3' | '4'>('3');
  const { data, isLoading } = useQuery({ queryKey: ['opps', min], queryFn: () => api<{ items: Opp[]; mappings: Mapping[]; assumption: string }>(`/api/opportunities?minOrgs=${min}`) });
  const byCanon = useMemo(() => {
    const m = new Map<string, Mapping[]>();
    for (const x of data?.mappings ?? []) m.set(x.canonicalId, [...(m.get(x.canonicalId) ?? []), x]);
    return m;
  }, [data]);
  const items = data?.items ?? [];
  const spend = items.reduce((s, o) => s + o.spend, 0);
  const saving = items.reduce((s, o) => s + o.estSaving, 0);

  const cols = useMemo<ColumnDef<Opp>[]>(
    () => [
      {
        accessorKey: 'cnmc',
        header: 'National code',
        cell: (c) => (
          <div className="max-w-[420px]">
            <Link onClick={(e) => e.stopPropagation()} href={`/canonical/${c.row.original.id}`} className="block truncate font-mono text-caption font-medium text-primary-800 hover:underline">
              {c.row.original.cnmc}
            </Link>
            <div className="truncate text-micro text-grey-500">{c.row.original.description}</div>
          </div>
        ),
      },
      { accessorKey: 'category', header: 'Cat.', size: 60, cell: (c) => <CategoryChip code={c.getValue<string>()} /> },
      {
        accessorKey: 'orgs',
        header: 'Buying CPSEs',
        size: 210,
        cell: (c) => (
          <span className="flex flex-wrap gap-0.5">
            {c.row.original.orgCodes.map((o) => (
              <OrgChip key={o} code={o} />
            ))}
          </span>
        ),
      },
      { accessorKey: 'codes', header: 'Legacy codes', size: 90, meta: { align: 'right' }, cell: (c) => <span className="tabular">{c.getValue<number>()}</span> },
      { accessorKey: 'qty', header: 'Annual qty', size: 90, meta: { align: 'right' }, cell: (c) => <span className="tabular">{Math.round(c.getValue<number>()).toLocaleString('en-IN')} <span className="text-micro text-grey-400">{c.row.original.baseUom}</span></span> },
      {
        accessorKey: 'priceSpread',
        header: 'Price spread',
        size: 110,
        meta: { align: 'right' },
        cell: (c) => {
          const v = c.getValue<number | null>();
          return v === null ? <span className="text-grey-400">—</span> : <span className={v > 0.2 ? 'tabular font-medium text-amber-800' : 'tabular'}>{(v * 100).toFixed(0)}%</span>;
        },
      },
      { accessorKey: 'spend', header: 'Combined spend*', size: 120, meta: { align: 'right' }, cell: (c) => <span className="tabular">{fmtInr(c.getValue<number>())}</span> },
      { accessorKey: 'estSaving', header: 'Est. saving*', size: 110, meta: { align: 'right' }, cell: (c) => <span className="tabular font-semibold text-high-700">{fmtInr(c.getValue<number>())}</span> },
    ],
    [],
  );

  return (
    <div>
      <PageHeader
        eyebrow="Harmonisation outcome"
        title="Procurement insight — demand aggregation"
        description="Once several CPSEs' legacy codes resolve to the same national code, their demand can be pooled into a rate contract or GeM category buy. Price spread shows the same item bought at different prices by different CPSEs."
        actions={<Segmented value={min} onChange={setMin} items={[{ value: '2', label: '2+ CPSEs' }, { value: '3', label: '3+ CPSEs' }, { value: '4', label: '4+ CPSEs' }]} />}
      />
      <div className="mb-3 flex items-start gap-2 rounded border border-grey-300 bg-white px-3 py-2 text-caption text-grey-700">
        <Info size={14} className="mt-0.5 shrink-0 text-teal-600" />
        <span>
          <b>Illustrative estimate.</b> {data?.assumption}
        </span>
      </div>
      <div className="mb-3 grid grid-cols-3 gap-3">
        <div className="panel px-4 py-3">
          <div className="eyebrow">Aggregation candidates</div>
          <div className="font-display text-display font-semibold"><CountUp value={items.length} /></div>
        </div>
        <div className="panel px-4 py-3">
          <div className="eyebrow">Combined annual spend*</div>
          <div className="font-display text-display font-semibold"><CountUp value={spend} format={(n) => fmtInr(n)} /></div>
        </div>
        <div className="panel px-4 py-3">
          <div className="eyebrow">Indicative saving*</div>
          <div className="font-display text-display font-semibold text-high-700"><CountUp value={saving} format={(n) => fmtInr(n)} /></div>
        </div>
      </div>
      <Panel title="National codes shared across CPSEs" subtitle="Expand a row to see each CPSE's legacy code and last purchase price">
        {isLoading ? <LoadingBar /> : <DataTable data={items} columns={cols} getRowId={(r) => r.id} initialSorting={[{ id: 'spend', desc: true }]} renderExpanded={(o) => <MappingRows rows={byCanon.get(o.id) ?? []} />} pageSize={25} />}
      </Panel>
    </div>
  );
}
