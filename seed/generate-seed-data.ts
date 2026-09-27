/**
 * Seed CLI — re-runnable (PRD §9).
 *
 *   npm run seed                 reset the database and regenerate the full synthetic dataset
 *   npm run seed -- --if-empty   seed only when the database has no data (used by `predev`)
 *   npm run seed:fixtures        only (re)write CSV/XLSX fixtures under seed/fixtures and public/samples
 */
import fs from 'node:fs';
import path from 'node:path';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { createStandaloneDb } from '@/lib/db/client';
import { generateIoclSample, generateSeedRecords } from './catalog';
import { countRecords, ensureSeeded, seedDatabase } from './seed';

const args = new Set(process.argv.slice(2));

function writeFixtures() {
  const dir = path.join(process.cwd(), 'seed', 'fixtures');
  fs.mkdirSync(dir, { recursive: true });
  const recs = generateSeedRecords();
  const byOrg = new Map<string, typeof recs>();
  for (const r of recs) byOrg.set(r.org, [...(byOrg.get(r.org) ?? []), r]);
  for (const [org, rows] of byOrg) {
    const csv = Papa.unparse(rows.map((r) => ({ legacy_code: r.legacyCode, description: r.description, long_text: r.longText ?? '', uom: r.uom, manufacturer: r.manufacturer ?? '', part_number: r.partNumber ?? '', material_group: r.materialGroup, last_po_price_inr: r.unitPriceInr ?? '', annual_qty: r.annualQty ?? '' })));
    fs.writeFileSync(path.join(dir, `${org}_material_master.csv`), csv);
  }
  const sample = generateIoclSample();
  const pub = path.join(process.cwd(), 'public', 'samples');
  fs.mkdirSync(pub, { recursive: true });
  fs.writeFileSync(path.join(pub, 'IOCL_material_extract.csv'), Papa.unparse(sample));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sample), 'MARA_extract');
  XLSX.writeFile(wb, path.join(pub, 'IOCL_material_extract.xlsx'));
  console.log(`fixtures: ${recs.length} records across ${byOrg.size} CPSEs → seed/fixtures; IOCL sample (${sample.length} rows) → public/samples`);
}

async function main() {
  writeFixtures();
  if (args.has('--fixtures-only')) return;

  const usingNeon = !!process.env.DATABASE_URL;
  const dataDir = process.env.PGLITE_DATA_DIR ?? path.join(process.cwd(), '.data', 'pglite');

  if (args.has('--if-empty')) {
    const { db, close } = await createStandaloneDb();
    const seeded = await ensureSeeded(db, (m) => console.log(m));
    console.log(seeded ? `database seeded (${await countRecords(db)} records)` : `database already populated (${await countRecords(db)} records) — skipping seed`);
    await close();
    return;
  }

  if (usingNeon) {
    const { db, close } = await createStandaloneDb();
    console.log('resetting Neon schema…');
    await db.execute('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public; DROP SCHEMA IF EXISTS drizzle CASCADE;');
    await close();
  } else if (fs.existsSync(dataDir)) {
    console.log(`resetting local PGlite database at ${dataDir}…`);
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
  const { db, close } = await createStandaloneDb();
  await seedDatabase(db, (m) => console.log(m));
  console.log(`done — ${await countRecords(db)} raw material records`);
  await close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
