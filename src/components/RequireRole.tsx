import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import type { Role } from '@shared/types';
import { useAuth } from '@/state/auth';
import { Container, ButtonLink } from './ui';

/**
 * Usability guard only. Every protected API route and table enforces access on
 * the server and in Postgres RLS; this component just avoids showing screens
 * people cannot use.
 */
export function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { user, loading, hasRole } = useAuth();
  const loc = useLocation();
  if (loading) return <div className="min-h-[50vh]" aria-busy="true" />;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  if (!hasRole(...roles)) {
    return (
      <Container className="py-24">
        <p className="font-display text-[0.7rem] font-bold uppercase tracking-editorial text-crimson">Access restricted</p>
        <h1 className="mt-3 font-display text-4xl font-extrabold tracking-tight">You don&rsquo;t have access to this area.</h1>
        <p className="mt-3 max-w-lg text-ink-muted">If you think this is a mistake, contact the MADE NEW team. Roles are assigned by administrators and can&rsquo;t be changed from your profile.</p>
        <ButtonLink to="/" variant="secondary" className="mt-8">
          Back to home
        </ButtonLink>
      </Container>
    );
  }
  return <>{children}</>;
}
