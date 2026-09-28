import { createHash } from 'node:crypto';
import { asc, desc, sql } from 'drizzle-orm';
import type { Executor } from '@/lib/db/client';
import { auditEvents } from '@/lib/db/schema';

export const GENESIS_HASH = '0'.repeat(64);

export interface Actor {
  id: string | null;
  name: string;
  role: string;
}

export const SYSTEM_ACTOR: Actor = { id: null, name: 'UniMat matching engine', role: 'system' };

/** Deterministic JSON (sorted keys) so the hash is reproducible during verification. */
export function stableStringify(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`)
    .join(',')}}`;
}

export interface AuditBody {
  occurredAt: string;
  actorId: string | null;
  actorName: string;
  actorRole: string;
  action: string;
  entityType: string;
  entityId: string;
  reason: string | null;
  payload: Record<string, unknown>;
}

export function computeAuditHash(prevHash: string, body: AuditBody): string {
  return createHash('sha256').update(prevHash).update('|').update(stableStringify(body)).digest('hex');
}

/**
 * Append an immutable, hash-chained audit event. Must be called inside the same transaction as the state change
 * it records. An advisory transaction lock serialises writers so the chain never forks.
 */
export async function appendAudit(
  tx: Executor,
  actor: Actor,
  e: { action: string; entityType: string; entityId: string; reason?: string | null; payload?: Record<string, unknown>; at?: Date },
) {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(260990)`);
  const [last] = await tx.select({ hash: auditEvents.hash }).from(auditEvents).orderBy(desc(auditEvents.seq)).limit(1);
  const prevHash = last?.hash ?? GENESIS_HASH;
  const body: AuditBody = {
    occurredAt: (e.at ?? new Date()).toISOString(),
    actorId: actor.id,
    actorName: actor.name,
    actorRole: actor.role,
    action: e.action,
    entityType: e.entityType,
    entityId: e.entityId,
    reason: e.reason ?? null,
    payload: e.payload ?? {},
  };
  const hash = computeAuditHash(prevHash, body);
  const [row] = await tx
    .insert(auditEvents)
    .values({ ...body, occurredAt: new Date(body.occurredAt), prevHash, hash })
    .returning({ seq: auditEvents.seq, hash: auditEvents.hash });
  return row;
}

export interface ChainVerification {
  ok: boolean;
  checked: number;
  brokenAtSeq: number | null;
  headHash: string | null;
  message: string;
}

/** Recompute every hash from genesis; any edit, deletion or re-ordering breaks the chain. */
export async function verifyAuditChain(db: Executor): Promise<ChainVerification> {
  const rows = await db.select().from(auditEvents).orderBy(asc(auditEvents.seq));
  let prev = GENESIS_HASH;
  for (const r of rows) {
    const body: AuditBody = {
      occurredAt: r.occurredAt.toISOString(),
      actorId: r.actorId,
      actorName: r.actorName,
      actorRole: r.actorRole,
      action: r.action,
      entityType: r.entityType,
      entityId: r.entityId,
      reason: r.reason,
      payload: r.payload,
    };
    const expected = computeAuditHash(prev, body);
    if (r.prevHash !== prev || r.hash !== expected) {
      return { ok: false, checked: rows.length, brokenAtSeq: r.seq, headHash: rows.at(-1)?.hash ?? null, message: `Chain broken at event #${r.seq}` };
    }
    prev = r.hash;
  }
  return { ok: true, checked: rows.length, brokenAtSeq: null, headHash: rows.at(-1)?.hash ?? null, message: `All ${rows.length} events verified from genesis` };
}
