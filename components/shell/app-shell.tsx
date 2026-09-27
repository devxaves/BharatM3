'use client';

import { useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeftRight,
  BookText,
  Check,
  ChevronDown,
  ClipboardCheck,
  Database,
  FileUp,
  Gauge,
  Landmark,
  PlugZap,
  ScrollText,
  Search,
  SlidersHorizontal,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { api } from '@/lib/client/api';
import { useSession } from '@/lib/client/session';
import { cx } from '@/lib/format';
import { ROLE_LABEL, type Role } from '@/lib/governance/roles';
import { fadeUp, transition } from '@/lib/motion';

const NAV: { group: string; items: { href: string; label: string; icon: ReactNode; badge?: 'pending' }[] }[] = [
  { group: 'Overview', items: [{ href: '/dashboard', label: 'Dashboard', icon: <Gauge size={15} /> }] },
  {
    group: 'Material data',
    items: [
      { href: '/ingest', label: 'Ingestion', icon: <FileUp size={15} /> },
      { href: '/records', label: 'Material records', icon: <Database size={15} /> },
    ],
  },
  {
    group: 'Harmonisation',
    items: [
      { href: '/review', label: 'Review queue', icon: <ClipboardCheck size={15} />, badge: 'pending' },
      { href: '/mappings', label: 'CNMC & mappings', icon: <ArrowLeftRight size={15} /> },
      { href: '/opportunities', label: 'Procurement insight', icon: <Landmark size={15} /> },
    ],
  },
  {
    group: 'Governance',
    items: [
      { href: '/audit', label: 'Audit trail', icon: <ScrollText size={15} /> },
      { href: '/governance', label: 'Rules & configuration', icon: <SlidersHorizontal size={15} /> },
      { href: '/dictionary', label: 'Dictionary & UOM', icon: <BookText size={15} /> },
    ],
  },
  { group: 'Integration', items: [{ href: '/integration', label: 'SAP / ERP API', icon: <PlugZap size={15} /> }] },
];

function Mark() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden>
      <rect x="0.5" y="0.5" width="27" height="27" rx="5" fill="rgb(var(--c-primary-800))" stroke="rgb(var(--c-primary-600))" />
      <path d="M6 20V8.5l4.5 6 4.5-6V20" fill="none" stroke="rgb(var(--c-white))" strokeWidth="2" strokeLinejoin="round" />
      <path d="M18.5 8h3.2l-2 2.6c1.3.2 2.2 1.1 2.2 2.4 0 1.5-1.2 2.5-2.8 2.5-.8 0-1.5-.2-2-.6" fill="none" stroke="rgb(var(--c-teal-400))" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Sidebar({ pending }: { pending: number }) {
  const path = usePathname();
  const active = (href: string) => path === href || (href !== '/dashboard' && path.startsWith(href));
  return (
    <aside className="sticky top-0 z-30 flex h-screen w-sidebar shrink-0 flex-col bg-primary-900 text-primary-100">
      <Link href="/" className="flex h-topbar items-center gap-2.5 border-b border-white/10 px-4 hover:bg-white/5 transition-colors">
        <Mark />
        <div className="leading-tight">
          <div className="font-display text-[15px] font-bold tracking-[-0.01em] text-white">BharatM3</div>
          <div className="text-micro uppercase tracking-[0.08em] text-primary-300">National Material Master</div>
        </div>
      </Link>
      <nav className="scroll-thin flex-1 overflow-y-auto px-2 py-3">
        {NAV.map((g) => (
          <div key={g.group} className="mb-3">
            <div className="px-2.5 pb-1 text-micro font-semibold uppercase tracking-[0.1em] text-primary-300/70">{g.group}</div>
            {g.items.map((it) => {
              const on = active(it.href);
              return (
                <Link
                  key={it.href}
                  href={it.href}
                  className={cx('relative flex h-8 items-center gap-2.5 rounded px-2.5 text-dense transition-colors', on ? 'text-white' : 'text-primary-200 hover:bg-white/5 hover:text-white')}
                >
                  {on && <motion.span layoutId="nav-active" className="absolute inset-0 rounded bg-white/10 shadow-[inset_2px_0_0_rgb(var(--c-teal-400))]" transition={transition} />}
                  <span className="relative opacity-90">{it.icon}</span>
                  <span className="relative flex-1">{it.label}</span>
                  {it.badge === 'pending' && pending > 0 && (
                    <span className="relative rounded-sm bg-amber-500 px-1.5 font-mono text-micro font-semibold text-primary-950" title="Open steward tasks awaiting a decision">
                      {pending}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
      <div className="border-t border-white/10 px-4 py-3 text-micro leading-relaxed text-primary-300">
        <div className="font-semibold text-primary-200">SIH PS 26099 · MoPNG / CPCL</div>
        <div>Synthetic demonstration data — not actual CPSE records.</div>
      </div>
    </aside>
  );
}

function RoleSwitcher() {
  const { session } = useSession();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  if (!session) return <div className="h-8 w-48 animate-pulse rounded bg-grey-100" />;
  const switchTo = async (id: string) => {
    await api('/api/session', { method: 'POST', json: { userId: id } });
    setOpen(false);
    await qc.invalidateQueries();
  };
  const initials = session.user.name.split(' ').map((p) => p[0]).slice(0, 2).join('');
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} className="flex h-9 items-center gap-2.5 rounded border border-transparent pl-1 pr-2 hover:border-grey-200 hover:bg-grey-50" aria-haspopup="menu" aria-expanded={open}>
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary-100 font-display text-caption font-bold text-primary-800">{initials}</span>
        <span className="text-left leading-tight">
          <span className="block text-dense font-medium text-grey-900">{session.user.name}</span>
          <span className="block text-micro uppercase tracking-[0.06em] text-grey-500">
            {ROLE_LABEL[session.user.role as Role]} · {session.user.orgCode}
          </span>
        </span>
        <ChevronDown size={14} className="text-grey-400" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div {...fadeUp} role="menu" className="absolute right-0 top-11 z-40 w-80 rounded-md border border-grey-200 bg-white p-1 shadow-pop">
            <div className="px-2.5 pb-1.5 pt-1 text-micro text-grey-500">Act as (MVP role simulation — production uses CPSE SSO)</div>
            {session.users.map((u) => (
              <button key={u.id} role="menuitem" onClick={() => switchTo(u.id)} className="flex w-full items-center gap-2.5 rounded px-2.5 py-1.5 text-left hover:bg-grey-50">
                <span className="w-4 text-teal-600">{u.id === session.user.id && <Check size={14} />}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-dense font-medium text-grey-900">{u.name}</span>
                  <span className="block truncate text-caption text-grey-500">{u.designation}</span>
                </span>
                <span className="rounded-sm bg-grey-100 px-1.5 py-0.5 font-mono text-micro text-grey-700">{ROLE_LABEL[u.role as Role]}</span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function GlobalLookup() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName)) {
        e.preventDefault();
        ref.current?.focus();
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);
  return (
    <form
      className="relative w-[380px]"
      onSubmit={(e) => {
        e.preventDefault();
        if (q.trim()) router.push(`/mappings?q=${encodeURIComponent(q.trim())}`);
      }}
    >
      <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-grey-400" />
      <input ref={ref} value={q} onChange={(e) => setQ(e.target.value)} className="input h-8 pl-8 pr-8" placeholder="Look up legacy code, CNMC or description" aria-label="Global lookup" />
      <kbd className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm border border-grey-300 px-1 font-mono text-micro text-grey-500">/</kbd>
    </form>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { session } = useSession();
  const path = usePathname();

  if (path === '/') {
    return <main className="min-h-screen bg-grey-25">{children}</main>;
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar pending={session?.pendingReviews ?? 0} />
      <div className="min-w-[1080px] flex-1">
        <header className="sticky top-0 z-20 flex h-topbar items-center justify-between gap-4 border-b border-grey-200 bg-white/95 px-6 backdrop-blur-[2px]">
          <GlobalLookup />
          <div className="flex items-center gap-4">
            {session && (
              <span className="hidden items-center gap-1.5 text-caption text-grey-500 xl:flex" title="Database driver">
                <span className="h-1.5 w-1.5 rounded-full bg-high-600" />
                {session.driver === 'neon' ? 'Neon Postgres' : 'Embedded Postgres (PGlite)'} · pgvector · pg_trgm
              </span>
            )}
            <RoleSwitcher />
          </div>
        </header>
        <main className="px-6 pb-12 pt-5">{children}</main>
      </div>
    </div>
  );
}
