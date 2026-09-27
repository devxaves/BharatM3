'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { AnimatePresence, motion } from 'framer-motion';
import { Eye, Link2, ShieldCheck, ShieldX } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { Suspense, useMemo, useState } from 'react';
import { DataTable } from '@/components/ui/data-table';
import { Button, Dialog, DialogSection, LoadingBar, PageHeader, Panel } from '@/components/ui/primitives';
import { Badge } from '@/components/ui/status';
import { api } from '@/lib/client/api';
import type { AuditEvent } from '@/lib/client/types';
import { cx, fmtDateTime } from '@/lib/format';
import { fadeUp } from '@/lib/motion';

const ACTION_TONE = (a: string) =>
  a.includes('REJECT') || a.includes('REVERSED') || a.includes('RETIRED') || a.includes('WITHDRAWN')
    ? 'veto'
    : a.includes('APPROVED') || a.includes('CREATED') || a.includes('MAPPED')
      ? 'high'
      : a.includes('INFO')
        ? 'amber'
        : 'neutral';

function AuditInner() {
  const params = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const [action, setAction] = useState('');
  const [selectedEvent, setSelectedEvent] = useState<AuditEvent | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['audit', action, q],
    queryFn: () =>
      api<{ events: AuditEvent[]; actions: { action: string; n: number }[]; total: number }>(
        `/api/audit?limit=500${action ? `&action=${action}` : ''}${q ? `&q=${encodeURIComponent(q)}` : ''}`,
      ),
  });

  const verify = useMutation({
    mutationFn: () =>
      api<{
        ok: boolean;
        checked: number;
        brokenAtSeq: number | null;
        headHash: string | null;
        message: string;
        ms: number;
      }>('/api/audit/verify'),
  });

  const cols = useMemo<ColumnDef<AuditEvent>[]>(
    () => [
      {
        accessorKey: 'seq',
        header: '#',
        size: 60,
        cell: (c) => <span className="tabular font-mono text-caption text-grey-500">{c.getValue<number>()}</span>,
      },
      {
        accessorKey: 'occurredAt',
        header: 'Timestamp',
        size: 150,
        cell: (c) => <span className="whitespace-nowrap font-mono text-caption text-grey-800">{fmtDateTime(c.getValue<string>())}</span>,
      },
      {
        accessorKey: 'actorName',
        header: 'Actor',
        size: 180,
        cell: (c) => (
          <span>
            <span className="text-dense font-medium text-grey-900">{c.row.original.actorName}</span>{' '}
            <span className="font-mono text-micro text-grey-500">{c.row.original.actorRole}</span>
          </span>
        ),
      },
      {
        accessorKey: 'action',
        header: 'Action',
        size: 220,
        cell: (c) => (
          <Badge tone={ACTION_TONE(c.getValue<string>())} className="!normal-case font-mono !tracking-normal">
            {c.getValue<string>()}
          </Badge>
        ),
      },
      {
        accessorKey: 'entityType',
        header: 'Entity',
        cell: (c) => (
          <span className="block max-w-[320px] truncate whitespace-nowrap text-caption">
            <span className="text-grey-600 font-medium">{c.row.original.entityType}</span>{' '}
            {typeof c.row.original.payload.cnmc === 'string' && (
              <span className="ml-1.5 font-mono text-caption font-semibold text-primary-800">
                {c.row.original.payload.cnmc as string}
              </span>
            )}
            {typeof c.row.original.payload.legacyCode === 'string' && (
              <span className="ml-1.5 font-mono text-micro text-grey-700">
                {c.row.original.payload.legacyCode as string}
              </span>
            )}
          </span>
        ),
      },
      {
        id: 'inspect',
        header: '',
        size: 80,
        cell: (c) => (
          <button
            type="button"
            onClick={() => setSelectedEvent(c.row.original)}
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
        eyebrow="Immutable Audit"
        title="Audit trail"
        description="SHA-256 forward hash-chained audit log of all catalog state changes and decisions."
        actions={
          <Button
            variant="primary"
            icon={<Link2 size={14} />}
            onClick={() => verify.mutate()}
            disabled={verify.isPending}
          >
            {verify.isPending ? 'Verifying…' : 'Verify hash chain'}
          </Button>
        }
      />

      <AnimatePresence>
        {verify.data && (
          <motion.div
            {...fadeUp}
            className={cx(
              'mb-3 flex items-center gap-3 rounded-md border px-4 py-2.5',
              verify.data.ok ? 'border-high-600/40 bg-high-50' : 'border-veto-600/40 bg-veto-50',
            )}
          >
            {verify.data.ok ? <ShieldCheck size={20} className="text-high-600" /> : <ShieldX size={20} className="text-veto-600" />}
            <div className="text-dense">
              <div className={cx('font-semibold', verify.data.ok ? 'text-high-700' : 'text-veto-700')}>
                {verify.data.ok ? 'Cryptographic Chain Intact' : 'Chain Broken'} — {verify.data.message}
              </div>
              <div className="font-mono text-micro text-grey-600">
                head {verify.data.headHash} · {verify.data.checked} events verified in {verify.data.ms} ms
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <Panel
        title={`${data?.total ?? 0} immutable events`}
        actions={
          <div className="flex items-center gap-2">
            <input
              className="input h-7 w-64"
              placeholder="Search actor, entity, reason, payload…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="Search audit"
            />
            <select
              className="input h-7 w-60"
              value={action}
              onChange={(e) => setAction(e.target.value)}
              aria-label="Action filter"
            >
              <option value="">All actions</option>
              {data?.actions
                .sort((a, b) => b.n - a.n)
                .map((a) => (
                  <option key={a.action} value={a.action}>
                    {a.action} ({a.n})
                  </option>
                ))}
            </select>
          </div>
        }
      >
        {isLoading ? (
          <LoadingBar label="Loading audit trail" />
        ) : (
          <DataTable
            data={data?.events ?? []}
            columns={cols}
            getRowId={(r) => String(r.seq)}
            pageSize={40}
            maxHeight="calc(100vh - 280px)"
            onRowClick={(r) => setSelectedEvent(r)}
          />
        )}
      </Panel>

      {/* Detail Dialog for Audit Event */}
      {selectedEvent && (
        <Dialog
          open={!!selectedEvent}
          onClose={() => setSelectedEvent(null)}
          title={
            <div className="flex items-center gap-2">
              <span>Audit Event #{selectedEvent.seq}</span>
              <Badge tone={ACTION_TONE(selectedEvent.action)} className="font-mono text-micro">
                {selectedEvent.action}
              </Badge>
            </div>
          }
          subtitle={`Recorded at ${fmtDateTime(selectedEvent.occurredAt)} by ${selectedEvent.actorName} (${selectedEvent.actorRole})`}
          width={680}
        >
          <div className="space-y-3.5 text-dense">
            {selectedEvent.reason && (
              <div className="rounded border border-grey-200 bg-grey-50 p-3">
                <div className="eyebrow mb-1">Actor Reason / Statement</div>
                <p className="text-grey-900 font-medium italic">“{selectedEvent.reason}”</p>
              </div>
            )}

            <DialogSection title="Event Payload">
              <pre className="scroll-thin max-h-56 overflow-auto rounded bg-grey-900 p-3 font-mono text-micro text-grey-100 leading-relaxed">
                {JSON.stringify(selectedEvent.payload, null, 2)}
              </pre>
            </DialogSection>

            <DialogSection title="Cryptographic Hash Chain Link">
              <div className="space-y-1.5 font-mono text-caption">
                <div className="flex flex-col sm:flex-row sm:items-center gap-1">
                  <span className="w-20 shrink-0 text-grey-500 font-sans">Previous Hash:</span>
                  <span className="break-all text-micro text-grey-700">{selectedEvent.prevHash}</span>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center gap-1">
                  <span className="w-20 shrink-0 text-grey-500 font-sans">Event Hash:</span>
                  <span className="break-all text-micro font-bold text-primary-800">{selectedEvent.hash}</span>
                </div>
                <div className="text-micro font-sans text-grey-500 pt-1 border-t border-grey-200">
                  Verification formula: <code>SHA-256(prev_hash ‖ canonical_json(event))</code>
                </div>
              </div>
            </DialogSection>
          </div>
        </Dialog>
      )}
    </div>
  );
}

export default function AuditPage() {
  return (
    <Suspense fallback={<LoadingBar label="Loading audit trail…" />}>
      <AuditInner />
    </Suspense>
  );
}
