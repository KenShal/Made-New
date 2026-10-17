import { createHmac, randomUUID } from 'node:crypto';
import { createApp } from '../src/app';
import { loadEnv } from '../src/env';
import { createLogger } from '../src/logger';
import { memoryRepo } from '../src/repo/memory';
import type { TokenVerifier } from '../src/auth';
import { unauthorised } from '../src/http/errors';
import type { MalwareScanner } from '../src/integrations/scanner';

export const WEBHOOK_SECRET = 'test-webhook-secret-123456';

/** Test tokens look like "t:<userId>:<aal>:<authTimeSeconds>". The fake verifier stands in for JWT verification. */
export const fakeVerifier: TokenVerifier = async (token) => {
  const [p, userId, aal, at] = token.split(':');
  if (p !== 't' || !userId) throw unauthorised();
  return { userId, email: `${userId}@example.test`, aal: aal === 'aal2' ? 'aal2' : 'aal1', authTime: Number(at ?? Math.floor(Date.now() / 1000)), emailVerified: true };
};

export function setup(opts: { scanner?: MalwareScanner; now?: () => number } = {}) {
  const mem = memoryRepo();
  const logs: string[] = [];
  const env = loadEnv({ NODE_ENV: 'test', SHOPIFY_WEBHOOK_SECRET: WEBHOOK_SECRET, SHOPIFY_STORE_DOMAIN: 'made-new-test.myshopify.com', CORS_ALLOWED_ORIGINS: 'http://localhost:5173', CUSTOMER_REF_SALT: 'salt-salt-salt-salt' });
  const app = createApp({ env, repo: mem.repo, verify: fakeVerifier, scanner: opts.scanner ?? { scan: async () => 'clean' }, log: createLogger((l) => logs.push(l)), now: opts.now });

  const creatorA = mem.seedUser({ id: randomUUID(), roles: ['shopper', 'creator'], creatorId: 'cr_A', name: 'Creator A' });
  const creatorB = mem.seedUser({ id: randomUUID(), roles: ['shopper', 'creator'], creatorId: 'cr_B', name: 'Creator B' });
  const reviewer = mem.seedUser({ id: randomUUID(), roles: ['shopper', 'reviewer'], name: 'Reviewer' });
  const admin = mem.seedUser({ id: randomUUID(), roles: ['shopper', 'reviewer', 'admin'], name: 'Admin' });
  const finance = mem.seedUser({ id: randomUUID(), roles: ['shopper', 'finance'], name: 'Finance' });
  const shopper = mem.seedUser({ id: randomUUID(), roles: ['shopper'], name: 'Shopper' });

  const now = () => Math.floor((opts.now?.() ?? Date.now()) / 1000);
  const token = (u: { id: string }, aal: 'aal1' | 'aal2' = 'aal2', authTime = now()) => `t:${u.id}:${aal}:${authTime}`;

  const req = (method: string, path: string, init: { as?: { id: string }; aal?: 'aal1' | 'aal2'; authTime?: number; body?: unknown; headers?: Record<string, string> } = {}) =>
    app.request(path, {
      method,
      headers: {
        ...(init.as ? { Authorization: `Bearer ${token(init.as, init.aal, init.authTime)}` } : {}),
        ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });

  const webhook = (topic: string, payload: unknown, opts2: { id?: string; secret?: string; tamper?: boolean } = {}) => {
    const raw = JSON.stringify(payload);
    const hmac = createHmac('sha256', opts2.secret ?? WEBHOOK_SECRET).update(raw).digest('base64');
    return app.request('/webhooks/shopify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Hmac-Sha256': hmac, 'X-Shopify-Topic': topic, 'X-Shopify-Webhook-Id': opts2.id ?? randomUUID(), 'X-Shopify-Shop-Domain': 'made-new-test.myshopify.com' },
      body: opts2.tamper ? raw.replace('"quantity":1', '"quantity":9') : raw,
    });
  };

  return { app, mem, env, logs, creatorA, creatorB, reviewer, admin, finance, shopper, req, webhook, token };
}

export const validDraft = {
  title: 'Made New',
  description: 'Stacked wordmark with verse on the back.',
  category: 'heavyweight',
  colourIds: ['bone', 'black'],
  productTypes: ['heavyweight'],
  suggestedPrice: { amount: 3800, currency: 'GBP' },
  scripture: '2 Corinthians 5:17',
  artwork: { style: 'stack', lines: ['MADE', 'NEW'], accent: '5:17' },
  ownershipConfirmed: true,
  policyAccepted: true,
};
