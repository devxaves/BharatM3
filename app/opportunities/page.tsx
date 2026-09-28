'use client';

import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { ExternalLink, Eye, Info } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { MappingRows, type Mapping } from '@/components/mappings/mapping-rows';
import { CountUp } from '@/components/ui/count-up';
import { DataTable } from '@/components/ui/data-table';
import { Button, Dialog, DialogSection, LoadingBar, PageHeader, Panel, Segmented, Stat } from '@/components/ui/primitives';
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

function OpportunityDetailModal({
  opp,
  mappings,
  onClose,
}: {
  opp: Opp;
  mappings: Mapping[];
  onClose: () => void;
}) {
  return (
    <Dialog
      open
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <span>Demand Aggregation Opportunity</span>
        </div>
      }
      subtitle={<span className="font-mono font-bold text-primary-800">{opp.cnmc}</span>}
      width={820}
      footer={
        <div className="flex w-full items-center justify-between">
          <Link
            href={`/canonical/${opp.id}`}
            className="inline-flex items-center gap-1.5 text-caption font-medium text-teal-700 hover:underline"
          >
            Open canonical material record <ExternalLink size={13} />
          </Link>
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      }
    >
      <div className="space-y-4 text-dense">
        <div className="rounded-md border border-grey-200 bg-grey-50 p-3">
          <div className="eyebrow mb-1">Standardised Description</div>
          <div className="font-mono text-caption font-semibold text-grey-900">{opp.description}</div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 rounded-md border border-grey-200 bg-grey-25 p-3">
          <Stat label="Combined Spend" value={<span className="font-display font-bold text-primary-900">{fmtInr(opp.spend)}</span>} />
          <Stat label="Est. Annual Saving" value={<span className="font-display font-bold text-high-700">{fmtInr(opp.estSaving)}</span>} hint="~15% pooled volume" />
          <Stat label="Annual Quantity" value={<span className="font-mono text-caption">{Math.round(opp.qty).toLocaleString('en-IN')} {opp.baseUom}</span>} />
          <Stat
            label="Price Spread"
            value={opp.priceSpread !== null ? `${(opp.priceSpread * 100).toFixed(0)}%` : '—'}
            hint={opp.minPrice && opp.maxPrice ? `${fmtInr(opp.minPrice, { compact: false })} - ${fmtInr(opp.maxPrice, { compact: false })}` : undefined}
          />
        </div>

        <DialogSection title={`Contributing CPSE Catalogs (${mappings.length} legacy codes)`} subtitle="Individual enterprise purchase order history">
          <MappingRows rows={mappings} />
        </DialogSection>
      </div>
    </Dialog>
  );
}

