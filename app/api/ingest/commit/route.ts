import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { ApiError, route } from '@/lib/api';
import { getDb } from '@/lib/db/client';
import { organizations, sourceSystems } from '@/lib/db/schema';
import { applyMapping } from '@/lib/ingestion/columns';
import { ingestRows } from '@/lib/ingestion/pipeline';
import { requirePermission, toActor } from '@/lib/governance/session';

export const dynamic = 'force-dynamic';

const Body = z.object({
  orgId: z.string().uuid(),
  fileName: z.string().min(1).max(200),
  mapping: z.record(z.string()),
  rows: z.array(z.record(z.string())).min(1).max(20000),
});

/** Step 3 — Stage 1 ingestion (idempotent). Normalization / classification / matching run as separate stages. */
export const POST = route(async (req) => {
  const user = await requirePermission('ingest:write');
  const body = Body.parse(await req.json());
  const mapped = Object.values(body.mapping);
  if (!mapped.includes('legacyCode') || !mapped.includes('description')) throw new ApiError(400, 'Map at least the legacy code and description columns');
  const db = await getDb();
  const [org] = await db.select().from(organizations).where(eq(organizations.id, body.orgId));
  if (!org) throw new ApiError(404, 'Unknown organisation');
  const [ss] = await db.select().from(sourceSystems).where(eq(sourceSystems.orgId, org.id));
  const rows = applyMapping(body.rows, body.mapping);
  return db.transaction((tx) => ingestRows(tx, { orgId: org.id, sourceSystemId: ss?.id ?? null, fileName: body.fileName, rows, mapping: body.mapping, actor: toActor(user) }));
});
