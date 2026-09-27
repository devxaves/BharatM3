'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Eye, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { DataTable } from '@/components/ui/data-table';
import { Button, Dialog, DialogSection, LoadingBar, PageHeader, Panel, Segmented, Stat } from '@/components/ui/primitives';
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
  const { data, isLoading } = useQuery({
    queryKey: ['dictionary'],
    queryFn: () => api<{ entries: Entry[] }>('/api/dictionary'),
  });

  const cfg = useQuery({
    queryKey: ['config'],
    queryFn: () =>
      api<{
        uoms: Uom[];
        classes: { id: string; categoryCode: string; subtype: string | null; unspscCode: string; unspscTitle: string }[];
      }>('/api/config'),
  });

  const [q, setQ] = useState('');
  const [show, setShow] = useState<'active' | 'all'>('active');
  const [addOpen, setAddOpen] = useState(false);
  const [selectedTerm, setSelectedTerm] = useState<Entry | null>(null);
  const [selectedUom, setSelectedUom] = useState<Uom | null>(null);

  const [form, setForm] = useState({
    term: '',
    expansion: '',
    kind: 'ABBREVIATION',
    categoryCode: '',
  });

  const add = useMutation({
    mutationFn: () =>
      api('/api/dictionary', {
        method: 'POST',
        json: { ...form, categoryCode: form.categoryCode || null },
      }),
    onSuccess: () => {
      toast({
        kind: 'success',
        title: 'Dictionary updated',
        body: 'New vocabulary version applies to the next normalization run.',
      });
      setForm({ term: '', expansion: '', kind: 'ABBREVIATION', categoryCode: '' });
      setAddOpen(false);
      qc.invalidateQueries({ queryKey: ['dictionary'] });
    },
    onError: (e: Error) => toast({ kind: 'error', title: 'Not added', body: e.message }),
  });

  const toggle = useMutation({
    mutationFn: (e: Entry) => api(`/api/dictionary/${e.id}`, { method: 'PATCH', json: { active: !e.active } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dictionary'] });
      setSelectedTerm(null);
    },
  });

  const rows = useMemo(() => (data?.entries ?? []).filter((e) => show === 'all' || e.active), [data, show]);
  const editable = can('dictionary:write');

  const cols = useMemo<ColumnDef<Entry>[]>(
    () => [
      {
        accessorKey: 'term',
        header: 'Term',
        size: 130,
        cell: (c) => <span className="font-mono font-bold text-grey-900">{c.getValue<string>()}</span>,
      },
      {
        accessorKey: 'expansion',
        header: 'Expands to',
        cell: (c) => <span className="font-mono text-caption text-primary-800 font-semibold">{c.getValue<string>()}</span>,
      },
      {
        accessorKey: 'kind',
        header: 'Kind',
        size: 120,
        cell: (c) => <Badge tone={c.getValue<string>() === 'SYNONYM' ? 'ai' : 'neutral'}>{c.getValue<string>()}</Badge>,
      },
      {
        accessorKey: 'categoryCode',
        header: 'Scope',
        size: 110,
        cell: (c) => <span className="text-caption text-grey-600">{c.getValue<string>() ? humanize(c.getValue<string>()) : 'All categories'}</span>,
      },
      {
        accessorKey: 'version',
        header: 'Ver.',
        size: 60,
        meta: { align: 'right' },
        cell: (c) => <span className="tabular font-mono text-caption">v{c.getValue<number>()}</span>,
      },
      {
        id: 'status',
        header: 'Status',
        size: 90,
        cell: (c) => (c.row.original.active ? <Badge tone="high">Active</Badge> : <Badge>Inactive</Badge>),
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
              setSelectedTerm(c.row.original);
            }}
            className="inline-flex items-center gap-1 text-caption text-teal-700 hover:underline"
          >
            <Eye size={12} /> View
          </button>
        ),
      },
    ],
    [],
  );

  return (
    <div className="space-y-3">
      <PageHeader
        eyebrow="Vocabulary & Standards"
        title="Abbreviation dictionary & units"
        description="Domain shorthand expansions and unit of measure conversion tables."
        actions={
          editable && (
            <Button variant="primary" icon={<Plus size={13} />} onClick={() => setAddOpen(true)}>
              Add term
            </Button>
          )
        }
      />

      <div className="grid grid-cols-12 gap-3">
        <Panel
          className="col-span-12 lg:col-span-7 min-w-0"
          title={`${rows.length} dictionary terms`}
          actions={
            <div className="flex items-center gap-2">
              <input
                className="input h-7 w-48"
                placeholder="Filter terms…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                aria-label="Filter dictionary"
              />
              <Segmented value={show} onChange={setShow} items={[{ value: 'active', label: 'Active' }, { value: 'all', label: 'All' }]} />
            </div>
          }
        >
          {isLoading ? (
            <LoadingBar label="Loading dictionary" />
          ) : (
            <DataTable
              data={rows}
              columns={cols}
              globalFilter={q}
              getRowId={(r) => r.id}
              pageSize={30}
              onRowClick={(r) => setSelectedTerm(r)}
              maxHeight="calc(100vh - 290px)"
              rowClassName={(r) => cx(!r.active && 'opacity-60')}
            />
          )}
        </Panel>

        <div className="col-span-12 lg:col-span-5 min-w-0 space-y-3">
          <Panel
            title="Unit of measure master"
            subtitle="Click any unit for aliases and dimension conversion"
          >
            <table className="dt">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Dimension</th>
                  <th className="text-right">→ Base</th>
                  <th>ISO</th>
                </tr>
              </thead>
              <tbody>
                {cfg.data?.uoms.map((u) => (
                  <tr
                    key={u.code}
                    onClick={() => setSelectedUom(u)}
                    className="cursor-pointer transition-colors hover:bg-grey-50"
                    title="Click for UOM detail"
                  >
                    <td>
                      <div className="font-mono font-bold text-primary-900">{u.code}</div>
                      <div className="max-w-[150px] truncate font-mono text-micro text-grey-500">{u.aliases.join(' · ')}</div>
                    </td>
                    <td className="text-caption text-grey-700">{humanize(u.dimension)}</td>
                    <td className="tabular text-right font-mono text-caption">
                      ×{u.factorToBase} {u.baseCode}
                    </td>
                    <td className="font-mono text-caption text-grey-600">{u.isoCode}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>

          <Panel title="Classification master (UNSPSC preview)">
            <table className="dt">
              <tbody>
                {cfg.data?.classes.slice(0, 6).map((c) => (
                  <tr key={c.id}>
                    <td className="text-caption font-medium text-grey-800">
                      {humanize(c.categoryCode)}
                      {c.subtype && <span className="text-grey-500 font-normal"> · {humanize(c.subtype)}</span>}
                    </td>
                    <td className="font-mono text-caption text-primary-800 font-semibold">{c.unspscCode}</td>
                    <td className="text-caption text-grey-600 truncate max-w-[160px]">{c.unspscTitle}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        </div>
      </div>

      {/* Add Term Dialog */}
      <Dialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add dictionary term"
        subtitle="Expands raw ERP shorthand into canonical text"
        width={560}
        footer={
          <>
            <Button variant="ghost" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={!form.term.trim() || !form.expansion.trim() || add.isPending}
              onClick={() => add.mutate()}
            >
              Add term
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="field-label">Abbreviation / Term (raw ERP shorthand)</label>
            <input
              className="input font-mono uppercase"
              value={form.term}
              onChange={(e) => setForm({ ...form, term: e.target.value })}
              placeholder="e.g. BRNZ"
              autoFocus
            />
          </div>
          <div>
            <label className="field-label">Canonical Expansion</label>
            <input
              className="input font-mono uppercase"
              value={form.expansion}
              onChange={(e) => setForm({ ...form, expansion: e.target.value })}
              placeholder="e.g. BRONZE"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label">Kind</label>
              <select className="input" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
                <option value="ABBREVIATION">Abbreviation</option>
                <option value="SYNONYM">Synonym</option>
              </select>
            </div>
            <div>
              <label className="field-label">Category Scope</label>
              <select className="input" value={form.categoryCode} onChange={(e) => setForm({ ...form, categoryCode: e.target.value })}>
                <option value="">All categories</option>
                {['BEARING', 'VALVE', 'CABLE', 'FASTENER', 'PUMP'].map((c) => (
                  <option key={c} value={c}>{humanize(c)}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </Dialog>

      {/* Term Detail Dialog */}
      {selectedTerm && (
        <Dialog
          open={!!selectedTerm}
          onClose={() => setSelectedTerm(null)}
          title={`Dictionary Term: ${selectedTerm.term}`}
          subtitle={`Version ${selectedTerm.version} · Updated ${fmtDate(selectedTerm.updatedAt)} by ${selectedTerm.updatedByName ?? 'system'}`}
          width={540}
          footer={
            <div className="flex w-full items-center justify-between">
              {editable && (
                <Button
                  variant={selectedTerm.active ? 'danger' : 'approve'}
                  size="sm"
                  onClick={() => toggle.mutate(selectedTerm)}
                >
                  {selectedTerm.active ? 'Deactivate term' : 'Activate term'}
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => setSelectedTerm(null)}>
                Close
              </Button>
            </div>
          }
        >
          <div className="space-y-3 text-dense">
            <div className="rounded border border-grey-200 bg-grey-50 p-3">
              <div className="eyebrow mb-0.5">Expands To</div>
              <div className="font-mono text-lead font-bold text-primary-900">{selectedTerm.expansion}</div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded border border-grey-200 bg-white p-3">
                <div className="eyebrow">Kind</div>
                <div className="mt-1 font-semibold">{selectedTerm.kind}</div>
              </div>
              <div className="rounded border border-grey-200 bg-white p-3">
                <div className="eyebrow">Category Scope</div>
                <div className="mt-1 font-semibold">{selectedTerm.categoryCode ? humanize(selectedTerm.categoryCode) : 'All categories'}</div>
              </div>
            </div>
          </div>
        </Dialog>
      )}

      {/* UOM Detail Dialog */}
      {selectedUom && (
        <Dialog
          open={!!selectedUom}
          onClose={() => setSelectedUom(null)}
          title={`Unit: ${selectedUom.code} (${selectedUom.name})`}
          subtitle={`Dimension: ${humanize(selectedUom.dimension)} · ISO standard: ${selectedUom.isoCode}`}
          width={520}
        >
          <div className="space-y-3 text-dense">
            <DialogSection title="Conversion Formula">
              <div className="font-mono text-caption">
                1 {selectedUom.code} = <b>{selectedUom.factorToBase} {selectedUom.baseCode}</b>
              </div>
            </DialogSection>
            <DialogSection title="Recognized Shorthand & Aliases">
              <div className="flex flex-wrap gap-1.5">
                {selectedUom.aliases.map((a) => (
                  <span key={a} className="rounded border border-grey-200 bg-white px-2 py-0.5 font-mono text-caption">
                    {a}
                  </span>
                ))}
              </div>
            </DialogSection>
          </div>
        </Dialog>
      )}
    </div>
  );
}
