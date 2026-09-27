'use client';

import { useQuery } from '@tanstack/react-query';
import { Check, Copy, ExternalLink, Play, Terminal } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button, PageHeader, Panel, Segmented } from '@/components/ui/primitives';
import { Badge } from '@/components/ui/status';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/client/api';
import { cx } from '@/lib/format';

const ENDPOINTS = [
  {
    method: 'GET',
    path: '/api/v1/materials/{cnmc}?format=json|idoc|odata&org={CPSE}',
    desc: 'Harmonised material master as JSON, MATMAS05 IDoc (ECC) or API_PRODUCT_SRV entity (S/4HANA).',
  },
  {
    method: 'GET',
    path: '/api/v1/lookup?org={CPSE}&code={legacyCode}',
    desc: 'Resolve any CPSE legacy code to its Common National Material Code and sibling codes.',
  },
  {
    method: 'GET',
    path: '/api/v1/export?org={CPSE}&format=idoc|odata&since={ISO date}',
    desc: 'Delta distribution of every national code relevant to one CPSE (ALE / CPI iFlow ingestion).',
  },
];

export default function IntegrationPage() {
  const toast = useToast();
  const canon = useQuery({
    queryKey: ['canonical'],
    queryFn: () =>
      api<{
        canonical: { id: string; cnmc: string; orgs: string[]; mappings: number }[];
        mappings: { canonicalId: string; org: string; legacyCode: string }[];
      }>('/api/canonical'),
  });

  const [mode, setMode] = useState<'material' | 'lookup' | 'export'>('material');
  const [cnmc, setCnmc] = useState('');
  const [org, setOrg] = useState('CPCL');
  const [fmt, setFmt] = useState<'json' | 'idoc' | 'odata'>('idoc');
  const [code, setCode] = useState('');
  const [copied, setCopied] = useState(false);
  const [out, setOut] = useState<{ url: string; status: number; body: string; ms: number } | null>(null);

  useEffect(() => {
    const top = canon.data?.canonical.slice().sort((a, b) => b.mappings - a.mappings)[0];
    if (top && !cnmc) {
      setCnmc(top.cnmc);
      const m = canon.data?.mappings.find((x) => x.canonicalId === top.id && x.org === 'CPCL') ?? canon.data?.mappings.find((x) => x.canonicalId === top.id);
      if (m) {
        setCode(m.legacyCode);
        setOrg(m.org);
      }
    }
  }, [canon.data, cnmc]);

  const url =
    mode === 'material'
      ? `/api/v1/materials/${encodeURIComponent(cnmc)}?format=${fmt}&org=${org}`
      : mode === 'lookup'
        ? `/api/v1/lookup?org=${org}&code=${encodeURIComponent(code)}`
        : `/api/v1/export?org=${org}&format=${fmt === 'odata' ? 'odata' : 'idoc'}`;

  const run = async () => {
    const t0 = performance.now();
    try {
      const res = await fetch(url);
      const text = await res.text();
      let body = text;
      try {
        const j = JSON.parse(text);
        if (mode === 'export' && Array.isArray(j.documents)) {
          j.documents = j.documents.slice(0, 2).concat(j.documents.length > 2 ? [`… ${j.documents.length - 2} more documents`] : []);
        }
        body = JSON.stringify(j, null, 2);
      } catch {}
      setOut({ url, status: res.status, body, ms: Math.round(performance.now() - t0) });
    } catch (e: any) {
      setOut({ url, status: 500, body: JSON.stringify({ error: e.message }, null, 2), ms: Math.round(performance.now() - t0) });
    }
  };

  const copyResponse = () => {
    if (!out) return;
    navigator.clipboard.writeText(out.body);
    setCopied(true);
    toast({ kind: 'info', title: 'Payload copied' });
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-3">
      <PageHeader
        eyebrow="Enterprise Integration"
        title="SAP & ERP integration"
        description="National codes synchronize into CPSE ERPs without renumbering. BISMT / ProductOldID maintains uninterrupted legacy traceability."
      />

      <div className="grid grid-cols-12 gap-3">
        {/* Left Column: API Reference & Architecture */}
        <div className="col-span-12 lg:col-span-5 space-y-3">
          <Panel title="REST API Endpoints (v1, Read-Only)">
            <div className="divide-y divide-grey-100">
              {ENDPOINTS.map((e) => (
                <div key={e.path} className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Badge tone="high">{e.method}</Badge>
                    <code className="break-all font-mono text-caption font-semibold text-primary-800">{e.path}</code>
                  </div>
                  <p className="mt-1 text-caption text-grey-600 leading-relaxed">{e.desc}</p>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Production ERP Integration Paths" subtitle="Direct integration without business disruption">
            <ol className="space-y-2.5 p-4 text-caption text-grey-700">
              <li className="flex items-start gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary-100 font-mono text-micro font-bold text-primary-800">
                  1
                </span>
                <div>
                  <b className="text-grey-900">SAP ECC 6.0 (CPCL, SAIL):</b> ALE MATMAS05 IDoc distribution. CNMC maps to <span className="font-mono text-grey-900 font-medium">MARA-NORMT</span> + Z-segment; legacy number preserved in <span className="font-mono text-grey-900 font-medium">MARA-BISMT</span>.
                </div>
              </li>
              <li className="flex items-start gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary-100 font-mono text-micro font-bold text-primary-800">
                  2
                </span>
                <div>
                  <b className="text-grey-900">SAP S/4HANA (NTPC, BHEL):</b> <span className="font-mono text-grey-900 font-medium">API_PRODUCT_SRV</span> OData v2 or SAP Integration Suite iFlow with key-user custom field <span className="font-mono text-grey-900 font-medium">YY1_CNMC_PRD</span>.
                </div>
              </li>
              <li className="flex items-start gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary-100 font-mono text-micro font-bold text-primary-800">
                  3
                </span>
                <div>
                  <b className="text-grey-900">Oracle EBS (CIL):</b> Item cross-reference type <span className="font-mono text-grey-900 font-medium">NATIONAL_CODE</span> ingested via EGO open interface.
                </div>
              </li>
            </ol>
          </Panel>
        </div>

        {/* Right Column: Interactive API Console */}
        <Panel
          className="col-span-12 lg:col-span-7"
          title="Interactive API Console"
          subtitle="Test live ERP payload serialization"
          actions={
            <Segmented
              value={mode}
              onChange={(m) => {
                setMode(m);
                setOut(null);
              }}
              items={[
                { value: 'material', label: 'Material Payload' },
                { value: 'lookup', label: 'Code Lookup' },
                { value: 'export', label: 'Delta Export' },
              ]}
            />
          }
        >
          {/* Controls Bar */}
          <div className="flex flex-wrap items-end gap-2 border-b border-grey-200 bg-grey-25 p-3">
            {mode === 'material' && (
              <div className="min-w-[240px] flex-1">
                <label className="field-label">National Code</label>
                <select className="input font-mono text-caption" value={cnmc} onChange={(e) => setCnmc(e.target.value)}>
                  {canon.data?.canonical.map((c) => (
                    <option key={c.id} value={c.cnmc}>
                      {c.cnmc} ({c.orgs.join(', ')})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="w-28">
              <label className="field-label">Target CPSE</label>
              <select className="input font-medium" value={org} onChange={(e) => setOrg(e.target.value)}>
                {['CPCL', 'NTPC', 'SAIL', 'CIL', 'BHEL', 'IOCL'].map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            </div>

            {mode === 'lookup' && (
              <div className="flex-1 min-w-[200px]">
                <label className="field-label">Legacy Code</label>
                <input className="input font-mono font-medium" value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. 10004127" />
              </div>
            )}

            {mode !== 'lookup' && (
              <div>
                <label className="field-label">Format</label>
                <Segmented
                  value={fmt}
                  onChange={setFmt}
                  items={[
                    ...(mode === 'material' ? [{ value: 'json' as const, label: 'JSON' }] : []),
                    { value: 'idoc', label: 'IDoc' },
                    { value: 'odata', label: 'OData' },
                  ]}
                />
              </div>
            )}

            <Button variant="primary" icon={<Play size={13} />} onClick={run}>
              Send Request
            </Button>
          </div>

          {/* Request URL line */}
          <div className="flex items-center justify-between bg-grey-100 px-4 py-2 font-mono text-micro text-grey-700 border-b border-grey-200">
            <span className="truncate">GET {url}</span>
            <div className="flex items-center gap-2">
              {out && (
                <span
                  className={cx(
                    'rounded px-1.5 py-0.5 font-bold',
                    out.status < 300 ? 'bg-high-100 text-high-800' : 'bg-veto-100 text-veto-800',
                  )}
                >
                  HTTP {out.status} · {out.ms}ms
                </span>
              )}
              {out && (
                <Button size="sm" variant="ghost" icon={copied ? <Check size={12} className="text-high-600" /> : <Copy size={12} />} onClick={copyResponse}>
                  {copied ? 'Copied' : 'Copy'}
                </Button>
              )}
            </div>
          </div>

          {/* Response Payload */}
          <pre className="scroll-thin h-[460px] overflow-auto bg-grey-900 p-4 font-mono text-micro leading-relaxed text-grey-100">
            {out ? out.body : '// Click "Send Request" to preview live ERP serialization payload'}
          </pre>
        </Panel>
      </div>
    </div>
  );
}

