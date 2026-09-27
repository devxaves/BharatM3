import { route } from '@/lib/api';
import { getDb } from '@/lib/db/client';
import { verifyAuditChain } from '@/lib/governance/audit';
import { requirePermission } from '@/lib/governance/session';

export const dynamic = 'force-dynamic';

export const GET = route(async () => {
  await requirePermission('records:read');
  const t0 = Date.now();
  const r = await verifyAuditChain(await getDb());
  return { ...r, ms: Date.now() - t0 };
});
