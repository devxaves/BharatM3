/**
 * End-to-end integration over a real (in-memory) Postgres with pgvector + pg_trgm:
 * seed → ingestion → normalization → classification → matching → approval / rejection → audit verification.
 */
import { and, count, eq, sql } from 'drizzle-orm';
import { createStandaloneDb, type DB } from '@/lib/db/client';
import { auditEvents, canonicalMaterials, matchRecommendations, materialMappings, organizations, rawMaterialRecords, users } from '@/lib/db/schema';
import { decideRecommendation } from '@/lib/governance/approval';
import { verifyAuditChain } from '@/lib/governance/audit';
import { ingestRows } from '@/lib/ingestion/pipeline';
import { seedDatabase } from '@/seed/seed';

let db: DB;
let close: () => Promise<void>;
let steward: { id: string; name: string; role: string };

beforeAll(async () => {
  const s = await createStandaloneDb({ inMemory: true });
  db = s.db;
  close = s.close;
  await seedDatabase(db, () => {});
  const [u] = await db.select().from(users).where(eq(users.role, 'data_steward')).limit(1);
  steward = { id: u.id, name: u.name, role: u.role };
});
afterAll(async () => close?.());

describe('seeded platform', () => {
  it('produces the documented record counts (PRD §9: ~500–1000 records, 5 CPSEs, 5 categories)', async () => {
    const [{ n }] = await db.select({ n: count() }).from(rawMaterialRecords);
    expect(n).toBeGreaterThanOrEqual(500);
    expect(n).toBeLessThanOrEqual(1000);
    const orgs = await db.execute(sql`SELECT count(DISTINCT org_id)::int AS n FROM raw_material_records`);
    expect((orgs as unknown as { rows: { n: number }[] }).rows[0].n).toBe(5);
  });

  it('matching yields every match type the checklist requires', async () => {
    const rows = await db.select({ t: matchRecommendations.matchType, n: count() }).from(matchRecommendations).groupBy(matchRecommendations.matchType);
    const types = Object.fromEntries(rows.map((r) => [r.t, r.n]));
    for (const t of ['IDENTICAL', 'DUPLICATE', 'NEAR_DUPLICATE', 'FUNCTIONALLY_EQUIVALENT', 'RELATED_BUT_NOT_EQUIVALENT', 'INSUFFICIENT_DATA']) expect(types[t] ?? 0).toBeGreaterThan(0);
  });

  it('every recommendation carries reason codes and an explanation', async () => {
    const rows = await db.select({ rc: matchRecommendations.reasonCodes, ex: matchRecommendations.explanation }).from(matchRecommendations);
    expect(rows.every((r) => r.rc.length > 0 && r.ex.length > 40)).toBe(true);
  });

  it('has at least one canonical material mapped from 3+ CPSEs (procurement opportunity)', async () => {
    const res = await db.execute(sql`SELECT canonical_id, count(DISTINCT org_id)::int AS orgs FROM material_mappings WHERE status='ACTIVE' GROUP BY canonical_id HAVING count(DISTINCT org_id) >= 3`);
    expect((res as unknown as { rows: unknown[] }).rows.length).toBeGreaterThan(0);
  });

  it('pressure-class false friends exist in the data and are vetoed', async () => {
    const rows = await db.select().from(matchRecommendations).where(eq(matchRecommendations.vetoed, true));
    expect(rows.some((r) => r.reasonCodes.includes('VETO_PRESSURE_CLASS_MISMATCH'))).toBe(true);
    expect(rows.every((r) => r.matchType === 'RELATED_BUT_NOT_EQUIVALENT')).toBe(true);
  });
});

