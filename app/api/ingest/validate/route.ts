import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { route } from '@/lib/api';
import { getDb } from '@/lib/db/client';
import { rawMaterialRecords } from '@/lib/db/schema';
import { applyMapping } from '@/lib/ingestion/columns';
import { rowHash } from '@/lib/ingestion/pipeline';
import { processRecord } from '@/lib/ingestion/process';
import { loadDictionary, loadSchemas, loadUomMaster } from '@/lib/matching/load-config';
import { requirePermission } from '@/lib/governance/session';

export const dynamic = 'force-dynamic';

const Body = z.object({ orgId: z.string().uuid(), mapping: z.record(z.string()), rows: z.array(z.record(z.string())).max(20000) });

/** Step 2 — data-quality preview before anything is written (missing fields, abbreviations, UOM issues, repeats). */
export const POST = route(async (req) => {
  await requirePermission('ingest:write');
  const body = Body.parse(await req.json());
  const db = await getDb();
  const [dictionary, uomMaster, schemas] = await Promise.all([loadDictionary(db), loadUomMaster(db), loadSchemas(db)]);
  const rows = applyMapping(body.rows, body.mapping);

  const missing = { legacyCode: 0, description: 0, uom: 0, manufacturer: 0, partNumber: 0 };
  const abbreviations = new Map<string, { expansion: string; count: number }>();
  const uomIssues = new Map<string, { flag: string; count: number; normalizedTo: string | null }>();
  const categories: Record<string, number> = {};
  let insufficient = 0;
  const seen = new Set<string>();
  let inFileDuplicates = 0;
  const samples: { legacyCode: string; description: string; normalized: string; category: string; flags: string[] }[] = [];

  for (const r of rows) {
    if (!r.legacyCode) missing.legacyCode++;
    if (!r.description) missing.description++;
    if (!r.uom) missing.uom++;
    if (!r.manufacturer) missing.manufacturer++;
    if (!r.partNumber) missing.partNumber++;
    if (seen.has(r.legacyCode)) inFileDuplicates++;
    seen.add(r.legacyCode);
    if (!r.description) continue;
    const p = processRecord({ legacyCode: r.legacyCode, description: r.description, longText: r.longText, uom: r.uom, manufacturer: r.manufacturer, partNumber: r.partNumber }, { dictionary, uomMaster, schemas });
    categories[p.category] = (categories[p.category] ?? 0) + 1;
    if (p.missingRequired.length) insufficient++;
    for (const e of p.expansions) {
      const cur = abbreviations.get(e.term) ?? { expansion: e.expansion, count: 0 };
      cur.count++;
      abbreviations.set(e.term, cur);
    }
    for (const f of p.qualityFlags.filter((x) => x.startsWith('UOM_'))) {
      const key = `${r.uom ?? '∅'}|${f}`;
      const cur = uomIssues.get(key) ?? { flag: f, count: 0, normalizedTo: p.uom.code };
      cur.count++;
      uomIssues.set(key, cur);
    }
    if (samples.length < 6) samples.push({ legacyCode: r.legacyCode, description: r.description, normalized: p.normalized, category: p.category, flags: p.qualityFlags });
  }

  const hashes = rows.filter((r) => r.legacyCode && r.description).map((r) => rowHash(body.orgId, r));
  let alreadyIngested = 0;
  for (let i = 0; i < hashes.length; i += 500) {
    const hit = await db.select({ id: rawMaterialRecords.id }).from(rawMaterialRecords).where(and(eq(rawMaterialRecords.orgId, body.orgId), inArray(rawMaterialRecords.rowHash, hashes.slice(i, i + 500))));
    alreadyIngested += hit.length;
  }

  return {
    rows: rows.length,
    valid: rows.filter((r) => r.legacyCode && r.description).length,
    missing,
    inFileDuplicates,
    alreadyIngested,
    insufficient,
    categories,
    abbreviations: [...abbreviations.entries()].map(([term, v]) => ({ term, ...v })).sort((a, b) => b.count - a.count),
    uomIssues: [...uomIssues.entries()].map(([k, v]) => ({ raw: k.split('|')[0], ...v })).sort((a, b) => b.count - a.count),
    samples,
  };
});
