export const fmtInt = (n: number | null | undefined) => (n ?? 0).toLocaleString('en-IN');
export const fmtPct = (n: number | null | undefined, dp = 1) => `${((n ?? 0) * 100).toFixed(dp)}%`;
export const fmtScore = (n: number | null | undefined) => (n ?? 0).toFixed(3);

/** Indian numbering: ₹ 4.2 L, ₹ 1.35 Cr */
export function fmtInr(n: number | null | undefined, opts: { compact?: boolean } = { compact: true }) {
  const v = n ?? 0;
  if (!opts.compact) return `₹ ${Math.round(v).toLocaleString('en-IN')}`;
  if (v >= 1e7) return `₹ ${(v / 1e7).toFixed(2)} Cr`;
  if (v >= 1e5) return `₹ ${(v / 1e5).toFixed(2)} L`;
  if (v >= 1e3) return `₹ ${(v / 1e3).toFixed(1)} K`;
  return `₹ ${Math.round(v)}`;
}

export function fmtDateTime(d: string | Date | null | undefined) {
  if (!d) return '—';
  const x = typeof d === 'string' ? new Date(d) : d;
  return x.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
}

export function fmtDate(d: string | Date | null | undefined) {
  if (!d) return '—';
  const x = typeof d === 'string' ? new Date(d) : d;
  return x.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function fmtRelative(d: string | Date | null | undefined) {
  if (!d) return '—';
  const x = typeof d === 'string' ? new Date(d) : d;
  const s = (Date.now() - x.getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

export const humanize = (s: string | null | undefined) => (s ?? '').replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(' ');
}
