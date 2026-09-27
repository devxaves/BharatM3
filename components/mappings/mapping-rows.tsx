'use client';

import { Undo2 } from 'lucide-react';
import { MatchTypeBadge, OrgChip, StatusBadge } from '@/components/ui/status';
import { cx, fmtInr } from '@/lib/format';

export interface Mapping {
  id: string;
  canonicalId: string;
  org: string;
  orgName: string;
  legacyCode: string;
  rawId: string;
  description: string;
  uom: string | null;
  price: number | null;
  qty: number | null;
  matchType: string;
  confidence: number;
  status: string;
  createdAt: string;
  createdBy: string | null;
  reversalReason: string | null;
}

export function MappingRows({ rows, onReverse, canReverse }: { rows: Mapping[]; onReverse?: (m: Mapping) => void; canReverse?: boolean }) {
  return (
    <div className="scroll-thin overflow-x-auto">
    <table className="w-full text-caption">
      <thead>
        <tr className="text-left text-micro uppercase tracking-[0.06em] text-grey-500">
          <th className="py-1 pr-3 font-semibold">CPSE</th>
          <th className="py-1 pr-3 font-semibold">Legacy code</th>
          <th className="py-1 pr-3 font-semibold">Description in source ERP</th>
          <th className="py-1 pr-3 font-semibold">UOM</th>
          <th className="py-1 pr-3 text-right font-semibold">Last PO</th>
          <th className="py-1 pr-3 font-semibold">Evidence</th>
          <th className="py-1 pr-3 font-semibold">Status</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {rows.map((m) => (
          <tr key={m.id} className={cx('border-t border-grey-200/70', m.status !== 'ACTIVE' && 'opacity-60')}>
            <td className="py-1 pr-3"><OrgChip code={m.org} /></td>
            <td className="py-1 pr-3 font-mono text-primary-800">{m.legacyCode}</td>
            <td className="max-w-[340px] truncate py-1 pr-3 font-mono text-grey-800" title={m.description}>{m.description}</td>
            <td className="py-1 pr-3 font-mono">{m.uom}</td>
            <td className="tabular py-1 pr-3 text-right">{m.price ? fmtInr(m.price, { compact: false }) : '—'}</td>
            <td className="py-1 pr-3">
              <span className="inline-flex items-center gap-1.5">
                <MatchTypeBadge type={m.matchType} /> <span className="font-mono text-micro text-grey-500">{m.confidence.toFixed(3)}</span>
              </span>
            </td>
            <td className="py-1 pr-3" title={m.reversalReason ?? undefined}>
              <StatusBadge status={m.status} />
            </td>
            <td className="py-1 text-right">
              {canReverse && m.status === 'ACTIVE' && onReverse && (
                <button onClick={() => onReverse(m)} className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-micro text-grey-500 hover:bg-grey-100 hover:text-veto-700" title="Reverse mapping (admin)">
                  <Undo2 size={11} /> Reverse
                </button>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
    </div>
  );
}

