import { describe, expect, it } from 'vitest';
import { PermanentJobError, backoffMs, memoryJobStore, runJobs } from '../src/domain/jobs';
import { memoryStore } from '../src/http/rate-limit';
import { createLogger, redact } from '../src/logger';
import { setup } from './helpers';

describe('logger redaction', () => {
  it('redacts sensitive keys, bearer tokens, JWTs and Shopify tokens', () => {
    const lines: string[] = [];
    const log = createLogger((l) => lines.push(l));
    log.info('auth header Bearer abc.def.ghi', {
      password: 'hunter2hunter2',
      nested: { accessToken: 'x', apiKey: 'y', card: '4242424242424242', ok: 'visible' },
      note: 'token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
      // Built at runtime so secret scanners don't flag this fake fixture.
      shop: ['shpat', '0123456789abcdef0123456789abcdef'].join('_'),
    });
    const out = lines.join('');
    for (const secret of ['hunter2', 'abc.def.ghi', '4242424242424242', 'eyJhbGci', 'shpat_0123']) expect(out).not.toContain(secret);
    expect(out).toContain('visible');
  });
  it('does not leak error stacks', () => {
    expect(redact(new Error('boom'))).toEqual({ name: 'Error', message: 'boom' });
  });
});

describe('rate limiting', () => {
  it('fixed window resets after the window', () => {
    let t = 0;
    const s = memoryStore(() => t);
    for (let i = 0; i < 3; i++) s.hit('k', 1000);
    expect(s.hit('k', 1000).count).toBe(4);
    t = 1001;
    expect(s.hit('k', 1000).count).toBe(1);
  });
  it('returns 429 with Retry-After once a sensitive limit is exceeded', async () => {
    const s = setup();
    let last: Response | undefined;
    for (let i = 0; i < 11; i++) last = await s.req('POST', '/api/finance/adjustments', { as: s.finance, body: {}, headers: { 'Idempotency-Key': `k-${i}-abcdefgh` } });
    expect(last!.status).toBe(429);
    expect(last!.headers.get('Retry-After')).toBeTruthy();
  });
});

describe('integration jobs', () => {
  it('deduplicates by idempotency key', async () => {
    const store = memoryJobStore();
    const a = await store.enqueue({ kind: 'k', idempotencyKey: 'shopify-product:1', payload: {} });
    const b = await store.enqueue({ kind: 'k', idempotencyKey: 'shopify-product:1', payload: {} });
    expect(a.id).toBe(b.id);
    expect(store.all()).toHaveLength(1);
  });
  it('retries transient failures with backoff and then succeeds', async () => {
    const store = memoryJobStore();
    await store.enqueue({ kind: 'k', idempotencyKey: 'x', payload: {} });
    let calls = 0;
    const handlers = { k: async () => { calls++; if (calls === 1) throw new Error('503'); return { ok: true }; } };
    const t0 = new Date('2026-10-17T00:00:00Z');
    expect((await runJobs(store, handlers, t0)).failed).toBe(1);
    expect((await runJobs(store, handlers, t0)).ran).toBe(0); // backoff not elapsed
    await runJobs(store, handlers, new Date(t0.getTime() + backoffMs(1) + 1));
    expect(store.all()[0]).toMatchObject({ status: 'succeeded', attempts: 2 });
  });
  it('does not retry permanent errors, and allows a manual retry', async () => {
    const store = memoryJobStore();
    const j = await store.enqueue({ kind: 'k', idempotencyKey: 'y', payload: {} });
    await runJobs(store, { k: async () => { throw new PermanentJobError('bad mapping'); } });
    expect((await store.get(j.id))!.status).toBe('failed');
    expect((await store.requeue(j.id)).status).toBe('queued');
  });
  it('caps backoff at one hour', () => {
    expect(backoffMs(20)).toBe(60 * 60_000);
  });
});

describe('configuration', () => {
  it('treats blank values from .env.example as unset', async () => {
    const { loadEnv } = await import('../src/env');
    const { readFileSync } = await import('node:fs');
    const vars = Object.fromEntries(readFileSync(new URL('../.env.example', import.meta.url), 'utf8').split('\n').filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
    expect(() => loadEnv(vars)).not.toThrow();
  });
  it('fails fast in production when secrets are missing', async () => {
    const { loadEnv } = await import('../src/env');
    expect(() => loadEnv({ NODE_ENV: 'production' })).toThrow(/SUPABASE_URL/);
  });
});
