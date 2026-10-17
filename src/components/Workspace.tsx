import type { ReactNode } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Container, SampleBadge } from './ui';
import { platform } from '@/data/platform';
import { useAuth } from '@/state/auth';
import { spring } from '@/lib/motion';
import { cn } from '@/lib/cn';

export interface WorkspaceNavItem {
  to: string;
  label: string;
  end?: boolean;
  show?: boolean;
}

export function WorkspaceLayout({ title, nav, id }: { title: string; nav: WorkspaceNavItem[]; id: string }) {
  const { user, signOut } = useAuth();
  const items = nav.filter((n) => n.show !== false);
  return (
    <div className="border-t border-line bg-soft">
      <Container className="grid gap-8 py-8 lg:grid-cols-[14rem_1fr] lg:py-12">
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="flex items-center justify-between lg:block">
            <p className="font-display text-[0.7rem] font-bold uppercase tracking-editorial text-ink-muted">{title}</p>
            {platform.demo && <SampleBadge className="lg:mt-3" label="Demo data" />}
          </div>
          <nav aria-label={title} className="-mx-4 mt-4 overflow-x-auto px-4 lg:mx-0 lg:px-0">
            <ul className="flex gap-1 lg:flex-col">
              {items.map((n) => (
                <li key={n.to}>
                  <NavLink to={n.to} end={n.end} className={({ isActive }) => cn('relative block whitespace-nowrap px-3 py-2.5 text-sm font-semibold transition-colors', isActive ? 'text-ink' : 'text-ink-muted hover:text-ink')}>
                    {({ isActive }) => (
                      <>
                        {isActive && <motion.span layoutId={`ws-${id}`} transition={spring.indicator} className="absolute inset-0 -z-0 bg-white" />}
                        <span className="relative">{n.label}</span>
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
          {user && (
            <div className="mt-8 hidden border-t border-line pt-4 text-xs text-ink-muted lg:block">
              <p className="font-semibold text-ink">{user.name}</p>
              <p className="truncate">{user.email}</p>
              <p className="mt-1 capitalize">{user.roles.filter((r) => r !== 'shopper').join(', ') || 'shopper'}</p>
              <button type="button" className="mt-3 underline underline-offset-4 hover:text-crimson" onClick={() => void signOut()}>
                Sign out
              </button>
            </div>
          )}
        </aside>
        <main className="min-w-0">
          <Outlet />
        </main>
      </Container>
    </div>
  );
}

export function WorkspaceHeader({ title, eyebrow, actions, children }: { title: string; eyebrow?: string; actions?: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div>
        {eyebrow && <p className="font-display text-[0.7rem] font-bold uppercase tracking-editorial text-ink-muted">{eyebrow}</p>}
        <h1 className="mt-2 font-display text-4xl font-extrabold tracking-tight">{title}</h1>
        {children}
      </div>
      {actions && <div className="flex flex-wrap gap-3">{actions}</div>}
    </div>
  );
}

export function Stat({ label, value, note, tone }: { label: string; value: ReactNode; note?: string; tone?: 'crimson' }) {
  return (
    <div className="bg-white p-5">
      <p className="text-[0.7rem] font-bold uppercase tracking-[0.12em] text-ink-muted">{label}</p>
      <p className={cn('mt-2 font-display text-[1.75rem] font-extrabold tabular-nums leading-none tracking-tight', tone === 'crimson' && 'text-crimson')}>{value}</p>
      {note && <p className="mt-2 text-xs text-ink-muted">{note}</p>}
    </div>
  );
}

export function Panel({ title, children, actions, className }: { title?: string; children: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <section className={cn('bg-white p-5 sm:p-6', className)}>
      {(title || actions) && (
        <div className="mb-4 flex items-center justify-between gap-4">
          {title && <h2 className="font-display text-sm font-bold uppercase tracking-[0.12em]">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function StatGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-px bg-line lg:grid-cols-4">{children}</div>;
}

export function LoadingGrid() {
  return (
    <div className="grid grid-cols-2 gap-px bg-line lg:grid-cols-4" aria-busy="true">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="bg-white p-5">
          <div className="skeleton h-3 w-20" />
          <div className="skeleton mt-3 h-7 w-24" />
        </div>
      ))}
    </div>
  );
}
