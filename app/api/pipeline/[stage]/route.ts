import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { ApiError, route } from '@/lib/api';
import { getDb } from '@/lib/db/client';
import { ingestionBatches } from '@/lib/db/schema';
import { batchQualitySummary, classifyBatch, normalizeBatch } from '@/lib/ingestion/pipeline';
import { runMatching } from '@/lib/matching/engine';
import { requirePermission, toActor } from '@/lib/governance/session';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * Discrete pipeline stages for a batch — the upload UI calls these one after another so each stage's progress
 * and result is visible (ingestion → normalization → classification & extraction → matching).
 */
export const POST = route<{ params: { stage: string } }>(async (req, { params }) => {
  const user = await requirePermission('ingest:write');
  const { batchId } = z.object({ batchId: z.string().uuid() }).parse(await req.json());
  const db = await getDb();
  const [batch] = await db.select().from(ingestionBatches).where(eq(ingestionBatches.id, batchId));
  if (!batch) throw new ApiError(404, 'Batch not found');
  const t0 = Date.now();
  switch (params.stage) {
    case 'normalize': {
      const r = await db.transaction((tx) => normalizeBatch(tx, batchId));
      return { stage: 'normalize', ...r, ms: Date.now() - t0 };
    }
    case 'classify': {
      const r = await db.transaction((tx) => classifyBatch(tx, batchId));
      return { stage: 'classify', ...r, quality: await batchQualitySummary(db, batchId), ms: Date.now() - t0 };
    }
    case 'match': {
      const r = await db.transaction((tx) => runMatching(tx, { batchId, actor: toActor(user) }));
      await db.update(ingestionBatches).set({ status: 'MATCHED', stats: r as unknown as Record<string, unknown> }).where(eq(ingestionBatches.id, batchId));
      return { stage: 'match', ...r, ms: Date.now() - t0 };
    }
    default:
      throw new ApiError(404, `Unknown stage "${params.stage}"`);
  }
});
