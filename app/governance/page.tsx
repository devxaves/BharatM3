'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Cpu, FileSpreadsheet, History, Play, Plus, RotateCcw, Save, ShieldAlert, ShieldCheck, Sliders } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button, Dialog, DialogSection, LoadingBar, PageHeader, Panel, Segmented, Stat, Tabs } from '@/components/ui/primitives';
import { Badge, CategoryChip } from '@/components/ui/status';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/client/api';
import { useSession } from '@/lib/client/session';
import { cx, fmtDateTime, fmtPct, humanize } from '@/lib/format';
import type { CategorySchema, EngineConfig, MatchableCategory, ScoringWeights, Thresholds } from '@/lib/matching/types';

interface Rule {
  id: string;
  categoryCode: string;
  attributeKey: string;
  fromValue: string;
  toValue: string;
  bidirectional: boolean;
  rationale: string;
  approvedBy: string;
  active: boolean;
}

interface Config {
  engine: EngineConfig;
  engineUpdatedAt: string | null;
  engineUpdatedBy: string | null;
  matcherVersion: string;
  schemas: Record<MatchableCategory, CategorySchema>;
  rules: Rule[];
  runs: {
    run: {
      id: string;
      scope: string;
      recordsConsidered: number;
      candidatesEvaluated: number;
      recommendationsWritten: number;
      durationMs: number;
      startedAt: string;
      stats: { byMatchType?: Record<string, number> };
    };
    by: string | null;
    mv: string;
    emb: string;
  }[];
  versions: { id: string; matcherVersion: string; embeddingModel: string; notes: string; createdAt: string }[];
}

interface Eval {
  evaluatedRecords: number;
  truthPairs: number;
  precision: number | null;
  pairRecall: number | null;
  clusterRecall: number | null;
  truePositives: number;
  falsePositives: number;
  functionalEquivalent: { sameMaterial: number; differentMaterial: number };
  vetoes: { correct: number; wrong: number; precision: number | null };
  note: string;
}

const W_LABEL: Record<keyof ScoringWeights, string> = {
  semantic: 'Semantic description similarity',
  attribute: 'Core identity attributes',
  specification: 'Technical specifications',
  dimension: 'Physical dimensions',
  classification: 'Material classification',
  uom: 'UOM compatibility',
  procurement: 'Procurement history & pricing',
};

const T_LABEL: Record<keyof Thresholds, string> = {
  duplicate: 'Identical / Duplicate threshold (≥)',
  nearDuplicate: 'Near-duplicate threshold (≥)',
  functional: 'Functional equivalent threshold (≥)',
  related: 'Related candidate threshold (≥)',
  autoQueue: 'Fast-track auto-queue (≥)',
  review: 'Full-review routing (≥)',
};

