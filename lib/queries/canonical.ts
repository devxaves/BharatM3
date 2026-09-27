import { and, asc, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import { rowsOf, type DB } from '@/lib/db/client';
import { auditEvents, canonicalMaterials, materialMappings, organizations, rawMaterialRecords, users } from '@/lib/db/schema';

export async function listCanonical(db: DB) {
  const rows = await db
    .select({
      id: canonicalMaterials.id,
      cnmc: canonicalMaterials.cnmc,
      shortCode: canonicalMaterials.shortCode,
      description: canonicalMaterials.canonicalDescription,
      category: canonicalMaterials.categoryCode,
      unspsc: canonicalMaterials.unspscCode,
      baseUom: canonicalMaterials.baseUom,
      status: canonicalMaterials.status,
      version: canonicalMaterials.version,
      value: canonicalMaterials.estAnnualValueInr,
      createdAt: canonicalMaterials.createdAt,
      mappings: sql<number>`count(${materialMappings.id}) filter (where ${materialMappings.status} = 'ACTIVE')::int`,
      orgs: sql<string[]>`coalesce(array_agg(distinct ${organizations.code}) filter (where ${materialMappings.status} = 'ACTIVE'), '{}')`,
    })
    .from(canonicalMaterials)
    .leftJoin(materialMappings, eq(materialMappings.canonicalId, canonicalMaterials.id))
    .leftJoin(organizations, eq(organizations.id, materialMappings.orgId))
    .groupBy(canonicalMaterials.id)
    .orderBy(desc(canonicalMaterials.createdAt));
  return rows;
}

export async function canonicalMappings(db: DB, canonicalIds: string[]) {
  if (!canonicalIds.length) return [];
  return db
    .select({
      id: materialMappings.id,
      canonicalId: materialMappings.canonicalId,
      org: organizations.code,
      orgName: organizations.name,
      legacyCode: materialMappings.legacyCode,
      rawId: rawMaterialRecords.id,
      description: rawMaterialRecords.rawDescription,
      uom: rawMaterialRecords.rawUom,
      price: rawMaterialRecords.lastPoPriceInr,
      qty: rawMaterialRecords.annualQty,
      matchType: materialMappings.matchType,
      confidence: materialMappings.confidence,
      status: materialMappings.status,
      createdAt: materialMappings.createdAt,
      createdBy: users.name,
      reversalReason: materialMappings.reversalReason,
    })
    .from(materialMappings)
    .innerJoin(organizations, eq(organizations.id, materialMappings.orgId))
    .innerJoin(rawMaterialRecords, eq(rawMaterialRecords.id, materialMappings.rawRecordId))
    .leftJoin(users, eq(users.id, materialMappings.createdBy))
    .where(inArray(materialMappings.canonicalId, canonicalIds))
    .orderBy(asc(organizations.code), asc(materialMappings.legacyCode));
}

export async function getCanonical(db: DB, idOrCnmc: string) {
  const isUuid = /^[0-9a-f-]{36}$/i.test(idOrCnmc);
  const [c] = await db
    .select({ c: canonicalMaterials, createdBy: users.name })
    .from(canonicalMaterials)
    .leftJoin(users, eq(users.id, canonicalMaterials.createdBy))
    .where(isUuid ? eq(canonicalMaterials.id, idOrCnmc) : or(eq(canonicalMaterials.cnmc, idOrCnmc), eq(canonicalMaterials.shortCode, idOrCnmc)));
  if (!c) return null;
  const mappings = await canonicalMappings(db, [c.c.id]);
  const mappingIds = mappings.map((m) => m.id);
  const history = await db
    .select()
    .from(auditEvents)
    .where(or(eq(auditEvents.entityId, c.c.id), mappingIds.length ? inArray(auditEvents.entityId, mappingIds) : undefined))
    .orderBy(asc(auditEvents.seq));
  return { ...c.c, createdByName: c.createdBy, mappings, history };
}

/**
 * Legacy-code / text lookup. Exact code hits first, then pg_trgm fuzzy matches on the normalized description
 * and canonical description (trigram GIN indexes).
 */
export async function lookup(db: DB, q: string) {
  const term = q.trim();
  if (!term) return { exact: [], fuzzy: [] };
  const exact = await db
    .select({
      rawId: rawMaterialRecords.id,
      org: organizations.code,
      legacyCode: rawMaterialRecords.legacyCode,
      description: rawMaterialRecords.rawDescription,
      canonicalId: canonicalMaterials.id,
      cnmc: canonicalMaterials.cnmc,
      canonicalDescription: canonicalMaterials.canonicalDescription,
    })
    .from(rawMaterialRecords)
    .innerJoin(organizations, eq(organizations.id, rawMaterialRecords.orgId))
    .leftJoin(materialMappings, and(eq(materialMappings.rawRecordId, rawMaterialRecords.id), eq(materialMappings.status, 'ACTIVE')))
    .leftJoin(canonicalMaterials, eq(canonicalMaterials.id, materialMappings.canonicalId))
    .where(or(ilike(rawMaterialRecords.legacyCode, `%${term}%`), ilike(canonicalMaterials.cnmc, `%${term}%`), ilike(canonicalMaterials.shortCode, `%${term}%`)))
    .limit(25);
  const fuzzyRes = await db.execute(sql`
    SELECT r.id AS "rawId", o.code AS org, r.legacy_code AS "legacyCode", r.raw_description AS description,
           c.id AS "canonicalId", c.cnmc, c.canonical_description AS "canonicalDescription",
           round(greatest(similarity(n.normalized_description, upper(${term})), similarity(r.raw_description, upper(${term})))::numeric, 3)::float AS sim
    FROM normalized_material_records n
    JOIN raw_material_records r ON r.id = n.raw_id
    JOIN organizations o ON o.id = r.org_id
    LEFT JOIN material_mappings m ON m.raw_record_id = r.id AND m.status = 'ACTIVE'
    LEFT JOIN canonical_materials c ON c.id = m.canonical_id
    WHERE n.normalized_description % upper(${term}) OR r.raw_description ILIKE ${'%' + term + '%'}
    ORDER BY sim DESC
    LIMIT 25`);
  const fuzzy = rowsOf<{ rawId: string; org: string; legacyCode: string; description: string; canonicalId: string | null; cnmc: string | null; canonicalDescription: string | null; sim: number }>(fuzzyRes);
  const exactIds = new Set(exact.map((e) => e.rawId));
  return { exact, fuzzy: fuzzy.filter((f) => !exactIds.has(f.rawId)) };
}

export async function opportunities(db: DB, minOrgs = 3) {
  const res = await db.execute(sql`
    SELECT c.id, c.cnmc, c.short_code AS "shortCode", c.canonical_description AS description, c.category_code AS category, c.base_uom AS "baseUom",
           count(DISTINCT m.org_id)::int AS orgs,
           count(m.id)::int AS codes,
           array_agg(DISTINCT o.code ORDER BY o.code) AS "orgCodes",
           coalesce(sum(r.last_po_price_inr * r.annual_qty), 0)::float AS spend,
           coalesce(sum(r.annual_qty), 0)::float AS qty,
           min(r.last_po_price_inr)::float AS "minPrice",
           max(r.last_po_price_inr)::float AS "maxPrice",
           count(r.last_po_price_inr)::int AS "pricePoints"
    FROM canonical_materials c
    JOIN material_mappings m ON m.canonical_id = c.id AND m.status = 'ACTIVE'
    JOIN raw_material_records r ON r.id = m.raw_record_id
    JOIN organizations o ON o.id = m.org_id
    WHERE c.status = 'APPROVED'
    GROUP BY c.id
    HAVING count(DISTINCT m.org_id) >= ${minOrgs}
    ORDER BY spend DESC`);
  return rowsOf<{
    id: string;
    cnmc: string;
    shortCode: string;
    description: string;
    category: string;
    baseUom: string | null;
    orgs: number;
    codes: number;
    orgCodes: string[];
    spend: number;
    qty: number;
    minPrice: number | null;
    maxPrice: number | null;
    pricePoints: number;
  }>(res).map((r) => ({
    ...r,
    // ILLUSTRATIVE: demand-aggregation saving assumption applied to synthetic PO values
    estSaving: r.spend * (r.orgs >= 5 ? 0.12 : r.orgs === 4 ? 0.1 : 0.08),
    priceSpread: r.minPrice && r.maxPrice ? (r.maxPrice - r.minPrice) / r.minPrice : null,
  }));
}
