import { route } from '@/lib/api';
import { getDb } from '@/lib/db/client';
import { requirePermission } from '@/lib/governance/session';
import { listRecords } from '@/lib/queries/records';

export const dynamic = 'force-dynamic';

export const GET = route(async () => {
  await requirePermission('records:read');
  return { records: await listRecords(await getDb()) };
});
