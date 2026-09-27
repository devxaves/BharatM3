import { z } from 'zod';
import { route } from '@/lib/api';
import { getDb } from '@/lib/db/client';
import { decideRecommendation } from '@/lib/governance/approval';
import { requirePermission, toActor } from '@/lib/governance/session';

export const dynamic = 'force-dynamic';

/**
 * Lightweight approval for the fast-track queue (≥ 0.95, deterministic identity). Each item is still an individual,
 * individually audited decision in its own transaction — nothing is merged silently.
 */
export const POST = route(async (req) => {
  const user = await requirePermission('review:decide');
  const { ids, note } = z.object({ ids: z.array(z.string().uuid()).min(1).max(200), note: z.string().max(500).optional() }).parse(await req.json());
  const db = await getDb();
  const results: { id: string; ok: boolean; cnmc?: string; error?: string }[] = [];
  for (const id of ids) {
    try {
      const r = await decideRecommendation(db, id, { action: 'APPROVE', note: note ?? 'Fast-track bulk approval' }, toActor(user));
      results.push({ id, ok: true, cnmc: r.canonical?.cnmc });
    } catch (e) {
      results.push({ id, ok: false, error: (e as Error).message });
    }
  }
  return { approved: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length, results };
});
