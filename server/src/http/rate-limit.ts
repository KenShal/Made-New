/**
 * Fixed-window in-memory rate limiter. Suitable for a single instance; for
 * multiple instances swap the store for Redis/Upstash with the same interface.
 * Supabase Auth applies its own limits to sign-in, sign-up and reset flows.
 */
export interface RateLimitStore {
  hit(key: string, windowMs: number): { count: number; resetAt: number };
}

export function memoryStore(now: () => number = Date.now): RateLimitStore {
  const buckets = new Map<string, { count: number; resetAt: number }>();
  return {
    hit(key, windowMs) {
      const t = now();
      let b = buckets.get(key);
      if (!b || b.resetAt <= t) {
        b = { count: 0, resetAt: t + windowMs };
        buckets.set(key, b);
        if (buckets.size > 50_000) for (const [k, v] of buckets) if (v.resetAt <= t) buckets.delete(k);
      }
      b.count += 1;
      return b;
    },
  };
}

export interface RateRule {
  name: string;
  limit: number;
  windowMs: number;
}

export const RULES = {
  default: { name: 'default', limit: 300, windowMs: 60_000 },
  write: { name: 'write', limit: 60, windowMs: 60_000 },
  upload: { name: 'upload', limit: 20, windowMs: 10 * 60_000 },
  sensitive: { name: 'sensitive', limit: 10, windowMs: 10 * 60_000 },
  webhook: { name: 'webhook', limit: 600, windowMs: 60_000 },
} satisfies Record<string, RateRule>;
