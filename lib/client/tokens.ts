'use client';

import { useEffect, useState } from 'react';

/** Resolve design-token colours at runtime so charts (SVG attributes) never carry raw hex values. */
const NAMES = ['primary-600', 'primary-800', 'primary-200', 'teal-600', 'grey-200', 'grey-300', 'grey-400', 'grey-500', 'grey-700', 'high-600', 'amber-500', 'veto-600', 'white'] as const;
export type TokenName = (typeof NAMES)[number];

export function useTokens(): Record<TokenName, string> {
  const [t, setT] = useState<Record<string, string>>(() => Object.fromEntries(NAMES.map((n) => [n, 'currentColor'])));
  useEffect(() => {
    const cs = getComputedStyle(document.documentElement);
    setT(Object.fromEntries(NAMES.map((n) => [n, `rgb(${cs.getPropertyValue(n === 'white' ? '--c-white' : `--c-${n}`).trim()})`])));
  }, []);
  return t as Record<TokenName, string>;
}
