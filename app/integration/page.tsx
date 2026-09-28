'use client';

import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  Code2,
  Copy,
  ExternalLink,
  FileCode,
  Layers,
  Play,
  Plug,
  Server,
  Terminal,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button, PageHeader, Panel, Segmented, Tabs } from '@/components/ui/primitives';
import { Badge } from '@/components/ui/status';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/client/api';
import { cx } from '@/lib/format';

type TabView = 'console' | 'reference' | 'snippets' | 'architecture';

const ENDPOINTS = [
  {
    id: 'material',
    method: 'GET',
    path: '/api/v1/materials/{cnmc}',
    summary: 'Harmonised Material Master',
    desc: 'Retrieve harmonised material master as JSON, MATMAS05 IDoc (SAP ECC), or API_PRODUCT_SRV entity (SAP S/4HANA).',
    params: [
      { name: 'cnmc', in: 'path', type: 'string', required: true, desc: 'Common National Material Code, short code, or UUID' },
      { name: 'format', in: 'query', type: 'json | idoc | odata', required: false, desc: 'Output payload format (default: json)' },
      { name: 'org', in: 'query', type: 'CPCL | NTPC | SAIL | CIL | BHEL | IOCL', required: false, desc: 'Target CPSE to populate legacy BISMT / ProductOldID' },
    ],
    sampleResponse: {
      cnmc: 'IN-CPSE-01-000001',
      short_code: 'MAT-100412',
      canonical_description: 'DEEP GROOVE BALL BEARING 6205-2RSH/C3 (25x52x15 mm)',
      category: 'BEARING',
      subtype: 'BALL_BEARING',
      unspsc_code: '31171504',
      attributes: {
        bearing_type: 'DEEP_GROOVE_BALL_BEARING',
        bore_diameter_mm: '25',
        outer_diameter_mm: '52',
        width_mm: '15',
        clearance: 'C3',
        sealing: '2RSH',
      },
      base_uom: 'EA',
      status: 'ACTIVE',
      version: 1,
      legacy_mappings: [
        { cpse: 'CPCL', legacy_code: '10004127', match_type: 'IDENTICAL', confidence: 1.0, status: 'ACTIVE' },
        { cpse: 'NTPC', legacy_code: 'NTP-BRG-6205', match_type: 'DUPLICATE', confidence: 0.98, status: 'ACTIVE' },
      ],
    },
  },
  {
    id: 'lookup',
    method: 'GET',
    path: '/api/v1/lookup',
    summary: 'Cross-CPSE Code Resolver',
    desc: 'Resolve any enterprise legacy material code to its Common National Material Code and peer CPSE equivalents.',
    params: [
      { name: 'org', in: 'query', type: 'CPSE Code', required: true, desc: 'Source CPSE (e.g., CPCL, NTPC, SAIL, CIL)' },
      { name: 'code', in: 'query', type: 'string', required: true, desc: 'Source legacy material code' },
    ],
    sampleResponse: {
      cpse: 'CPCL',
      legacy_code: '10004127',
      status: 'HARMONISED',
      cnmc: 'IN-CPSE-01-000001',
      short_code: 'MAT-100412',
      canonical_description: 'DEEP GROOVE BALL BEARING 6205-2RSH/C3 (25x52x15 mm)',
      match_type: 'IDENTICAL',
      confidence: 1.0,
      siblings: [
        { cpse: 'NTPC', legacy_code: 'NTP-BRG-6205', match_type: 'DUPLICATE' },
        { cpse: 'SAIL', legacy_code: 'SL-6205-2RS-C3', match_type: 'FUNCTIONALLY_EQUIVALENT' },
      ],
    },
  },
  {
    id: 'export',
    method: 'GET',
    path: '/api/v1/export',
    summary: 'ERP Delta Synchronization',
    desc: 'Delta distribution of every national code mapped to one CPSE for scheduled ALE distribution or SAP CPI iFlow ingestion.',
    params: [
      { name: 'org', in: 'query', type: 'CPSE Code', required: true, desc: 'Target CPSE code (e.g. CPCL)' },
      { name: 'format', in: 'query', type: 'idoc | odata', required: false, desc: 'Payload format (default: idoc)' },
      { name: 'since', in: 'query', type: 'ISO 8601 Date', required: false, desc: 'Filter updates on or after this timestamp' },
    ],
    sampleResponse: {
      cpse: 'CPCL',
      format: 'idoc',
      count: 24,
      generatedAt: '2026-09-28T08:00:00.000Z',
      documents: [
        {
          IDOC: {
            EDI_DC40: { IDOCTYP: 'MATMAS05', MESTYP: 'MATMAS', SNDPRN: 'UNIMAT', RCVPRN: 'CPCL_ECC' },
            E1MARAM: { MSGFN: '005', MATNR: '10004127', NORMT: 'IN-CPSE-01-000001', BISMT: '10004127', MEINS: 'EA' },
          },
        },
      ],
    },
  },
];

