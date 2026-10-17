import type { Transition, Variants } from 'framer-motion';

/**
 * MADE NEW motion language.
 * - One easing curve ("editorial") for reveals; one spring for physical objects.
 * - Routine feedback stays under 250ms. Editorial reveals 600 to 900ms.
 * - Only transform and opacity are animated.
 */
export const ease = {
  editorial: [0.22, 1, 0.36, 1] as const,
  exit: [0.4, 0, 1, 1] as const,
  standard: [0.2, 0, 0, 1] as const,
};

export const duration = { instant: 0.12, quick: 0.22, base: 0.38, reveal: 0.72, slow: 0.95 };

export const spring = {
  garment: { type: 'spring', stiffness: 140, damping: 22, mass: 1.1 } satisfies Transition,
  indicator: { type: 'spring', stiffness: 420, damping: 38 } satisfies Transition,
  snappy: { type: 'spring', stiffness: 520, damping: 32 } satisfies Transition,
  bag: { type: 'spring', stiffness: 600, damping: 18 } satisfies Transition,
};

/* Page entry and route transitions: short, never blocks content. */
export const pageMotion = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: duration.base, ease: ease.editorial } },
  exit: { opacity: 0, transition: { duration: duration.instant, ease: ease.exit } },
};

/* Staggered reveals for collections and editorial blocks. */
export const revealParent: Variants = {
  hidden: {},
  shown: { transition: { staggerChildren: 0.06, delayChildren: 0.04 } },
};
/* Reveals tip up from below in 3D, like a card standing up. */
export const revealChild: Variants = {
  hidden: { opacity: 0, y: 28, rotateX: -32, transformPerspective: 900 },
  shown: { opacity: 1, y: 0, rotateX: 0, transformPerspective: 900, transition: { duration: duration.reveal + 0.1, ease: ease.editorial } },
};

/* Image reveal: a clip that opens upward. */
export const imageReveal: Variants = {
  hidden: { clipPath: 'inset(100% 0% 0% 0%)', scale: 1.06 },
  shown: { clipPath: 'inset(0% 0% 0% 0%)', scale: 1, transition: { duration: duration.slow, ease: ease.editorial } },
};

/* Hero product carousel: the garment turns in 3D as it changes. */
export const garmentVariants: Variants = {
  enter: (dir: number) => ({ x: dir > 0 ? 140 : -140, rotateY: dir > 0 ? 75 : -75, opacity: 0, scale: 0.9 }),
  center: { x: 0, rotateY: 0, opacity: 1, scale: 1, transition: { ...spring.garment, opacity: { duration: duration.base } } },
  exit: (dir: number) => ({ x: dir > 0 ? -120 : 120, rotateY: dir > 0 ? -70 : 70, opacity: 0, scale: 0.94, transition: { duration: duration.base + 0.08, ease: ease.exit } }),
};
/* Reduced motion: a plain crossfade. */
export const garmentVariantsFlat: Variants = {
  enter: { opacity: 0 },
  center: { opacity: 1, transition: { duration: duration.base } },
  exit: { opacity: 0, transition: { duration: duration.quick } },
};
export const captionVariants: Variants = {
  enter: { opacity: 0, y: 14 },
  center: { opacity: 1, y: 0, transition: { duration: duration.base, ease: ease.editorial, delay: 0.08 } },
  exit: { opacity: 0, y: -10, transition: { duration: duration.quick, ease: ease.exit } },
};

/* Product-card hover. */
export const cardHover = { rest: { y: 0 }, hover: { y: -4, transition: spring.snappy } };

/* Modal and drawer. */
export const modalMotion = {
  overlay: { initial: { opacity: 0 }, animate: { opacity: 1, transition: { duration: duration.quick } }, exit: { opacity: 0, transition: { duration: duration.quick } } },
  panel: {
    initial: { opacity: 0, y: 24, scale: 0.98 },
    animate: { opacity: 1, y: 0, scale: 1, transition: { duration: duration.base, ease: ease.editorial } },
    exit: { opacity: 0, y: 12, transition: { duration: duration.quick, ease: ease.exit } },
  },
};
export const drawerMotion = {
  initial: { x: '100%' },
  animate: { x: 0, transition: { duration: duration.base, ease: ease.editorial } },
  exit: { x: '100%', transition: { duration: duration.quick + 0.06, ease: ease.exit } },
};

/* Toasts. */
export const toastMotion = {
  initial: { opacity: 0, y: 16, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1, transition: spring.snappy },
  exit: { opacity: 0, y: 8, transition: { duration: duration.quick } },
};

/* Shopping bag count bump. */
export const bagBump = { scale: [1, 1.35, 1], transition: { duration: 0.42, ease: ease.editorial } };

/* Dashboard loading skeleton shimmer is CSS-only (see index.css). */

/* Approval state change: a quick settle. */
export const statusChange = {
  initial: { opacity: 0, scale: 0.9 },
  animate: { opacity: 1, scale: 1, transition: spring.snappy },
};

/* Campaign progress fill. */
export const progressFill = (pct: number) => ({
  initial: { scaleX: 0 },
  whileInView: { scaleX: Math.min(1, Math.max(0, pct)) },
  viewport: { once: true, margin: '-10% 0px' },
  transition: { duration: duration.slow + 0.3, ease: ease.editorial },
});
