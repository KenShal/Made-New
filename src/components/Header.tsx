import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Wordmark } from './Wordmark';
import { useCart } from '@/state/cart';
import { useAuth } from '@/state/auth';
import { bagBump, spring, duration, ease } from '@/lib/motion';
import { cn } from '@/lib/cn';
import { Container } from './ui';

const NAV = [
  { to: '/shop', label: 'Shop' },
  { to: '/discover', label: 'Discover' },
  { to: '/campaigns', label: 'Campaigns' },
  { to: '/how-it-works', label: 'How it works' },
];

export function Header() {
  const { count, setOpen, bump } = useCart();
  const { user } = useAuth();
  const [menu, setMenu] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const loc = useLocation();

  useEffect(() => setMenu(false), [loc.pathname]);
  useEffect(() => {
    // Passive, threshold-only listener: one state flip, not a per-frame update.
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const account = user ? (user.roles.includes('admin') || user.roles.includes('reviewer') || user.roles.includes('finance') ? '/admin' : user.roles.includes('creator') ? '/creator/dashboard' : '/creator/onboarding') : '/login';

  return (
    <header className={cn('sticky top-0 z-50 border-b bg-white/95 backdrop-blur-[2px] transition-colors duration-300', scrolled ? 'border-line' : 'border-transparent')}>
      <Container className="flex h-16 items-center justify-between gap-6 sm:h-[4.5rem]">
        <Link to="/" className="shrink-0 text-[1.35rem] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-crimson" aria-label="MADE NEW home">
          <Wordmark />
        </Link>

        <nav aria-label="Primary" className="hidden md:block">
          <ul className="flex items-center gap-8">
            {NAV.map((n) => (
              <li key={n.to}>
                <NavLink to={n.to} className="relative py-2 text-[0.8rem] font-semibold uppercase tracking-[0.14em] text-ink transition-colors hover:text-crimson">
                  {({ isActive }) => (
                    <>
                      {n.label}
                      {isActive && <motion.span layoutId="nav-indicator" transition={spring.indicator} className="absolute -bottom-0.5 left-0 right-0 h-[2px] bg-crimson" />}
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex items-center gap-1 sm:gap-3">
          <Link to="/creator/designs/new" className="hidden text-[0.8rem] font-semibold uppercase tracking-[0.14em] text-crimson hover:text-crimson-deep lg:inline">
            Create
          </Link>
          <Link to={account} className="grid h-11 w-11 place-items-center hover:text-crimson" aria-label={user ? `Account: ${user.name}` : 'Sign in'}>
            <svg viewBox="0 0 20 20" className="h-[1.15rem] w-[1.15rem]" aria-hidden>
              <circle cx="10" cy="6.5" r="3.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
              <path d="M3 18c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </Link>
          <button type="button" onClick={() => setOpen(true)} className="relative grid h-11 w-11 place-items-center hover:text-crimson" aria-label={`Open bag, ${count} ${count === 1 ? 'item' : 'items'}`}>
            <svg viewBox="0 0 20 20" className="h-[1.15rem] w-[1.15rem]" aria-hidden>
              <path d="M3.5 6.5h13l-1 11h-11z" fill="none" stroke="currentColor" strokeWidth="1.5" />
              <path d="M7 6.5V5a3 3 0 0 1 6 0v1.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
            </svg>
            <AnimatePresence>
              {count > 0 && (
                <motion.span
                  key={bump}
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ ...bagBump, opacity: 1 }}
                  className="absolute right-1 top-1 grid h-[1.1rem] min-w-[1.1rem] place-items-center rounded-full bg-crimson px-1 text-[0.62rem] font-bold text-white"
                  aria-hidden
                >
                  {count}
                </motion.span>
              )}
            </AnimatePresence>
          </button>
          <button type="button" className="grid h-11 w-11 place-items-center md:hidden" aria-expanded={menu} aria-controls="mobile-menu" aria-label={menu ? 'Close menu' : 'Open menu'} onClick={() => setMenu((m) => !m)}>
            <span className="relative block h-3 w-5" aria-hidden>
              <span className={cn('absolute left-0 h-[1.5px] w-5 bg-ink transition-transform duration-300', menu ? 'top-1.5 rotate-45' : 'top-0')} />
              <span className={cn('absolute left-0 h-[1.5px] w-5 bg-ink transition-transform duration-300', menu ? 'top-1.5 -rotate-45' : 'top-3')} />
            </span>
          </button>
        </div>
      </Container>

      <AnimatePresence>
        {menu && (
          <motion.nav
            id="mobile-menu"
            aria-label="Mobile"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0, transition: { duration: duration.base, ease: ease.editorial } }}
            exit={{ opacity: 0, transition: { duration: duration.quick } }}
            className="border-t border-line bg-white md:hidden"
          >
            <ul className="flex flex-col px-4 py-4">
              {[...NAV, { to: '/creator/designs/new', label: 'Create a design' }].map((n) => (
                <li key={n.to}>
                  <NavLink to={n.to} className={({ isActive }) => cn('flex h-14 items-center border-b border-line font-display text-2xl font-extrabold tracking-tight', isActive ? 'text-crimson' : 'text-ink')}>
                    {n.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
}