export default function OpportunitiesPage() {
  const [min, setMin] = useState<'2' | '3' | '4'>('3');
  const [selectedOpp, setSelectedOpp] = useState<Opp | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['opps', min],
    queryFn: () => api<{ items: Opp[]; mappings: Mapping[]; assumption: string }>(`/api/opportunities?minOrgs=${min}`),
  });

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
          <div className="max-w-[380px]">
            <div className="block truncate font-mono text-caption font-bold text-primary-800" title={c.row.original.cnmc}>
              {c.row.original.cnmc}
            </div>
            <div className="truncate text-micro text-grey-500">{c.row.original.description}</div>
          </div>
        ),
      },
      { accessorKey: 'category', header: 'Cat.', size: 60, cell: (c) => <CategoryChip code={c.getValue<string>()} /> },
      {
        accessorKey: 'orgs',
        header: 'Buying CPSEs',
        size: 190,
        cell: (c) => (
          <span className="flex flex-wrap gap-0.5">
            {c.row.original.orgCodes.map((o) => (
              <OrgChip key={o} code={o} />
            ))}
          </span>
        ),
      },
      {
        accessorKey: 'codes',
        header: 'Codes',
        size: 80,
        meta: { align: 'right' },
        cell: (c) => <span className="tabular font-mono text-caption">{c.getValue<number>()}</span>,
      },
      {
        accessorKey: 'priceSpread',
        header: 'Spread',
        size: 90,
        meta: { align: 'right' },
        cell: (c) => {
          const v = c.getValue<number | null>();
          return v === null ? <span className="text-grey-400">—</span> : <span className={v > 0.2 ? 'tabular font-semibold text-amber-800' : 'tabular'}>{(v * 100).toFixed(0)}%</span>;
        },
      },
      {
        accessorKey: 'spend',
        header: 'Spend',
        size: 110,
        meta: { align: 'right' },
        cell: (c) => <span className="tabular font-medium">{fmtInr(c.getValue<number>())}</span>,
      },
      {
        accessorKey: 'estSaving',
        header: 'Est. saving',
        size: 110,
        meta: { align: 'right' },
        cell: (c) => <span className="tabular font-bold text-high-700">{fmtInr(c.getValue<number>())}</span>,
      },
      {
        id: 'action',
        header: '',
        size: 70,
        cell: (c) => (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setSelectedOpp(c.row.original);
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

  return (
    <div className="space-y-3">
      <PageHeader
        eyebrow="Procurement Insights"
        title="Demand aggregation"
        description="Pool multi-CPSE demand for shared material codes into rate contracts and centralized procurement."
        actions={
          <Segmented
            value={min}
            onChange={setMin}
            items={[
              { value: '2', label: '2+ CPSEs' },
              { value: '3', label: '3+ CPSEs' },
              { value: '4', label: '4+ CPSEs' },
            ]}
          />
        }
      />

      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
        <div className="panel border-l-4 border-l-primary-800 p-4 transition-all duration-200 hover:border-grey-300">
          <div className="text-micro font-semibold uppercase tracking-[0.08em] text-grey-500">Aggregation Candidates</div>
          <div className="mt-1 font-display text-kpi font-bold tracking-tight text-primary-950 tabular">
            <CountUp value={items.length} />
          </div>
          <div className="mt-1 text-caption font-medium text-grey-500">Shared across {min}+ CPSE enterprise catalogs</div>
        </div>
        <div className="panel border-l-4 border-l-teal-600 p-4 transition-all duration-200 hover:border-grey-300">
          <div className="text-micro font-semibold uppercase tracking-[0.08em] text-grey-500">Combined Annual Spend</div>
          <div className="mt-1 font-display text-kpi font-bold tracking-tight text-grey-900 tabular">
            <CountUp value={spend} format={(n) => fmtInr(n)} />
          </div>
          <div className="mt-1 text-caption font-medium text-grey-500">Aggregated purchasing volume</div>
        </div>
        <div className="panel border-l-4 border-l-high-600 p-4 transition-all duration-200 hover:border-grey-300">
          <div className="text-micro font-semibold uppercase tracking-[0.08em] text-grey-500">Estimated Annual Savings</div>
          <div className="mt-1 font-display text-kpi font-bold tracking-tight text-high-800 tabular">
            <CountUp value={saving} format={(n) => fmtInr(n)} />
          </div>
          <div className="mt-1 text-caption font-medium text-grey-500">~15% volume discount potential</div>
        </div>
      </div>

      <Panel
        title={`National codes shared across ${min}+ CPSEs (${items.length})`}
        subtitle="Click any item for price dispersion and contributing purchase orders"
      >
        {isLoading ? (
          <LoadingBar label="Computing procurement insights" />
        ) : (
          <DataTable
            data={items}
            columns={cols}
            getRowId={(r) => r.id}
            initialSorting={[{ id: 'spend', desc: true }]}
            onRowClick={(r) => setSelectedOpp(r)}
            pageSize={25}
          />
        )}
      </Panel>

      {/* Opportunity Detail Modal */}
      {selectedOpp && (
        <OpportunityDetailModal
          opp={selectedOpp}
          mappings={byCanon.get(selectedOpp.id) ?? []}
          onClose={() => setSelectedOpp(null)}
        />
      )}
    </div>
  );
}
