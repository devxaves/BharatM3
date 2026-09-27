import { route } from '@/lib/api';
import { getDb } from '@/lib/db/client';
import { requirePermission, toActor } from '@/lib/governance/session';
import { runMatching } from '@/lib/matching/engine';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** Full re-run with the current configuration. Decided recommendations are never overwritten. */
export const POST = route(async () => {
  const user = await requirePermission('matching:run');
  const db = await getDb();
  return db.transaction((tx) => runMatching(tx, { actor: toActor(user) }));
});
