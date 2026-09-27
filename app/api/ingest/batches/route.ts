import { route } from '@/lib/api';
import { getDb } from '@/lib/db/client';
import { organizations } from '@/lib/db/schema';
import { requirePermission } from '@/lib/governance/session';
import { listBatches } from '@/lib/queries/records';

export const dynamic = 'force-dynamic';

export const GET = route(async () => {
  await requirePermission('records:read');
  const db = await getDb();
  const orgs = await db.select({ id: organizations.id, code: organizations.code, name: organizations.name, sector: organizations.sector }).from(organizations);
  return { batches: await listBatches(db), organizations: orgs };
});
