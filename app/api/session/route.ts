import { cookies } from 'next/headers';
import { eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { route, ApiError } from '@/lib/api';
import { getDb } from '@/lib/db/client';
import { approvalTasks, organizations, users } from '@/lib/db/schema';
import { PERMISSIONS, type Role } from '@/lib/governance/roles';
import { getSessionUser, SESSION_COOKIE } from '@/lib/governance/session';

export const dynamic = 'force-dynamic';

export const GET = route(async () => {
  const db = await getDb();
  const me = await getSessionUser();
  const all = await db
    .select({ id: users.id, name: users.name, role: users.role, designation: users.designation, org: organizations.code })
    .from(users)
    .leftJoin(organizations, eq(organizations.id, users.orgId));
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(approvalTasks).where(inArray(approvalTasks.status, ['OPEN', 'NEEDS_INFO']));
  return { user: me, permissions: PERMISSIONS[me.role as Role] ?? [], users: all, pendingReviews: Number(n), driver: process.env.DATABASE_URL ? 'neon' : 'pglite' };
});

export const POST = route(async (req) => {
  const { userId } = z.object({ userId: z.string().uuid() }).parse(await req.json());
  const db = await getDb();
  const [u] = await db.select().from(users).where(eq(users.id, userId));
  if (!u) throw new ApiError(404, 'Unknown user');
  cookies().set(SESSION_COOKIE, u.id, { httpOnly: true, sameSite: 'lax', path: '/' });
  return { ok: true };
});
