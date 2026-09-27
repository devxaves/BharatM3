import { route } from '@/lib/api';
import { getDb } from '@/lib/db/client';
import { requirePermission } from '@/lib/governance/session';
import { evaluateMatching } from '@/lib/queries/evaluation';

export const dynamic = 'force-dynamic';

export const GET = route(async () => {
  await requirePermission('records:read');
  return evaluateMatching(await getDb());
});
