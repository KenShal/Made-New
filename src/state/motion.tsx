import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { MotionConfig } from 'framer-motion';
import { safeStorage } from '@/lib/storage';

interface MotionPref {
  reduced: boolean;
  setReduced: (v: boolean) => void;
}

const Ctx = createContext<MotionPref>({ reduced: false, setReduced: () => {} });

export function MotionPreferenceProvider({ children }: { children: ReactNode }) {
  const [reduced, setReduced] = useState(() => safeStorage.get('mn:reduce-motion') === '1');
  useEffect(() => {
    safeStorage.set('mn:reduce-motion', reduced ? '1' : '0');
    document.documentElement.dataset.reduceMotion = reduced ? 'true' : 'false';
  }, [reduced]);
  const value = useMemo(() => ({ reduced, setReduced }), [reduced]);
  return (
    <Ctx.Provider value={value}>
      {/* "user" respects the OS preference; "always" forces reduced motion from the site toggle. */}
      <MotionConfig reducedMotion={reduced ? 'always' : 'user'}>{children}</MotionConfig>
    </Ctx.Provider>
  );
}

export const useMotionPreference = () => useContext(Ctx);
