'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { cx } from '@/lib/format';
import { transition } from '@/lib/motion';

type Kind = 'success' | 'error' | 'info';
interface Toast {
  id: number;
  kind: Kind;
  title: string;
  body?: ReactNode;
}

const Ctx = createContext<(t: Omit<Toast, 'id'>) => void>(() => {});
export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((t: Omit<Toast, 'id'>) => {
    const id = Date.now() + Math.random();
    setItems((xs) => [...xs, { ...t, id }]);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), t.kind === 'error' ? 7000 : 4500);
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[360px] flex-col gap-2" aria-live="polite">
        <AnimatePresence initial={false}>
          {items.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1, transition }}
              exit={{ opacity: 0, x: 24, transition }}
              className={cx(
                'pointer-events-auto flex gap-2.5 rounded-md border bg-white px-3 py-2.5 shadow-pop',
                t.kind === 'success' ? 'border-high-600/40' : t.kind === 'error' ? 'border-veto-600/40' : 'border-grey-300',
              )}
            >
              <span className={cx('mt-0.5', t.kind === 'success' ? 'text-high-600' : t.kind === 'error' ? 'text-veto-600' : 'text-teal-600')}>
                {t.kind === 'success' ? <CheckCircle2 size={16} /> : t.kind === 'error' ? <AlertTriangle size={16} /> : <Info size={16} />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-dense font-semibold text-grey-900">{t.title}</div>
                {t.body && <div className="mt-0.5 text-caption text-grey-600">{t.body}</div>}
              </div>
              <button className="text-grey-400 hover:text-grey-700" onClick={() => setItems((xs) => xs.filter((x) => x.id !== t.id))} aria-label="Dismiss">
                <X size={14} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  );
}
