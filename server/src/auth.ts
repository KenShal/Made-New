import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import type { Role } from '@shared/types';
import { forbidden, unauthorised } from './http/errors';

export interface VerifiedToken {
  userId: string;
  email: string;
  aal: 'aal1' | 'aal2';
  /** Seconds since epoch of the most recent authentication (not refresh). */
  authTime: number;
  emailVerified: boolean;
}

export interface Principal extends VerifiedToken {
  roles: Role[];
  creatorId: string | null;
  name: string;
  token: string;
}

export type TokenVerifier = (token: string) => Promise<VerifiedToken>;

/**
 * Verifies Supabase access tokens locally: signature, issuer, audience and expiry.
 * Uses the project's JWKS (asymmetric keys) or the legacy HS256 secret.
 */
export function supabaseVerifier(cfg: { supabaseUrl: string; jwtSecret?: string }): TokenVerifier {
  const issuer = `${cfg.supabaseUrl}/auth/v1`;
  const key = cfg.jwtSecret ? new TextEncoder().encode(cfg.jwtSecret) : createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));
  return async (token) => {
    let payload: JWTPayload & { email?: string; aal?: string; amr?: { timestamp: number }[]; user_metadata?: { email_verified?: boolean } };
    try {
      ({ payload } = await jwtVerify(token, key as Parameters<typeof jwtVerify>[1], { issuer, audience: 'authenticated', clockTolerance: 5 }));
    } catch {
      throw unauthorised();
    }
    if (!payload.sub) throw unauthorised();
    const authTime = Math.max(0, ...(payload.amr ?? []).map((a) => a.timestamp ?? 0)) || (payload.iat ?? 0);
    return {
      userId: payload.sub,
      email: String(payload.email ?? ''),
      aal: payload.aal === 'aal2' ? 'aal2' : 'aal1',
      authTime,
      emailVerified: Boolean(payload.user_metadata?.email_verified ?? true),
    };
  };
}

export const STAFF_ROLES: Role[] = ['reviewer', 'admin', 'finance'];

export function requireRole(p: Principal | null, ...roles: Role[]): Principal {
  if (!p) throw unauthorised();
  if (!roles.some((r) => p.roles.includes(r))) throw forbidden();
  return p;
}

/** Staff actions require a second factor when REQUIRE_STAFF_MFA is on. */
export function requireStaffMfa(p: Principal, enforce: boolean): void {
  if (enforce && p.roles.some((r) => STAFF_ROLES.includes(r)) && p.aal !== 'aal2') {
    throw forbidden('Multi-factor authentication is required for staff accounts.');
  }
}

/** Sensitive actions (payout approval, adjustments) require a recent sign-in. */
export function requireRecentAuth(p: Principal, maxAgeSeconds = 15 * 60, nowSeconds = Math.floor(Date.now() / 1000)): void {
  if (nowSeconds - p.authTime > maxAgeSeconds) throw forbidden('Please sign in again to continue.');
}
