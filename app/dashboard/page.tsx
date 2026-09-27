'use client';

import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  Ban,
  CircleAlert,
  Database,
  HelpCircle,
  Info,
  Layers,
  Percent,
  Ruler,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CountUp } from '@/components/ui/count-up';
import { Dialog, DialogSection, LoadingBar, PageHeader, Panel, SummaryCard } from '@/components/ui/primitives';
import { CategoryChip, MATCH_TONE, OrgChip, StatusBadge } from '@/components/ui/status';
import { api } from '@/lib/client/api';
import { useTokens } from '@/lib/client/tokens';
import { cx, fmtDateTime, fmtInr, fmtPct, humanize } from '@/lib/format';
import { staggerChild, staggerParent } from '@/lib/motion';

interface Dash {
  totals: Record<string, number>;
  categories: {
    category: string;
    records: number;
    mapped: number;
    canonical: number;
    pending: number;
    duplicates: number;
  }[];
  matchTypes: { type: string; n: number }[];
  orgs: {
    code: string;
    name: string;
    sector: string;
    records: number;
    mapped: number;
    pending: number;
    completeness: number;
    uom_issues: number;
  }[];
  timeline: { day: string; approved: number; rejected: number }[];
  flags: { flag: string; n: number }[];
  funnel: Record<string, number>;
  lastRun: Record<string, unknown> | null;
  opportunities: {
    count: number;
    totalSpend: number;
    totalSaving: number;
    top: {
      id: string;
      cnmc: string;
      description: string;
      category: string;
      orgs: number;
      orgCodes: string[];
      spend: number;
      estSaving: number;
    }[];
  };
}

type MetricModal =
  | 'ingested'
  | 'canonical'
  | 'reduction'
  | 'duplicates'
  | 'pending'
  | 'vetoes'
  | 'insufficient'
  | 'uom'
  | 'stewards'
  | null;

const tipStyle = {
  contentStyle: {
    borderRadius: 6,
    border: '1px solid rgb(var(--c-grey-200))',
    fontSize: 12,
    padding: '6px 10px',
    backgroundColor: '#ffffff',
    boxShadow: 'var(--shadow-pop)',
  },
  cursor: { fill: 'rgb(var(--c-grey-100))' },
};

