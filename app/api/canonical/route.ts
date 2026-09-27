import { route } from '@/lib/api';
import { getDb } from '@/lib/db/client';
import { requirePermission } from '@/lib/governance/session';
import { canonicalMappings, listCanonical } from '@/lib/queries/canonical';

export const dynamic = 'force-dynamic';

export const GET = route(async () => {
  await requirePermission('mappings:read');
  const db = await getDb();
  const canonical = await listCanonical(db);
  const mappings = await canonicalMappings(db, canonical.map((c) => c.id));
  return { canonical, mappings };
});
