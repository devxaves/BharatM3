import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { ApiError, route } from '@/lib/api';
import { getDb } from '@/lib/db/client';
import { organizations, sourceSystems } from '@/lib/db/schema';
import { toIdoc, toOData } from '@/lib/integration/sap';
import { getCanonical } from '@/lib/queries/canonical';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/materials/{cnmc | shortCode | uuid}?format=idoc|odata|json&org=CPCL
 * Mock SAP/ERP adapter: returns the harmonised material shaped as a MATMAS05 IDoc or an S/4HANA
 * API_PRODUCT_SRV entity. `org` targets a specific CPSE (fills BISMT / ProductOldID with its legacy code).
 */
export const GET = route<{ params: { cnmc: string } }>(async (req, { params }) => {
  const url = new URL(req.url);
  const format = url.searchParams.get('format') ?? 'json';
  const orgCode = url.searchParams.get('org')?.toUpperCase();
  const db = await getDb();
  const c = await getCanonical(db, decodeURIComponent(params.cnmc));
  if (!c) throw new ApiError(404, `No canonical material ${params.cnmc}`);
  const exportable = { ...c, mappings: c.mappings.map((m) => ({ org: m.org, legacyCode: m.legacyCode, status: m.status })) };
  let receiver: { org: string; client?: string } | undefined;
  if (orgCode) {
    const [o] = await db.select({ code: organizations.code, client: sourceSystems.client }).from(organizations).leftJoin(sourceSystems, eq(sourceSystems.orgId, organizations.id)).where(eq(organizations.code, orgCode));
    if (!o) throw new ApiError(404, `Unknown CPSE ${orgCode}`);
    receiver = { org: o.code, client: o.client ?? undefined };
  }
  const headers = { 'x-unimat-cnmc': c.cnmc, 'cache-control': 'no-store' };
  if (format === 'idoc') return NextResponse.json(toIdoc(exportable, receiver), { headers });
  if (format === 'odata') return NextResponse.json(toOData(exportable, receiver), { headers });
  return NextResponse.json(
    {
      cnmc: c.cnmc,
      internal_uuid: c.id,
      short_code: c.shortCode,
      canonical_description: c.canonicalDescription,
      category: c.categoryCode,
      subtype: c.subtype,
      unspsc_code: c.unspscCode,
      attributes: Object.fromEntries(Object.entries(c.attributes).map(([k, v]) => [k, v.value])),
      base_uom: c.baseUom,
      status: c.status,
      version: c.version,
      legacy_mappings: c.mappings.map((m) => ({ cpse: m.org, legacy_code: m.legacyCode, match_type: m.matchType, confidence: m.confidence, status: m.status })),
    },
    { headers },
  );
});