export default function Dashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api<Dash>('/api/dashboard'),
  });
  const tk = useTokens();
  const [activeModal, setActiveModal] = useState<MetricModal>(null);
  const [selectedCategory, setSelectedCategory] = useState<Dash['categories'][0] | null>(null);

  if (isLoading || !data) return <LoadingBar label="Computing national material master analytics" />;

  const t = data.totals;
  const cats = data.categories
    .filter((c) => c.category !== 'PENDING')
    .map((c) => ({
      ...c,
      label: humanize(c.category),
      remaining: c.records - c.mapped,
      percent: c.records > 0 ? (c.mapped / c.records) * 100 : 0,
    }));

  const types = [
    'IDENTICAL',
    'DUPLICATE',
    'NEAR_DUPLICATE',
    'FUNCTIONALLY_EQUIVALENT',
    'RELATED_BUT_NOT_EQUIVALENT',
    'INSUFFICIENT_DATA',
    'NOT_MATCHED',
  ]
    .map((k) => ({
      type: k,
      label: humanize(k).replace('Related but not equivalent', 'Related (not equiv.)'),
      n: data.matchTypes.find((m) => m.type === k)?.n ?? 0,
    }))
    .filter((x) => x.n > 0);

  const toneColor = (type: string) =>
    ({
      high: tk['high-600'],
      amber: tk['amber-500'],
      veto: tk['veto-600'],
      neutral: tk['grey-400'],
    })[MATCH_TONE[type] as 'high' | 'amber' | 'veto' | 'neutral'] ?? tk['grey-400'];

  const funnel = [
    { k: 'ingested', label: '1. Ingested raw records' },
    { k: 'normalized', label: '2. Text & UOM normalized' },
    { k: 'classified', label: '3. Classified & embedded' },
    { k: 'matched', label: '4. Candidate pairs evaluated' },
    { k: 'harmonised', label: '5. Mapped to CNMC' },
  ];

  const tl = data.timeline.map((d) => ({ ...d, label: d.day.slice(5) }));
  const flags = data.flags.filter((f) => !['PART_NUMBER_MISSING'].includes(f.flag)).slice(0, 6);
  const flagMax = Math.max(1, ...flags.map((f) => f.n));

  return (
    <div className="space-y-3">
      <PageHeader
        eyebrow="Enterprise Overview"
        title="Material analytics"
        description={`${t.records.toLocaleString('en-IN')} legacy items across ${t.orgs} CPSEs harmonised into ${t.canonical} Common National Material Codes.`}
        actions={
          <div className="flex items-center gap-2">
            <Link
              href="/ingest"
              className="inline-flex h-8 items-center gap-1.5 rounded border border-grey-300 bg-white px-3 text-caption font-medium text-grey-800 hover:bg-grey-50 transition-colors"
            >
              Upload extract
            </Link>
            <Link
              href="/review"
              className="inline-flex h-8 items-center gap-2 rounded border border-primary-900 bg-primary-800 px-3.5 text-caption font-medium text-white hover:bg-primary-900 transition-colors"
            >
              Review queue <ArrowRight size={13} />
            </Link>
          </div>
        }
      />

      {/* Summary-first primary metric cards — click opens detail dialog */}
      <motion.div variants={staggerParent} initial="initial" animate="animate" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <motion.div variants={staggerChild}>
          <SummaryCard
            label="Records ingested"
            value={<CountUp value={t.records} />}
            hint={`${t.orgs} CPSEs connected`}
            icon={<Layers size={14} />}
            onClick={() => setActiveModal('ingested')}
          />
        </motion.div>
        <motion.div variants={staggerChild}>
          <SummaryCard
            label="National codes"
            value={<CountUp value={t.canonical} />}
            hint={`${t.mapped} legacy codes mapped`}
            tone="high"
            icon={<ShieldCheck size={14} />}
            onClick={() => setActiveModal('canonical')}
          />
        </motion.div>
        <motion.div variants={staggerChild}>
          <SummaryCard
            label="Code reduction"
            value={<CountUp value={t.codeReduction * 100} format={(n) => `${n.toFixed(1)}%`} />}
            hint="Catalog compression"
            tone="teal"
            icon={<Percent size={14} />}
            onClick={() => setActiveModal('reduction')}
          />
        </motion.div>
        <motion.div variants={staggerChild}>
          <SummaryCard
            label="Duplicates detected"
            value={<CountUp value={t.duplicates} />}
            hint={`+ ${t.functional} functional equivalents`}
            icon={<Sparkles size={14} />}
            onClick={() => setActiveModal('duplicates')}
          />
        </motion.div>
        <motion.div variants={staggerChild}>
          <SummaryCard
            label="Pending review"
            value={<CountUp value={t.pending} />}
            hint="AI suggestions awaiting steward"
            tone="amber"
            icon={<CircleAlert size={14} />}
            onClick={() => setActiveModal('pending')}
          />
        </motion.div>
        <motion.div variants={staggerChild}>
          <SummaryCard
            label="Safety vetoes"
            value={<CountUp value={t.vetoes} />}
            hint="False friends blocked by rules"
            tone="veto"
            icon={<Ban size={14} />}
            onClick={() => setActiveModal('vetoes')}
          />
        </motion.div>
      </motion.div>

      {/* Secondary summary bar: compact stats with on-demand click detail */}
      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
        <button
          type="button"
          onClick={() => setActiveModal('insufficient')}
          className="group panel flex items-center justify-between p-3.5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-grey-300 hover:shadow-card-hover"
        >
          <div className="flex items-center gap-3 min-w-0">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-amber-200/80 bg-amber-50 text-amber-700 shadow-sm">
              <HelpCircle size={15} />
            </span>
            <div className="min-w-0">
              <div className="eyebrow font-bold text-grey-500">Insufficient data</div>
              <div className="mt-0.5 font-display text-lead font-bold text-grey-900 tracking-tight">
                <CountUp value={t.insufficient} /> <span className="text-caption font-normal text-grey-500">records missing attrs</span>
              </div>
            </div>
          </div>
          <span className="text-micro font-semibold text-teal-700 opacity-80 group-hover:opacity-100 transition-opacity">Details →</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveModal('uom')}
          className="group panel flex items-center justify-between p-3.5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-grey-300 hover:shadow-card-hover"
        >
          <div className="flex items-center gap-3 min-w-0">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-teal-200/80 bg-teal-50 text-teal-700 shadow-sm">
              <Ruler size={15} />
            </span>
            <div className="min-w-0">
              <div className="eyebrow font-bold text-grey-500">UOM inconsistencies</div>
              <div className="mt-0.5 font-display text-lead font-bold text-grey-900 tracking-tight">
                <CountUp value={t.uom_issues} /> <span className="text-caption font-normal text-grey-500">standardised units</span>
              </div>
            </div>
          </div>
          <span className="text-micro font-semibold text-teal-700 opacity-80 group-hover:opacity-100 transition-opacity">Details →</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveModal('stewards')}
          className="group panel flex items-center justify-between p-3.5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-grey-300 hover:shadow-card-hover"
        >
          <div className="flex items-center gap-3 min-w-0">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-high-200/80 bg-high-50 text-high-700 shadow-sm">
              <Users size={15} />
            </span>
            <div className="min-w-0">
              <div className="eyebrow font-bold text-grey-500">Steward decisions</div>
              <div className="mt-0.5 font-display text-lead font-bold text-grey-900 tracking-tight">
                <CountUp value={t.approved} /> <span className="text-caption font-normal text-grey-500">approved · {t.rejected} rejected</span>
              </div>
            </div>
          </div>
          <span className="text-micro font-semibold text-teal-700 opacity-80 group-hover:opacity-100 transition-opacity">Audit trail →</span>
        </button>
      </div>

      {/* Main Charts: Category Harmonisation & AI Match Type Breakdown */}
      <div className="mt-3 grid grid-cols-12 gap-3">
        <Panel
          className="col-span-12 lg:col-span-7"
          title="Harmonisation by category"
          subtitle="Click any category row for detailed attribute schema & counts"
          actions={
            <Legend
              items={[
                { c: tk['primary-600'], l: 'Harmonised' },
                { c: tk['grey-300'], l: 'Not yet harmonised' },
              ]}
            />
          }
        >
          <div className="h-[220px] px-2 pt-2">
            <ResponsiveContainer>
              <BarChart data={cats} layout="vertical" margin={{ left: 8, right: 24, top: 4, bottom: 4 }} barCategoryGap={8}>
                <CartesianGrid horizontal={false} stroke={tk['grey-200']} />
                <XAxis type="number" tick={{ fontSize: 11, fill: tk['grey-500'] }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="label" width={96} tick={{ fontSize: 12, fill: tk['grey-700'] }} axisLine={false} tickLine={false} />
                <Tooltip {...tipStyle} formatter={(v: number, n: string) => [v, n === 'mapped' ? 'Harmonised' : 'Not yet harmonised']} />
                <Bar dataKey="mapped" stackId="a" fill={tk['primary-600']} stroke={tk.white} strokeWidth={2} animationDuration={700} />
                <Bar dataKey="remaining" stackId="a" fill={tk['grey-300']} stroke={tk.white} strokeWidth={2} radius={[0, 4, 4, 0]} animationDuration={700} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <table className="dt border-t border-grey-200">
            <thead>
              <tr>
                <th>Category</th>
                <th className="text-right">Records</th>
                <th className="text-right">Progress</th>
                <th className="text-right">National codes</th>
                <th className="text-right">Pending</th>
              </tr>
            </thead>
            <tbody>
              {cats.map((c) => (
                <tr
                  key={c.category}
                  onClick={() => setSelectedCategory(c)}
                  className="cursor-pointer transition-colors hover:bg-grey-50"
                  title="Click for category details"
                >
                  <td>
                    <CategoryChip code={c.category} long />
                  </td>
                  <td className="tabular text-right">{c.records}</td>
                  <td className="tabular text-right">
                    <span className="inline-flex items-center gap-1.5 font-medium text-grey-800">
                      <span className="h-1.5 w-12 overflow-hidden rounded-full bg-grey-200">
                        <span className="block h-full bg-primary-700" style={{ width: `${c.percent}%` }} />
                      </span>
                      {c.percent.toFixed(0)}%
                    </span>
                  </td>
                  <td className="tabular text-right">{c.canonical}</td>
                  <td className={cx('tabular text-right', c.pending > 0 && 'font-semibold text-amber-800')}>
                    {c.pending}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>

        <div className="col-span-12 space-y-3 lg:col-span-5">
          <Panel
            title="AI recommendations by match type"
            subtitle="Governance routing: green = high confidence, amber = needs review, red = safety veto"
          >
            <div className="h-[210px] px-2 pt-2">
              <ResponsiveContainer>
                <BarChart data={types} layout="vertical" margin={{ left: 8, right: 36, top: 2, bottom: 2 }} barCategoryGap={6}>
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="label" width={140} tick={{ fontSize: 11.5, fill: tk['grey-700'] }} axisLine={false} tickLine={false} />
                  <Tooltip {...tipStyle} formatter={(v: number) => [v, 'recommendations']} />
                  <Bar dataKey="n" radius={[0, 4, 4, 0]} animationDuration={700} label={{ position: 'right', fontSize: 11, fill: tk['grey-700'] }}>
                    {types.map((x) => (
                      <Cell key={x.type} fill={toneColor(x.type)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Panel>

          <Panel title="Pipeline throughput" subtitle="Records successfully advancing through each stage">
            <div className="space-y-2 px-4 py-3">
              {funnel.map((f, i) => {
                const v = data.funnel[f.k] ?? 0;
                const pct = v / Math.max(1, data.funnel.ingested);
                return (
                  <div key={f.k} className="grid grid-cols-[160px_1fr_60px] items-center gap-3 text-caption">
                    <span className="truncate text-grey-700 font-medium">
                      {f.label}
                    </span>
                    <span className="h-2 overflow-hidden rounded bg-grey-100">
                      <motion.span
                        className="block h-full rounded bg-primary-600"
                        initial={{ width: 0 }}
                        animate={{ width: `${pct * 100}%` }}
                        transition={{ duration: 0.7, delay: i * 0.08, ease: [0.2, 0, 0, 1] }}
                      />
                    </span>
                    <span className="tabular text-right font-mono text-micro text-grey-800">
                      {v}
                    </span>
                  </div>
                );
              })}
            </div>
          </Panel>
        </div>
      </div>

      {/* CPSE Participation & Procurement Opportunities */}
      <div className="mt-3 grid grid-cols-12 gap-3">
        <Panel
          className="col-span-12 lg:col-span-7"
          title="CPSE participation & data quality"
          subtitle="Harmonisation rates across participating organizations"
          bodyClassName="overflow-x-auto"
        >
          <table className="dt">
            <thead>
              <tr>
                <th>CPSE</th>
                <th>Sector</th>
                <th className="text-right">Records</th>
                <th className="text-right">Harmonised</th>
                <th className="text-right">Completeness</th>
                <th className="text-right">Pending</th>
              </tr>
            </thead>
            <tbody>
              {data.orgs.map((o, i) => (
                <tr key={o.code} className={cx(i % 2 === 1 && 'dt-zebra')}>
                  <td>
                    <span className="flex items-center gap-2">
                      <OrgChip code={o.code} />
                      <span className="max-w-[180px] truncate text-grey-800 font-medium">{o.name}</span>
                    </span>
                  </td>
                  <td className="text-grey-600 text-caption">{o.sector}</td>
                  <td className="tabular text-right">{o.records}</td>
                  <td className="tabular text-right">
                    {o.records ? (
                      <span className="inline-flex items-center gap-2">
                        <span className="h-1.5 w-12 overflow-hidden rounded-full bg-grey-100">
                          <span className="block h-full bg-primary-600" style={{ width: `${(o.mapped / o.records) * 100}%` }} />
                        </span>
                        {fmtPct(o.mapped / o.records, 0)}
                      </span>
                    ) : (
                      <span className="text-grey-400">awaiting data</span>
                    )}
                  </td>
                  <td className="tabular text-right">{o.records ? fmtPct(o.completeness, 0) : '—'}</td>
                  <td className={cx('tabular text-right', o.pending > 0 && 'font-semibold text-amber-800')}>{o.pending}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>

        <Panel
          className="col-span-12 lg:col-span-5"
          title="Procurement opportunity"
          subtitle="Top national codes shared across 3+ CPSEs"
          actions={
            <Link href="/opportunities" className="inline-flex items-center gap-1 text-caption font-medium text-teal-700 hover:underline">
              All {data.opportunities.count} <ArrowRight size={12} />
            </Link>
          }
        >
          <table className="dt">
            <thead>
              <tr>
                <th>National code</th>
                <th>CPSEs</th>
                <th className="text-right">Spend</th>
                <th className="text-right">Est. saving</th>
              </tr>
            </thead>
            <tbody>
              {data.opportunities.top.slice(0, 5).map((o) => (
                <tr key={o.id}>
                  <td className="max-w-[200px]">
                    <Link
                      href={`/mappings?q=${encodeURIComponent(o.cnmc)}`}
                      className="block truncate font-mono text-caption text-primary-800 hover:underline"
                      title={o.cnmc}
                    >
                      {o.cnmc}
                    </Link>
                    <div className="truncate text-micro text-grey-500" title={o.description}>{o.description}</div>
                  </td>
                  <td>
                    <span className="flex flex-wrap gap-0.5">
                      {o.orgCodes.map((c) => (
                        <OrgChip key={c} code={c} />
                      ))}
                    </span>
                  </td>
                  <td className="tabular text-right text-caption">{fmtInr(o.spend)}</td>
                  <td className="tabular text-right font-medium text-high-700 text-caption">{fmtInr(o.estSaving)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>

      {/* DETAIL DIALOGS (Summary-first, detail-on-demand pattern) */}

      {/* 1. Records Ingested Dialog */}
      <Dialog
        open={activeModal === 'ingested'}
        onClose={() => setActiveModal(null)}
        title="Records Ingested Breakdown"
        subtitle={`Total of ${t.records.toLocaleString('en-IN')} legacy material records across ${t.orgs} CPSEs`}
        width={680}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded border border-grey-200 bg-grey-25 p-3 text-center">
              <div className="eyebrow">Total Records</div>
              <div className="font-display text-title font-bold text-primary-900">{t.records}</div>
            </div>
            <div className="rounded border border-grey-200 bg-grey-25 p-3 text-center">
              <div className="eyebrow">Connected CPSEs</div>
              <div className="font-display text-title font-bold text-primary-900">{t.orgs}</div>
            </div>
            <div className="rounded border border-grey-200 bg-grey-25 p-3 text-center">
              <div className="eyebrow">Abbreviations Expanded</div>
              <div className="font-display text-title font-bold text-teal-700">{t.abbreviations.toLocaleString('en-IN')}</div>
            </div>
          </div>

          <DialogSection title="Organization Ingestion Volume" subtitle="Number of raw records ingested per CPSE ERP">
            <div className="space-y-2">
              {data.orgs.map((o) => (
                <div key={o.code} className="flex items-center justify-between text-dense">
                  <div className="flex items-center gap-2">
                    <OrgChip code={o.code} />
                    <span className="font-medium text-grey-800">{o.name}</span>
                    <span className="text-micro text-grey-500">({o.sector})</span>
                  </div>
                  <span className="font-mono text-caption font-semibold">{o.records} records</span>
                </div>
              ))}
            </div>
          </DialogSection>

          <DialogSection title="Ingestion Principles" subtitle="PRD §2 Core Design Principles">
            <ul className="list-disc pl-4 text-caption space-y-1 text-grey-700">
              <li><b>Additive & Idempotent:</b> Source ERP material records are preserved untouched in <code>raw_material_records</code>.</li>
              <li><b>Zero Renumbering:</b> Legacy codes remain permanent identifiers in source CPSE ERPs (SAP ECC, S/4HANA, Oracle).</li>
              <li><b>Lineage & Traceability:</b> Every extracted attribute and normalized token traces directly back to its raw extract.</li>
            </ul>
          </DialogSection>
        </div>
      </Dialog>

      {/* 2. National Codes Dialog */}
      <Dialog
        open={activeModal === 'canonical'}
        onClose={() => setActiveModal(null)}
        title="Common National Material Code (CNMC) Registry"
        subtitle={`${t.canonical} standardized national codes created covering ${t.mapped} legacy CPSE codes`}
        width={680}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded border border-grey-200 bg-grey-25 p-3 text-center">
              <div className="eyebrow">National Codes</div>
              <div className="font-display text-title font-bold text-high-700">{t.canonical}</div>
            </div>
            <div className="rounded border border-grey-200 bg-grey-25 p-3 text-center">
              <div className="eyebrow">Mapped Legacy Codes</div>
              <div className="font-display text-title font-bold text-primary-900">{t.mapped}</div>
            </div>
            <div className="rounded border border-grey-200 bg-grey-25 p-3 text-center">
              <div className="eyebrow">Avg Codes per CNMC</div>
              <div className="font-display text-title font-bold text-teal-700">
                {t.canonical > 0 ? (t.mapped / t.canonical).toFixed(1) : '1.0'}x
              </div>
            </div>
          </div>

          <DialogSection title="Category Distribution" subtitle="Active CNMCs per governed family">
            <div className="grid grid-cols-2 gap-2 text-dense">
              {cats.map((c) => (
                <div key={c.category} className="flex items-center justify-between rounded border border-grey-200 bg-white p-2">
                  <CategoryChip code={c.category} />
                  <span className="font-mono text-caption font-semibold">{c.canonical} CNMCs</span>
                </div>
              ))}
            </div>
          </DialogSection>

          <div className="flex justify-end">
            <Link
              href="/mappings"
              className="inline-flex items-center gap-1 text-caption font-medium text-teal-700 hover:underline"
              onClick={() => setActiveModal(null)}
            >
              Open national material register →
            </Link>
          </div>
        </div>
      </Dialog>

      {/* 3. Code Reduction Dialog */}
      <Dialog
        open={activeModal === 'reduction'}
        onClose={() => setActiveModal(null)}
        title="Material Code Reduction Analytics"
        subtitle="Catalog compression achieved by collapsing duplicate legacy items into shared CNMCs"
        width={600}
      >
        <div className="space-y-4 text-dense">
          <div className="rounded-lg border border-teal-600/30 bg-teal-50/50 p-4">
            <div className="eyebrow !text-teal-800">Catalog Reduction Rate</div>
            <div className="mt-1 font-display text-hero font-bold text-teal-900">
              {(t.codeReduction * 100).toFixed(1)}%
            </div>
            <p className="mt-1 text-caption text-teal-800">
              {t.mapped} legacy codes collapsed into {t.canonical} distinct National Material Codes.
            </p>
          </div>

          <DialogSection title="Formula & Governance Meaning">
            <p className="text-caption text-grey-700 leading-relaxed">
              Reduction is defined as <code>(Mapped Legacy Codes - Canonical Codes) / Mapped Legacy Codes</code>.
              When multiple CPSEs purchase identical physical items with disparate internal part numbers, BharatM3 establishes a single Common National Material Code without altering internal ERP numbering.
            </p>
          </DialogSection>
        </div>
      </Dialog>

      {/* 4. Duplicates & Equivalents Dialog */}
      <Dialog
        open={activeModal === 'duplicates'}
        onClose={() => setActiveModal(null)}
        title="Duplicate Detection & Functional Equivalents"
        subtitle="AI classification of matching pairs across CPSE boundaries"
        width={640}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded border border-grey-200 bg-grey-25 p-3">
              <div className="eyebrow">Exact / Near Duplicates</div>
              <div className="font-display text-title font-bold text-primary-900">{t.duplicates} pairs</div>
              <p className="mt-1 text-micro text-grey-500">Same manufacturer part, specification, or dimensional fingerprint.</p>
            </div>
            <div className="rounded border border-grey-200 bg-grey-25 p-3">
              <div className="eyebrow">Functional Equivalents</div>
              <div className="font-display text-title font-bold text-amber-800">{t.functional} pairs</div>
              <p className="mt-1 text-micro text-grey-500">Different OEM or make, but fully interchangeable duty specs.</p>
            </div>
          </div>

          <DialogSection title="Recommendation Types" subtitle="Hybrid scoring breakdown">
            <div className="space-y-1.5">
              {types.map((type) => (
                <div key={type.type} className="flex items-center justify-between text-caption">
                  <span className="font-medium text-grey-800">{type.label}</span>
                  <span className="font-mono font-semibold">{type.n}</span>
                </div>
              ))}
            </div>
          </DialogSection>
        </div>
      </Dialog>

      {/* 5. Pending Review Queue Dialog */}
      <Dialog
        open={activeModal === 'pending'}
        onClose={() => setActiveModal(null)}
        title="Pending Steward Review Queue"
        subtitle={`${t.pending} AI recommendations currently awaiting human-in-the-loop decisions`}
        width={600}
      >
        <div className="space-y-4 text-dense">
          <div className="rounded-md border border-amber-500/40 bg-amber-50 p-3.5">
            <div className="flex items-center gap-2 font-semibold text-amber-900">
              <CircleAlert size={16} /> Human-in-the-Loop Governance
            </div>
            <p className="mt-1 text-caption text-amber-800 leading-relaxed">
              AI suggests matches and builds attribute comparisons, but only certified CPSE domain stewards hold the authority to approve, edit, or reject canonical mappings.
            </p>
          </div>

          <DialogSection title="Review Queue Organization">
            <ul className="list-disc pl-4 text-caption space-y-1.5 text-grey-700">
              <li><b>Fast-track Queue:</b> Deterministic exact matches (Score ≥ 0.95) with matching OEM MPN or dimensional identity.</li>
              <li><b>Full Review Queue:</b> Functional equivalents and near-duplicates requiring side-by-side engineering comparison.</li>
              <li><b>Needs Info Queue:</b> Candidate pairs flagged for clarification from the source CPSE.</li>
            </ul>
          </DialogSection>

          <div className="flex justify-end pt-2">
            <Link
              href="/review"
              className="inline-flex h-8 items-center gap-2 rounded border border-primary-900 bg-primary-800 px-3.5 text-dense font-medium text-white hover:bg-primary-900"
              onClick={() => setActiveModal(null)}
            >
              Open review workbench <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </Dialog>

      {/* 6. Safety Vetoes Dialog */}
      <Dialog
        open={activeModal === 'vetoes'}
        onClose={() => setActiveModal(null)}
        title="Hard Safety Exclusion Vetoes"
        subtitle={`${t.vetoes} pairs with high text similarity blocked by deterministic safety rules`}
        width={640}
      >
        <div className="space-y-4">
          <div className="rounded-md border border-veto-600/40 bg-veto-50 p-3.5">
            <div className="flex items-center gap-2 font-semibold text-veto-900">
              <Ban size={16} className="text-veto-700" /> Safety Exclusion Guarantee
            </div>
            <p className="mt-1 text-caption text-veto-800 leading-relaxed">
              High semantic similarity is strictly vetoed when critical engineering properties differ (e.g. Class 150 vs Class 300 valves, HT vs LT cables).
            </p>
          </div>

          <DialogSection title="Protected Safety Rules" subtitle="Hard exclusions defined in PRD §6.2">
            <ul className="list-disc pl-4 text-caption space-y-1.5 text-grey-700">
              <li><b>Valves:</b> Pressure class mismatch, body material grade mismatch, seat rating.</li>
              <li><b>Cables:</b> Voltage grade (1.1kV vs 11kV), conductor material (Copper vs Aluminum), armoring.</li>
              <li><b>Bearings:</b> Bore / OD / width tolerance conflicts, radial clearance (C3 vs Standard).</li>
              <li><b>Fasteners:</b> Material grade (B7 vs B8M), thread standard (Metric vs Imperial).</li>
            </ul>
          </DialogSection>

          <div className="flex justify-end pt-2">
            <Link
              href="/review?tab=VETOED"
              className="inline-flex items-center gap-1 text-caption font-medium text-veto-700 hover:underline"
              onClick={() => setActiveModal(null)}
            >
              Inspect vetoed pairs in review queue →
            </Link>
          </div>
        </div>
      </Dialog>

      {/* 7. Insufficient Data Dialog */}
      <Dialog
        open={activeModal === 'insufficient'}
        onClose={() => setActiveModal(null)}
        title="Insufficient Data & Incomplete Attributes"
        subtitle={`${t.insufficient} records missing required attributes for their category schema`}
        width={600}
      >
        <div className="space-y-4">
          <DialogSection title="Quality Findings" subtitle="Top missing attribute flags">
            <div className="space-y-2">
              {flags.map((f) => (
                <div key={f.flag} className="flex items-center justify-between text-caption">
                  <span className="font-mono text-micro text-grey-700">{f.flag}</span>
                  <span className="font-mono font-semibold text-amber-800">{f.n} records</span>
                </div>
              ))}
            </div>
          </DialogSection>
          <p className="text-caption text-grey-600">
            Records missing critical attributes are segregated into the Unresolved queue and routed for CPSE catalog enrichment.
          </p>
        </div>
      </Dialog>

      {/* 8. UOM Inconsistencies Dialog */}
      <Dialog
        open={activeModal === 'uom'}
        onClose={() => setActiveModal(null)}
        title="Unit of Measure Normalization"
        subtitle={`${t.uom_issues} non-standard, ambiguous, or mismatched units harmonised`}
        width={600}
      >
        <div className="space-y-4 text-dense">
          <DialogSection title="UOM Master & Conversion Engine">
            <p className="text-caption text-grey-700 leading-relaxed">
              Disparate CPSE extracts report quantities in varied units (e.g., <code>NOS</code>, <code>NUM</code>, <code>EA</code>, <code>PC</code> → standardized to <code>EA</code>; metric tonne vs meter for cable context).
            </p>
          </DialogSection>
          <div className="flex justify-end">
            <Link
              href="/dictionary"
              className="inline-flex items-center gap-1 text-caption font-medium text-teal-700 hover:underline"
              onClick={() => setActiveModal(null)}
            >
              View UOM conversion master →
            </Link>
          </div>
        </div>
      </Dialog>

      {/* 9. Steward Governance & Audit Dialog */}
      <Dialog
        open={activeModal === 'stewards'}
        onClose={() => setActiveModal(null)}
        title="Steward Governance & Audit Trail"
        subtitle={`${t.approved} approvals · ${t.rejected} rejections · ${t.audit_events.toLocaleString('en-IN')} cryptographic audit events`}
        width={620}
      >
        <div className="space-y-4 text-dense">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded border border-high-600/30 bg-high-50 p-3">
              <div className="eyebrow !text-high-800">Approved Matches</div>
              <div className="font-display text-title font-bold text-high-900">{t.approved}</div>
            </div>
            <div className="rounded border border-veto-600/30 bg-veto-50 p-3">
              <div className="eyebrow !text-veto-800">Rejected Recommendations</div>
              <div className="font-display text-title font-bold text-veto-900">{t.rejected}</div>
            </div>
          </div>

          <DialogSection title="SHA-256 Hash Chained Audit Trail">
            <p className="text-caption text-grey-700 leading-relaxed">
              Every decision, edit, mapping reversal, and ingestion is immutably recorded in <code>audit_events</code> with a forward cryptographic hash chain ensuring non-repudiation.
            </p>
          </DialogSection>

          <div className="flex justify-end">
            <Link
              href="/audit"
              className="inline-flex items-center gap-1 text-caption font-medium text-teal-700 hover:underline"
              onClick={() => setActiveModal(null)}
            >
              Open full audit trail →
            </Link>
          </div>
        </div>
      </Dialog>

      {/* 10. Category Detail Dialog */}
      {selectedCategory && (
        <Dialog
          open={!!selectedCategory}
          onClose={() => setSelectedCategory(null)}
          title={`Category: ${humanize(selectedCategory.category)}`}
          subtitle="Detailed harmonisation progress & metrics for this material family"
          width={600}
        >
          <div className="space-y-4 text-dense">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded border border-grey-200 bg-grey-25 p-3">
                <div className="eyebrow">Total Ingested</div>
                <div className="font-display text-title font-bold">{selectedCategory.records}</div>
              </div>
              <div className="rounded border border-grey-200 bg-grey-25 p-3">
                <div className="eyebrow">Harmonised to CNMC</div>
                <div className="font-display text-title font-bold text-high-700">{selectedCategory.mapped}</div>
              </div>
              <div className="rounded border border-grey-200 bg-grey-25 p-3">
                <div className="eyebrow">National Codes (CNMC)</div>
                <div className="font-display text-title font-bold text-primary-900">{selectedCategory.canonical}</div>
              </div>
              <div className="rounded border border-grey-200 bg-grey-25 p-3">
                <div className="eyebrow">Pending Review</div>
                <div className="font-display text-title font-bold text-amber-800">{selectedCategory.pending}</div>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Link
                href={`/records?cat=${selectedCategory.category}`}
                className="inline-flex items-center gap-1 text-caption font-medium text-teal-700 hover:underline"
                onClick={() => setSelectedCategory(null)}
              >
                Browse {humanize(selectedCategory.category)} records →
              </Link>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}

function Legend({ items }: { items: { c: string; l: string }[] }) {
  return (
    <span className="flex items-center gap-3">
      {items.map((i) => (
        <span key={i.l} className="flex items-center gap-1.5 text-caption text-grey-600">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: i.c }} />
          {i.l}
        </span>
      ))}
    </span>
  );
}
