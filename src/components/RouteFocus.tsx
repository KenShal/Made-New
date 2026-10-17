import { useEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

/** Scroll to top on new navigations (not back/forward) and move focus to <main>. */
export function RouteFocus() {
  const { pathname, hash } = useLocation();
  const type = useNavigationType();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (hash) {
      const el = document.getElementById(hash.slice(1));
      if (el) {
        el.scrollIntoView();
        return;
      }
    }
    if (type !== 'POP') window.scrollTo(0, 0);
    const main = document.getElementById('main');
    main?.focus({ preventScroll: true });
  }, [pathname, hash, type]);
  return null;
}
