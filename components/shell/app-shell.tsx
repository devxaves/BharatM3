'use client';

import { useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeftRight,
  BookText,
  Check,
  ChevronDown,
  ClipboardCheck,
  Code2,
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

const NAV: {
  group: string;
  items: { href: string; label: string; icon: ReactNode; badge?: 'pending'; tag?: string }[];
}[] = [
  { group: 'Overview', items: [{ href: '/dashboard', label: 'Dashboard', icon: <Gauge size={15} /> }] },
  {
    group: 'Material data',
    items: [
      { href: '/ingest', label: 'Data Ingestion', icon: <FileUp size={15} /> },
      { href: '/records', label: 'Material Records', icon: <Database size={15} /> },
    ],
  },
  {
    group: 'Harmonisation',
    items: [
      { href: '/review', label: 'Review Queue', icon: <ClipboardCheck size={15} />, badge: 'pending' },
      { href: '/mappings', label: 'CNMC Register', icon: <ArrowLeftRight size={15} /> },
      { href: '/opportunities', label: 'Procurement Insights', icon: <Landmark size={15} /> },
    ],
  },
  {
    group: 'Governance',
    items: [
      { href: '/audit', label: 'Audit Trail', icon: <ScrollText size={15} /> },
      { href: '/governance', label: 'Rules & Matcher', icon: <SlidersHorizontal size={15} /> },
      { href: '/dictionary', label: 'Dictionary & UOM', icon: <BookText size={15} /> },
    ],
  },
  {
    group: 'Developer & ERP',
    items: [
      { href: '/integration', label: 'API Docs & ERP', icon: <Code2 size={15} />, tag: 'v1' },
    ],
  },
];

function Mark() {
  return (
    <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary-800">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white" aria-hidden>
        <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z" />
        <path d="M8 7h8" />
        <path d="M8 11h8" />
        <path d="m8 15 3 2 5-4" stroke="rgb(var(--c-amber-400))" />
      </svg>
    </div>
  );
}

/** Thin institutional strip above the masthead. */
function UtilityStrip({ driver }: { driver?: string }) {
  return (
    <div className="hidden border-b border-primary-950 bg-primary-900 text-primary-100 md:block">
      <div className="mx-auto flex h-7 max-w-[1600px] items-center justify-between px-6 text-micro font-medium">
        <div className="flex items-center gap-3">
          <span className="font-semibold uppercase tracking-[0.08em] text-white">Ministry of Petroleum &amp; Natural Gas</span>
          <span className="h-3 w-px bg-primary-600" />
          <span className="text-primary-200">National Material Master · SIH PS 26099</span>
        </div>
        {driver && (
          <div className="flex items-center gap-1.5 text-primary-200">
            <span className="h-1.5 w-1.5 rounded-full bg-high-400" />
            <span className="uppercase tracking-[0.08em]">Live</span>
            <span className="text-primary-300">·</span>
            {driver === 'neon' ? 'Neon Postgres' : 'Embedded Postgres (PGlite)'} · pgvector
          </div>
        )}
      </div>
    </div>
  );
}

function NavBar({ pending }: { pending: number }) {
  const path = usePathname();
  const active = (href: string) => path === href || (href !== '/dashboard' && path.startsWith(href));

  return (
    <nav aria-label="Primary" className="border-b border-grey-200 bg-white">
      <div className="scroll-thin mx-auto flex h-navbar max-w-[1600px] items-stretch gap-1 overflow-x-auto px-6">
        {NAV.map((g, gi) => (
          <div key={g.group} className="flex items-stretch">
            {gi > 0 && <span className="mx-1.5 my-3.5 w-px shrink-0 bg-grey-200" aria-hidden />}
            {g.items.map((it) => {
              const on = active(it.href);
              return (
                <Link
                  key={it.href}
                  href={it.href}
                  title={`${g.group} · ${it.label}`}
                  aria-current={on ? 'page' : undefined}
                  className={cx(
                    'relative flex shrink-0 items-center gap-2 whitespace-nowrap px-2.5 text-dense font-medium transition-colors duration-150',
                    on ? 'text-primary-800' : 'text-grey-600 hover:text-primary-800',
                  )}
                >
                  <span className={cx('hidden 2xl:inline', on ? 'text-primary-800' : 'text-grey-400')}>{it.icon}</span>
                  <span className={cx(on && 'font-semibold')}>{it.label}</span>
                  {it.tag && (
                    <span className="rounded-sm border border-grey-200 bg-grey-50 px-1 font-mono text-[10px] font-medium text-grey-600">{it.tag}</span>
                  )}
                  {it.badge === 'pending' && pending > 0 && (
                    <span
                      className="tabular rounded-sm bg-amber-500 px-1.5 text-micro font-semibold text-white"
                      title="Open steward tasks awaiting a decision"
                    >
                      {pending}
                    </span>
                  )}
                  {on && (
                    <motion.span
                      layoutId="nav-active"
                      className="absolute inset-x-2.5 bottom-0 h-0.5 bg-primary-800"
                      transition={transition}
                    >
                      <span className="absolute left-0 top-0 h-0.5 w-3 bg-amber-500" />
                    </motion.span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </div>
    </nav>
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

  if (!session) return <div className="h-8 w-44 animate-pulse rounded-md bg-grey-100" />;

  const switchTo = async (id: string) => {
    await api('/api/session', { method: 'POST', json: { userId: id } });
    setOpen(false);
    await qc.invalidateQueries();
  };

  const initials = session.user.name.split(' ').map((p) => p[0]).slice(0, 2).join('');

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex h-9 items-center gap-2.5 rounded-md border border-grey-200 bg-white pl-1.5 pr-2.5 hover:border-grey-300 hover:bg-grey-50 transition-colors"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary-100 text-caption font-semibold text-primary-800">
          {initials}
        </span>
        <span className="text-left leading-tight">
          <span className="block text-dense font-semibold text-grey-900">{session.user.name}</span>
          <span className="block text-micro font-medium uppercase tracking-[0.08em] text-grey-500">
            {ROLE_LABEL[session.user.role as Role]} · <span className="font-semibold text-primary-800">{session.user.orgCode}</span>
          </span>
        </span>
        <ChevronDown size={14} className="text-grey-400 ml-0.5" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div {...fadeUp} role="menu" className="absolute right-0 top-11 z-40 w-80 rounded-lg border border-grey-200 bg-white p-1.5 shadow-pop">
            <div className="px-3 pb-2 pt-1.5 text-micro font-semibold uppercase tracking-[0.08em] text-grey-500">
              Role Simulation (CPSE Single Sign-On)
            </div>
            {session.users.map((u) => (
              <button
                key={u.id}
                role="menuitem"
                onClick={() => switchTo(u.id)}
                className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left hover:bg-grey-50 transition-colors"
              >
                <span className="w-4 text-primary-800">{u.id === session.user.id && <Check size={15} />}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-dense font-semibold text-grey-900">{u.name}</span>
                  <span className="block truncate text-caption text-grey-500">{u.designation}</span>
                </span>
                <span className="rounded-sm border border-grey-200 bg-grey-50 px-1.5 py-0.5 text-micro font-semibold text-grey-700">
                  {ROLE_LABEL[u.role as Role]}
                </span>
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
      className="relative w-full max-w-[460px]"
      onSubmit={(e) => {
        e.preventDefault();
        if (q.trim()) router.push(`/mappings?q=${encodeURIComponent(q.trim())}`);
      }}
    >
      <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-grey-400" />
      <input
        ref={ref}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="input h-9 bg-grey-50 pl-9 pr-10 text-dense focus:bg-white"
        placeholder="Look up legacy code, CNMC, or item description…"
        aria-label="Global lookup"
      />
      <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-sm border border-grey-200 bg-white px-1.5 font-mono text-[11px] text-grey-500">
        /
      </kbd>
    </form>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { session } = useSession();
  const path = usePathname();

  if (path === '/') {
    return <main className="min-h-screen bg-grey-50">{children}</main>;
  }

  return (
    <div className="min-h-screen bg-grey-50">
      <header className="sticky top-0 z-30">
        <UtilityStrip driver={session?.driver} />
        <div className="border-b border-grey-150 bg-white">
          <div className="mx-auto flex h-topbar max-w-[1600px] items-center gap-6 px-6">
            <Link href="/" className="flex shrink-0 items-center gap-3">
              <Mark />
              <div className="leading-tight">
                <div className="text-[16px] font-bold tracking-tight text-grey-900">BharatM3</div>
                <div className="text-micro font-medium uppercase tracking-[0.08em] text-grey-500">National Material Master</div>
              </div>
            </Link>
            <span className="hidden h-8 w-px bg-grey-200 lg:block" aria-hidden />
            <div className="hidden min-w-0 flex-1 md:block">
              <GlobalLookup />
            </div>
            <div className="ml-auto flex items-center gap-3">
              <Link
                href="/integration"
                className="hidden h-9 items-center gap-1.5 rounded-md border border-grey-200 px-3 text-caption font-semibold text-grey-800 transition-colors hover:border-grey-300 hover:bg-grey-50 lg:inline-flex"
              >
                <Code2 size={14} className="text-primary-800" />
                API Explorer
              </Link>
              <RoleSwitcher />
            </div>
          </div>
        </div>
        <NavBar pending={session?.pendingReviews ?? 0} />
      </header>
      <main className="mx-auto max-w-[1600px] px-6 pb-16 pt-6">{children}</main>
    </div>
  );
}
