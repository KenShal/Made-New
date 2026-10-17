import { useEffect, useRef, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { pageMotion } from '@/lib/motion';

/**
 * Route wrapper: sets the document title and moves focus to the main heading
 * on navigation so screen-reader and keyboard users land at the new content.
 */
export function Page({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    document.title = title === 'MADE NEW' ? 'MADE NEW | Wear the message. Fund the mission.' : `${title} | MADE NEW`;
  }, [title]);
  return (
    <motion.div ref={ref} {...pageMotion} className={className}>
      {children}
    </motion.div>
  );
}
