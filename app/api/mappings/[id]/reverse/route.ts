import { z } from 'zod';
import { route } from '@/lib/api';
import { getDb } from '@/lib/db/client';
import { reverseMapping } from '@/lib/governance/approval';
import { requirePermission, toActor } from '@/lib/governance/session';

export const dynamic = 'force-dynamic';

/** Reversible, non-destructive: the mapping row is kept with status REVERSED and a reason. */
export const POST = route<{ params: { id: string } }>(async (req, { params }) => {
  const user = await requirePermission('mappings:reverse');
  const { reason } = z.object({ reason: z.string().min(5).max(500) }).parse(await req.json());
  return reverseMapping(await getDb(), params.id, reason, toActor(user));
});
