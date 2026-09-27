import { cookies } from 'next/headers';
import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import { organizations, users } from '@/lib/db/schema';
import { ApiError } from '@/lib/api';
import { can } from './roles';
import type { Actor } from './audit';

export const SESSION_COOKIE = 'bm3_uid';

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: string;
  designation: string | null;
  orgCode: string | null;
}

/**
 * MVP role-based session (PRD §7.12: a role field + route guards, no OAuth).
 * The active user is chosen with the role switcher in the top bar; production would sit behind the
 * CPSE's SSO (SAML/OIDC) with roles mapped from AD groups — see docs/scale-roadmap.md.
 */
export async function getSessionUser(): Promise<SessionUser> {
  const db = await getDb();
  const uid = cookies().get(SESSION_COOKIE)?.value;
  const rows = await db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role, designation: users.designation, orgCode: organizations.code })
    .from(users)
    .leftJoin(organizations, eq(users.orgId, organizations.id));
  const found = rows.find((r) => r.id === uid) ?? rows.find((r) => r.role === 'data_steward') ?? rows[0];
  if (!found) throw new ApiError(503, 'No users seeded');
  return found;
}

export async function requirePermission(permission: string): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!can(user.role, permission)) throw new ApiError(403, `Role "${user.role}" lacks permission "${permission}"`);
  return user;
}

export const toActor = (u: SessionUser): Actor => ({ id: u.id, name: u.name, role: u.role });
