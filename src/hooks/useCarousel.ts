import { useCallback, useEffect, useRef, useState } from 'react';

export interface CarouselOptions {
  count: number;
  intervalMs?: number;
  /** Temporary pauses: hover, focus within, hidden tab, dragging. */
  suspended?: boolean;
  /** Disables autoplay entirely (e.g. reduced motion). */
  autoplayAllowed?: boolean;
}

/**
 * Carousel state machine. Autoplay only runs when allowed, not suspended, and the
 * user has not explicitly paused. Any manual navigation restarts the timer so
 * the slide the user picked is never yanked away immediately.
 */
export function useCarousel({ count, intervalMs = 6500, suspended = false, autoplayAllowed = true }: CarouselOptions) {
  const [[index, direction], setState] = useState<[number, number]>([0, 0]);
  const [userPaused, setUserPaused] = useState(false);
  const [cycle, setCycle] = useState(0); // bumps to restart the autoplay timer
  const timer = useRef<number | null>(null);

  const go = useCallback(
    (next: number, dir?: number) => {
      setState(([cur]) => {
        const n = ((next % count) + count) % count;
        if (n === cur) return [cur, 0];
        return [n, dir ?? (n > cur ? 1 : -1)];
      });
      setCycle((c) => c + 1);
    },
    [count],
  );
  const next = useCallback(() => setState(([cur]) => [(cur + 1) % count, 1]), [count]);
  const prev = useCallback(() => setState(([cur]) => [(cur - 1 + count) % count, -1]), [count]);
  const manualNext = useCallback(() => { next(); setCycle((c) => c + 1); }, [next]);
  const manualPrev = useCallback(() => { prev(); setCycle((c) => c + 1); }, [prev]);

  const playing = autoplayAllowed && !userPaused && !suspended && count > 1;

  useEffect(() => {
    if (!playing) return;
    timer.current = window.setTimeout(next, intervalMs);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [playing, index, cycle, intervalMs, next]);

  return {
    index,
    direction,
    playing,
    userPaused,
    autoplayAllowed,
    go,
    next: manualNext,
    prev: manualPrev,
    togglePause: () => setUserPaused((p) => !p),
    setUserPaused,
    cycle,
  };
}
