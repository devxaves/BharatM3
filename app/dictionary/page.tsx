'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { DataTable } from '@/components/ui/data-table';
import { Button, LoadingBar, PageHeader, Panel, Segmented } from '@/components/ui/primitives';
import { Badge } from '@/components/ui/status';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/client/api';
import { useSession } from '@/lib/client/session';
import { cx, fmtDate, humanize } from '@/lib/format';

interface Entry {
  id: string;
  term: string;
  expansion: string;
  kind: string;
  categoryCode: string | null;
  version: number;
  active: boolean;
  updatedAt: string;
  updatedByName: string | null;
}
interface Uom {
  code: string;
  name: string;
  dimension: string;
  baseCode: string;
  factorToBase: number;
  isoCode: string;
  aliases: string[];
}

export default function DictionaryPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const { can } = useSession();
  const { data, isLoading } = useQuery({ queryKey: ['dictionary'], queryFn: () => api<{ entries: Entry[] }>('/api/dictionary') });
  const cfg = useQuery({ queryKey: ['config'], queryFn: () => api<{ uoms: Uom[]; classes: { id: string; categoryCode: string; subtype: string | null; unspscCode: string; unspscTitle: string }[] }>('/api/config') });
  const [q, setQ] = useState('');
  const [show, setShow] = useState<'active' | 'all'>('active');
  const [form, setForm] = useState({ term: '', expansion: '', kind: 'ABBREVIATION', categoryCode: '' });

  const add = useMutation({
    mutationFn: () => api('/api/dictionary', { method: 'POST', json: { ...form, categoryCode: form.categoryCode || null } }),
    onSuccess: () => {
      toast({ kind: 'success', title: 'Dictionary updated', body: 'New versions apply to the next normalization run.' });
      setForm({ term: '', expansion: '', kind: 'ABBREVIATION', categoryCode: '' });
      qc.invalidateQueries({ queryKey: ['dictionary'] });
    },
    onError: (e: Error) => toast({ kind: 'error', title: 'Not added', body: e.message }),
  });
  const toggle = useMutation({
    mutationFn: (e: Entry) => api(`/api/dictionary/${e.id}`, { method: 'PATCH', json: { active: !e.active } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dictionary'] }),
  });

  const rows = useMemo(() => (data?.entries ?? []).filter((e) => show === 'all' || e.active), [data, show]);
  const editable = can('dictionary:write');
  const cols = useMemo<ColumnDef<Entry>[]>(
    () => [
      { accessorKey: 'term', header: 'Term', size: 130, cell: (c) => <span className="font-mono font-semibold text-grey-900">{c.getValue<string>()}</span> },
      { accessorKey: 'expansion', header: 'Expands to', cell: (c) => <span className="font-mono text-caption text-primary-800">{c.getValue<string>()}</span> },
      { accessorKey: 'kind', header: 'Kind', size: 120, cell: (c) => <Badge tone={c.getValue<string>() === 'SYNONYM' ? 'ai' : 'neutral'}>{c.getValue<string>()}</Badge> },
      { accessorKey: 'categoryCode', header: 'Scope', size: 110, cell: (c) => <span className="text-caption text-grey-600">{c.getValue<string>() ? humanize(c.getValue<string>()) : 'All categories'}</span> },
      { accessorKey: 'version', header: 'Ver.', size: 50, meta: { align: 'right' }, cell: (c) => <span className="tabular font-mono text-caption">v{c.getValue<number>()}</span> },
      { accessorKey: 'updatedAt', header: 'Updated', size: 110, cell: (c) => <span className="whitespace-nowrap text-caption text-grey-500" title={c.row.original.updatedByName ?? 'seed'}>{fmtDate(c.getValue<string>())}</span> },
      {
        id: 'active',
        header: 'Status',
        size: 100,
        cell: (c) => (
          <span className="flex items-center gap-2">
            {c.row.original.active ? <Badge tone="high">Active</Badge> : <Badge>Inactive</Badge>}
            {editable && (
              <button onClick={() => toggle.mutate(c.row.original)} className="text-micro text-grey-500 hover:text-grey-900 hover:underline">
                {c.row.original.active ? 'Deactivate' : 'Activate'}
              </button>
            )}
          </span>
        ),
      },
    ],
    [editable, toggle],
  );

  return (
    <div>
      <PageHeader
        eyebrow="Governance"
        title="Abbreviation dictionary & unit master"
        description="The normalization layer is only as good as its vocabulary. Terms are versioned — revising a term supersedes the old version rather than overwriting it — and category scope resolves ambiguous abbreviations (HD = HEAD only for pumps)."
      />
      <div className="grid grid-cols-12 gap-3">
        <Panel
          className="col-span-7 min-w-0"
          title={`${rows.length} dictionary terms`}
          actions={
            <>
              <input className="input h-7 w-56" placeholder="Filter terms…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filter dictionary" />
              <Segmented value={show} onChange={setShow} items={[{ value: 'active', label: 'Active' }, { value: 'all', label: 'All versions' }]} />
            </>
          }
        >
          {editable && (
            <div className="flex items-end gap-2 border-b border-grey-200 bg-grey-25 px-3 py-2">
              <div className="w-32">
                <label className="field-label">Term</label>
                <input className="input font-mono uppercase" value={form.term} onChange={(e) => setForm({ ...form, term: e.target.value })} placeholder="e.g. BRNZ" />
              </div>
              <div className="flex-1">
                <label className="field-label">Expansion</label>
                <input className="input font-mono uppercase" value={form.expansion} onChange={(e) => setForm({ ...form, expansion: e.target.value })} placeholder="e.g. BRONZE" />
              </div>
              <div className="w-36">
                <label className="field-label">Kind</label>
                <select className="input" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
                  <option value="ABBREVIATION">Abbreviation</option>
                  <option value="SYNONYM">Synonym</option>
                </select>
              </div>
              <div className="w-36">
                <label className="field-label">Scope</label>
                <select className="input" value={form.categoryCode} onChange={(e) => setForm({ ...form, categoryCode: e.target.value })}>
                  <option value="">All categories</option>
                  {['BEARING', 'VALVE', 'CABLE', 'FASTENER', 'PUMP'].map((c) => (
                    <option key={c} value={c}>{humanize(c)}</option>
                  ))}
                </select>
              </div>
              <Button variant="primary" icon={<Plus size={13} />} disabled={!form.term || !form.expansion || add.isPending} onClick={() => add.mutate()}>
                Add
              </Button>
            </div>
          )}
          {isLoading ? <LoadingBar /> : <DataTable data={rows} columns={cols} globalFilter={q} getRowId={(r) => r.id} pageSize={40} maxHeight="calc(100vh - 340px)" rowClassName={(r) => cx(!r.active && 'opacity-50')} />}
        </Panel>
        <div className="col-span-5 min-w-0 space-y-3">
          <Panel title="Unit of measure master" subtitle="Aliases found in CPSE extracts → canonical unit, with conversion to the base unit">
            <table className="dt">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Dimension</th>
                  <th className="text-right">→ base</th>
                  <th>ISO</th>
                </tr>
              </thead>
              <tbody>
                {cfg.data?.uoms.map((u) => (
                  <tr key={u.code} title={`Aliases: ${u.aliases.join(', ')}`}>
                    <td>
                      <div className="font-mono font-semibold">{u.code}</div>
                      <div className="max-w-[170px] truncate font-mono text-micro text-grey-500">{u.aliases.join(' · ')}</div>
                    </td>
                    <td className="text-caption">{humanize(u.dimension)}</td>
                    <td className="tabular text-right font-mono text-caption">
                      ×{u.factorToBase} {u.baseCode}
                    </td>
                    <td className="font-mono text-caption text-grey-600">{u.isoCode}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="border-t border-grey-200 px-3 py-2 text-caption text-grey-600">
              <b>MT</b> is resolved by context: metric tonne by default, metre for cables — and flagged <span className="font-mono text-micro">UOM_AMBIGUOUS_MT</span> for review.
            </div>
          </Panel>
          <Panel title="Classification master (UNSPSC, illustrative subset)">
            <table className="dt">
              <tbody>
                {cfg.data?.classes.map((c) => (
                  <tr key={c.id}>
                    <td className="text-caption">
                      {humanize(c.categoryCode)}
                      {c.subtype && <span className="text-grey-500"> · {humanize(c.subtype)}</span>}
                    </td>
                    <td className="font-mono text-caption">{c.unspscCode}</td>
                    <td className="text-caption text-grey-600">{c.unspscTitle}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        </div>
      </div>
    </div>
  );
}