function ThresholdBar({ t }: { t: Thresholds }) {
  const seg = [
    { from: 0, to: t.related, label: 'Unmatched', cls: 'bg-grey-200' },
    { from: t.related, to: t.functional, label: 'Related', cls: 'bg-grey-300' },
    { from: t.functional, to: t.nearDuplicate, label: 'Functional Equiv.', cls: 'bg-amber-200' },
    { from: t.nearDuplicate, to: t.duplicate, label: 'Near-Duplicate', cls: 'bg-amber-400' },
    { from: t.duplicate, to: 1, label: 'Identical', cls: 'bg-high-600 text-white' },
  ];
  return (
    <div className="space-y-1">
      <div className="flex h-7 overflow-hidden rounded border border-grey-300">
        {seg.map((s) => (
          <div
            key={s.label}
            className={cx('flex items-center justify-center overflow-hidden px-1 text-[11px] font-semibold transition-all duration-200', s.cls)}
            style={{ width: `${Math.max(0, (s.to - s.from) * 100)}%` }}
            title={`${s.label}: ${s.from}–${s.to}`}
          >
            {(s.to - s.from) > 0.09 ? s.label : ''}
          </div>
        ))}
      </div>
      <div className="relative h-4 font-mono text-micro text-grey-500">
        {[t.related, t.functional, t.nearDuplicate, t.duplicate].map((v) => (
          <span key={v} className="absolute -translate-x-1/2" style={{ left: `${v * 100}%` }}>
            {v.toFixed(2)}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function GovernancePage() {
  const qc = useQueryClient();
  const toast = useToast();
  const { can } = useSession();
  const { data, isLoading } = useQuery({ queryKey: ['config'], queryFn: () => api<Config>('/api/config') });
  const ev = useQuery({ queryKey: ['evaluation'], queryFn: () => api<Eval>('/api/evaluation') });

  const [activeTab, setActiveTab] = useState<'engine' | 'rules' | 'schemas' | 'runs'>('engine');
  const [weights, setWeights] = useState<ScoringWeights | null>(null);
  const [thresholds, setThresholds] = useState<Thresholds | null>(null);
  const [reason, setReason] = useState('');
  const [schemaTab, setSchemaTab] = useState<MatchableCategory>('VALVE');
  const [ruleOpen, setRuleOpen] = useState(false);
  const [rule, setRule] = useState({
    categoryCode: 'VALVE',
    attributeKey: 'body_material',
    fromValue: '',
    toValue: '',
    bidirectional: false,
    rationale: '',
    approvedBy: '',
  });

  useEffect(() => {
    if (data) {
      setWeights(data.engine.weights);
      setThresholds(data.engine.thresholds);
    }
  }, [data]);

  const save = useMutation({
    mutationFn: () => api('/api/config', { method: 'PUT', json: { weights, thresholds, reason } }),
    onSuccess: () => {
      toast({ kind: 'success', title: 'Engine configuration updated', body: 'Audited in hash chain. Re-run matching to evaluate catalog.' });
      setReason('');
      qc.invalidateQueries({ queryKey: ['config'] });
    },
    onError: (e: Error) => toast({ kind: 'error', title: 'Configuration error', body: e.message }),
  });

  const rerun = useMutation({
    mutationFn: () => api<{ pairsEvaluated: number; recommendationsWritten: number; durationMs: number }>('/api/matching/run', { method: 'POST' }),
    onSuccess: (r) => {
      toast({
        kind: 'success',
        title: 'Matching re-run complete',
        body: `${r.pairsEvaluated} pairs evaluated → ${r.recommendationsWritten} recommendations produced in ${(r.durationMs / 1000).toFixed(1)}s.`,
      });
      qc.invalidateQueries();
    },
    onError: (e: Error) => toast({ kind: 'error', title: 'Run failed', body: e.message }),
  });

  const addRule = useMutation({
    mutationFn: () => api('/api/substitution-rules', { method: 'POST', json: rule }),
    onSuccess: () => {
      toast({ kind: 'success', title: 'Substitution rule registered' });
      setRuleOpen(false);
      qc.invalidateQueries({ queryKey: ['config'] });
    },
    onError: (e: Error) => toast({ kind: 'error', title: 'Failed to add rule', body: e.message }),
  });

  const toggleRule = useMutation({
    mutationFn: (r: Rule) =>
      api(`/api/substitution-rules/${r.id}`, {
        method: 'PATCH',
        json: { active: !r.active, reason: r.active ? 'Withdrawn by MDM admin' : 'Reactivated by MDM admin' },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['config'] }),
  });

  if (isLoading || !data || !weights || !thresholds) return <LoadingBar label="Loading governance parameters…" />;

  const editable = can('config:write');
  const wSum = Object.values(weights).reduce((s, v) => s + v, 0);
  const schema = data.schemas[schemaTab];

  return (
    <div className="space-y-3">
      <PageHeader
        eyebrow="Governance & Rules"
        title="Matching rules & configuration"
        description="Versioned weights, thresholds, schemas, and material substitution rules governing AI harmonization."
        actions={
          <div className="flex items-center gap-2">
            <Segmented
              value={activeTab}
              onChange={setActiveTab}
              items={[
                { value: 'engine', label: 'Engine & Weights' },
                { value: 'rules', label: `Substitution Rules (${data.rules.length})` },
                { value: 'schemas', label: 'Attribute Schemas' },
                { value: 'runs', label: `Run History (${data.runs.length})` },
              ]}
            />
            <Button
              variant="primary"
              icon={<Play size={13} />}
              disabled={!can('matching:run') || rerun.isPending}
              onClick={() => rerun.mutate()}
            >
              {rerun.isPending ? 'Matching…' : 'Re-run matching'}
            </Button>
          </div>
        }
      />

      {/* TAB 1: ENGINE & WEIGHTS */}
      {activeTab === 'engine' && (
        <div className="space-y-3">
          <div className="grid grid-cols-12 gap-3">
            <Panel
              className="col-span-12 lg:col-span-7"
              title="Scoring fusion weights & classification thresholds"
              subtitle={`Active since ${fmtDateTime(data.engineUpdatedAt)}${data.engineUpdatedBy ? ` by ${data.engineUpdatedBy}` : ''} · Model ${data.matcherVersion}`}
            >
              <div className="grid grid-cols-1 gap-6 p-4 md:grid-cols-2">
                <div>
                  <div className="eyebrow mb-2">Score Fusion Weights (Total = 1.00)</div>
                  {(Object.keys(W_LABEL) as (keyof ScoringWeights)[]).map((k) => (
                    <div key={k} className="grid grid-cols-[1fr_80px_48px] items-center gap-2 py-1.5 border-b border-grey-100 last:border-0">
                      <label className="text-dense font-medium text-grey-700" htmlFor={`w-${k}`}>
                        {W_LABEL[k]}
                      </label>
                      <input
                        id={`w-${k}`}
                        type="range"
                        min={0}
                        max={0.5}
                        step={0.01}
                        value={weights[k]}
                        disabled={!editable}
                        onChange={(e) => setWeights({ ...weights, [k]: Number(e.target.value) })}
                        className="accent-[rgb(var(--c-primary-700))]"
                      />
                      <span className="tabular text-right font-mono text-caption font-semibold">{weights[k].toFixed(2)}</span>
                    </div>
                  ))}
                  <div className="mt-2 flex items-center justify-between pt-2 border-t border-grey-200">
                    <span className="text-caption text-grey-600 font-medium">Weight sum</span>
                    <span className={cx('tabular font-mono text-caption font-bold', Math.abs(wSum - 1) > 0.001 ? 'text-veto-700' : 'text-high-700')}>
                      Σ = {wSum.toFixed(2)}
                    </span>
                  </div>
                </div>

                <div>
                  <div className="eyebrow mb-2">Confidence Routing Thresholds</div>
                  {(Object.keys(T_LABEL) as (keyof Thresholds)[]).map((k) => (
                    <div key={k} className="grid grid-cols-[1fr_80px] items-center gap-2 py-1 border-b border-grey-100 last:border-0">
                      <label className="text-dense text-grey-700 font-medium" htmlFor={`t-${k}`}>
                        {T_LABEL[k]}
                      </label>
                      <input
                        id={`t-${k}`}
                        type="number"
                        step={0.01}
                        min={0}
                        max={1}
                        className="input h-7 text-right font-mono font-semibold"
                        value={thresholds[k]}
                        disabled={!editable}
                        onChange={(e) => setThresholds({ ...thresholds, [k]: Number(e.target.value) })}
                      />
                    </div>
                  ))}
                  <div className="mt-4 pt-2 border-t border-grey-200">
                    <div className="eyebrow mb-1.5">Threshold Visualization</div>
                    <ThresholdBar t={thresholds} />
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 border-t border-grey-200 bg-grey-25 px-4 py-3">
                {editable ? (
                  <>
                    <input
                      className="input h-8 flex-1"
                      placeholder="Reason for parameter tune (audited to SHA-256 chain)…"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                    />
                    <Button
                      variant="primary"
                      icon={<Save size={13} />}
                      disabled={reason.trim().length < 5 || save.isPending}
                      onClick={() => save.mutate()}
                    >
                      Save parameters
                    </Button>
                  </>
                ) : (
                  <span className="text-caption text-grey-500">Read-only · Requires MDM Administrator role to tune weights and thresholds.</span>
                )}
              </div>
            </Panel>

            <Panel className="col-span-12 lg:col-span-5" title="Matching quality benchmark" subtitle="Synthetic ground-truth verification">
              {!ev.data ? (
                <LoadingBar />
              ) : (
                <div className="p-4 space-y-4">
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { l: 'Precision', v: ev.data.precision, h: `${ev.data.truePositives} TP · ${ev.data.falsePositives} FP` },
                      { l: 'Pair Recall', v: ev.data.pairRecall, h: `of ${ev.data.truthPairs} true pairs` },
                      { l: 'Cluster Recall', v: ev.data.clusterRecall, h: 'Transitive match' },
                    ].map((x) => (
                      <div key={x.l} className="rounded-lg border border-grey-200/90 bg-grey-50/70 p-3.5 text-center transition-all hover:bg-white hover:shadow-sm">
                        <div className="eyebrow font-bold text-grey-600 tracking-wider">{x.l}</div>
                        <div className="mt-1 font-display text-title font-extrabold tracking-tight text-primary-900">{x.v === null ? '—' : fmtPct(x.v)}</div>
                        <div className="mt-0.5 text-micro text-grey-500 font-medium">{x.h}</div>
                      </div>
                    ))}
                  </div>

                  <div className="space-y-2 rounded border border-grey-200 bg-grey-50 p-3 text-caption text-grey-700">
                    <div className="flex justify-between items-center">
                      <span>Safety vetoes on distinct materials:</span>
                      <span className="font-mono font-bold text-grey-900">
                        {ev.data.vetoes.correct} / {ev.data.vetoes.correct + ev.data.vetoes.wrong} ({ev.data.vetoes.precision === null ? '—' : fmtPct(ev.data.vetoes.precision)})
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span>Functional equivalent pairs correctly routed:</span>
                      <span className="font-mono font-bold text-grey-900">
                        {ev.data.functionalEquivalent.sameMaterial} / {ev.data.functionalEquivalent.differentMaterial}
                      </span>
                    </div>
                  </div>

                  <p className="text-caption text-grey-500 italic leading-relaxed">{ev.data.note}</p>
                </div>
              )}
            </Panel>
          </div>
        </div>
      )}

      {/* TAB 2: SUBSTITUTION RULES */}
      {activeTab === 'rules' && (
        <Panel
          title={`Engineering substitution rules (${data.rules.length})`}
          subtitle="Governed interchangeability exceptions that bypass strict safety vetoes"
          actions={
            editable && (
              <Button size="sm" variant="primary" icon={<Plus size={13} />} onClick={() => setRuleOpen(true)}>
                Add substitution rule
              </Button>
            )
          }
        >
          <table className="dt">
            <thead>
              <tr>
                <th>Category</th>
                <th>Attribute</th>
                <th>Substitution</th>
                <th>Engineering Rationale / Approver</th>
                <th>Status</th>
                <th className="text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {data.rules.map((r) => (
                <tr key={r.id}>
                  <td className="text-caption font-semibold">{humanize(r.categoryCode)}</td>
                  <td className="font-mono text-caption text-primary-800 font-semibold">{r.attributeKey}</td>
                  <td className="whitespace-nowrap font-mono text-caption text-grey-900 font-semibold">
                    {r.fromValue} {r.bidirectional ? '⇄' : '→'} {r.toValue}
                  </td>
                  <td className="max-w-[340px] text-caption">
                    <div className="line-clamp-2 text-grey-800 font-medium" title={r.rationale}>
                      {r.rationale}
                    </div>
                    <div className="mt-0.5 text-micro text-grey-500 font-sans">Approved: {r.approvedBy}</div>
                  </td>
                  <td>{r.active ? <Badge tone="high">Active</Badge> : <Badge>Withdrawn</Badge>}</td>
                  <td className="text-right">
                    {editable && (
                      <button
                        className="text-caption text-teal-700 hover:underline font-medium"
                        onClick={() => toggleRule.mutate(r)}
                      >
                        {r.active ? 'Withdraw' : 'Activate'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}

      {/* TAB 3: ATTRIBUTE SCHEMAS */}
      {activeTab === 'schemas' && (
        <Panel
          title="Category attribute schemas"
          subtitle="Standardized domain specifications, required parameters, and safety-critical attributes"
        >
          <div className="px-4 pt-2 border-b border-grey-200">
            <Tabs<MatchableCategory>
              value={schemaTab}
              onChange={setSchemaTab}
              items={(Object.keys(data.schemas) as MatchableCategory[]).map((c) => ({
                value: c,
                label: humanize(c),
                count: data.schemas[c].fields.length,
              }))}
            />
          </div>

          <table className="dt">
            <thead>
              <tr>
                <th>Attribute Label</th>
                <th>Key</th>
                <th>Group</th>
                <th>Type & Unit</th>
                <th className="text-right">Weight</th>
                <th>Required</th>
                <th>Identity</th>
                <th>Hard Veto Rule</th>
              </tr>
            </thead>
            <tbody>
              {schema.fields.map((f) => (
                <tr key={f.key}>
                  <td className="font-medium text-grey-900">{f.label}</td>
                  <td className="font-mono text-caption text-grey-600">{f.key}</td>
                  <td className="text-caption text-grey-600">{humanize(f.group)}</td>
                  <td className="text-caption">
                    {f.type}
                    {f.unit ? ` · ${f.unit}` : ''}
                    {f.tolerance ? ` · ±${f.tolerance * 100}%` : ''}
                  </td>
                  <td className="tabular text-right font-mono font-semibold">{f.weight}</td>
                  <td>{f.required ? <Badge tone="amber">Required</Badge> : <span className="text-grey-400">—</span>}</td>
                  <td>{f.identity ? <Badge tone="primary">Identity</Badge> : <span className="text-grey-400">—</span>}</td>
                  <td>
                    {f.veto ? (
                      <Badge tone="veto" className="font-mono text-micro">
                        <ShieldAlert size={11} className="mr-1 inline" /> {f.veto.replace('_', ' ')}
                      </Badge>
                    ) : (
                      <span className="text-grey-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="border-t border-grey-200 bg-grey-25 px-4 py-2.5 text-caption text-grey-700 flex flex-wrap gap-4">
            <div>
              CNMC Prefix: <span className="font-mono font-bold text-primary-800">{schema.cnmcPrefix}</span>
            </div>
            <div>
              Default UNSPSC: <span className="font-mono font-semibold">{schema.defaultUnspsc}</span>
            </div>
            <div>
              Expected UOM: <span className="font-semibold">{schema.expectedUomDimension}</span>
            </div>
            <div>
              Blocking Keys: <span className="font-mono text-grey-800">{schema.blockingKeys.join(' + ')}</span>
            </div>
          </div>
        </Panel>
      )}

      {/* TAB 4: RUN HISTORY */}
      {activeTab === 'runs' && (
        <Panel
          title={`Matching runs & model lineage (${data.runs.length})`}
          subtitle="Audit record of AI matching iterations and recommendations produced"
        >
          <table className="dt">
            <thead>
              <tr>
                <th>Run Timestamp</th>
                <th>Scope</th>
                <th>Model Version</th>
                <th>Triggered By</th>
                <th className="text-right">Pairs Evaluated</th>
                <th className="text-right">Recommendations</th>
                <th className="text-right">Duration</th>
              </tr>
            </thead>
            <tbody>
              {data.runs.map(({ run, by, mv }) => (
                <tr key={run.id}>
                  <td className="whitespace-nowrap text-caption font-mono font-medium text-grey-900">{fmtDateTime(run.startedAt)}</td>
                  <td>
                    <Badge tone={run.scope === 'FULL' ? 'primary' : 'neutral'}>{run.scope}</Badge>
                  </td>
                  <td className="font-mono text-micro text-grey-600">{mv}</td>
                  <td className="text-caption text-grey-700">{by ?? 'system'}</td>
                  <td className="tabular text-right font-mono">{run.candidatesEvaluated.toLocaleString()}</td>
                  <td className="tabular text-right font-mono font-bold text-high-700">{run.recommendationsWritten}</td>
                  <td className="tabular text-right font-mono text-caption text-grey-600">{((run.durationMs ?? 0) / 1000).toFixed(1)}s</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}

      {/* Add Substitution Rule Dialog */}
      <Dialog
        open={ruleOpen}
        onClose={() => setRuleOpen(false)}
        title="Add engineering substitution rule"
        subtitle="Registers certified material equivalence for matching exceptions"
        width={580}
        footer={
          <>
            <Button variant="ghost" onClick={() => setRuleOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={addRule.isPending || !rule.fromValue || !rule.toValue || rule.rationale.length < 8 || rule.approvedBy.length < 3}
              onClick={() => addRule.mutate()}
            >
              Add substitution rule
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-3 text-dense">
          <div>
            <label className="field-label">Category</label>
            <select
              className="input"
              value={rule.categoryCode}
              onChange={(e) =>
                setRule({
                  ...rule,
                  categoryCode: e.target.value,
                  attributeKey: data.schemas[e.target.value as MatchableCategory].fields.find((f) => f.veto)?.key ?? '',
                })
              }
            >
              {Object.keys(data.schemas).map((c) => (
                <option key={c} value={c}>
                  {humanize(c)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="field-label">Safety-critical attribute</label>
            <select className="input" value={rule.attributeKey} onChange={(e) => setRule({ ...rule, attributeKey: e.target.value })}>
              {data.schemas[rule.categoryCode as MatchableCategory].fields
                .filter((f) => f.veto)
                .map((f) => (
                  <option key={f.key} value={f.key}>
                    {f.label}
                  </option>
                ))}
            </select>
          </div>
          <div>
            <label className="field-label">Required value (from)</label>
            <input
              className="input font-mono uppercase"
              value={rule.fromValue}
              onChange={(e) => setRule({ ...rule, fromValue: e.target.value })}
              placeholder="e.g. CS-WCB"
            />
          </div>
          <div>
            <label className="field-label">Acceptable substitute (to)</label>
            <input
              className="input font-mono uppercase"
              value={rule.toValue}
              onChange={(e) => setRule({ ...rule, toValue: e.target.value })}
              placeholder="e.g. CS-WCC"
            />
          </div>
          <label className="col-span-2 flex items-center gap-2 text-dense pt-1">
            <input type="checkbox" checked={rule.bidirectional} onChange={(e) => setRule({ ...rule, bidirectional: e.target.checked })} />
            Interchangeable in both directions
          </label>
          <div className="col-span-2">
            <label className="field-label">Engineering rationale (required)</label>
            <textarea
              className="input h-16 py-1.5"
              value={rule.rationale}
              onChange={(e) => setRule({ ...rule, rationale: e.target.value })}
              placeholder="Engineering standard reference, temperature/pressure ratings..."
            />
          </div>
          <div className="col-span-2">
            <label className="field-label">Approved by (designation, CPSE)</label>
            <input
              className="input"
              value={rule.approvedBy}
              onChange={(e) => setRule({ ...rule, approvedBy: e.target.value })}
              placeholder="e.g. Chief Engineer (Materials), CPCL"
            />
          </div>
        </div>
      </Dialog>
    </div>
  );
}

