import { eq, sql } from 'drizzle-orm';
import type { DB } from '@/lib/db/client';
import {
  appConfig,
  categoryAttributeSchemas,
  classificationMaster,
  ingestionBatches,
  materialCategories,
  matchRecommendations,
  organizations,
  rawMaterialRecords,
  roles,
  sourceSystems,
  substitutionRules,
  synonymMaster,
  uomMaster,
  users,
} from '@/lib/db/schema';
import { decideRecommendation } from '@/lib/governance/approval';
import { appendAudit, SYSTEM_ACTOR, type Actor } from '@/lib/governance/audit';
import { DICTIONARY_SEED } from '@/lib/ingestion/dictionary-seed';
import { classifyBatch, ingestRows, normalizeBatch } from '@/lib/ingestion/pipeline';
import { UOM_SEED } from '@/lib/ingestion/uom';
import { DEFAULT_CATEGORY_SCHEMAS } from '@/lib/matching/categories';
import { DEFAULT_ENGINE_CONFIG } from '@/lib/matching/config';
import { runMatching } from '@/lib/matching/engine';
import { generateSeedRecords, mulberry32, ORGS } from './catalog';
import { CLASSIFICATION_SEED, ROLES_SEED, SUBSTITUTION_RULES_SEED, USERS_SEED } from './reference-data';

const DAY = 86_400_000;

/** Clusters whose historical approvals are seeded so the procurement-opportunity view has real data. */
const DEMO_APPROVED_CLUSTERS = new Set([
  'BRG-6205-2RS-C3',
  'VLV-GATE-4-150-WCB',
  'CBL-1.1-3.5x95-AL',
  'FST-BOLT-M16x80-8.8-HDG',
  'BRG-NU310',
  'CBL-1.1-3.5x240-AL',
  'BRG-22216',
  'PMP-S-100x50',
]);

export interface SeedLog {
  (msg: string): void;
}

export async function ensureSeeded(db: DB, log: SeedLog = () => {}) {
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(organizations);
  if (Number(n) > 0) return false;
  await seedDatabase(db, log);
  return true;
}

