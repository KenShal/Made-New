import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { safeStorage } from '@/lib/storage';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { ease } from '@/lib/motion';

let shownThisLoad = false;

/** Seconds until the intro overlay lifts, so the hero can time its own entrance. */
export function introDelaySeconds(reduced: boolean): number {
  if (reduced || shownThisLoad || safeStorage.session.get('mn:intro') === '1') return 0;
  return safeStorage.get('mn:visited') === '1' ? 0.55 : 1.25;
}

/**
 * Opening sequence: white canvas, wordmark resolves, crimson accent appears, then
 * the overlay lifts. The page beneath is already rendered and interactive-ready.
 * - First visit: ~1.5s. Returning visitor: ~0.7s. Same session or reduced motion: skipped.
 * - Click, tap, scroll or any key skips it immediately.
 */
export function Intro() {
  const reduced = usePrefersReducedMotion();
  const [phase] = useState<'full' | 'short' | 'none'>(() => {
    if (shownThisLoad || safeStorage.session.get('mn:intro') === '1') return 'none';
    return safeStorage.get('mn:visited') === '1' ? 'short' : 'full';
  });
  const [visible, setVisible] = useState(phase !== 'none' && !reduced);

  useEffect(() => {
    shownThisLoad = true;
    safeStorage.session.set('mn:intro', '1');
    safeStorage.set('mn:visited', '1');
    if (!visible) return;
    const t = window.setTimeout(() => setVisible(false), phase === 'full' ? 1500 : 700);
    const skip = () => setVisible(false);
    window.addEventListener('keydown', skip, { once: true });
    window.addEventListener('wheel', skip, { once: true, passive: true });
    window.addEventListener('touchstart', skip, { once: true, passive: true });
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('keydown', skip);
      window.removeEventListener('wheel', skip);
      window.removeEventListener('touchstart', skip);
    };
  }, [visible, phase]);

  const short = phase === 'short';
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="fixed inset-0 z-[80] grid place-items-center bg-white"
          aria-hidden
          onClick={() => setVisible(false)}
          exit={{ opacity: 0, transition: { duration: 0.45, ease: ease.editorial } }}
          data-testid="intro"
        >
          <div className="flex flex-col items-center">
            <motion.span
              initial={{ opacity: 0, y: 14, filter: 'blur(6px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: short ? 0.35 : 0.7, ease: ease.editorial } }}
              className="font-display text-[clamp(2.5rem,8vw,5.5rem)] font-extrabold uppercase leading-none tracking-[-0.05em] text-ink"
            >
              MADE NEW
            </motion.span>
            <motion.span
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1, transition: { delay: short ? 0.2 : 0.55, duration: short ? 0.3 : 0.55, ease: ease.editorial } }}
              className="mt-4 block h-[3px] w-16 origin-left bg-crimson"
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
