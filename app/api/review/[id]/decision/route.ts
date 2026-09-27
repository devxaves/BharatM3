import { route } from '@/lib/api';
import { getDb } from '@/lib/db/client';
import { decideRecommendation, DecisionInput } from '@/lib/governance/approval';
import { requirePermission, toActor } from '@/lib/governance/session';

export const dynamic = 'force-dynamic';

/** Steward decision: APPROVE | REJECT | EDIT (approve with edits) | REQUEST_INFO. Every call is audited. */
export const POST = route<{ params: { id: string } }>(async (req, { params }) => {
  const user = await requirePermission('review:decide');
  const input = DecisionInput.parse(await req.json());
  return decideRecommendation(await getDb(), params.id, input, toActor(user));
});
