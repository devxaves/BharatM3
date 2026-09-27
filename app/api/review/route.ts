import { z } from 'zod';
import { route } from '@/lib/api';
import { getDb } from '@/lib/db/client';
import { requirePermission } from '@/lib/governance/session';
import { queueCounts, reviewQueue } from '@/lib/queries/review';

export const dynamic = 'force-dynamic';

const Tab = z.enum(['FAST_TRACK', 'FULL_REVIEW', 'UNRESOLVED', 'VETOED', 'DECIDED']);

export const GET = route(async (req) => {
  await requirePermission('records:read');
  const tab = Tab.parse(new URL(req.url).searchParams.get('tab') ?? 'FULL_REVIEW');
  const db = await getDb();
  const [items, counts] = await Promise.all([reviewQueue(db, tab), queueCounts(db)]);
  return { tab, items, counts };
});
