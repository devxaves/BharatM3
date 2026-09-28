'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { forwardRef, useEffect, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cx } from '@/lib/format';
import { fadeUp, transition } from '@/lib/motion';

type Variant = 'primary' | 'secondary' | 'accent' | 'outline' | 'ghost' | 'danger' | 'approve';
type Size = 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-primary-800 text-white border border-primary-800 hover:bg-primary-900 hover:border-primary-900',
  secondary: 'bg-transparent text-grey-900 border border-grey-200 hover:border-grey-300 hover:bg-white',
  accent: 'bg-amber-500 text-white border border-amber-500 hover:bg-amber-600 hover:border-amber-600',
  outline: 'bg-transparent text-grey-900 border border-grey-200 hover:border-grey-300 hover:bg-white',
  ghost: 'bg-transparent text-grey-700 border border-transparent hover:bg-grey-100',
  danger: 'bg-white text-veto-700 border border-veto-600/30 hover:bg-veto-50 hover:border-veto-600',
  approve: 'bg-high-600 text-white border border-high-600 hover:bg-high-700 hover:border-high-700',
};
const SIZES: Record<Size, string> = {
  sm: 'h-7 px-2.5 text-caption gap-1.5 font-medium',
  md: 'h-9 px-4 text-dense gap-2 font-semibold',
  lg: 'h-10 px-4 text-dense gap-2 font-semibold',
};

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; icon?: ReactNode; kbd?: string }>(
  function Button({ variant = 'outline', size = 'md', icon, kbd, className, children, ...rest }, ref) {
    return (
      <button
        ref={ref}
        className={cx(
          'inline-flex select-none items-center justify-center whitespace-nowrap rounded-md transition-colors duration-150 disabled:pointer-events-none disabled:opacity-40',
          VARIANTS[variant],
          SIZES[size],
          className,
        )}
        {...rest}
      >
        {icon}
        {children}
        {kbd && (
          <kbd
            className={cx(
              'ml-1 rounded-sm px-1 font-mono text-micro',
              variant === 'outline' || variant === 'ghost' || variant === 'danger'
                ? 'bg-grey-100 text-grey-600 border border-grey-200'
                : 'bg-white/20 text-white',
            )}
          >
            {kbd}
          </kbd>
        )}
      </button>
    );
  },
);

