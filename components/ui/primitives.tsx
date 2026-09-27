'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { forwardRef, useEffect, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cx } from '@/lib/format';
import { fadeUp, transition } from '@/lib/motion';

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'approve';
type Size = 'sm' | 'md';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-primary-800 text-white hover:bg-primary-900 border border-primary-900 shadow-[inset_0_1px_0_rgb(255_255_255/0.08)]',
  secondary: 'bg-teal-600 text-white hover:bg-teal-700 border border-teal-700',
  outline: 'bg-white text-grey-800 border border-grey-300 hover:border-grey-400 hover:bg-grey-50',
  ghost: 'bg-transparent text-grey-700 border border-transparent hover:bg-grey-100',
  danger: 'bg-white text-veto-700 border border-veto-600/40 hover:bg-veto-50 hover:border-veto-600',
  approve: 'bg-high-600 text-white border border-high-700 hover:bg-high-700 shadow-[inset_0_1px_0_rgb(255_255_255/0.1)]',
};
const SIZES: Record<Size, string> = { sm: 'h-7 px-2.5 text-caption gap-1.5', md: 'h-8 px-3.5 text-dense gap-2' };

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; icon?: ReactNode; kbd?: string }>(
  function Button({ variant = 'outline', size = 'md', icon, kbd, className, children, ...rest }, ref) {
    return (
      <button
        ref={ref}
        className={cx(
          'inline-flex select-none items-center justify-center whitespace-nowrap rounded font-medium transition-[background-color,border-color,color,transform] duration-150 active:translate-y-px disabled:pointer-events-none disabled:opacity-45',
          VARIANTS[variant],
          SIZES[size],
          className,
        )}
        {...rest}
      >
        {icon}
        {children}
        {kbd && <kbd className={cx('ml-1 rounded-sm px-1 font-mono text-micro', variant === 'outline' || variant === 'ghost' || variant === 'danger' ? 'bg-grey-100 text-grey-500' : 'bg-white/15 text-white/80')}>{kbd}</kbd>}
      </button>
    );
  },
);

export function Panel({ title, actions, children, className, bodyClassName, subtitle }: { title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string }) {
  return (
    <section className={cx('panel', className)}>
      {(title || actions) && (
        <header className="panel-header">
          <div className="min-w-0">
            {title && <h2 className="panel-title">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-caption text-grey-500">{subtitle}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0 max-w-3xl">
        {eyebrow && <div className="eyebrow mb-1">{eyebrow}</div>}
        <h1 className="text-display">{title}</h1>
        {description && <p className="mt-1.5 text-body text-grey-600">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded-sm border border-grey-300 bg-white px-1 font-mono text-micro text-grey-600 shadow-[0_1px_0_rgb(var(--c-grey-300))]">{children}</kbd>;
}

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { value: T; label: ReactNode; count?: number; tone?: 'amber' | 'veto' | 'neutral' }[] }) {
  return (
    <div role="tablist" className="scroll-thin flex items-end gap-0.5 overflow-x-auto border-b border-grey-200">
      {items.map((it) => {
        const active = it.value === value;
        return (
          <button
            key={it.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(it.value)}
            className={cx('relative flex shrink-0 items-center gap-1.5 whitespace-nowrap px-2.5 pb-2 pt-1.5 text-dense font-medium transition-colors', active ? 'text-primary-900' : 'text-grey-500 hover:text-grey-800')}
          >
            {it.label}
            {it.count !== undefined && (
              <span
                className={cx(
                  'tabular rounded-sm px-1.5 text-micro font-semibold',
                  it.tone === 'amber' && it.count > 0 ? 'bg-amber-100 text-amber-800' : it.tone === 'veto' ? 'bg-veto-50 text-veto-700' : 'bg-grey-100 text-grey-600',
                )}
              >
                {it.count}
              </span>
            )}
            {active && <motion.span layoutId={`tab-underline-${items.map((i) => i.value).join('')}`} className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary-800" transition={transition} />}
          </button>
        );
      })}
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { value: T; label: ReactNode }[] }) {
  return (
    <div className="inline-flex rounded border border-grey-300 bg-grey-50 p-0.5">
      {items.map((it) => (
        <button
          key={it.value}
          onClick={() => onChange(it.value)}
          className={cx('relative h-6 rounded-sm px-2.5 text-caption font-medium transition-colors', it.value === value ? 'text-primary-900' : 'text-grey-500 hover:text-grey-800')}
        >
          {it.value === value && <motion.span layoutId={`seg-${items.map((i) => i.value).join('')}`} className="absolute inset-0 rounded-sm bg-white shadow-panel" transition={transition} />}
          <span className="relative">{it.label}</span>
        </button>
      ))}
    </div>
  );
}

export function Empty({ title, children, icon }: { title: string; children?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      {icon && <div className="mb-3 text-grey-400">{icon}</div>}
      <div className="font-display text-lead font-semibold text-grey-800">{title}</div>
      {children && <div className="mt-1 max-w-md text-dense text-grey-500">{children}</div>}
    </div>
  );
}

/** Indeterminate loading bar — used in place of a bare spinner. */
export function LoadingBar({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="px-4 py-10" role="status" aria-label={label}>
      <div className="mx-auto h-1 w-48 overflow-hidden rounded-full bg-grey-100">
        <motion.div className="h-full w-1/3 rounded-full bg-teal-600" animate={{ x: ['-100%', '300%'] }} transition={{ duration: 1.1, repeat: Infinity, ease: 'easeInOut' }} />
      </div>
      <div className="mt-2 text-center text-caption text-grey-500">{label}…</div>
    </div>
  );
}

export function Dialog({ open, onClose, title, children, footer, width = 520 }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; width?: number }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 flex items-start justify-center bg-grey-900/35 px-4 pt-[12vh]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={transition} onMouseDown={onClose}>
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className="w-full rounded-md border border-grey-200 bg-white shadow-pop"
            style={{ maxWidth: width }}
            {...fadeUp}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-grey-200 px-4 py-3">
              <h3 className="text-lead">{title}</h3>
              <button onClick={onClose} className="rounded p-1 text-grey-500 hover:bg-grey-100" aria-label="Close">
                <X size={16} />
              </button>
            </div>
            <div className="px-4 py-4">{children}</div>
            {footer && <div className="flex justify-end gap-2 border-t border-grey-200 bg-grey-25 px-4 py-3">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div>
      <div className="eyebrow">{label}</div>
      <div className="mt-0.5 font-display text-lead font-semibold text-grey-900">{value}</div>
      {hint && <div className="text-caption text-grey-500">{hint}</div>}
    </div>
  );
}
