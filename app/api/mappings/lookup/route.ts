import { route } from '@/lib/api';
import { getDb } from '@/lib/db/client';
import { requirePermission } from '@/lib/governance/session';
import { lookup } from '@/lib/queries/canonical';

export const dynamic = 'force-dynamic';

export const GET = route(async (req) => {
  await requirePermission('mappings:read');
  const q = new URL(req.url).searchParams.get('q') ?? '';
  return lookup(await getDb(), q.slice(0, 120));
});
