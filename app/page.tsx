'use client';

import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { ArrowRight, Ban, CircleAlert, Layers, Ruler, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CountUp } from '@/components/ui/count-up';
import { LoadingBar, PageHeader, Panel } from '@/components/ui/primitives';
import { CategoryChip, MATCH_TONE, OrgChip } from '@/components/ui/status';
import { api } from '@/lib/client/api';
import { useTokens } from '@/lib/client/tokens';
import { cx, fmtDateTime, fmtInr, fmtPct, humanize } from '@/lib/format';
import { staggerChild, staggerParent } from '@/lib/motion';

interface Dash {
  totals: Record<string, number>;
  categories: { category: string; records: number; mapped: number; canonical: number; pending: number; duplicates: number }[];
  matchTypes: { type: string; n: number }[];
  orgs: { code: string; name: string; sector: string; records: number; mapped: number; pending: number; completeness: number; uom_issues: number }[];
  timeline: { day: string; approved: number; rejected: number }[];
  flags: { flag: string; n: number }[];
  funnel: Record<string, number>;
  lastRun: Record<string, unknown> | null;
  opportunities: { count: number; totalSpend: number; totalSaving: number; top: { id: string; cnmc: string; description: string; category: string; orgs: number; orgCodes: string[]; spend: number; estSaving: number }[] };
}

