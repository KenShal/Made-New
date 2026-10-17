import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Role } from '@shared/types';
import { supabase } from '@/lib/supabase';
import { config } from '@/lib/config';
import { safeStorage } from '@/lib/storage';
import { DEMO_CREATOR_ID } from '@/data/sample';
import { setCurrentUser } from './currentUser';

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  roles: Role[];
  creatorId: string | null;
  emailVerified: boolean;
  mfa: boolean;
}

export type AuthMode = 'supabase' | 'demo';

interface AuthCtx {
  mode: AuthMode;
  user: SessionUser | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (input: { email: string; password: string; name: string; marketingConsent: boolean }) => Promise<{ needsVerification: boolean }>;
  signOut: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  /** Demo mode only: impersonate a sample persona to explore role-specific screens. */
  demoSignInAs: (persona: DemoPersona) => void;
  hasRole: (...roles: Role[]) => boolean;
}

export type DemoPersona = 'shopper' | 'creator' | 'reviewer' | 'admin' | 'finance';

const DEMO_PERSONAS: Record<DemoPersona, SessionUser> = {
  shopper: { id: 'demo-shopper', email: 'shopper@demo.madenew', name: 'Demo Shopper', roles: ['shopper'], creatorId: null, emailVerified: true, mfa: false },
  creator: { id: 'demo-creator', email: 'ada@demo.madenew', name: 'Ada Okafor', roles: ['shopper', 'creator'], creatorId: DEMO_CREATOR_ID, emailVerified: true, mfa: false },
  reviewer: { id: 'demo-reviewer', email: 'sam@demo.madenew', name: 'Sam Patel', roles: ['shopper', 'reviewer'], creatorId: null, emailVerified: true, mfa: true },
  admin: { id: 'demo-admin', email: 'priya@demo.madenew', name: 'Priya Shah', roles: ['shopper', 'reviewer', 'admin'], creatorId: null, emailVerified: true, mfa: true },
  finance: { id: 'demo-finance', email: 'tom@demo.madenew', name: 'Tom Fraser', roles: ['shopper', 'finance'], creatorId: null, emailVerified: true, mfa: true },
};

const Ctx = createContext<AuthCtx | null>(null);
const DEMO_KEY = 'mn:demo-persona';

/**
 * Roles are loaded from the server (/api/me reads the user_roles table). They are
 * never taken from user-editable profile fields or JWT user_metadata.
 */
async function loadProfile(accessToken: string, fallbackEmail: string): Promise<SessionUser> {
  const res = await fetch(`${config.apiBaseUrl}/api/me`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error('Could not load your account');
  const me = (await res.json()) as Partial<SessionUser>;
  return {
    id: me.id ?? '',
    email: me.email ?? fallbackEmail,
    name: me.name ?? fallbackEmail,
    roles: me.roles ?? ['shopper'],
    creatorId: me.creatorId ?? null,
    emailVerified: Boolean(me.emailVerified),
    mfa: Boolean(me.mfa),
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const mode: AuthMode = supabase ? 'supabase' : 'demo';
  const [user, setUser] = useState<SessionUser | null>(() => {
    if (mode !== 'demo') return null;
    const p = safeStorage.session.get(DEMO_KEY) as DemoPersona | null;
    return p && p in DEMO_PERSONAS ? DEMO_PERSONAS[p] : null;
  });
  const [loading, setLoading] = useState(mode === 'supabase');

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    const apply = async (token: string | undefined, email: string) => {
      if (!token) {
        setUser(null);
        setLoading(false);
        return;
      }
      try {
        const u = await loadProfile(token, email);
        if (active) setUser(u);
      } catch {
        if (active) setUser(null);
      } finally {
        if (active) setLoading(false);
      }
    };
    supabase.auth.getSession().then(({ data }) => apply(data.session?.access_token, data.session?.user.email ?? ''));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      void apply(session?.access_token, session?.user.email ?? '');
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) throw new Error('Sign-in needs Supabase to be configured. Use a demo persona below.');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    // Generic message: do not reveal whether the email exists.
    if (error) throw new Error(error.status === 429 ? 'Too many attempts. Please wait a moment and try again.' : 'Email or password is incorrect.');
  }, []);

  const signUp = useCallback(async (input: { email: string; password: string; name: string; marketingConsent: boolean }) => {
    if (!supabase) throw new Error('Registration needs Supabase to be configured. Use a demo persona to explore.');
    const { data, error } = await supabase.auth.signUp({
      email: input.email,
      password: input.password,
      options: {
        emailRedirectTo: `${window.location.origin}/login?verified=1`,
        // Display name and consent only; roles are never set from the client.
        data: { display_name: input.name, marketing_consent: input.marketingConsent },
      },
    });
    if (error) throw new Error(error.status === 429 ? 'Too many attempts. Please try again later.' : 'We could not create that account. Check your details and try again.');
    return { needsVerification: !data.session };
  }, []);

  const signOut = useCallback(async () => {
    if (supabase) await supabase.auth.signOut();
    safeStorage.session.set(DEMO_KEY, '');
    setUser(null);
  }, []);

  const requestPasswordReset = useCallback(async (email: string) => {
    if (!supabase) throw new Error('Password reset needs Supabase to be configured.');
    await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/login?reset=1` });
  }, []);

  const demoSignInAs = useCallback(
    (persona: DemoPersona) => {
      if (mode !== 'demo') return;
      safeStorage.session.set(DEMO_KEY, persona);
      setUser(DEMO_PERSONAS[persona]);
    },
    [mode],
  );

  // Keep the platform adapter in sync before children render (child effects run before parent effects).
  setCurrentUser(user);

  const value = useMemo<AuthCtx>(
    () => ({
      mode,
      user,
      loading,
      signIn,
      signUp,
      signOut,
      requestPasswordReset,
      demoSignInAs,
      hasRole: (...roles) => Boolean(user && roles.some((r) => user.roles.includes(r))),
    }),
    [mode, user, loading, signIn, signUp, signOut, requestPasswordReset, demoSignInAs],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth must be used inside AuthProvider');
  return c;
}

export async function accessToken(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}
