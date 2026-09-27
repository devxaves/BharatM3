import { and, eq, gte } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { ApiError, route } from '@/lib/api';
import { getDb } from '@/lib/db/client';
import { canonicalMaterials, materialMappings, organizations, sourceSystems } from '@/lib/db/schema';
import { toIdoc, toOData } from '@/lib/integration/sap';
import { canonicalMappings } from '@/lib/queries/canonical';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/export?org=CPCL&format=idoc|odata&since=2026-09-01
 * Delta export of all canonical materials relevant to one CPSE — what a scheduled ALE distribution
 * (BD10 / change pointers) or an S/4HANA inbound integration flow would consume.
 */
export const GET = route(async (req) => {
  const p = new URL(req.url).searchParams;
  const orgCode = (p.get('org') ?? '').toUpperCase();
  const format = p.get('format') === 'odata' ? 'odata' : 'idoc';
  const since = p.get('since');
  const db = await getDb();
  const [o] = await db.select({ id: organizations.id, code: organizations.code, client: sourceSystems.client }).from(organizations).leftJoin(sourceSystems, eq(sourceSystems.orgId, organizations.id)).where(eq(organizations.code, orgCode));
  if (!o) throw new ApiError(404, `Unknown CPSE "${orgCode}" — pass ?org=CPCL|NTPC|SAIL|CIL|BHEL|IOCL`);
  const rows = await db
    .selectDistinct({ c: canonicalMaterials })
    .from(canonicalMaterials)
    .innerJoin(materialMappings, eq(materialMappings.canonicalId, canonicalMaterials.id))
    .where(and(eq(materialMappings.orgId, o.id), eq(materialMappings.status, 'ACTIVE'), since ? gte(canonicalMaterials.updatedAt, new Date(since)) : undefined));
  const maps = await canonicalMappings(db, rows.map((r) => r.c.id));
  const docs = rows.map(({ c }) => {
    const exp = { ...c, mappings: maps.filter((m) => m.canonicalId === c.id).map((m) => ({ org: m.org, legacyCode: m.legacyCode, status: m.status })) };
    return format === 'odata' ? toOData(exp, { org: o.code }) : toIdoc(exp, { org: o.code, client: o.client ?? undefined });
  });
  return NextResponse.json({ cpse: o.code, format, count: docs.length, generatedAt: new Date().toISOString(), documents: docs });
});