export function Panel({
  title,
  actions,
  children,
  className,
  bodyClassName,
  subtitle,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cx('panel', className)}>
      {(title || actions) && (
        <header className="panel-header">
          <div className="min-w-0">
            {title && <h2 className="panel-title">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-caption text-grey-500 font-normal">{subtitle}</p>}
          </div>
          {actions && <div className="flex max-w-full flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={cx('overflow-x-auto', bodyClassName)}>{children}</div>
    </section>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-grey-200 pb-5">
      <div className="min-w-0 max-w-3xl">
        {eyebrow && <div className="section-tag mb-2.5">{eyebrow}</div>}
        <h1 className="font-display text-display font-bold tracking-tight text-grey-900 sm:text-section">{title}</h1>
        {description && <p className="mt-2 text-body leading-relaxed text-grey-500">{description}</p>}
      </div>
      {actions && <div className="flex max-w-full flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded-sm border border-grey-200 bg-grey-50 px-1.5 py-0.5 font-mono text-micro text-grey-700">{children}</kbd>;
}

export function Tabs<T extends string>({
  value,
  onChange,
  items,
}: {
  value: T;
  onChange: (v: T) => void;
  items: { value: T; label: ReactNode; count?: number; tone?: 'amber' | 'veto' | 'neutral' | 'high' }[];
}) {
  return (
    <div role="tablist" className="no-scrollbar flex items-end gap-1.5 overflow-x-auto border-b border-grey-200">
      {items.map((it) => {
        const active = it.value === value;
        return (
          <button
            key={it.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(it.value)}
            className={cx(
              'relative flex shrink-0 items-center gap-2 whitespace-nowrap px-3.5 pb-2.5 pt-2 text-dense font-semibold transition-colors duration-150',
              active ? 'text-primary-800' : 'text-grey-500 hover:text-grey-900',
            )}
          >
            {it.label}
            {it.count !== undefined && (
              <span
                className={cx(
                  'tabular rounded-sm px-1.5 py-0.5 text-micro font-semibold',
                  it.tone === 'amber' && it.count > 0
                    ? 'bg-amber-100 text-amber-900'
                    : it.tone === 'veto'
                      ? 'bg-veto-100 text-veto-800'
                      : it.tone === 'high'
                        ? 'bg-high-100 text-high-800'
                        : 'bg-grey-100 text-grey-700',
                )}
              >
                {it.count}
              </span>
            )}
            {active && (
              <motion.span
                layoutId={`tab-underline-${items.map((i) => i.value).join('')}`}
                className="absolute inset-x-1 -bottom-px h-0.5 bg-primary-800"
                transition={transition}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  items,
}: {
  value: T;
  onChange: (v: T) => void;
  items: { value: T; label: ReactNode }[];
}) {
  return (
    <div className="no-scrollbar inline-flex max-w-full overflow-x-auto rounded-md border border-grey-200 bg-grey-100 p-0.5">
      {items.map((it) => (
        <button
          key={it.value}
          onClick={() => onChange(it.value)}
          className={cx(
            'relative h-7 shrink-0 whitespace-nowrap rounded-sm px-3 text-caption font-semibold transition-colors duration-150',
            it.value === value ? 'text-primary-800' : 'text-grey-600 hover:text-grey-900',
          )}
        >
          {it.value === value && (
            <motion.span
              layoutId={`seg-${items.map((i) => i.value).join('')}`}
              className="absolute inset-0 rounded-sm border border-grey-200 bg-white"
              transition={transition}
            />
          )}
          <span className="relative z-10">{it.label}</span>
        </button>
      ))}
    </div>
  );
}

export function Empty({ title, children, icon }: { title: string; children?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      {icon && <div className="mb-3 text-grey-400">{icon}</div>}
      <div className="font-display text-lead font-semibold text-grey-800">{title}</div>
      {children && <div className="mt-1.5 max-w-md text-dense text-grey-500 leading-relaxed">{children}</div>}
    </div>
  );
}

/** Indeterminate loading bar — used in place of a bare spinner. */
export function LoadingBar({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="px-4 py-12" role="status" aria-label={label}>
      <div className="mx-auto h-1 w-48 overflow-hidden rounded-full bg-grey-200">
        <motion.div
          className="h-full w-1/3 rounded-full bg-primary-800"
          animate={{ x: ['-100%', '300%'] }}
          transition={{ duration: 1.1, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>
      <div className="mt-3 text-center text-caption font-medium text-grey-500">{label}…</div>
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
  width = 600,
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-grey-950/50 p-3 sm:p-4"
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
              'flex max-h-[90vh] w-full flex-col overflow-hidden rounded-xl border border-grey-200 bg-white shadow-elevated',
              className,
            )}
            style={{ maxWidth: typeof width === 'number' ? `${width}px` : width }}
            {...fadeUp}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between border-b border-grey-150 bg-white px-4 py-4 sm:px-6">
              <div className="min-w-0 pr-4">
                <h3 className="text-card font-display font-semibold text-grey-900">{title}</h3>
                {subtitle && <p className="mt-0.5 text-caption text-grey-500 font-normal">{subtitle}</p>}
              </div>
              <button
                onClick={onClose}
                className="mt-0.5 rounded-md p-1.5 text-grey-400 hover:bg-grey-100 hover:text-grey-700 transition-colors"
                aria-label="Close dialog"
              >
                <X size={16} />
              </button>
            </div>
            <div className="scroll-thin flex-1 overflow-y-auto px-4 py-5 sm:px-6">{children}</div>
            {footer && <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-grey-150 bg-grey-50 px-4 py-3.5 sm:px-6">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function DialogSection({
  title,
  subtitle,
  children,
  className,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx('space-y-2.5 rounded-lg border border-grey-200 bg-grey-50 p-4', className)}>
      {title && (
        <div className="pb-2 border-b border-grey-200">
          <div className="text-caption font-semibold text-grey-800">{title}</div>
          {subtitle && <div className="mt-0.5 text-micro text-grey-500">{subtitle}</div>}
        </div>
      )}
      <div>{children}</div>
    </div>
  );
}

export function Stat({
  label,
  value,
  hint,
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="label-caps">{label}</div>
      <div className="mt-1 font-display text-title font-bold tracking-tight text-grey-900 tabular">{value}</div>
      {hint && <div className="mt-0.5 text-caption text-grey-500 font-normal">{hint}</div>}
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
  const accentCls =
    tone === 'amber'
      ? 'bg-amber-50 text-amber-700 border-amber-200'
      : tone === 'veto'
        ? 'bg-veto-50 text-veto-700 border-veto-200'
        : tone === 'high'
          ? 'bg-high-50 text-high-700 border-high-200'
          : tone === 'teal'
            ? 'bg-teal-50 text-teal-700 border-teal-200'
            : 'bg-primary-100 text-primary-800 border-primary-200';

  const borderAccent =
    tone === 'amber'
      ? 'bg-amber-500'
      : tone === 'veto'
        ? 'bg-veto-600'
        : tone === 'high'
          ? 'bg-high-600'
          : tone === 'teal'
            ? 'bg-teal-600'
            : 'bg-primary-800';

  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'group relative flex w-full flex-col justify-between overflow-hidden rounded-xl border bg-white p-5 text-left transition-colors duration-150',
        onClick ? 'cursor-pointer hover:border-grey-300' : 'cursor-default',
        active ? 'border-primary-800 ring-1 ring-primary-800' : 'border-grey-200',
        className,
      )}
    >
      <span className={cx('absolute inset-x-0 top-0 h-0.5', borderAccent)} aria-hidden />
      <div className="flex w-full items-center justify-between gap-1.5">
        <span className="label-caps truncate">{label}</span>
        {icon && (
          <span className={cx('flex h-7 w-7 shrink-0 items-center justify-center rounded-md border', accentCls)}>
            {icon}
          </span>
        )}
      </div>
      <div
        className={cx(
          'mt-3 font-display text-kpi font-bold tracking-tight tabular',
          tone === 'amber'
            ? 'text-amber-700'
            : tone === 'veto'
              ? 'text-veto-700'
              : tone === 'high'
                ? 'text-high-700'
                : tone === 'teal'
                  ? 'text-teal-700'
                  : 'text-grey-900',
        )}
      >
        {value}
      </div>
      {hint && <div className="mt-1.5 line-clamp-1 text-caption font-medium text-grey-500">{hint}</div>}
      {onClick && (
        <div className="mt-4 flex items-center justify-between border-t border-grey-150 pt-2.5 text-caption font-semibold text-primary-800 group-hover:text-primary-900">
          <span>View breakdown</span>
          <span className="transition-transform duration-150 group-hover:translate-x-1">→</span>
        </div>
      )}
    </button>
  );
}
