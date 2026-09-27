'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Play, Plus, Save, ShieldAlert } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button, Dialog, LoadingBar, PageHeader, Panel, Tabs } from '@/components/ui/primitives';
import { Badge } from '@/components/ui/status';
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
  runs: { run: { id: string; scope: string; recordsConsidered: number; candidatesEvaluated: number; recommendationsWritten: number; durationMs: number; startedAt: string; stats: { byMatchType?: Record<string, number> } }; by: string | null; mv: string; emb: string }[];
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

const W_LABEL: Record<keyof ScoringWeights, string> = { semantic: 'Semantic + fuzzy text', attribute: 'Identity attributes', specification: 'Specification', dimension: 'Dimensions', classification: 'Classification', uom: 'UOM compatibility', procurement: 'Procurement history' };
const T_LABEL: Record<keyof Thresholds, string> = { duplicate: 'Identical / duplicate ≥', nearDuplicate: 'Near-duplicate ≥', functional: 'Functional equivalent ≥', related: 'Related (stored) ≥', autoQueue: 'Fast-track routing ≥', review: 'Full-review routing ≥' };

function ThresholdBar({ t }: { t: Thresholds }) {
  const seg = [
    { from: 0, to: t.related, label: 'Not matched', cls: 'bg-grey-200' },
    { from: t.related, to: t.functional, label: 'Related', cls: 'bg-grey-300' },
    { from: t.functional, to: t.nearDuplicate, label: 'Functional equiv.', cls: 'bg-amber-200' },
    { from: t.nearDuplicate, to: t.duplicate, label: 'Near-duplicate', cls: 'bg-amber-500/70' },
    { from: t.duplicate, to: 1, label: 'Dup.', cls: 'bg-high-600' },
  ];
  return (
    <div>
      <div className="flex h-6 overflow-hidden rounded-sm border border-grey-200">
        {seg.map((s) => (
          <div key={s.label} className={cx('flex items-center justify-center overflow-hidden whitespace-nowrap text-[10px] font-medium text-grey-800 transition-all duration-200', s.cls)} style={{ width: `${(s.to - s.from) * 100}%` }} title={`${s.label}: ${s.from}–${s.to}`}>
            {s.to - s.from > 0.08 ? s.label : ''}
          </div>
        ))}
      </div>
      <div className="relative mt-0.5 h-4 font-mono text-[10px] text-grey-500">
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
  const [weights, setWeights] = useState<ScoringWeights | null>(null);
  const [thresholds, setThresholds] = useState<Thresholds | null>(null);
  const [reason, setReason] = useState('');
  const [schemaTab, setSchemaTab] = useState<MatchableCategory>('VALVE');
  const [ruleOpen, setRuleOpen] = useState(false);
  const [rule, setRule] = useState({ categoryCode: 'VALVE', attributeKey: 'body_material', fromValue: '', toValue: '', bidirectional: false, rationale: '', approvedBy: '' });

  useEffect(() => {
    if (data) {
      setWeights(data.engine.weights);
      setThresholds(data.engine.thresholds);
    }
  }, [data]);

  const save = useMutation({
    mutationFn: () => api('/api/config', { method: 'PUT', json: { weights, thresholds, reason } }),
    onSuccess: () => {
      toast({ kind: 'success', title: 'Engine configuration saved', body: 'Audited as ENGINE_CONFIG_UPDATED. Re-run matching to apply.' });
      setReason('');
      qc.invalidateQueries({ queryKey: ['config'] });
    },
    onError: (e: Error) => toast({ kind: 'error', title: 'Not saved', body: e.message }),
  });
  const rerun = useMutation({
    mutationFn: () => api<{ pairsEvaluated: number; recommendationsWritten: number; durationMs: number }>('/api/matching/run', { method: 'POST' }),
    onSuccess: (r) => {
      toast({ kind: 'success', title: 'Matching re-run complete', body: `${r.pairsEvaluated} pairs → ${r.recommendationsWritten} recommendations in ${(r.durationMs / 1000).toFixed(1)} s. Decided items were not touched.` });
      qc.invalidateQueries();
    },
    onError: (e: Error) => toast({ kind: 'error', title: 'Run failed', body: e.message }),
  });
  const addRule = useMutation({
    mutationFn: () => api('/api/substitution-rules', { method: 'POST', json: rule }),
    onSuccess: () => {
      toast({ kind: 'success', title: 'Substitution rule added' });
      setRuleOpen(false);
      qc.invalidateQueries({ queryKey: ['config'] });
    },
    onError: (e: Error) => toast({ kind: 'error', title: 'Rule not added', body: e.message }),
  });
  const toggleRule = useMutation({
    mutationFn: (r: Rule) => api(`/api/substitution-rules/${r.id}`, { method: 'PATCH', json: { active: !r.active, reason: r.active ? 'Withdrawn by MDM administrator' : 'Re-activated by MDM administrator' } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['config'] }),
  });

  if (isLoading || !data || !weights || !thresholds) return <LoadingBar />;
  const editable = can('config:write');
  const wSum = Object.values(weights).reduce((s, v) => s + v, 0);
  const schema = data.schemas[schemaTab];

  return (
    <div>
      <PageHeader
        eyebrow="Governance"
        title="Matching rules & configuration"
        description="Weights, thresholds, category attribute schemas and substitution rules live in the database — not in code — so they are tunable, versioned and audited. Every recommendation records the model version that produced it."
        actions={
          <Button variant="primary" icon={<Play size={13} />} disabled={!can('matching:run') || rerun.isPending} onClick={() => rerun.mutate()}>
            {rerun.isPending ? 'Re-running matching…' : 'Re-run matching'}
          </Button>
        }
      />
      <div className="grid grid-cols-12 gap-3">
        <Panel className="col-span-7" title="Score fusion & confidence thresholds" subtitle={`Active since ${fmtDateTime(data.engineUpdatedAt)}${data.engineUpdatedBy ? ` · by ${data.engineUpdatedBy}` : ''} · ${data.matcherVersion}`}>
          <div className="grid grid-cols-2 gap-6 p-4">
            <div>
              <div className="eyebrow mb-2">Fusion weights (must sum to 1.00)</div>
              {(Object.keys(W_LABEL) as (keyof ScoringWeights)[]).map((k) => (
                <div key={k} className="grid grid-cols-[1fr_70px_48px] items-center gap-2 py-1">
                  <label className="text-dense text-grey-700" htmlFor={`w-${k}`}>{W_LABEL[k]}</label>
                  <input id={`w-${k}`} type="range" min={0} max={0.5} step={0.01} value={weights[k]} disabled={!editable} onChange={(e) => setWeights({ ...weights, [k]: Number(e.target.value) })} className="accent-[rgb(var(--c-primary-700))]" />
                  <span className="tabular text-right font-mono text-caption">{weights[k].toFixed(2)}</span>
                </div>
              ))}
              <div className={cx('mt-1 text-right font-mono text-caption', Math.abs(wSum - 1) > 0.001 ? 'font-semibold text-veto-700' : 'text-high-700')}>Σ = {wSum.toFixed(2)}</div>
            </div>
            <div>
              <div className="eyebrow mb-2">Classification & routing thresholds</div>
              {(Object.keys(T_LABEL) as (keyof Thresholds)[]).map((k) => (
                <div key={k} className="grid grid-cols-[1fr_80px] items-center gap-2 py-1">
                  <label className="text-dense text-grey-700" htmlFor={`t-${k}`}>{T_LABEL[k]}</label>
                  <input id={`t-${k}`} type="number" step={0.01} min={0} max={1} className="input h-7 text-right font-mono" value={thresholds[k]} disabled={!editable} onChange={(e) => setThresholds({ ...thresholds, [k]: Number(e.target.value) })} />
                </div>
              ))}
              <div className="mt-3">
                <ThresholdBar t={thresholds} />
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 border-t border-grey-200 bg-grey-25 px-4 py-2.5">
            {editable ? (
              <>
                <input className="input h-8 flex-1" placeholder="Reason for change (required, audited)" value={reason} onChange={(e) => setReason(e.target.value)} />
                <Button variant="primary" icon={<Save size={13} />} disabled={reason.trim().length < 5 || save.isPending} onClick={() => save.mutate()}>
                  Save configuration
                </Button>
              </>
            ) : (
              <span className="text-caption text-grey-500">Read-only — only the MDM Administrator role can change engine configuration.</span>
            )}
          </div>
        </Panel>

        <Panel className="col-span-5" title="Matching quality (synthetic ground truth)" subtitle="Seed records carry the id of the physical item they were generated from">
          {!ev.data ? (
            <LoadingBar />
          ) : (
            <div className="p-4">
              <div className="grid grid-cols-3 gap-3">
                {[
                  { l: 'Precision', v: ev.data.precision, h: `${ev.data.truePositives} TP · ${ev.data.falsePositives} FP` },
                  { l: 'Pair recall', v: ev.data.pairRecall, h: `of ${ev.data.truthPairs} true pairs` },
                  { l: 'Cluster recall', v: ev.data.clusterRecall, h: 'via transitive grouping' },
                ].map((x) => (
                  <div key={x.l} className="rounded border border-grey-200 px-3 py-2">
                    <div className="eyebrow">{x.l}</div>
                    <div className="font-display text-title font-semibold">{x.v === null ? '—' : fmtPct(x.v)}</div>
                    <div className="text-micro text-grey-500">{x.h}</div>
                  </div>
                ))}
              </div>
              <div className="mt-3 space-y-1 text-caption text-grey-700">
                <div className="flex justify-between">
                  <span>Safety vetoes on genuinely different items</span>
                  <b className="tabular">
                    {ev.data.vetoes.correct} / {ev.data.vetoes.correct + ev.data.vetoes.wrong} ({ev.data.vetoes.precision === null ? '—' : fmtPct(ev.data.vetoes.precision)})
                  </b>
                </div>
                <div className="flex justify-between">
                  <span>Functional-equivalent pairs routed to humans (same / different item)</span>
                  <b className="tabular">
                    {ev.data.functionalEquivalent.sameMaterial} / {ev.data.functionalEquivalent.differentMaterial}
                  </b>
                </div>
              </div>
              <p className="mt-2 text-micro text-grey-500">{ev.data.note}</p>
            </div>
          )}
        </Panel>
      </div>

      <div className="mt-3 grid grid-cols-12 gap-3">
        <Panel
          className="col-span-7"
          title="Hard exclusion escape hatch — substitution rules"
          subtitle="The ONLY way a safety-critical mismatch can be relaxed. Category-scoped, engineering-approved, audited."
          actions={editable && <Button size="sm" icon={<Plus size={13} />} onClick={() => setRuleOpen(true)}>Add rule</Button>}
        >
          <table className="dt">
            <thead>
              <tr>
                <th>Category</th>
                <th>Attribute</th>
                <th>Rule</th>
                <th>Rationale / approver</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.rules.map((r) => (
                <tr key={r.id}>
                  <td className="text-caption">{humanize(r.categoryCode)}</td>
                  <td className="font-mono text-caption">{r.attributeKey}</td>
                  <td className="whitespace-nowrap font-mono text-caption">
                    {r.fromValue} {r.bidirectional ? '⇄' : '→'} {r.toValue}
                  </td>
                  <td className="max-w-[300px] text-caption">
                    <div className="line-clamp-2 text-grey-800" title={r.rationale}>{r.rationale}</div>
                    <div className="text-micro text-grey-500">{r.approvedBy}</div>
                  </td>
                  <td>{r.active ? <Badge tone="high">Active</Badge> : <Badge>Withdrawn</Badge>}</td>
                  <td>{editable && <button className="text-caption text-grey-500 hover:text-grey-900 hover:underline" onClick={() => toggleRule.mutate(r)}>{r.active ? 'Withdraw' : 'Activate'}</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
        <Panel className="col-span-5" title="Matching runs & model versions">
          <table className="dt">
            <thead>
              <tr>
                <th>Started</th>
                <th>Scope</th>
                <th className="text-right">Pairs</th>
                <th className="text-right">Recs</th>
                <th className="text-right">Time</th>
              </tr>
            </thead>
            <tbody>
              {data.runs.map(({ run, by, mv }) => (
                <tr key={run.id} title={`${mv} · ${by ?? 'system'}`}>
                  <td className="whitespace-nowrap text-caption">{fmtDateTime(run.startedAt)}</td>
                  <td><Badge tone={run.scope === 'FULL' ? 'primary' : 'neutral'}>{run.scope}</Badge></td>
                  <td className="tabular text-right">{run.candidatesEvaluated}</td>
                  <td className="tabular text-right">{run.recommendationsWritten}</td>
                  <td className="tabular text-right">{((run.durationMs ?? 0) / 1000).toFixed(1)}s</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="border-t border-grey-200 px-3 py-2 text-caption text-grey-600">
            {data.versions.map((v) => (
              <div key={v.id} className="flex justify-between gap-2 py-0.5">
                <span className="font-mono">{v.matcherVersion}</span>
                <span className="truncate text-grey-500">{v.embeddingModel}</span>
                <span className="font-mono text-micro text-grey-400">cfg {v.notes}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <Panel className="mt-3" title="Category attribute schemas (v1)" subtitle="Category-aware matching: each material family has its own governed attributes, weights and safety-critical fields">
        <div className="px-3 pt-1">
          <Tabs<MatchableCategory> value={schemaTab} onChange={setSchemaTab} items={(Object.keys(data.schemas) as MatchableCategory[]).map((c) => ({ value: c, label: humanize(c), count: data.schemas[c].fields.length }))} />
        </div>
        <table className="dt">
          <thead>
            <tr>
              <th>Attribute</th>
              <th>Key</th>
              <th>Group</th>
              <th>Type</th>
              <th className="text-right">Weight</th>
              <th>Required</th>
              <th>Identity (CNMC)</th>
              <th>Hard veto family</th>
            </tr>
          </thead>
          <tbody>
            {schema.fields.map((f) => (
              <tr key={f.key}>
                <td className="font-medium">{f.label}</td>
                <td className="font-mono text-caption text-grey-600">{f.key}</td>
                <td className="text-caption">{humanize(f.group)}</td>
                <td className="text-caption">
                  {f.type}
                  {f.unit ? ` · ${f.unit}` : ''}
                  {f.tolerance ? ` · ±${f.tolerance * 100}%` : ''}
                </td>
                <td className="tabular text-right">{f.weight}</td>
                <td>{f.required ? <Badge tone="amber">Required</Badge> : <span className="text-grey-400">—</span>}</td>
                <td>{f.identity ? <Badge tone="primary">Identity</Badge> : <span className="text-grey-400">—</span>}</td>
                <td>
                  {f.veto ? (
                    <Badge tone="veto">
                      <ShieldAlert size={10} /> {f.veto.replace('_', ' ')}
                    </Badge>
                  ) : (
                    <span className="text-grey-400">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="border-t border-grey-200 px-3 py-2 text-caption text-grey-600">
          CNMC prefix <span className="font-mono">{schema.cnmcPrefix}</span> · default UNSPSC <span className="font-mono">{schema.defaultUnspsc}</span> · expected UOM dimension {schema.expectedUomDimension.toLowerCase()} · blocking keys{' '}
          <span className="font-mono">{schema.blockingKeys.join(' + ')}</span>
        </div>
      </Panel>

      <Dialog
        open={ruleOpen}
        onClose={() => setRuleOpen(false)}
        title="Add substitution rule"
        footer={
          <>
            <Button variant="ghost" onClick={() => setRuleOpen(false)}>Cancel</Button>
            <Button variant="primary" disabled={addRule.isPending || !rule.fromValue || !rule.toValue || rule.rationale.length < 10 || rule.approvedBy.length < 3} onClick={() => addRule.mutate()}>
              Add rule
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="field-label">Category</label>
            <select className="input" value={rule.categoryCode} onChange={(e) => setRule({ ...rule, categoryCode: e.target.value, attributeKey: data.schemas[e.target.value as MatchableCategory].fields.find((f) => f.veto)?.key ?? '' })}>
              {Object.keys(data.schemas).map((c) => <option key={c} value={c}>{humanize(c)}</option>)}
            </select>
          </div>
          <div>
            <label className="field-label">Safety-critical attribute</label>
            <select className="input" value={rule.attributeKey} onChange={(e) => setRule({ ...rule, attributeKey: e.target.value })}>
              {data.schemas[rule.categoryCode as MatchableCategory].fields.filter((f) => f.veto).map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
            </select>
          </div>
          <div>
            <label className="field-label">Required value (from)</label>
            <input className="input font-mono" value={rule.fromValue} onChange={(e) => setRule({ ...rule, fromValue: e.target.value })} placeholder="e.g. CS-WCB" />
          </div>
          <div>
            <label className="field-label">Acceptable substitute (to)</label>
            <input className="input font-mono" value={rule.toValue} onChange={(e) => setRule({ ...rule, toValue: e.target.value })} placeholder="e.g. CS-WCC" />
          </div>
          <label className="col-span-2 flex items-center gap-2 text-dense">
            <input type="checkbox" checked={rule.bidirectional} onChange={(e) => setRule({ ...rule, bidirectional: e.target.checked })} /> Interchangeable in both directions
          </label>
          <div className="col-span-2">
            <label className="field-label">Engineering rationale</label>
            <textarea className="input h-16 py-1.5" value={rule.rationale} onChange={(e) => setRule({ ...rule, rationale: e.target.value })} />
          </div>
          <div className="col-span-2">
            <label className="field-label">Approved by (designation, CPSE)</label>
            <input className="input" value={rule.approvedBy} onChange={(e) => setRule({ ...rule, approvedBy: e.target.value })} />
          </div>
        </div>
      </Dialog>
    </div>
  );
}

