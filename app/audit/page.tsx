'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { AnimatePresence, motion } from 'framer-motion';
import { Link2, ShieldCheck, ShieldX } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { Suspense, useMemo, useState } from 'react';
import { DataTable } from '@/components/ui/data-table';
import { Button, LoadingBar, PageHeader, Panel } from '@/components/ui/primitives';
import { Badge } from '@/components/ui/status';
import { api } from '@/lib/client/api';
import type { AuditEvent } from '@/lib/client/types';
import { cx, fmtDateTime } from '@/lib/format';
import { fadeUp } from '@/lib/motion';

const ACTION_TONE = (a: string) =>
  a.includes('REJECT') || a.includes('REVERSED') || a.includes('RETIRED') || a.includes('WITHDRAWN') ? 'veto' : a.includes('APPROVED') || a.includes('CREATED') || a.includes('MAPPED') ? 'high' : a.includes('INFO') ? 'amber' : 'neutral';

function AuditInner() {
  const params = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const [action, setAction] = useState('');
  const { data, isLoading } = useQuery({
    queryKey: ['audit', action, q],
    queryFn: () => api<{ events: AuditEvent[]; actions: { action: string; n: number }[]; total: number }>(`/api/audit?limit=500${action ? `&action=${action}` : ''}${q ? `&q=${encodeURIComponent(q)}` : ''}`),
  });
  const verify = useMutation({ mutationFn: () => api<{ ok: boolean; checked: number; brokenAtSeq: number | null; headHash: string | null; message: string; ms: number }>('/api/audit/verify') });

  const cols = useMemo<ColumnDef<AuditEvent>[]>(
    () => [
      { accessorKey: 'seq', header: '#', size: 60, cell: (c) => <span className="tabular font-mono text-caption text-grey-500">{c.getValue<number>()}</span> },
      { accessorKey: 'occurredAt', header: 'Timestamp', size: 150, cell: (c) => <span className="whitespace-nowrap font-mono text-caption">{fmtDateTime(c.getValue<string>())}</span> },
      {
        accessorKey: 'actorName',
        header: 'Actor',
        size: 180,
        cell: (c) => (
          <span>
            <span className="text-dense text-grey-900">{c.row.original.actorName}</span> <span className="font-mono text-micro text-grey-500">{c.row.original.actorRole}</span>
          </span>
        ),
      },
      { accessorKey: 'action', header: 'Action', size: 230, cell: (c) => <Badge tone={ACTION_TONE(c.getValue<string>())} className="!normal-case font-mono !tracking-normal">{c.getValue<string>()}</Badge> },
      {
        accessorKey: 'entityType',
        header: 'Entity',
        cell: (c) => (
          <span className="block max-w-[340px] truncate whitespace-nowrap text-caption">
            <span className="text-grey-600">{c.row.original.entityType}</span> <span className="font-mono text-micro text-grey-400">{c.row.original.entityId.slice(0, 8)}</span>
            {typeof c.row.original.payload.cnmc === 'string' && <span className="ml-1.5 font-mono text-micro text-primary-800">{c.row.original.payload.cnmc as string}</span>}
            {typeof c.row.original.payload.legacyCode === 'string' && <span className="ml-1.5 font-mono text-micro text-grey-700">{c.row.original.payload.legacyCode as string}</span>}
          </span>
        ),
      },
      { accessorKey: 'reason', header: 'Reason', cell: (c) => <span className="line-clamp-1 max-w-[260px] text-caption text-grey-700" title={c.getValue<string>() ?? ''}>{c.getValue<string>() ?? ''}</span> },
      { accessorKey: 'hash', header: 'Hash', size: 100, cell: (c) => <span className="font-mono text-micro text-grey-400">{c.getValue<string>().slice(0, 10)}…</span> },
    ],
    [],
  );

  return (
    <div>
      <PageHeader
        eyebrow="Governance"
        title="Audit trail"
        description="Every state change — ingestion, matching runs, approvals, rejections, code generation, mapping reversals, dictionary and rule edits — is appended here. Each event's SHA-256 hash covers the previous event, and the database itself rejects UPDATE/DELETE on this table."
        actions={
          <Button variant="primary" icon={<Link2 size={14} />} onClick={() => verify.mutate()} disabled={verify.isPending}>
            {verify.isPending ? 'Verifying…' : 'Verify hash chain'}
          </Button>
        }
      />
      <AnimatePresence>
        {verify.data && (
          <motion.div {...fadeUp} className={cx('mb-3 flex items-center gap-3 rounded-md border px-4 py-2.5', verify.data.ok ? 'border-high-600/40 bg-high-50' : 'border-veto-600/40 bg-veto-50')}>
            {verify.data.ok ? <ShieldCheck size={20} className="text-high-600" /> : <ShieldX size={20} className="text-veto-600" />}
            <div className="text-dense">
              <div className={cx('font-semibold', verify.data.ok ? 'text-high-700' : 'text-veto-700')}>{verify.data.ok ? 'Chain intact' : 'Chain broken'} — {verify.data.message}</div>
              <div className="font-mono text-micro text-grey-600">
                head {verify.data.headHash} · recomputed in {verify.data.ms} ms
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <Panel
        title={`${data?.total ?? 0} immutable events`}
        actions={
          <>
            <input className="input h-7 w-64" placeholder="Search actor, entity, reason, payload…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search audit" />
            <select className="input h-7 w-72" value={action} onChange={(e) => setAction(e.target.value)} aria-label="Action filter">
              <option value="">All actions</option>
              {data?.actions
                .sort((a, b) => b.n - a.n)
                .map((a) => (
                  <option key={a.action} value={a.action}>
                    {a.action} ({a.n})
                  </option>
                ))}
            </select>
          </>
        }
      >
        {isLoading ? (
          <LoadingBar />
        ) : (
          <DataTable
            data={data?.events ?? []}
            columns={cols}
            getRowId={(r) => String(r.seq)}
            pageSize={50}
            maxHeight="calc(100vh - 300px)"
            renderExpanded={(e) => (
              <div className="grid grid-cols-[1fr_380px] gap-4">
                <pre className="scroll-thin max-h-64 overflow-auto rounded bg-white p-2 font-mono text-micro text-grey-800">{JSON.stringify(e.payload, null, 2)}</pre>
                <div className="space-y-1 text-caption">
                  <div className="eyebrow">Chain link</div>
                  <div>
                    <span className="text-grey-500">prev </span>
                    <span className="break-all font-mono text-micro">{e.prevHash}</span>
                  </div>
                  <div>
                    <span className="text-grey-500">hash </span>
                    <span className="break-all font-mono text-micro text-primary-800">{e.hash}</span>
                  </div>
                  <div className="text-micro text-grey-500">hash = SHA-256(prev ‖ canonical-JSON(event))</div>
                  {e.reason && <div className="pt-1 text-grey-800">“{e.reason}”</div>}
                </div>
              </div>
            )}
          />
        )}
      </Panel>
    </div>
  );
}

export default function AuditPage() {
  return (
    <Suspense fallback={<LoadingBar />}>
      <AuditInner />
    </Suspense>
  );
}
