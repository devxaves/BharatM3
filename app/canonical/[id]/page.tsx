'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Check, Copy, ExternalLink } from 'lucide-react';
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
  const [copied, setCopied] = useState(false);
  const toast = useToast();

  if (isLoading) return <LoadingBar label="Loading canonical material record…" />;
  if (error || !data) return <Empty title="Canonical material not found">{(error as Error)?.message}</Empty>;

  const active = data.mappings.filter((m) => m.status === 'ACTIVE');
  const orgs = [...new Set(active.map((m) => m.org))];
  const payload = JSON.stringify(fmt === 'idoc' ? data.sapPreview.idoc : data.sapPreview.odata, null, 2);
  const prices = active.map((m) => m.price).filter((p): p is number => !!p);

  const handleCopy = () => {
    navigator.clipboard.writeText(payload);
    setCopied(true);
    toast({ kind: 'info', title: 'Payload copied to clipboard' });
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Link
          href="/mappings"
          className="inline-flex items-center gap-1 text-caption text-grey-600 hover:text-grey-900 font-medium transition-colors"
        >
          <ArrowLeft size={13} /> Back to National Register
        </Link>
      </div>

      <PageHeader
        eyebrow={`Common National Material Code · ${humanize(data.categoryCode)}`}
        title={data.canonicalDescription}
        description={<span className="font-mono text-lead font-bold text-primary-800">{data.cnmc}</span>}
        actions={
          <div className="flex items-center gap-2">
            <StatusBadge status={data.status} />
            <a
              href={`/api/v1/materials/${encodeURIComponent(data.cnmc)}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-8 items-center gap-1.5 rounded border border-grey-300 bg-white px-3 text-caption font-medium text-grey-800 hover:bg-grey-50"
            >
              REST API <ExternalLink size={12} />
            </a>
          </div>
        }
      />

      <div className="grid grid-cols-12 gap-3">
        <div className="col-span-12 lg:col-span-7 space-y-3">
          {/* Identity Grid */}
          <Panel title="Material Master Identity">
            <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
              <Stat label="ERP Short Code (MATNR)" value={<span className="font-mono text-caption font-bold">{data.shortCode}</span>} hint="SAP ECC safe" />
              <Stat label="Base UOM · Version" value={<span className="font-mono text-caption font-semibold">{data.baseUom ?? 'EA'} · v{data.version}</span>} />
              <Stat label="UNSPSC Classification" value={<span className="font-mono text-caption font-semibold">{data.unspscCode ?? '—'}</span>} hint={data.subtype ? humanize(data.subtype) : undefined} />
              <Stat label="Combined Annual Spend" value={<span className="font-display text-caption font-bold text-high-700">{fmtInr(data.estAnnualValueInr)}</span>} />
            </div>
          </Panel>

          {/* Mapped Legacy Codes */}
          <Panel
            title={`Mapped Legacy Codes (${active.length} across ${orgs.length} CPSEs)`}
            subtitle="Harmonised cross-enterprise material references"
          >
            <div className="scroll-thin overflow-x-auto p-4">
              <MappingRows rows={data.mappings} />
            </div>
            {prices.length > 1 && (
              <div className="border-t border-grey-200 bg-grey-25 px-4 py-2.5 text-caption text-grey-700">
                Price spread across CPSEs: <b>{fmtInr(Math.min(...prices), { compact: false })}</b> to <b>{fmtInr(Math.max(...prices), { compact: false })}</b> (
                {(((Math.max(...prices) - Math.min(...prices)) / Math.min(...prices)) * 100).toFixed(0)}% dispersion)
              </div>
            )}
          </Panel>

          {/* Immutable Audit Lineage */}
          <Panel title="Immutable Change History" subtitle="SHA-256 cryptographic trail for this material">
            <ol className="divide-y divide-grey-100">
              {data.history.map((h) => (
                <li key={h.seq} className="grid grid-cols-[140px_1fr_auto] items-center gap-3 px-4 py-2 text-caption">
                  <span className="font-mono text-micro text-grey-500">{fmtDateTime(h.occurredAt)}</span>
                  <div>
                    <span className="font-semibold text-grey-900">{h.action.replace(/_/g, ' ')}</span>
                    <span className="text-grey-500 font-sans ml-1">by {h.actorName}</span>
                    {typeof h.payload.legacyCode === 'string' && <span className="ml-1.5 font-mono text-micro text-grey-700 font-semibold">{h.payload.legacyCode}</span>}
                  </div>
                  <Link href={`/audit?q=${h.entityId}`} className="font-mono text-micro text-teal-700 hover:underline">
                    #{h.seq} {h.hash.slice(0, 8)}
                  </Link>
                </li>
              ))}
            </ol>
          </Panel>
        </div>

        <div className="col-span-12 lg:col-span-5 space-y-3">
          {/* Extracted & Governed Attributes */}
          <Panel title="Governed Standard Attributes">
            <table className="dt">
              <thead>
                <tr>
                  <th>Attribute</th>
                  <th>Standard Value</th>
                  <th className="text-right">Confidence</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(data.attributes).map(([k, a]) => (
                  <tr key={k}>
                    <td className="font-medium text-grey-700">{humanize(k)}</td>
                    <td className="font-mono text-caption font-semibold text-grey-900">{String(a.value).replace(/_/g, ' ')}</td>
                    <td className="tabular text-right font-mono text-micro text-grey-500">{(a.confidence * 100).toFixed(0)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex flex-wrap items-center gap-1.5 border-t border-grey-200 bg-grey-25 px-4 py-2.5">
              <CategoryChip code={data.categoryCode} long />
              {orgs.map((o) => (
                <OrgChip key={o} code={o} />
              ))}
            </div>
          </Panel>

          {/* SAP Payload Preview */}
          <Panel
            title="SAP Integration Payload"
            subtitle="Ready for RFC / IDoc / OData synchronization"
            actions={
              <div className="flex items-center gap-2">
                <Segmented
                  value={fmt}
                  onChange={setFmt}
                  items={[
                    { value: 'idoc', label: 'IDoc MATMAS05' },
                    { value: 'odata', label: 'S/4 OData' },
                  ]}
                />
                <Button size="sm" variant="ghost" icon={copied ? <Check size={12} className="text-high-600" /> : <Copy size={12} />} onClick={handleCopy}>
                  {copied ? 'Copied' : 'Copy'}
                </Button>
              </div>
            }
          >
            <pre className="scroll-thin max-h-[460px] overflow-auto bg-grey-900 p-3 font-mono text-micro leading-relaxed text-grey-100">
              {payload}
            </pre>
          </Panel>
        </div>
      </div>
    </div>
  );
}

