import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { ApiError, route } from '@/lib/api';
import { getDb } from '@/lib/db/client';
import { synonymMaster } from '@/lib/db/schema';
import { appendAudit } from '@/lib/governance/audit';
import { requirePermission, toActor } from '@/lib/governance/session';

export const dynamic = 'force-dynamic';

/** Deactivate / reactivate (soft) — dictionary entries are never hard-deleted. */
export const PATCH = route<{ params: { id: string } }>(async (req, { params }) => {
  const user = await requirePermission('dictionary:write');
  const { active } = z.object({ active: z.boolean() }).parse(await req.json());
  const db = await getDb();
  return db.transaction(async (tx) => {
    const [row] = await tx.update(synonymMaster).set({ active, updatedAt: new Date(), updatedBy: user.id }).where(eq(synonymMaster.id, params.id)).returning();
    if (!row) throw new ApiError(404, 'Entry not found');
    await appendAudit(tx, toActor(user), { action: active ? 'DICTIONARY_TERM_ACTIVATED' : 'DICTIONARY_TERM_DEACTIVATED', entityType: 'synonym_master', entityId: row.id, payload: { term: row.term, expansion: row.expansion } });
    return row;
  });
});
