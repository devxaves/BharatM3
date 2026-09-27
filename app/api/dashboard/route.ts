import { route } from '@/lib/api';
import { getDb } from '@/lib/db/client';
import { requirePermission } from '@/lib/governance/session';
import { dashboard } from '@/lib/queries/dashboard';

export const dynamic = 'force-dynamic';

export const GET = route(async () => {
  await requirePermission('dashboard:read');
  return dashboard(await getDb());
});
