import { z } from 'zod';
import { route } from '@/lib/api';
import { getDb } from '@/lib/db/client';
import { substitutionRules } from '@/lib/db/schema';
import { appendAudit } from '@/lib/governance/audit';
import { requirePermission, toActor } from '@/lib/governance/session';

export const dynamic = 'force-dynamic';

export const GET = route(async () => {
  await requirePermission('records:read');
  return { rules: await (await getDb()).select().from(substitutionRules) };
});

const Body = z.object({
  categoryCode: z.enum(['BEARING', 'VALVE', 'CABLE', 'FASTENER', 'PUMP']),
  attributeKey: z.string().min(1).max(40),
  fromValue: z.string().trim().min(1).max(40).transform((s) => s.toUpperCase()),
  toValue: z.string().trim().min(1).max(40).transform((s) => s.toUpperCase()),
  bidirectional: z.boolean(),
  rationale: z.string().min(10).max(500),
  approvedBy: z.string().min(3).max(120),
});

export const POST = route(async (req) => {
  const user = await requirePermission('config:write');
  const body = Body.parse(await req.json());
  const db = await getDb();
  return db.transaction(async (tx) => {
    const [row] = await tx.insert(substitutionRules).values(body).returning();
    await appendAudit(tx, toActor(user), { action: 'SUBSTITUTION_RULE_ADDED', entityType: 'substitution_rule', entityId: row.id, reason: body.rationale, payload: body });
    return row;
  });
});
