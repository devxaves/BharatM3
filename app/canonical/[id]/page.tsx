'use client';

import { useQuery } from '@tanstack/react-query';
import { Copy, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { MappingRows, type Mapping } from '@/components/mappings/mapping-rows';
import { Button, Empty, LoadingBar, PageHeader, Panel, Segmented, Stat } from '@/components/ui/primitives';
import { CategoryChip, OrgChip, StatusBadge } from '@/components/ui/status';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/client/api';
import type { AuditEvent } from '@/lib/client/types';
import { fmtDateTime, fmtInr, humanize } from '@/lib/format';
import type { AttributeMap } from '@/lib/matching/types';

interface Canonical {
  id: string;
  cnmc: string;
  shortCode: string;
  canonicalDescription: string;
  categoryCode: string;
  subtype: string | null;
  unspscCode: string | null;
  attributes: AttributeMap;
  baseUom: string | null;
  status: string;
  version: number;
  estAnnualValueInr: number | null;
  createdAt: string;
  updatedAt: string;
  createdByName: string | null;
  mappings: Mapping[];
  history: AuditEvent[];
  sapPreview: { idoc: unknown; odata: unknown };
}

export default function CanonicalPage({ params }: { params: { id: string } }) {
  const { data, isLoading, error } = useQuery({ queryKey: ['canonical', params.id], queryFn: () => api<Canonical>(`/api/canonical/${params.id}`) });
  const [fmt, setFmt] = useState<'idoc' | 'odata'>('idoc');
  const toast = useToast();
  if (isLoading) return <LoadingBar />;
  if (error || !data) return <Empty title="Canonical material not found">{(error as Error)?.message}</Empty>;
  const active = data.mappings.filter((m) => m.status === 'ACTIVE');
  const orgs = [...new Set(active.map((m) => m.org))];
  const payload = JSON.stringify(fmt === 'idoc' ? data.sapPreview.idoc : data.sapPreview.odata, null, 2);
  const prices = active.map((m) => m.price).filter((p): p is number => !!p);

  return (
    <div>
      <PageHeader
        eyebrow={`Common National Material Code · ${humanize(data.categoryCode)}`}
        title={data.canonicalDescription}
        description={
          <span className="font-mono text-dense font-semibold text-primary-800">{data.cnmc}</span>
        }
        actions={
          <>
            <StatusBadge status={data.status} />
            <a href={`/api/v1/materials/${encodeURIComponent(data.cnmc)}`} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded border border-grey-300 bg-white px-3 text-dense text-grey-800 hover:bg-grey-50">
              API <ExternalLink size={13} />
            </a>
          </>
        }
      />
      <div className="grid grid-cols-12 gap-3">
        <div className="col-span-7 space-y-3">
          <Panel title="Identity">
            <div className="grid grid-cols-4 gap-4 px-4 py-3">
              <Stat label="ERP short code (MATNR)" value={<span className="font-mono text-dense">{data.shortCode}</span>} hint="≤ 18 chars, SAP ECC safe" />
              <Stat label="Immutable UUID" value={<span className="break-all font-mono text-micro">{data.id}</span>} />
              <Stat label="UNSPSC" value={<span className="font-mono text-dense">{data.unspscCode}</span>} hint={data.subtype ? humanize(data.subtype) : undefined} />
              <Stat label="Base UOM · version" value={<span className="font-mono text-dense">{data.baseUom ?? '—'} · v{data.version}</span>} hint={`created ${fmtDateTime(data.createdAt)} by ${data.createdByName ?? '—'}`} />
            </div>
          </Panel>
          <Panel title={`Legacy codes mapped · ${active.length} codes across ${orgs.length} CPSEs`}>
            <div className="scroll-thin overflow-x-auto px-4 py-2">
              <MappingRows rows={data.mappings} />
            </div>
            {prices.length > 1 && (
              <div className="border-t border-grey-200 px-4 py-2 text-caption text-grey-600">
                Price dispersion across CPSEs: {fmtInr(Math.min(...prices), { compact: false })} – {fmtInr(Math.max(...prices), { compact: false })} (
                {(((Math.max(...prices) - Math.min(...prices)) / Math.min(...prices)) * 100).toFixed(0)}% spread) · combined annual spend {fmtInr(data.estAnnualValueInr)} <span className="text-grey-400">(illustrative, synthetic PO data)</span>
              </div>
            )}
          </Panel>
          <Panel title="Change history (hash-chained)">
            <ol className="divide-y divide-grey-100">
              {data.history.map((h) => (
                <li key={h.seq} className="grid grid-cols-[150px_1fr_auto] gap-3 px-4 py-1.5 text-caption">
                  <span className="font-mono text-grey-500">{fmtDateTime(h.occurredAt)}</span>
                  <span>
                    <b className="font-medium text-grey-900">{h.action.replace(/_/g, ' ').toLowerCase()}</b> <span className="text-grey-600">by {h.actorName}</span>
                    {typeof h.payload.legacyCode === 'string' && <span className="ml-1 font-mono text-grey-700">{h.payload.legacyCode}</span>}
                  </span>
                  <Link href={`/audit?q=${h.entityId}`} className="font-mono text-micro text-grey-400 hover:text-teal-700">
                    #{h.seq} {h.hash.slice(0, 8)}
                  </Link>
                </li>
              ))}
            </ol>
          </Panel>
        </div>
        <div className="col-span-5 space-y-3">
          <Panel title="Standardised attributes">
            <table className="dt">
              <tbody>
                {Object.entries(data.attributes).map(([k, a]) => (
                  <tr key={k}>
                    <td className="text-grey-600">{humanize(k)}</td>
                    <td className="font-mono text-caption text-grey-900">{String(a.value).replace(/_/g, ' ')}</td>
                    <td className="text-right text-micro text-grey-400">{(a.confidence * 100).toFixed(0)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex flex-wrap items-center gap-1.5 border-t border-grey-200 px-3 py-2">
              <CategoryChip code={data.categoryCode} long />
              {orgs.map((o) => (
                <OrgChip key={o} code={o} />
              ))}
            </div>
          </Panel>
          <Panel
            title="SAP payload preview"
            actions={
              <>
                <Segmented value={fmt} onChange={setFmt} items={[{ value: 'idoc', label: 'IDoc MATMAS05' }, { value: 'odata', label: 'S/4 OData' }]} />
                <Button size="sm" variant="ghost" icon={<Copy size={12} />} onClick={() => navigator.clipboard.writeText(payload).then(() => toast({ kind: 'info', title: 'Payload copied' }))}>
                  Copy
                </Button>
              </>
            }
          >
            <pre className="scroll-thin max-h-[440px] overflow-auto bg-grey-900 px-3 py-2.5 font-mono text-micro leading-[1.55] text-grey-100">{payload}</pre>
          </Panel>
        </div>
      </div>
    </div>
  );
}
