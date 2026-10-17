import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { modalMotion, drawerMotion } from '@/lib/motion';
import { cn } from '@/lib/cn';

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/** Accessible modal: focus trap, Escape to close, restores focus, locks scroll, inert background. */
export function Dialog({ open, onClose, label, children, variant = 'modal', className }: { open: boolean; onClose: () => void; label: string; children: ReactNode; variant?: 'modal' | 'drawer'; className?: string }) {
  const panel = useRef<HTMLDivElement>(null);
  const restore = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    restore.current = document.activeElement as HTMLElement | null;
    const root = document.getElementById('root');
    root?.setAttribute('inert', '');
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const t = window.setTimeout(() => {
      const first = panel.current?.querySelector<HTMLElement>('[data-autofocus]') ?? panel.current?.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? panel.current)?.focus();
    }, 30);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
      if (e.key === 'Tab' && panel.current) {
        const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
        if (items.length === 0) return;
        const first = items[0]!;
        const last = items[items.length - 1]!;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(t);
      root?.removeAttribute('inert');
      document.body.style.overflow = prevOverflow;
      document.removeEventListener('keydown', onKey);
      restore.current?.focus?.();
    };
  }, [open, onClose]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[60]">
          <motion.div {...modalMotion.overlay} className="absolute inset-0 bg-ink/40" onClick={onClose} aria-hidden />
          <motion.div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-label={label}
            tabIndex={-1}
            {...(variant === 'drawer' ? drawerMotion : modalMotion.panel)}
            className={cn(
              'absolute bg-white focus:outline-none',
              variant === 'drawer' ? 'inset-y-0 right-0 flex w-full max-w-md flex-col' : 'inset-x-0 bottom-0 max-h-[92vh] overflow-y-auto sm:inset-auto sm:left-1/2 sm:top-1/2 sm:w-[min(64rem,92vw)] sm:-translate-x-1/2 sm:-translate-y-1/2',
              className,
            )}
          >
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

export function CloseButton({ onClick, label = 'Close' }: { onClick: () => void; label?: string }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} className="grid h-11 w-11 place-items-center text-ink transition-colors hover:text-crimson focus-visible:outline focus-visible:outline-2 focus-visible:outline-crimson">
      <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden>
        <path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    </button>
  );
}
