import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { ApiError, route } from '@/lib/api';
import { getDb } from '@/lib/db/client';
import { canonicalMaterials, materialMappings, organizations, rawMaterialRecords } from '@/lib/db/schema';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/lookup?org=CPCL&code=10004512
 * CPSE-facing mapping lookup: legacy code → Common National Material Code + sibling codes in other CPSEs.
 */
export const GET = route(async (req) => {
  const p = new URL(req.url).searchParams;
  const { org, code } = z.object({ org: z.string().min(2).max(10), code: z.string().min(1).max(60) }).parse({ org: p.get('org'), code: p.get('code') });
  const db = await getDb();
  const [o] = await db.select().from(organizations).where(eq(organizations.code, org.toUpperCase()));
  if (!o) throw new ApiError(404, `Unknown CPSE ${org}`);
  const [raw] = await db.select().from(rawMaterialRecords).where(and(eq(rawMaterialRecords.orgId, o.id), eq(rawMaterialRecords.legacyCode, code)));
  if (!raw) throw new ApiError(404, `Legacy code ${code} not found for ${o.code}`);
  const [m] = await db
    .select({ mapping: materialMappings, canonical: canonicalMaterials })
    .from(materialMappings)
    .innerJoin(canonicalMaterials, eq(canonicalMaterials.id, materialMappings.canonicalId))
    .where(and(eq(materialMappings.rawRecordId, raw.id), eq(materialMappings.status, 'ACTIVE')));
  if (!m) return { cpse: o.code, legacy_code: code, status: 'NOT_YET_HARMONISED', cnmc: null, siblings: [] };
  const siblings = await db
    .select({ cpse: organizations.code, legacy_code: materialMappings.legacyCode, match_type: materialMappings.matchType })
    .from(materialMappings)
    .innerJoin(organizations, eq(organizations.id, materialMappings.orgId))
    .where(and(eq(materialMappings.canonicalId, m.canonical.id), eq(materialMappings.status, 'ACTIVE')));
  return {
    cpse: o.code,
    legacy_code: code,
    status: 'HARMONISED',
    cnmc: m.canonical.cnmc,
    short_code: m.canonical.shortCode,
    internal_uuid: m.canonical.id,
    canonical_description: m.canonical.canonicalDescription,
    match_type: m.mapping.matchType,
    confidence: m.mapping.confidence,
    siblings: siblings.filter((s) => !(s.cpse === o.code && s.legacy_code === code)),
  };
});
