import { desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { ApiError, route } from '@/lib/api';
import { getDb } from '@/lib/db/client';
import { appConfig, classificationMaster, matchingRuns, modelVersions, substitutionRules, synonymMaster, uomMaster, users } from '@/lib/db/schema';
import { appendAudit } from '@/lib/governance/audit';
import { requirePermission, toActor } from '@/lib/governance/session';
import { MATCHER_VERSION } from '@/lib/matching/config';
import { loadEngineConfig, loadSchemas } from '@/lib/matching/load-config';

export const dynamic = 'force-dynamic';

export const GET = route(async () => {
  await requirePermission('records:read');
  const db = await getDb();
  const [engine, schemas, rules, uoms, classes, runs, versions, dictStats] = await Promise.all([
    loadEngineConfig(db),
    loadSchemas(db),
    db.select().from(substitutionRules).orderBy(substitutionRules.categoryCode),
    db.select().from(uomMaster),
    db.select().from(classificationMaster),
    db
      .select({ run: matchingRuns, by: users.name, mv: modelVersions.matcherVersion, emb: modelVersions.embeddingModel })
      .from(matchingRuns)
      .innerJoin(modelVersions, eq(modelVersions.id, matchingRuns.modelVersionId))
      .leftJoin(users, eq(users.id, matchingRuns.triggeredBy))
      .orderBy(desc(matchingRuns.startedAt))
      .limit(20),
    db.select().from(modelVersions).orderBy(desc(modelVersions.createdAt)),
    db.select({ kind: synonymMaster.kind, n: sql<number>`count(*)::int` }).from(synonymMaster).where(eq(synonymMaster.active, true)).groupBy(synonymMaster.kind),
  ]);
  const [row] = await db.select({ updatedAt: appConfig.updatedAt, by: users.name }).from(appConfig).leftJoin(users, eq(users.id, appConfig.updatedBy)).where(eq(appConfig.key, 'engine'));
  return { engine, engineUpdatedAt: row?.updatedAt, engineUpdatedBy: row?.by, matcherVersion: MATCHER_VERSION, schemas, rules, uoms, classes, runs, versions, dictStats };
});

const Weights = z.object({ semantic: z.number(), attribute: z.number(), specification: z.number(), dimension: z.number(), classification: z.number(), uom: z.number(), procurement: z.number() });
const Thresholds = z.object({ duplicate: z.number(), nearDuplicate: z.number(), functional: z.number(), related: z.number(), autoQueue: z.number(), review: z.number() });
const Body = z.object({ weights: Weights, thresholds: Thresholds, reason: z.string().min(5).max(500) });

export const PUT = route(async (req) => {
  const user = await requirePermission('config:write');
  const body = Body.parse(await req.json());
  const sum = Object.values(body.weights).reduce((s, v) => s + v, 0);
  if (Math.abs(sum - 1) > 0.001) throw new ApiError(422, `Weights must sum to 1.00 (currently ${sum.toFixed(3)})`);
  const t = body.thresholds;
  if (!(t.duplicate > t.nearDuplicate && t.nearDuplicate > t.functional && t.functional > t.related)) throw new ApiError(422, 'Thresholds must be strictly descending: duplicate > near-duplicate > functional > related');
  if (!(t.autoQueue >= t.review)) throw new ApiError(422, 'Auto-queue threshold must be ≥ review threshold');
  const db = await getDb();
  return db.transaction(async (tx) => {
    const prev = await loadEngineConfig(tx);
    const next = { ...prev, weights: body.weights, thresholds: body.thresholds };
    await tx.insert(appConfig).values({ key: 'engine', value: next, updatedBy: user.id }).onConflictDoUpdate({ target: appConfig.key, set: { value: next, updatedBy: user.id, updatedAt: new Date() } });
    await appendAudit(tx, toActor(user), { action: 'ENGINE_CONFIG_UPDATED', entityType: 'app_config', entityId: 'engine', reason: body.reason, payload: { before: { weights: prev.weights, thresholds: prev.thresholds }, after: { weights: next.weights, thresholds: next.thresholds } } });
    return { ok: true, engine: next };
  });
});
