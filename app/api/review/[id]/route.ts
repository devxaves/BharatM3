import { ApiError, route } from '@/lib/api';
import { getDb } from '@/lib/db/client';
import { requirePermission } from '@/lib/governance/session';
import { recommendationDetail } from '@/lib/queries/review';

export const dynamic = 'force-dynamic';

export const GET = route<{ params: { id: string } }>(async (_req, { params }) => {
  await requirePermission('records:read');
  const d = await recommendationDetail(await getDb(), params.id);
  if (!d) throw new ApiError(404, 'Recommendation not found');
  return d;
});
