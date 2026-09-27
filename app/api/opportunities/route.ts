import { route } from '@/lib/api';
import { getDb } from '@/lib/db/client';
import { requirePermission } from '@/lib/governance/session';
import { canonicalMappings, opportunities } from '@/lib/queries/canonical';

export const dynamic = 'force-dynamic';

export const GET = route(async (req) => {
  await requirePermission('dashboard:read');
  const min = Math.max(2, Number(new URL(req.url).searchParams.get('minOrgs') ?? 3));
  const db = await getDb();
  const items = await opportunities(db, min);
  const mappings = await canonicalMappings(db, items.map((i) => i.id));
  return { items, mappings, assumption: 'ILLUSTRATIVE — savings assume 8% (3 CPSEs), 10% (4) or 12% (5+) demand-aggregation benefit applied to synthetic last-PO values × annual quantity. Not real pricing data.' };
});
