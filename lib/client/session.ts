'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from './api';

export interface SessionData {
  user: { id: string; name: string; email: string; role: string; designation: string | null; orgCode: string | null };
  permissions: string[];
  users: { id: string; name: string; role: string; designation: string | null; org: string | null }[];
  pendingReviews: number;
  driver: 'neon' | 'pglite';
}

export function useSession() {
  const q = useQuery({ queryKey: ['session'], queryFn: () => api<SessionData>('/api/session'), staleTime: 10_000 });
  const can = (perm: string) => !!q.data?.permissions.includes(perm);
  return { ...q, session: q.data, can };
}
