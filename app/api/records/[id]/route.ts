import { ApiError, route } from '@/lib/api';
import { getDb } from '@/lib/db/client';
import { requirePermission } from '@/lib/governance/session';
import { getRecord } from '@/lib/queries/records';

export const dynamic = 'force-dynamic';

export const GET = route<{ params: { id: string } }>(async (_req, { params }) => {
  await requirePermission('records:read');
  const rec = await getRecord(await getDb(), params.id);
  if (!rec) throw new ApiError(404, 'Record not found');
  return rec;
});
