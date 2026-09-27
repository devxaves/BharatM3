'use client';

import { animate, useMotionValue, useTransform, motion } from 'framer-motion';
import { useEffect } from 'react';

/** Number count-up for dashboard KPIs (the one place polish-for-its-own-sake is allowed, PRD §8.2). */
export function CountUp({ value, format = (n) => Math.round(n).toLocaleString('en-IN'), duration = 0.9 }: { value: number; format?: (n: number) => string; duration?: number }) {
  const mv = useMotionValue(0);
  const text = useTransform(mv, (v) => format(v));
  useEffect(() => {
    const c = animate(mv, value, { duration, ease: [0.2, 0, 0, 1] });
    return () => c.stop();
  }, [value, duration, mv]);
  return <motion.span className="tabular">{text}</motion.span>;
}
