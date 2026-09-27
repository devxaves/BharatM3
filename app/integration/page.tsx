'use client';

import { useQuery } from '@tanstack/react-query';
import { Play } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button, PageHeader, Panel, Segmented } from '@/components/ui/primitives';
import { Badge } from '@/components/ui/status';
import { api } from '@/lib/client/api';
import { cx } from '@/lib/format';

const ENDPOINTS = [
  { method: 'GET', path: '/api/v1/materials/{cnmc}?format=json|idoc|odata&org={CPSE}', desc: 'Harmonised material master as JSON, a MATMAS05 IDoc (ECC) or an API_PRODUCT_SRV entity (S/4HANA). org fills BISMT / ProductOldID with that CPSE’s legacy code.' },
  { method: 'GET', path: '/api/v1/lookup?org={CPSE}&code={legacy code}', desc: 'Resolve a CPSE legacy code to its Common National Material Code and sibling codes in other CPSEs.' },
  { method: 'GET', path: '/api/v1/export?org={CPSE}&format=idoc|odata&since={ISO date}', desc: 'Delta distribution of every national code relevant to one CPSE — what an ALE/BD10 or CPI iFlow would consume.' },
];

export default function IntegrationPage() {
  const canon = useQuery({ queryKey: ['canonical'], queryFn: () => api<{ canonical: { id: string; cnmc: string; orgs: string[]; mappings: number }[]; mappings: { canonicalId: string; org: string; legacyCode: string }[] }>('/api/canonical') });
  const [mode, setMode] = useState<'material' | 'lookup' | 'export'>('material');
  const [cnmc, setCnmc] = useState('');
  const [org, setOrg] = useState('CPCL');
  const [fmt, setFmt] = useState<'json' | 'idoc' | 'odata'>('idoc');
  const [code, setCode] = useState('');
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
    mode === 'material' ? `/api/v1/materials/${encodeURIComponent(cnmc)}?format=${fmt}&org=${org}` : mode === 'lookup' ? `/api/v1/lookup?org=${org}&code=${encodeURIComponent(code)}` : `/api/v1/export?org=${org}&format=${fmt === 'odata' ? 'odata' : 'idoc'}`;

  const run = async () => {
    const t0 = performance.now();
    const res = await fetch(url);
    const text = await res.text();
    let body = text;
    try {
      const j = JSON.parse(text);
      if (mode === 'export' && Array.isArray(j.documents)) j.documents = j.documents.slice(0, 2).concat(j.documents.length > 2 ? [`… ${j.documents.length - 2} more documents`] : []);
      body = JSON.stringify(j, null, 2);
    } catch {}
    setOut({ url, status: res.status, body, ms: Math.round(performance.now() - t0) });
  };

  return (
    <div>
      <PageHeader
        eyebrow="Integration"
        title="SAP / ERP integration"
        description="No CPSE has to renumber anything. National codes flow back into each ERP through its standard interfaces, carrying the CPSE’s own legacy code in the old-material-number field so every document, stock and PO history stays traceable."
      />
      <div className="grid grid-cols-12 gap-3">
        <div className="col-span-5 space-y-3">
          <Panel title="REST endpoints (v1, read-only)">
            <div className="divide-y divide-grey-100">
              {ENDPOINTS.map((e) => (
                <div key={e.path} className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <Badge tone="high">{e.method}</Badge>
                    <code className="break-all text-caption text-primary-800">{e.path}</code>
                  </div>
                  <p className="mt-1 text-caption text-grey-600">{e.desc}</p>
                </div>
              ))}
            </div>
          </Panel>
          <Panel title="Production integration path">
            <ol className="space-y-2 px-4 py-3 text-caption text-grey-700">
              <li>
                <b className="text-grey-900">ECC 6.0 CPSEs (CPCL, SAIL):</b> ALE distribution of MATMAS05 IDocs via a logical system per CPSE; the national code goes to <span className="font-mono">MARA-NORMT</span> + Z-segment, the legacy number to <span className="font-mono">MARA-BISMT</span>.
              </li>
              <li>
                <b className="text-grey-900">S/4HANA CPSEs (NTPC, BHEL):</b> <span className="font-mono">API_PRODUCT_SRV</span> (OData v2) or SAP Integration Suite iFlow, with CNMC in a key-user extension field (<span className="font-mono">YY1_CNMC_PRD</span>).
              </li>
              <li>
                <b className="text-grey-900">Oracle EBS (CIL):</b> item cross-reference type <span className="font-mono">NATIONAL_CODE</span> loaded through the EGO item open interface from the same JSON.
              </li>
              <li>
                <b className="text-grey-900">Inbound:</b> nightly MARA/MAKT/MARC extracts (or change pointers) land in the ingestion layer; the pipeline is idempotent so re-sends are harmless.
              </li>
            </ol>
            <div className="border-t border-grey-200 px-4 py-2 text-micro text-grey-500">Full design: docs/sap-integration.md. Live SAP connectivity is out of MVP scope by design (PRD §3) — payloads here are shape-accurate mocks.</div>
          </Panel>
        </div>
        <Panel
          className="col-span-7"
          title="Try it"
          actions={<Segmented value={mode} onChange={(m) => { setMode(m); setOut(null); }} items={[{ value: 'material', label: 'Material' }, { value: 'lookup', label: 'Lookup' }, { value: 'export', label: 'Delta export' }]} />}
        >
          <div className="flex flex-wrap items-end gap-2 border-b border-grey-200 px-4 py-3">
            {mode === 'material' && (
              <div className="min-w-[300px] flex-1">
                <label className="field-label">National code</label>
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
              <label className="field-label">Receiving CPSE</label>
              <select className="input" value={org} onChange={(e) => setOrg(e.target.value)}>
                {['CPCL', 'NTPC', 'SAIL', 'CIL', 'BHEL', 'IOCL'].map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            </div>
            {mode === 'lookup' && (
              <div className="w-56">
                <label className="field-label">Legacy code</label>
                <input className="input font-mono" value={code} onChange={(e) => setCode(e.target.value)} />
              </div>
            )}
            {mode !== 'lookup' && <Segmented value={fmt} onChange={setFmt} items={[...(mode === 'material' ? [{ value: 'json' as const, label: 'JSON' }] : []), { value: 'idoc', label: 'IDoc' }, { value: 'odata', label: 'OData' }]} />}
            <Button variant="primary" icon={<Play size={13} />} onClick={run}>
              Send request
            </Button>
          </div>
          <div className="flex items-center gap-2 bg-grey-50 px-4 py-1.5 font-mono text-micro text-grey-600">
            GET {url}
            {out && (
              <span className={cx('ml-auto rounded-sm px-1.5 font-semibold', out.status < 300 ? 'bg-high-100 text-high-700' : 'bg-veto-100 text-veto-700')}>
                {out.status} · {out.ms} ms
              </span>
            )}
          </div>
          <pre className="scroll-thin h-[520px] overflow-auto bg-grey-900 px-4 py-3 font-mono text-micro leading-[1.55] text-grey-100">{out ? out.body : '// Send a request to see the live response from this deployment'}</pre>
        </Panel>
      </div>
    </div>
  );
}
