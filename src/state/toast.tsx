import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { toastMotion } from '@/lib/motion';

interface Toast {
  id: number;
  title: string;
  body?: string;
  tone: 'default' | 'error';
}

const Ctx = createContext<{ notify: (t: Omit<Toast, 'id' | 'tone'> & { tone?: Toast['tone'] }) => void }>({ notify: () => {} });

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const notify = useCallback((t: Omit<Toast, 'id' | 'tone'> & { tone?: Toast['tone'] }) => {
    const id = nextId++;
    setToasts((all) => [...all.slice(-2), { id, tone: 'default', ...t }]);
    window.setTimeout(() => setToasts((all) => all.filter((x) => x.id !== id)), 4200);
  }, []);
  const value = useMemo(() => ({ notify }), [notify]);
  return (
    <Ctx.Provider value={value}>
      {children}
      {createPortal(<div aria-live="polite" role="status" className="pointer-events-none fixed inset-x-0 bottom-4 z-[70] flex flex-col items-center gap-2 px-4 sm:bottom-6 sm:items-end sm:px-6">
        <AnimatePresence initial={false}>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              layout
              {...toastMotion}
              className={`pointer-events-auto w-full max-w-sm border bg-white px-5 py-4 shadow-[0_18px_40px_-24px_rgba(23,23,23,0.45)] ${t.tone === 'error' ? 'border-crimson' : 'border-line'}`}
            >
              <p className="font-display text-sm font-bold tracking-tight text-ink">{t.title}</p>
              {t.body && <p className="mt-0.5 text-sm text-ink-muted">{t.body}</p>}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>, document.body)}
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