export default function IntegrationPage() {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<TabView>('console');

  const canon = useQuery({
    queryKey: ['canonical'],
    queryFn: () =>
      api<{
        canonical: { id: string; cnmc: string; description?: string; orgs: string[]; mappings: number }[];
        mappings: { canonicalId: string; org: string; legacyCode: string }[];
      }>('/api/canonical'),
  });

  const [mode, setMode] = useState<'material' | 'lookup' | 'export'>('material');
  const [cnmc, setCnmc] = useState('');
  const [org, setOrg] = useState('CPCL');
  const [fmt, setFmt] = useState<'json' | 'idoc' | 'odata'>('json');
  const [code, setCode] = useState('');
  const [sinceDate, setSinceDate] = useState('');
  const [copied, setCopied] = useState(false);
  const [copiedSnippet, setCopiedSnippet] = useState(false);
  const [loading, setLoading] = useState(false);
  const [snippetLang, setSnippetLang] = useState<'curl' | 'python' | 'js' | 'abap'>('curl');
  const [out, setOut] = useState<{ url: string; status: number; body: string; ms: number; sizeKb: number } | null>(null);

  useEffect(() => {
    const top = canon.data?.canonical.slice().sort((a, b) => b.mappings - a.mappings)[0];
    if (top && !cnmc) {
      setCnmc(top.cnmc);
      const m =
        canon.data?.mappings.find((x) => x.canonicalId === top.id && x.org === 'CPCL') ??
        canon.data?.mappings.find((x) => x.canonicalId === top.id);
      if (m) {
        setCode(m.legacyCode);
        setOrg(m.org);
      }
    }
  }, [canon.data, cnmc]);

  const queryUrl =
    mode === 'material'
      ? `/api/v1/materials/${encodeURIComponent(cnmc || 'IN-CPSE-01-000001')}?format=${fmt}&org=${org}`
      : mode === 'lookup'
        ? `/api/v1/lookup?org=${org}&code=${encodeURIComponent(code || '10004127')}`
        : `/api/v1/export?org=${org}&format=${fmt === 'odata' ? 'odata' : 'idoc'}${sinceDate ? `&since=${sinceDate}` : ''}`;

  const run = async () => {
    setLoading(true);
    const t0 = performance.now();
    try {
      const res = await fetch(queryUrl);
      const text = await res.text();
      let body = text;
      try {
        const j = JSON.parse(text);
        if (mode === 'export' && Array.isArray(j.documents)) {
          j.documents = j.documents.slice(0, 3).concat(j.documents.length > 3 ? [`… ${j.documents.length - 3} more records`] : []);
        }
        body = JSON.stringify(j, null, 2);
      } catch {}
      const ms = Math.round(performance.now() - t0);
      const sizeKb = +(text.length / 1024).toFixed(1);
      setOut({ url: queryUrl, status: res.status, body, ms, sizeKb });
    } catch (e: any) {
      setOut({
        url: queryUrl,
        status: 500,
        body: JSON.stringify({ error: e.message }, null, 2),
        ms: Math.round(performance.now() - t0),
        sizeKb: 0.1,
      });
    } finally {
      setLoading(false);
    }
  };

  const copyResponse = () => {
    if (!out) return;
    navigator.clipboard.writeText(out.body);
    setCopied(true);
    toast({ kind: 'success', title: 'Payload copied to clipboard' });
    setTimeout(() => setCopied(false), 2000);
  };

  const copySnippet = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSnippet(true);
    toast({ kind: 'success', title: 'Code snippet copied' });
    setTimeout(() => setCopiedSnippet(false), 2000);
  };

  const fullUrl = typeof window !== 'undefined' ? `${window.location.origin}${queryUrl}` : queryUrl;

  const getSnippet = () => {
    if (snippetLang === 'curl') {
      return `curl -X GET "${fullUrl}" \\\n  -H "Accept: application/json" \\\n  -H "User-Agent: CPSE-ERP-Connector/1.0"`;
    }
    if (snippetLang === 'python') {
      return `import requests\n\nurl = "${fullUrl}"\nheaders = {"Accept": "application/json"}\n\nresponse = requests.get(url, headers=headers)\ndata = response.json()\nprint(f"Status: {response.status_code}")\nprint(data)`;
    }
    if (snippetLang === 'js') {
      return `// Using native Fetch API in Node.js 18+ or Browser\nconst res = await fetch("${fullUrl}", {\n  headers: { Accept: "application/json" }\n});\nconst data = await res.json();\nconsole.log(data);`;
    }
    if (snippetLang === 'abap') {
      return `* ABAP HTTP Client (SAP ECC / S/4HANA)\nDATA: lo_http_client TYPE REF TO if_http_client,\n      lv_response    TYPE string.\n\ncl_http_client=>create_by_url(\n  EXPORTING url = '${fullUrl}'\n  IMPORTING client = lo_http_client ).\n\nlo_http_client->request->set_method( 'GET' ).\nlo_http_client->send( ).\nlo_http_client->receive( ).\nlv_response = lo_http_client->response->get_cdata( ).`;
    }
    return '';
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Developer & Enterprise Integration"
        title="API Documentation & ERP Connectors"
        description="Standardized REST API, SAP ECC ALE IDoc (MATMAS05), and S/4HANA OData v2 endpoints for automated synchronization without renumbering."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              icon={<ExternalLink size={13} />}
              onClick={() => window.open('/api/v1/materials/IN-CPSE-01-000001', '_blank')}
            >
              Raw Spec v1
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon={<Play size={13} />}
              onClick={() => {
                setActiveTab('console');
                run();
              }}
            >
              Test Live Endpoint
            </Button>
          </div>
        }
      />

      {/* Top Highlights Banner */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="panel p-4 flex items-center gap-3.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 border border-teal-200 text-teal-700">
            <Plug size={20} />
          </div>
          <div>
            <div className="text-micro font-semibold uppercase tracking-[0.08em] text-grey-500">Integration Protocol</div>
            <div className="font-display text-dense font-bold text-grey-900 mt-0.5">REST · IDoc · OData v2</div>
          </div>
        </div>

        <div className="panel p-4 flex items-center gap-3.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 border border-primary-200 text-primary-800">
            <Server size={20} />
          </div>
          <div>
            <div className="text-micro font-semibold uppercase tracking-[0.08em] text-grey-500">Traceability Field</div>
            <div className="font-display text-dense font-bold text-grey-900 mt-0.5">MARA-NORMT / BISMT</div>
          </div>
        </div>

        <div className="panel p-4 flex items-center gap-3.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-high-50 border border-high-200 text-high-800">
            <CheckCircle2 size={20} />
          </div>
          <div>
            <div className="text-micro font-semibold uppercase tracking-[0.08em] text-grey-500">Business Impact</div>
            <div className="font-display text-dense font-bold text-grey-900 mt-0.5">Zero ERP Downtime</div>
          </div>
        </div>

        <div className="panel p-4 flex items-center gap-3.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 border border-amber-200 text-amber-800">
            <Code2 size={20} />
          </div>
          <div>
            <div className="text-micro font-semibold uppercase tracking-[0.08em] text-grey-500">Supported CPSEs</div>
            <div className="font-display text-dense font-bold text-grey-900 mt-0.5">6 Enterprise Orgs</div>
          </div>
        </div>
      </div>

      {/* Main Tab Controller */}
      <Tabs
        value={activeTab}
        onChange={setActiveTab}
        items={[
          { value: 'console', label: 'Interactive API Sandbox', tone: 'high' },
          { value: 'reference', label: 'API Reference & Schemas' },
          { value: 'snippets', label: 'Code SDK & cURL' },
          { value: 'architecture', label: 'ERP Field Architecture' },
        ]}
      />

      {/* TAB 1: INTERACTIVE CONSOLE */}
      {activeTab === 'console' && (
        <div className="grid grid-cols-12 gap-5">
          {/* Controls Form */}
          <div className="col-span-12 lg:col-span-5 space-y-4">
            <Panel title="Request Configuration" subtitle="Configure endpoint parameters and run live queries">
              <div className="p-4 space-y-4">
                <div>
                  <label className="field-label">Target Endpoint</label>
                  <Segmented
                    value={mode}
                    onChange={(m) => {
                      setMode(m);
                      setOut(null);
                    }}
                    items={[
                      { value: 'material', label: '1. Materials' },
                      { value: 'lookup', label: '2. Code Lookup' },
                      { value: 'export', label: '3. Delta Export' },
                    ]}
                  />
                </div>

                {mode === 'material' && (
                  <div>
                    <label className="field-label">Common National Material Code (CNMC)</label>
                    <select
                      className="input font-mono text-caption"
                      value={cnmc}
                      onChange={(e) => setCnmc(e.target.value)}
                    >
                      {canon.data?.canonical.map((c) => (
                        <option key={c.id} value={c.cnmc}>
                          {c.cnmc} ({c.orgs.join(', ')})
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-micro text-grey-500">Pick any canonical code generated from CPSE clustering.</p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="field-label">Target CPSE</label>
                    <select className="input font-bold" value={org} onChange={(e) => setOrg(e.target.value)}>
                      {['CPCL', 'NTPC', 'SAIL', 'CIL', 'BHEL', 'IOCL'].map((o) => (
                        <option key={o}>{o}</option>
                      ))}
                    </select>
                  </div>

                  {mode !== 'lookup' ? (
                    <div>
                      <label className="field-label">Payload Format</label>
                      <Segmented
                        value={fmt}
                        onChange={setFmt}
                        items={[
                          ...(mode === 'material' ? [{ value: 'json' as const, label: 'JSON' }] : []),
                          { value: 'idoc', label: 'SAP IDoc' },
                          { value: 'odata', label: 'OData' },
                        ]}
                      />
                    </div>
                  ) : null}
                </div>

                {mode === 'lookup' && (
                  <div>
                    <label className="field-label">Legacy Material Code</label>
                    <input
                      className="input font-mono font-bold"
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      placeholder="e.g. 10004127"
                    />
                    <p className="mt-1 text-micro text-grey-500">Resolves this legacy code to CNMC and peer CPSE equivalents.</p>
                  </div>
                )}

                {mode === 'export' && (
                  <div>
                    <label className="field-label">Since Timestamp (Optional)</label>
                    <input
                      type="date"
                      className="input"
                      value={sinceDate}
                      onChange={(e) => setSinceDate(e.target.value)}
                    />
                    <p className="mt-1 text-micro text-grey-500">Only export materials modified after this date.</p>
                  </div>
                )}

                <div className="pt-2">
                  <Button
                    variant="primary"
                    className="w-full"
                    icon={<Play size={14} />}
                    onClick={run}
                    disabled={loading}
                  >
                    {loading ? 'Executing Query…' : 'Send Live Request'}
                  </Button>
                </div>
              </div>
            </Panel>

            <Panel title="Active Request Details">
              <div className="p-4 space-y-3 text-dense">
                <div className="flex items-center gap-2">
                  <Badge tone="high">GET</Badge>
                  <span className="font-mono text-caption text-grey-800 break-all">{queryUrl}</span>
                </div>
                <div className="border-t border-grey-100 pt-2 text-caption text-grey-600 space-y-1">
                  <div>
                    <span className="font-bold text-grey-800">Auth:</span> Bearer Token / CPSE Mutual TLS
                  </div>
                  <div>
                    <span className="font-bold text-grey-800">Rate Limit:</span> 1,200 req / min per CPSE tenant
                  </div>
                  <div>
                    <span className="font-bold text-grey-800">Serialization:</span> Gzip / Deflate supported
                  </div>
                </div>
              </div>
            </Panel>
          </div>

          {/* Response Payload Viewer */}
          <div className="col-span-12 lg:col-span-7">
            <Panel
              title={
                <div className="flex items-center gap-2">
                  <span>API Response Viewer</span>
                  {out && (
                    <span
                      className={cx(
                        'rounded-sm px-1.5 py-0.5 font-mono text-micro font-semibold',
                        out.status < 300 ? 'bg-high-100 text-high-800 border border-high-200' : 'bg-veto-100 text-veto-800 border border-veto-200',
                      )}
                    >
                      HTTP {out.status} {out.status === 200 ? 'OK' : 'ERROR'}
                    </span>
                  )}
                </div>
              }
              subtitle="Live payload serialized directly from the database & SAP transformation engine"
              actions={
                out && (
                  <div className="flex items-center gap-2">
                    <span className="text-micro font-mono text-grey-500">
                      {out.ms}ms · {out.sizeKb} KB
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      icon={copied ? <Check size={12} className="text-high-600" /> : <Copy size={12} />}
                      onClick={copyResponse}
                    >
                      {copied ? 'Copied' : 'Copy Payload'}
                    </Button>
                  </div>
                )
              }
            >
              <div className="relative">
                <div className="flex items-center justify-between bg-grey-900 px-4 py-2 border-b border-grey-800 text-grey-400 font-mono text-micro">
                  <span>RESPONSE BODY ({out ? (fmt === 'idoc' ? 'SAP IDoc MATMAS05' : fmt === 'odata' ? 'OData v2' : 'JSON') : 'NO REQUEST YET'})</span>
                  {out && <span className="text-high-400">Content-Type: application/json; charset=utf-8</span>}
                </div>
                <pre className="scroll-thin h-[540px] overflow-auto bg-grey-950 p-4 font-mono text-caption leading-relaxed text-teal-300 selection:bg-teal-900 selection:text-white">
                  {out ? out.body : '// Select your parameters on the left and click "Send Live Request"'}
                </pre>
              </div>
            </Panel>
          </div>
        </div>
      )}

      {/* TAB 2: API REFERENCE */}
      {activeTab === 'reference' && (
        <div className="space-y-6">
          {ENDPOINTS.map((e) => (
            <Panel
              key={e.path}
              title={
                <div className="flex items-center gap-3">
                  <span className="rounded bg-teal-100 px-2 py-0.5 font-mono text-caption font-bold text-teal-900 border border-teal-200">
                    {e.method}
                  </span>
                  <span className="font-mono text-dense font-bold text-grey-900">{e.path}</span>
                  <span className="text-caption text-grey-500 font-normal">({e.summary})</span>
                </div>
              }
              subtitle={e.desc}
            >
              <div className="divide-y divide-grey-100">
                {/* Parameters Table */}
                <div className="p-4">
                  <div className="text-caption font-bold text-grey-800 mb-2">Request Parameters</div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-caption">
                      <thead>
                        <tr className="border-b border-grey-200 text-left text-micro font-semibold uppercase tracking-[0.08em] text-grey-500">
                          <th className="py-2 pr-4">Parameter</th>
                          <th className="py-2 px-4">Location</th>
                          <th className="py-2 px-4">Type</th>
                          <th className="py-2 px-4">Required</th>
                          <th className="py-2 pl-4">Description</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-grey-100">
                        {e.params.map((p) => (
                          <tr key={p.name}>
                            <td className="py-2 pr-4 font-mono font-bold text-primary-900">{p.name}</td>
                            <td className="py-2 px-4">
                              <span className="rounded bg-grey-100 px-1.5 py-0.5 font-mono text-micro font-semibold text-grey-700">
                                {p.in}
                              </span>
                            </td>
                            <td className="py-2 px-4 font-mono text-micro text-teal-800">{p.type}</td>
                            <td className="py-2 px-4">
                              {p.required ? (
                                <span className="rounded bg-veto-50 px-1.5 py-0.5 font-mono text-micro font-bold text-veto-700">Required</span>
                              ) : (
                                <span className="text-micro text-grey-400">Optional</span>
                              )}
                            </td>
                            <td className="py-2 pl-4 text-grey-600">{p.desc}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Sample Response */}
                <div className="p-4 bg-grey-25/50">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-caption font-bold text-grey-800">Sample 200 OK Response</div>
                    <Badge tone="high">application/json</Badge>
                  </div>
                  <pre className="scroll-thin max-h-60 overflow-auto rounded-lg bg-grey-900 p-3 font-mono text-caption text-grey-200">
                    {JSON.stringify(e.sampleResponse, null, 2)}
                  </pre>
                </div>
              </div>
            </Panel>
          ))}
        </div>
      )}

      {/* TAB 3: CODE SNIPPETS */}
      {activeTab === 'snippets' && (
        <div className="grid grid-cols-12 gap-5">
          <div className="col-span-12 lg:col-span-4 space-y-4">
            <Panel title="SDK & Integration Libraries" subtitle="Choose client language for ready-to-use boilerplate">
              <div className="p-4 space-y-2">
                {[
                  { id: 'curl', label: 'cURL / Shell CLI', icon: <Terminal size={15} /> },
                  { id: 'python', label: 'Python (requests / pandas)', icon: <FileCode size={15} /> },
                  { id: 'js', label: 'JavaScript / Node.js (fetch)', icon: <Code2 size={15} /> },
                  { id: 'abap', label: 'SAP ABAP (cl_http_client)', icon: <Server size={15} /> },
                ].map((l) => (
                  <button
                    key={l.id}
                    onClick={() => setSnippetLang(l.id as any)}
                    className={cx(
                      'flex w-full items-center justify-between rounded-lg p-3 text-dense font-semibold transition-all border',
                      snippetLang === l.id
                        ? 'bg-teal-50 border-teal-300 text-teal-900 shadow-sm'
                        : 'bg-white border-grey-200 text-grey-700 hover:bg-grey-50',
                    )}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className={snippetLang === l.id ? 'text-teal-700' : 'text-grey-400'}>{l.icon}</span>
                      <span>{l.label}</span>
                    </div>
                    {snippetLang === l.id && <Check size={14} className="text-teal-600" />}
                  </button>
                ))}
              </div>
            </Panel>

            <Panel title="Authentication & Security">
              <div className="p-4 text-dense text-grey-600 space-y-2.5">
                <p>
                  Production CPSE connections utilize <b>Mutual TLS (mTLS)</b> with X.509 client certificates issued by a trusted PKI.
                </p>
                <div className="rounded-lg bg-amber-50 border border-amber-200 p-2.5 text-caption text-amber-900">
                  <b>Sandbox Mode:</b> The live sandbox endpoints demonstrated here run in mock tenant simulation mode.
                </div>
              </div>
            </Panel>
          </div>

          <div className="col-span-12 lg:col-span-8">
            <Panel
              title={`${snippetLang.toUpperCase()} Integration Example`}
              subtitle={`Dynamically generated for ${queryUrl}`}
              actions={
                <Button
                  size="sm"
                  variant="outline"
                  icon={copiedSnippet ? <Check size={12} className="text-high-600" /> : <Copy size={12} />}
                  onClick={() => copySnippet(getSnippet())}
                >
                  {copiedSnippet ? 'Copied' : 'Copy Code'}
                </Button>
              }
            >
              <div className="bg-grey-950 p-4 rounded-b-xl">
                <pre className="scroll-thin max-h-[500px] overflow-auto font-mono text-caption leading-relaxed text-teal-300">
                  {getSnippet()}
                </pre>
              </div>
            </Panel>
          </div>
        </div>
      )}

      {/* TAB 4: ERP FIELD ARCHITECTURE */}
      {activeTab === 'architecture' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="panel p-5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="rounded-lg bg-primary-100 px-2 py-0.5 font-mono text-micro font-bold text-primary-900 border border-primary-200">
                  SAP ECC 6.0
                </span>
                <span className="text-micro font-bold text-teal-700">ALE / IDoc</span>
              </div>
              <h3 className="font-display text-lead font-bold text-grey-900">CPCL & SAIL Integration</h3>
              <p className="text-caption text-grey-600 leading-relaxed">
                Uses standard <b>MATMAS05</b> IDoc distribution without database schema changes. The Common National Material Code is populated into standard field <b>MARA-NORMT</b> (Industry Standard Description), while the CPSE original legacy code remains in <b>MARA-BISMT</b>.
              </p>
              <div className="rounded-lg bg-grey-50 border border-grey-200 p-3 text-caption font-mono space-y-1">
                <div><span className="text-grey-500">MARA-NORMT:</span> IN-CPSE-01-000001</div>
                <div><span className="text-grey-500">MARA-BISMT:</span> 10004127 (Legacy)</div>
                <div><span className="text-grey-500">Z-SEGMENT:</span> Z1MARA_CNMC_V1</div>
              </div>
            </div>

            <div className="panel p-5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="rounded-lg bg-teal-100 px-2 py-0.5 font-mono text-micro font-bold text-teal-900 border border-teal-200">
                  SAP S/4HANA
                </span>
                <span className="text-micro font-bold text-teal-700">OData v2 / CPI</span>
              </div>
              <h3 className="font-display text-lead font-bold text-grey-900">NTPC & BHEL Integration</h3>
              <p className="text-caption text-grey-600 leading-relaxed">
                Connects through standard <b>API_PRODUCT_SRV</b> OData service or SAP Integration Suite (CPI) iFlow. Leverages SAP Extensibility custom field <b>YY1_CNMC_PRD</b> on the Product entity with backward-compatible master data lookup.
              </p>
              <div className="rounded-lg bg-grey-50 border border-grey-200 p-3 text-caption font-mono space-y-1">
                <div><span className="text-grey-500">Entity:</span> A_Product</div>
                <div><span className="text-grey-500">Custom Field:</span> YY1_CNMC_PRD</div>
                <div><span className="text-grey-500">ProductOldID:</span> NTP-BRG-6205</div>
              </div>
            </div>

            <div className="panel p-5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="rounded-lg bg-amber-100 px-2 py-0.5 font-mono text-micro font-bold text-amber-900 border border-amber-200">
                  Oracle EBS & GeM
                </span>
                <span className="text-micro font-bold text-amber-800">EGO / REST</span>
              </div>
              <h3 className="font-display text-lead font-bold text-grey-900">CIL & National Portal</h3>
              <p className="text-caption text-grey-600 leading-relaxed">
                Integrates with Oracle Enterprise Data Management via Item Cross-Reference type <b>NATIONAL_CODE</b> using the <code>EGO_ITEM_PUB</code> interface. Exports automated catalog mapping to Government e-Marketplace (GeM) CPSE procurement categories.
              </p>
              <div className="rounded-lg bg-grey-50 border border-grey-200 p-3 text-caption font-mono space-y-1">
                <div><span className="text-grey-500">Cross Ref:</span> NATIONAL_CODE</div>
                <div><span className="text-grey-500">Interface:</span> EGO_ITEM_PUB</div>
                <div><span className="text-grey-500">GeM Category:</span> Industrial Bearings</div>
              </div>
            </div>
          </div>

          {/* Flow Diagram Card */}
          <Panel title="Zero-Disruption Enterprise Synchronization Architecture">
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-center text-center">
                <div className="rounded-xl border border-grey-200 bg-grey-50 p-4">
                  <div className="font-mono text-caption font-bold text-primary-900">CPSE Source ERP</div>
                  <div className="text-micro text-grey-500 mt-1">SAP ECC / S4 / Oracle</div>
                </div>

                <div className="text-teal-600 font-bold text-center">
                  <ArrowRight size={20} className="mx-auto hidden md:block" />
                  <span className="md:hidden">↓</span>
                  <div className="text-micro text-grey-500 mt-0.5">Delta Extract</div>
                </div>

                <div className="rounded-xl border-2 border-teal-600 bg-teal-50/50 p-4 shadow-sm">
                  <div className="font-display text-dense font-bold text-teal-900">UniMat Hub</div>
                  <div className="text-micro text-teal-700 mt-1">AI Matching & Safety Vetoes</div>
                </div>

                <div className="text-teal-600 font-bold text-center">
                  <ArrowRight size={20} className="mx-auto hidden md:block" />
                  <span className="md:hidden">↓</span>
                  <div className="text-micro text-grey-500 mt-0.5">Harmonised Sync</div>
                </div>

                <div className="rounded-xl border border-grey-200 bg-grey-50 p-4">
                  <div className="font-mono text-caption font-bold text-high-800">MARA-NORMT / BISMT</div>
                  <div className="text-micro text-grey-500 mt-1">Zero Renumbering</div>
                </div>
              </div>
            </div>
          </Panel>
        </div>
      )}
    </div>
  );
}