describe('governance workflow', () => {
  it('approving a recommendation creates/extends a canonical material, maps legacy codes and writes audit events', async () => {
    const [rec] = await db
      .select()
      .from(matchRecommendations)
      .where(and(eq(matchRecommendations.status, 'PENDING'), eq(matchRecommendations.matchType, 'NEAR_DUPLICATE')))
      .limit(1);
    const auditBefore = (await db.select({ n: count() }).from(auditEvents))[0].n;
    const res = await decideRecommendation(db, rec.id, { action: 'APPROVE', note: 'integration test' }, steward);
    expect(res.status).toBe('APPROVED');
    const maps = await db.select().from(materialMappings).where(eq(materialMappings.canonicalId, res.canonical!.id));
    expect(maps.map((m) => m.rawRecordId)).toEqual(expect.arrayContaining([rec.recordAId, rec.recordBId]));
    const auditAfter = (await db.select({ n: count() }).from(auditEvents))[0].n;
    expect(auditAfter).toBeGreaterThan(auditBefore);
    const [ev] = await db.select().from(auditEvents).where(and(eq(auditEvents.entityId, rec.id), eq(auditEvents.action, 'RECOMMENDATION_APPROVED')));
    expect(ev.actorName).toBe(steward.name);
  });

  it('rejecting requires a reason, creates no canonical material and logs the reason', async () => {
    const [rec] = await db
      .select()
      .from(matchRecommendations)
      .where(and(eq(matchRecommendations.status, 'PENDING'), eq(matchRecommendations.matchType, 'FUNCTIONALLY_EQUIVALENT')))
      .limit(1);
    await expect(decideRecommendation(db, rec.id, { action: 'REJECT' }, steward)).rejects.toThrow(/reason/);
    const canonBefore = (await db.select({ n: count() }).from(canonicalMaterials))[0].n;
    await decideRecommendation(db, rec.id, { action: 'REJECT', note: 'Seal type not interchangeable for this duty' }, steward);
    const canonAfter = (await db.select({ n: count() }).from(canonicalMaterials))[0].n;
    expect(canonAfter).toBe(canonBefore);
    const [ev] = await db.select().from(auditEvents).where(and(eq(auditEvents.entityId, rec.id), eq(auditEvents.action, 'RECOMMENDATION_REJECTED')));
    expect(ev.reason).toBe('Seal type not interchangeable for this duty');
  });

  it('vetoed pairs can never be approved', async () => {
    const [rec] = await db.select().from(matchRecommendations).where(eq(matchRecommendations.vetoed, true)).limit(1);
    await expect(decideRecommendation(db, rec.id, { action: 'APPROVE' }, steward)).rejects.toThrow(/veto/i);
  });

  it('audit chain verifies from genesis and the table is append-only at the database layer', async () => {
    const v = await verifyAuditChain(db);
    expect(v.ok).toBe(true);
    expect(v.checked).toBeGreaterThan(100);
    const dbError = async (q: Promise<unknown>) => {
      try {
        await q;
        return 'no error';
      } catch (e) {
        const err = e as Error & { cause?: Error };
        return `${err.message} ${err.cause?.message ?? ''}`;
      }
    };
    expect(await dbError(db.execute(sql`UPDATE audit_events SET reason = 'tampered' WHERE seq = 1`))).toMatch(/append-only/);
    expect(await dbError(db.execute(sql`DELETE FROM audit_events WHERE seq = 1`))).toMatch(/append-only/);
  });

  it('re-ingesting the same file is idempotent', async () => {
    const [org] = await db.select().from(organizations).where(eq(organizations.code, 'CPCL'));
    const existing = await db.select().from(rawMaterialRecords).where(eq(rawMaterialRecords.orgId, org.id)).limit(5);
    const rows = existing.map((r) => ({ legacyCode: r.legacyCode, description: r.rawDescription, longText: r.rawLongText, uom: r.rawUom, manufacturer: r.rawManufacturer, partNumber: r.rawPartNumber }));
    const res = await ingestRows(db, { orgId: org.id, sourceSystemId: null, fileName: 'repeat.csv', rows, actor: steward });
    expect(res.inserted).toBe(0);
    expect(res.skippedDuplicates).toBe(rows.length);
  });
});
