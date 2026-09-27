import { and, desc, eq, ilike, lt, or, sql } from 'drizzle-orm';
import { route } from '@/lib/api';
import { getDb } from '@/lib/db/client';
import { auditEvents } from '@/lib/db/schema';
import { requirePermission } from '@/lib/governance/session';

export const dynamic = 'force-dynamic';

/** Read-only audit log. There are intentionally no POST/PUT/PATCH/DELETE handlers for audit_events. */
export const GET = route(async (req) => {
  await requirePermission('records:read');
  const p = new URL(req.url).searchParams;
  const action = p.get('action');
  const q = p.get('q');
  const before = p.get('before');
  const limit = Math.min(500, Number(p.get('limit') ?? 300));
  const db = await getDb();
  const where = and(
    action ? eq(auditEvents.action, action) : undefined,
    q ? or(ilike(auditEvents.actorName, `%${q}%`), ilike(auditEvents.entityId, `%${q}%`), ilike(auditEvents.reason, `%${q}%`), sql`${auditEvents.payload}::text ILIKE ${'%' + q + '%'}`) : undefined,
    before ? lt(auditEvents.seq, Number(before)) : undefined,
  );
  const events = await db.select().from(auditEvents).where(where).orderBy(desc(auditEvents.seq)).limit(limit);
  const actions = await db.select({ action: auditEvents.action, n: sql<number>`count(*)::int` }).from(auditEvents).groupBy(auditEvents.action);
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(auditEvents);
  return { events, actions, total };
});
