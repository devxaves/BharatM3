import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { ApiError, route } from '@/lib/api';
import { getDb } from '@/lib/db/client';
import { substitutionRules } from '@/lib/db/schema';
import { appendAudit } from '@/lib/governance/audit';
import { requirePermission, toActor } from '@/lib/governance/session';

export const dynamic = 'force-dynamic';

export const PATCH = route<{ params: { id: string } }>(async (req, { params }) => {
  const user = await requirePermission('config:write');
  const { active, reason } = z.object({ active: z.boolean(), reason: z.string().min(5).max(300) }).parse(await req.json());
  const db = await getDb();
  return db.transaction(async (tx) => {
    const [row] = await tx.update(substitutionRules).set({ active }).where(eq(substitutionRules.id, params.id)).returning();
    if (!row) throw new ApiError(404, 'Rule not found');
    await appendAudit(tx, toActor(user), { action: active ? 'SUBSTITUTION_RULE_ACTIVATED' : 'SUBSTITUTION_RULE_WITHDRAWN', entityType: 'substitution_rule', entityId: row.id, reason, payload: { category: row.categoryCode, attribute: row.attributeKey, from: row.fromValue, to: row.toValue } });
    return row;
  });
});