function Kpi({ label, value, sub, tone, icon, href, format }: { label: string; value: number; sub?: ReactNode; tone?: 'amber' | 'veto' | 'high'; icon?: ReactNode; href?: string; format?: (n: number) => string }) {
  const body = (
    <motion.div variants={staggerChild} className={cx('panel group h-full px-4 py-3 transition-colors', href && 'hover:border-grey-300')}>
      <div className="flex items-center justify-between">
        <span className="eyebrow">{label}</span>
        <span className={cx(tone === 'amber' ? 'text-amber-600' : tone === 'veto' ? 'text-veto-600' : tone === 'high' ? 'text-high-600' : 'text-grey-400')}>{icon}</span>
      </div>
      <div className={cx('mt-1 font-display text-display font-semibold', tone === 'amber' ? 'text-amber-800' : 'text-grey-900')}>
        <CountUp value={value} format={format} />
      </div>
      {sub && <div className="mt-0.5 text-caption text-grey-500">{sub}</div>}
    </motion.div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

const tip = { contentStyle: { borderRadius: 5, border: '1px solid rgb(var(--c-grey-200))', fontSize: 12, padding: '6px 10px', boxShadow: 'var(--shadow-pop)' }, cursor: { fill: 'rgb(var(--c-grey-100))' } };

export default function Dashboard() {
  const { data, isLoading } = useQuery({ queryKey: ['dashboard'], queryFn: () => api<Dash>('/api/dashboard') });
  const tk = useTokens();
  if (isLoading || !data) return <LoadingBar label="Computing material master analytics" />;
  const t = data.totals;
  const cats = data.categories.filter((c) => c.category !== 'PENDING').map((c) => ({ ...c, label: humanize(c.category), remaining: c.records - c.mapped }));
  const types = ['IDENTICAL', 'DUPLICATE', 'NEAR_DUPLICATE', 'FUNCTIONALLY_EQUIVALENT', 'RELATED_BUT_NOT_EQUIVALENT', 'INSUFFICIENT_DATA', 'NOT_MATCHED']
    .map((k) => ({ type: k, label: humanize(k).replace('Related but not equivalent', 'Related (not equiv.)'), n: data.matchTypes.find((m) => m.type === k)?.n ?? 0 }))
    .filter((x) => x.n > 0);
  const toneColor = (type: string) => ({ high: tk['high-600'], amber: tk['amber-500'], veto: tk['veto-600'], neutral: tk['grey-400'] })[MATCH_TONE[type] as 'high' | 'amber' | 'veto' | 'neutral'] ?? tk['grey-400'];
  const funnel = [
    { k: 'ingested', label: 'Ingested' },
    { k: 'normalized', label: 'Normalized' },
    { k: 'classified', label: 'Classified' },
    { k: 'matched', label: 'Matched' },
    { k: 'harmonised', label: 'Harmonised (mapped)' },
  ];
  const tl = data.timeline.map((d) => ({ ...d, label: d.day.slice(5) }));
  const flags = data.flags.filter((f) => !['PART_NUMBER_MISSING'].includes(f.flag)).slice(0, 8);
  const flagMax = Math.max(1, ...flags.map((f) => f.n));

  return (
    <div>
      <PageHeader
        eyebrow="One Nation – One Material Code"
        title="Material master analytics"
        description={`${t.records.toLocaleString('en-IN')} legacy material records from ${t.orgs} CPSEs, harmonised into ${t.canonical} Common National Material Codes. All figures below are computed live from the database.`}
        actions={
          <Link href="/review" className="inline-flex h-8 items-center gap-2 rounded border border-primary-900 bg-primary-800 px-3.5 text-dense font-medium text-white hover:bg-primary-900">
            Open review queue <ArrowRight size={14} />
          </Link>
        }
      />

      <motion.div variants={staggerParent} initial="initial" animate="animate" className="grid grid-cols-6 gap-3">
        <Kpi label="Records ingested" value={t.records} sub={`${t.orgs} CPSEs · ${t.abbreviations.toLocaleString('en-IN')} abbreviations expanded`} icon={<Layers size={15} />} href="/records" />
        <Kpi label="National codes (CNMC)" value={t.canonical} sub={`${t.mapped} legacy codes mapped`} icon={<ShieldCheck size={15} />} tone="high" href="/mappings" />
        <Kpi label="Code reduction" value={t.codeReduction * 100} format={(n) => `${n.toFixed(1)}%`} sub="legacy codes collapsed into national codes" />
        <Kpi label="Duplicates detected" value={t.duplicates} sub={`+ ${t.functional} functional equivalents`} />
        <Kpi label="Pending review" value={t.pending} sub="AI suggestions awaiting a steward" tone="amber" icon={<CircleAlert size={15} />} href="/review" />
        <Kpi label="Safety vetoes" value={t.vetoes} sub="false friends blocked by rules" tone="veto" icon={<Ban size={15} />} href="/review?tab=VETOED" />
      </motion.div>

      <div className="mt-3 grid grid-cols-6 gap-3">
        <div className="panel col-span-2 px-4 py-3">
          <div className="eyebrow">Insufficient data</div>
          <div className="mt-1 flex items-baseline gap-2 font-display text-title font-semibold">
            <CountUp value={t.insufficient} /> <span className="text-caption font-normal text-grey-500">records missing a required attribute · {t.unclassified} unclassified</span>
          </div>
        </div>
        <div className="panel col-span-2 px-4 py-3">
          <div className="eyebrow flex items-center gap-1.5">
            <Ruler size={11} /> UOM inconsistencies
          </div>
          <div className="mt-1 flex items-baseline gap-2 font-display text-title font-semibold">
            <CountUp value={t.uom_issues} /> <span className="text-caption font-normal text-grey-500">non-standard / ambiguous / mismatched units normalised</span>
          </div>
        </div>
        <div className="panel col-span-2 px-4 py-3">
          <div className="eyebrow">Steward decisions</div>
          <div className="mt-1 flex items-baseline gap-2 font-display text-title font-semibold">
            <CountUp value={t.approved} /> <span className="text-caption font-normal text-grey-500">approved · {t.rejected} rejected · {t.audit_events.toLocaleString('en-IN')} audit events</span>
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-12 gap-3">
        <Panel className="col-span-7" title="Harmonisation by category" subtitle="Legacy records mapped to a national code vs. not yet harmonised" actions={<Legend items={[{ c: tk['primary-600'], l: 'Harmonised' }, { c: tk['grey-300'], l: 'Not yet harmonised' }]} />}>
          <div className="h-[230px] px-2 pt-2">
            <ResponsiveContainer>
              <BarChart data={cats} layout="vertical" margin={{ left: 8, right: 24, top: 4, bottom: 4 }} barCategoryGap={8}>
                <CartesianGrid horizontal={false} stroke={tk['grey-200']} />
                <XAxis type="number" tick={{ fontSize: 11, fill: tk['grey-500'] }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="label" width={96} tick={{ fontSize: 12, fill: tk['grey-700'] }} axisLine={false} tickLine={false} />
                <Tooltip {...tip} formatter={(v: number, n: string) => [v, n === 'mapped' ? 'Harmonised' : 'Not yet harmonised']} />
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
                <th className="text-right">Duplicate pairs</th>
                <th className="text-right">National codes</th>
                <th className="text-right">Pending</th>
              </tr>
            </thead>
            <tbody>
              {cats.map((c) => (
                <tr key={c.category}>
                  <td><CategoryChip code={c.category} long /></td>
                  <td className="tabular text-right">{c.records}</td>
                  <td className="tabular text-right">{c.duplicates}</td>
                  <td className="tabular text-right">{c.canonical}</td>
                  <td className={cx('tabular text-right', c.pending > 0 && 'font-semibold text-amber-800')}>{c.pending}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>

        <div className="col-span-5 space-y-3">
          <Panel title="AI recommendations by match type" subtitle="Colour = governance meaning: green high-confidence, amber needs human judgement, red vetoed">
            <div className="h-[208px] px-2 pt-2">
              <ResponsiveContainer>
                <BarChart data={types} layout="vertical" margin={{ left: 8, right: 36, top: 2, bottom: 2 }} barCategoryGap={6}>
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="label" width={140} tick={{ fontSize: 11.5, fill: tk['grey-700'] }} axisLine={false} tickLine={false} />
                  <Tooltip {...tip} formatter={(v: number) => [v, 'recommendations']} />
                  <Bar dataKey="n" radius={[0, 4, 4, 0]} animationDuration={700} label={{ position: 'right', fontSize: 11, fill: tk['grey-700'] }}>
                    {types.map((x) => (
                      <Cell key={x.type} fill={toneColor(x.type)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Panel>
          <Panel title="Pipeline" subtitle="Records reaching each stage">
            <div className="space-y-1.5 px-4 py-3">
              {funnel.map((f, i) => {
                const v = data.funnel[f.k] ?? 0;
                const pct = v / Math.max(1, data.funnel.ingested);
                return (
                  <div key={f.k} className="grid grid-cols-[150px_1fr_70px] items-center gap-3 text-caption">
                    <span className="text-grey-700">
                      <span className="mr-1.5 font-mono text-grey-400">{i + 1}</span>
                      {f.label}
                    </span>
                    <span className="h-2.5 overflow-hidden rounded-sm bg-grey-100">
                      <motion.span className="block h-full rounded-sm bg-primary-600" initial={{ width: 0 }} animate={{ width: `${pct * 100}%` }} transition={{ duration: 0.7, delay: i * 0.08, ease: [0.2, 0, 0, 1] }} />
                    </span>
                    <span className="tabular text-right font-mono text-grey-800">
                      {v} <span className="text-grey-400">{fmtPct(pct, 0)}</span>
                    </span>
                  </div>
                );
              })}
            </div>
          </Panel>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-12 gap-3">
        <Panel className="col-span-7" title="CPSE participation" subtitle="Per-organisation data quality and harmonisation status" bodyClassName="overflow-x-auto">
          <table className="dt">
            <thead>
              <tr>
                <th>CPSE</th>
                <th>Sector</th>
                <th className="text-right">Records</th>
                <th className="text-right">Harmonised</th>
                <th className="text-right">Completeness</th>
                <th className="text-right">UOM issues</th>
                <th className="text-right">Pending</th>
              </tr>
            </thead>
            <tbody>
              {data.orgs.map((o, i) => (
                <tr key={o.code} className={cx(i % 2 === 1 && 'dt-zebra')}>
                  <td>
                    <span className="flex items-center gap-2">
                      <OrgChip code={o.code} />
                      <span className="max-w-[180px] truncate text-grey-700">{o.name}</span>
                    </span>
                  </td>
                  <td className="text-grey-600">{o.sector}</td>
                  <td className="tabular text-right">{o.records}</td>
                  <td className="tabular text-right">
                    {o.records ? (
                      <span className="inline-flex items-center gap-2">
                        <span className="h-1.5 w-14 overflow-hidden rounded-full bg-grey-100">
                          <span className="block h-full bg-primary-600" style={{ width: `${(o.mapped / o.records) * 100}%` }} />
                        </span>
                        {fmtPct(o.mapped / o.records, 0)}
                      </span>
                    ) : (
                      <span className="text-grey-400">awaiting data</span>
                    )}
                  </td>
                  <td className="tabular text-right">{o.records ? fmtPct(o.completeness, 0) : '—'}</td>
                  <td className="tabular text-right">{o.uom_issues}</td>
                  <td className={cx('tabular text-right', o.pending > 0 && 'font-semibold text-amber-800')}>{o.pending}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
        <Panel className="col-span-5" title="Steward decisions · last 30 days" actions={<Legend items={[{ c: tk['high-600'], l: 'Approved' }, { c: tk['veto-600'], l: 'Rejected' }]} />}>
          <div className="h-[236px] px-2 pt-3">
            <ResponsiveContainer>
              <BarChart data={tl} margin={{ left: -18, right: 8, top: 4, bottom: 0 }} barCategoryGap={2}>
                <CartesianGrid vertical={false} stroke={tk['grey-200']} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: tk['grey-500'] }} axisLine={false} tickLine={false} interval={4} />
                <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: tk['grey-500'] }} axisLine={false} tickLine={false} />
                <Tooltip {...tip} labelFormatter={(l) => `Date ${l}`} />
                <Bar dataKey="approved" name="Approved" stackId="d" fill={tk['high-600']} stroke={tk.white} strokeWidth={1} animationDuration={700} />
                <Bar dataKey="rejected" name="Rejected" stackId="d" fill={tk['veto-600']} stroke={tk.white} strokeWidth={1} radius={[3, 3, 0, 0]} animationDuration={700} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      <div className="mt-3 grid grid-cols-12 gap-3">
        <Panel
          className="col-span-7"
          title="Procurement opportunity"
          subtitle="National codes used by 3+ CPSEs — candidates for demand aggregation"
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
                <th className="text-right">Combined spend*</th>
                <th className="text-right">Est. saving*</th>
              </tr>
            </thead>
            <tbody>
              {data.opportunities.top.map((o) => (
                <tr key={o.id}>
                  <td className="max-w-[340px]">
                    <Link href={`/mappings?q=${encodeURIComponent(o.cnmc)}`} className="block truncate font-mono text-caption text-primary-800 hover:underline">
                      {o.cnmc}
                    </Link>
                    <div className="truncate text-micro text-grey-500">{o.description}</div>
                  </td>
                  <td>
                    <span className="flex flex-wrap gap-0.5">
                      {o.orgCodes.map((c) => (
                        <OrgChip key={c} code={c} />
                      ))}
                    </span>
                  </td>
                  <td className="tabular text-right">{fmtInr(o.spend)}</td>
                  <td className="tabular text-right font-medium text-high-700">{fmtInr(o.estSaving)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="border-t border-grey-200 px-3 py-1.5 text-micro text-grey-500">* Illustrative — synthetic last-PO values × annual quantity; not real pricing data.</div>
        </Panel>
        <div className="col-span-5 space-y-3">
          <Panel title="Data-quality findings" subtitle="Flags raised during normalization">
            <div className="space-y-1 px-4 py-3">
              {flags.map((f) => (
                <div key={f.flag} className="grid grid-cols-[190px_1fr_40px] items-center gap-2 text-caption">
                  <span className="truncate font-mono text-micro text-grey-700" title={f.flag}>{f.flag}</span>
                  <span className="h-1.5 overflow-hidden rounded-full bg-grey-100">
                    <span className="block h-full rounded-full bg-grey-500" style={{ width: `${(f.n / flagMax) * 100}%` }} />
                  </span>
                  <span className="tabular text-right text-grey-700">{f.n}</span>
                </div>
              ))}
            </div>
          </Panel>
          {data.lastRun && (
            <Panel title="Last matching run">
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 px-4 py-3 text-caption">
                <span className="text-grey-500">Model</span>
                <span className="font-mono">{String(data.lastRun.matcher_version)}</span>
                <span className="text-grey-500">Embeddings</span>
                <span className="truncate font-mono" title={String(data.lastRun.embedding_model)}>{String(data.lastRun.embedding_model)}</span>
                <span className="text-grey-500">Pairs evaluated</span>
                <span className="tabular">{String(data.lastRun.candidates_evaluated)}</span>
                <span className="text-grey-500">Duration</span>
                <span className="tabular">{((Number(data.lastRun.duration_ms) || 0) / 1000).toFixed(1)} s</span>
                <span className="text-grey-500">Finished</span>
                <span>{fmtDateTime(String(data.lastRun.finished_at))}</span>
              </div>
            </Panel>
          )}
        </div>
      </div>
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