export async function seedDatabase(db: DB, log: SeedLog = console.log) {
  const t0 = Date.now();
  const now = Date.now();
  const tIngest = new Date(now - 34 * DAY);

  // ── Reference data ───────────────────────────────────────────────────────
  await db.insert(roles).values(ROLES_SEED.map((r) => ({ code: r.code, name: r.name, permissions: [...r.permissions] })));
  const orgRows = await db.insert(organizations).values(ORGS.map((o) => ({ code: o.code, name: o.name, sector: o.sector, ministry: o.ministry, hq: o.hq }))).returning();
  const orgId = Object.fromEntries(orgRows.map((o) => [o.code, o.id]));
  const ssRows = await db
    .insert(sourceSystems)
    .values(ORGS.map((o) => ({ orgId: orgId[o.code], name: o.system.name, systemType: o.system.type, version: o.system.version, client: o.system.client })))
    .returning();
  const ssOf = Object.fromEntries(ssRows.map((s) => [s.orgId, s.id]));
  const userRows = await db
    .insert(users)
    .values(USERS_SEED.map((u) => ({ name: u.name, email: u.email, role: u.role, orgId: orgId[u.org], designation: u.designation })))
    .returning();
  const userOf = (key: (typeof USERS_SEED)[number]['key']): Actor => {
    const u = userRows[USERS_SEED.findIndex((x) => x.key === key)];
    return { id: u.id, name: u.name, role: u.role };
  };
  await db.insert(materialCategories).values([
    ...Object.values(DEFAULT_CATEGORY_SCHEMAS).map((s) => ({ code: s.code, name: s.name, cnmcPrefix: s.cnmcPrefix, defaultUnspsc: s.defaultUnspsc, description: `${s.fields.length} governed attributes` })),
    { code: 'UNCLASSIFIED', name: 'Unclassified', cnmcPrefix: 'GEN', defaultUnspsc: null, description: 'Awaiting manual classification' },
  ]);
  await db.insert(categoryAttributeSchemas).values(Object.values(DEFAULT_CATEGORY_SCHEMAS).map((s) => ({ categoryCode: s.code, version: 1, schema: s })));
  await db.insert(uomMaster).values(UOM_SEED);
  await db.insert(synonymMaster).values(DICTIONARY_SEED.map((d) => ({ term: d.term, expansion: d.expansion, kind: d.kind, categoryCode: d.category })));
  await db.insert(classificationMaster).values(CLASSIFICATION_SEED.map((c) => ({ categoryCode: c.category, subtype: c.subtype, unspscCode: c.unspscCode, unspscTitle: c.unspscTitle })));
  await db.insert(substitutionRules).values(SUBSTITUTION_RULES_SEED.map((r) => ({ categoryCode: r.category, attributeKey: r.attributeKey, fromValue: r.fromValue, toValue: r.toValue, bidirectional: r.bidirectional, rationale: r.rationale, approvedBy: r.approvedBy })));
  await db.insert(appConfig).values({ key: 'engine', value: DEFAULT_ENGINE_CONFIG });
  await appendAudit(db, SYSTEM_ACTOR, {
    action: 'PLATFORM_INITIALISED',
    entityType: 'platform',
    entityId: 'unimat',
    payload: { organizations: ORGS.length, dictionaryTerms: DICTIONARY_SEED.length, uomCodes: UOM_SEED.length, substitutionRules: SUBSTITUTION_RULES_SEED.length, note: 'Synthetic demonstration dataset — not real CPSE records' },
    at: new Date(tIngest.getTime() - DAY),
  });
  log(`  reference data: ${ORGS.length} orgs, ${USERS_SEED.length} users, ${DICTIONARY_SEED.length} dictionary terms`);

  // ── CPSE extracts through the real ingestion pipeline ────────────────────
  const records = generateSeedRecords();
  const entry = userOf('entry');
  const byOrg = new Map<string, typeof records>();
  for (const r of records) byOrg.set(r.org, [...(byOrg.get(r.org) ?? []), r]);
  let k = 0;
  for (const [org, rows] of byOrg) {
    const at = new Date(tIngest.getTime() + k++ * 3_600_000);
    const res = await ingestRows(db, {
      orgId: orgId[org],
      sourceSystemId: ssOf[orgId[org]],
      fileName: `${org}_MM_material_master_extract_2026-08.csv`,
      rows: rows.map((r) => ({
        legacyCode: r.legacyCode,
        description: r.description,
        longText: r.longText,
        uom: r.uom,
        manufacturer: r.manufacturer,
        partNumber: r.partNumber,
        materialGroup: r.materialGroup,
        unitPriceInr: r.unitPriceInr,
        annualQty: r.annualQty,
        payload: { _seedTruthKey: r.truthKey, source: 'synthetic' },
      })),
      actor: entry,
      at,
    });
    log(`  ingested ${org}: ${res.inserted} records`);
  }
  const n = await normalizeBatch(db, null);
  const c = await classifyBatch(db, null);
  log(`  normalized ${n.normalized} (abbreviations expanded: ${n.abbreviationsExpanded}); classified ${JSON.stringify(c.byCategory)}`);
  const run = await runMatching(db, { actor: SYSTEM_ACTOR, at: new Date(tIngest.getTime() + 6 * 3_600_000) });
  await db.update(ingestionBatches).set({ status: 'MATCHED' });
  log(`  matching: ${run.pairsEvaluated} pairs → ${run.recommendationsWritten} recommendations ${JSON.stringify(run.byMatchType)} in ${run.durationMs} ms`);

  // ── Historical steward decisions (Wave-1 harmonisation) ──────────────────
  await seedHistoricalDecisions(db, [userOf('steward'), userOf('steward2')], now, log);
  // Nightly re-run after Wave-1 decisions: new pairs into approved groups collapse to one task per group
  const rerun = await runMatching(db, { actor: SYSTEM_ACTOR, at: new Date(now - 2 * 3_600_000) });
  log(`  nightly re-run: ${rerun.recommendationsWritten} open/updated recommendations`);
  log(`  seed complete in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}

async function seedHistoricalDecisions(db: DB, stewards: Actor[], now: number, log: SeedLog) {
  const rng = mulberry32(4242);
  const recs = await db
    .select({
      id: matchRecommendations.id,
      a: matchRecommendations.recordAId,
      b: matchRecommendations.recordBId,
      type: matchRecommendations.matchType,
      routing: matchRecommendations.routing,
      vetoed: matchRecommendations.vetoed,
      score: matchRecommendations.finalScore,
      reasons: matchRecommendations.reasonCodes,
    })
    .from(matchRecommendations)
    .where(eq(matchRecommendations.status, 'PENDING'));
  const raws = await db.select({ id: rawMaterialRecords.id, payload: rawMaterialRecords.rawPayload }).from(rawMaterialRecords);
  const truth = new Map(raws.map((r) => [r.id, (r.payload as { _seedTruthKey?: string } | null)?._seedTruthKey ?? '']));

  type Plan = { id: string; action: 'APPROVE' | 'REJECT' | 'REQUEST_INFO'; note?: string };
  const plan: Plan[] = [];
  const approvable = ['IDENTICAL', 'DUPLICATE', 'NEAR_DUPLICATE'];
  for (const r of recs.sort((x, y) => y.score - x.score)) {
    const ta = truth.get(r.a)!;
    const same = ta === truth.get(r.b);
    if (same && approvable.includes(r.type) && (DEMO_APPROVED_CLUSTERS.has(ta) || (r.routing === 'AUTO_QUEUE' && rng() < 0.55) || (r.routing === 'REVIEW' && rng() < 0.18))) {
      plan.push({ id: r.id, action: 'APPROVE', note: r.routing === 'AUTO_QUEUE' ? 'Fast-track: deterministic identity confirmed' : 'Verified against OEM catalogue' });
    }
  }
  const fe = recs.filter((r) => r.type === 'FUNCTIONALLY_EQUIVALENT' && truth.get(r.a) !== truth.get(r.b));
  const rejectReasons: Record<string, string> = {
    SEAL_TYPE: 'Seal type differs (sealed vs shielded) — not interchangeable for dusty coal-handling duty',
    FINISH: 'Coating differs; PTFE-coated studs are specified for offshore/corrosive service only',
    GRADE: 'Property class substitution not approved for this joint without engineering sign-off',
    CLEARANCE: 'Clearance class differs; C3 required for hot-running motor bearings',
    DEFAULT: 'Attributes differ materially; retain as separate materials',
  };
  for (const r of fe.slice(0, 40).filter(() => rng() < 0.2).slice(0, 6)) {
    const code = r.reasons.find((x) => x.startsWith('ATTR_CONFLICT:') || x.startsWith('SUBSTITUTION_RULE_APPLIED:'))?.split(':')[1] ?? 'DEFAULT';
    plan.push({ id: r.id, action: 'REJECT', note: rejectReasons[code] ?? rejectReasons.DEFAULT });
  }
  for (const r of recs.filter((x) => x.type === 'INSUFFICIENT_DATA').slice(0, 3)) {
    plan.push({ id: r.id, action: 'REQUEST_INFO', note: 'Source CPSE to provide size, rating and material from the purchase specification' });
  }

  // Spread over the last 30 days, chronologically, so the audit chain reads naturally
  const start = now - 30 * DAY;
  const step = (29 * DAY) / Math.max(plan.length, 1);
  let approved = 0;
  let rejected = 0;
  let skipped = 0;
  for (let i = 0; i < plan.length; i++) {
    const p = plan[i];
    const at = new Date(start + i * step + Math.floor(rng() * step * 0.6));
    const [cur] = await db.select({ status: matchRecommendations.status }).from(matchRecommendations).where(eq(matchRecommendations.id, p.id));
    if (cur?.status !== 'PENDING') {
      skipped++;
      continue;
    }
    try {
      await decideRecommendation(db, p.id, { action: p.action, note: p.note }, stewards[i % 2], at);
      if (p.action === 'APPROVE') approved++;
      if (p.action === 'REJECT') rejected++;
    } catch {
      skipped++;
    }
  }
  log(`  historical decisions: ${approved} approved, ${rejected} rejected, ${skipped} skipped/superseded`);
}

export async function countRecords(db: DB) {
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(rawMaterialRecords);
  return Number(n);
}

