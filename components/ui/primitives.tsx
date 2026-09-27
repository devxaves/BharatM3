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

export function Dialog({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  width = 560,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: number | string;
  className?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-grey-900/40 p-4 backdrop-blur-[2px]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={transition}
          onMouseDown={onClose}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            className={cx(
              'flex max-h-[90vh] w-full flex-col overflow-hidden rounded-lg border border-grey-200 bg-white shadow-pop',
              className,
            )}
            style={{ maxWidth: typeof width === 'number' ? `${width}px` : width }}
            {...fadeUp}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between border-b border-grey-200 px-5 py-3.5 bg-grey-25/50">
              <div className="min-w-0 pr-4">
                <h3 className="text-lead font-display font-semibold text-grey-900">{title}</h3>
                {subtitle && <p className="mt-0.5 text-caption text-grey-500">{subtitle}</p>}
              </div>
              <button
                onClick={onClose}
                className="mt-0.5 rounded-md p-1.5 text-grey-400 hover:bg-grey-100 hover:text-grey-700 transition-colors"
                aria-label="Close dialog"
              >
                <X size={16} />
              </button>
            </div>
            <div className="scroll-thin flex-1 overflow-y-auto px-5 py-4">{children}</div>
            {footer && <div className="flex shrink-0 justify-end gap-2 border-t border-grey-200 bg-grey-25 px-5 py-3">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function DialogSection({ title, subtitle, children, className }: { title?: ReactNode; subtitle?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cx('space-y-2 rounded-md border border-grey-200 bg-grey-25/40 p-3.5', className)}>
      {title && (
        <div className="border-b border-grey-200/80 pb-1.5">
          <div className="eyebrow !text-grey-600 font-semibold">{title}</div>
          {subtitle && <div className="text-micro text-grey-500">{subtitle}</div>}
        </div>
      )}
      <div>{children}</div>
    </div>
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

export function SummaryCard({
  label,
  value,
  hint,
  tone,
  icon,
  onClick,
  active,
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: 'amber' | 'veto' | 'high' | 'teal' | 'neutral';
  icon?: ReactNode;
  onClick?: () => void;
  active?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'group relative flex w-full flex-col justify-between rounded-md border p-3 text-left transition-all duration-150',
        onClick ? 'cursor-pointer hover:border-grey-400 hover:shadow-panel active:translate-y-px' : 'cursor-default',
        active ? 'border-teal-600 ring-2 ring-teal-600/15 bg-white' : 'border-grey-200 bg-white shadow-panel',
        className,
      )}
    >
      <div className="flex w-full items-center justify-between gap-1">
        <span className="eyebrow truncate">{label}</span>
        {icon && (
          <span
            className={cx(
              'shrink-0 text-caption',
              tone === 'amber' ? 'text-amber-600' : tone === 'veto' ? 'text-veto-600' : tone === 'high' ? 'text-high-600' : tone === 'teal' ? 'text-teal-600' : 'text-grey-400',
            )}
          >
            {icon}
          </span>
        )}
      </div>
      <div
        className={cx(
          'mt-1 font-display text-display font-semibold tabular',
          tone === 'amber' ? 'text-amber-800' : tone === 'veto' ? 'text-veto-700' : tone === 'high' ? 'text-high-700' : 'text-grey-900',
        )}
      >
        {value}
      </div>
      {hint && <div className="mt-1 line-clamp-1 text-caption text-grey-500">{hint}</div>}
      {onClick && (
        <div className="mt-2 flex items-center justify-between border-t border-grey-100 pt-1.5 text-micro font-medium text-teal-700 opacity-80 group-hover:opacity-100">
          <span>Click for breakdown</span>
          <span>→</span>
        </div>
      )}
    </button>
  );
}
