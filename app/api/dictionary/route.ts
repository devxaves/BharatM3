import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { ApiError, route } from '@/lib/api';
import { getDb } from '@/lib/db/client';
import { synonymMaster, users } from '@/lib/db/schema';
import { appendAudit } from '@/lib/governance/audit';
import { requirePermission, toActor } from '@/lib/governance/session';

export const dynamic = 'force-dynamic';

export const GET = route(async () => {
  await requirePermission('records:read');
  const db = await getDb();
  const entries = await db
    .select({ entry: synonymMaster, updatedBy: users.name })
    .from(synonymMaster)
    .leftJoin(users, eq(users.id, synonymMaster.updatedBy))
    .orderBy(desc(synonymMaster.updatedAt), synonymMaster.term);
  return { entries: entries.map((e) => ({ ...e.entry, updatedByName: e.updatedBy })) };
});

const Body = z.object({
  term: z.string().trim().min(1).max(40).transform((s) => s.toUpperCase()),
  expansion: z.string().trim().min(1).max(80).transform((s) => s.toUpperCase()),
  kind: z.enum(['ABBREVIATION', 'SYNONYM']),
  categoryCode: z.enum(['BEARING', 'VALVE', 'CABLE', 'FASTENER', 'PUMP']).nullable(),
});

/** Adding a term creates version 1; re-adding an existing term supersedes it with version n+1 (history is kept). */
export const POST = route(async (req) => {
  const user = await requirePermission('dictionary:write');
  const body = Body.parse(await req.json());
  const db = await getDb();
  return db.transaction(async (tx) => {
    const existing = await tx
      .select()
      .from(synonymMaster)
      .where(and(eq(synonymMaster.term, body.term), eq(synonymMaster.active, true)));
    const same = existing.find((e) => (e.categoryCode ?? null) === body.categoryCode);
    if (same && same.expansion === body.expansion) throw new ApiError(409, 'Identical active entry already exists');
    if (same) await tx.update(synonymMaster).set({ active: false, updatedAt: new Date(), updatedBy: user.id }).where(eq(synonymMaster.id, same.id));
    const [row] = await tx
      .insert(synonymMaster)
      .values({ ...body, version: (same?.version ?? 0) + 1, updatedBy: user.id })
      .returning();
    await appendAudit(tx, toActor(user), {
      action: same ? 'DICTIONARY_TERM_REVISED' : 'DICTIONARY_TERM_ADDED',
      entityType: 'synonym_master',
      entityId: row.id,
      payload: { term: row.term, expansion: row.expansion, kind: row.kind, category: row.categoryCode, version: row.version, previous: same ? { expansion: same.expansion, version: same.version } : null },
    });
    return row;
  });
});
