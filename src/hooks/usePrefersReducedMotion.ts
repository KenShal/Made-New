import { useReducedMotion } from 'framer-motion';
import { useMotionPreference } from '@/state/motion';

/** True when either the OS setting or the in-site "Reduce motion" toggle is on. */
export function usePrefersReducedMotion(): boolean {
  const os = useReducedMotion();
  const { reduced } = useMotionPreference();
  return Boolean(os) || reduced;
}
