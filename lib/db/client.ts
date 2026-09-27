import path from 'node:path';
import fs from 'node:fs';
import type { PgliteDatabase } from 'drizzle-orm/pglite';
import * as schema from './schema';

/**
 * Database access.
 *
 *  • DATABASE_URL set  → Neon serverless Postgres (pgvector + pg_trgm) via @neondatabase/serverless.
 *  • otherwise         → embedded PGlite (real Postgres 17 compiled to WASM) with the same two extensions,
 *                         persisted under ./.data/pglite. Zero external dependency for the demo (PRD principle 6).
 *
 * Both drivers expose the identical Drizzle Postgres API, so application code is driver-agnostic.
 */
export type DB = PgliteDatabase<typeof schema>;
export type Tx = Parameters<Parameters<DB['transaction']>[0]>[0];
export type Executor = DB | Tx;

interface DbState {
  db: DB;
  driver: 'neon' | 'pglite';
  close: () => Promise<void>;
}

const g = globalThis as unknown as { __bm3db?: Promise<DbState> };

export const MIGRATIONS_DIR = path.join(process.cwd(), 'drizzle');

async function connect(opts: { dataDir?: string; inMemory?: boolean } = {}): Promise<DbState> {
  const url = process.env.DATABASE_URL;
  if (url && !opts.inMemory) {
    const { Pool, neonConfig } = await import('@neondatabase/serverless');
    const ws = (await import('ws')).default;
    neonConfig.webSocketConstructor = ws;
    const pool = new Pool({ connectionString: url });
    const { drizzle } = await import('drizzle-orm/neon-serverless');
    const db = drizzle({ client: pool, schema }) as unknown as DB;
    await db.execute('CREATE EXTENSION IF NOT EXISTS vector');
    await db.execute('CREATE EXTENSION IF NOT EXISTS pg_trgm');
    const { migrate } = await import('drizzle-orm/neon-serverless/migrator');
    await migrate(db as never, { migrationsFolder: MIGRATIONS_DIR });
    return { db, driver: 'neon', close: () => pool.end() };
  }

  const { PGlite } = await import('@electric-sql/pglite');
  const { vector } = await import('@electric-sql/pglite-pgvector');
  const { pg_trgm } = await import('@electric-sql/pglite/contrib/pg_trgm');
  let dataDir: string | undefined;
  if (!opts.inMemory) {
    dataDir = opts.dataDir ?? process.env.PGLITE_DATA_DIR ?? path.join(process.cwd(), '.data', 'pglite');
    fs.mkdirSync(path.dirname(dataDir), { recursive: true });
  }
  const client = await PGlite.create(dataDir, { extensions: { vector, pg_trgm } });
  await client.exec('CREATE EXTENSION IF NOT EXISTS vector; CREATE EXTENSION IF NOT EXISTS pg_trgm;');
  const { drizzle } = await import('drizzle-orm/pglite');
  const db = drizzle({ client, schema });
  const { migrate } = await import('drizzle-orm/pglite/migrator');
  await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
  return { db, driver: 'pglite', close: () => client.close() };
}

/** Process-wide singleton (survives Next.js hot reloads). Auto-seeds an empty database on first use. */
export function getDbState(): Promise<DbState> {
  if (!g.__bm3db) {
    g.__bm3db = (async () => {
      const state = await connect();
      const { ensureSeeded } = await import('@/seed/seed');
      await ensureSeeded(state.db);
      return state;
    })().catch((err) => {
      g.__bm3db = undefined;
      throw err;
    });
  }
  return g.__bm3db;
}

export async function getDb(): Promise<DB> {
  return (await getDbState()).db;
}

/** Fresh, isolated database (in-memory PGlite) — used by tests and the seed CLI. */
export async function createStandaloneDb(opts: { dataDir?: string; inMemory?: boolean } = {}) {
  return connect(opts);
}

/** Normalise `db.execute()` results across drivers (PGlite and node-postgres both expose `.rows`). */
export function rowsOf<T>(res: unknown): T[] {
  return ((res as { rows?: T[] }).rows ?? (res as T[])) as T[];
}
