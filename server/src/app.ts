import { Hono, type Context } from 'hono';
import { secureHeaders } from 'hono/secure-headers';
import { cors } from 'hono/cors';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';
import type { Env } from './env';
import type { Logger } from './logger';
import type { Repo } from './repo/types';
import type { Principal, TokenVerifier } from './auth';
import { requireRecentAuth, requireRole, requireStaffMfa } from './auth';
import { HttpError, invalid, notConfigured, toResponseBody, unauthorised, conflict } from './http/errors';
import { orderView, payoutView, userView } from './http/views';
import { RULES, memoryStore, type RateLimitStore, type RateRule } from './http/rate-limit';
import type { MalwareScanner } from './integrations/scanner';
import { verifyShopifyWebhook } from './integrations/shopify';
import * as svc from './services';
import { CREATOR_TERMS_VERSION, onboardingSchema, decisionSchema } from './services';

export interface Deps {
  env: Env;
  repo: Repo;
  verify: TokenVerifier;
  scanner: MalwareScanner;
  log: Logger;
  rateStore?: RateLimitStore;
  now?: () => number;
}

type Vars = { principal: Principal | null; requestId: string };

export function createApp(deps: Deps) {
  const { env, repo, log } = deps;
  const rate = deps.rateStore ?? memoryStore(deps.now);
  const app = new Hono<{ Variables: Vars }>();
  const allowed = env.CORS_ALLOWED_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean);
  const enforceMfa = env.REQUIRE_STAFF_MFA === 'true';

  app.use('*', async (c, next) => {
    c.set('requestId', crypto.randomUUID());
    c.set('principal', null);
    await next();
    c.header('X-Request-Id', c.get('requestId'));
  });
  app.use(
    '*',
    secureHeaders({
      contentSecurityPolicy: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
      strictTransportSecurity: 'max-age=63072000; includeSubDomains; preload',
      xFrameOptions: 'DENY',
      referrerPolicy: 'strict-origin-when-cross-origin',
      crossOriginResourcePolicy: 'same-site',
    }),
  );
  // Credentials are bearer tokens (not cookies), so cross-site requests cannot ride on ambient auth (CSRF).
  app.use('/api/*', cors({ origin: (o) => (allowed.includes(o) ? o : null), allowHeaders: ['Authorization', 'Content-Type', 'Idempotency-Key'], allowMethods: ['GET', 'POST', 'PATCH'], maxAge: 600 }));

  const limiter = (rule: RateRule) => async (c: Context<{ Variables: Vars }>, next: () => Promise<void>) => {
    // The last X-Forwarded-For hop is the one added by our own proxy; earlier hops are client-controlled.
    const who = c.get('principal')?.userId ?? c.req.header('x-forwarded-for')?.split(',').at(-1)?.trim() ?? 'anon';
    const r = rate.hit(`${rule.name}:${who}`, rule.windowMs);
    c.header('RateLimit-Limit', String(rule.limit));
    c.header('RateLimit-Remaining', String(Math.max(0, rule.limit - r.count)));
    if (r.count > rule.limit) {
      c.header('Retry-After', String(Math.ceil((r.resetAt - (deps.now?.() ?? Date.now())) / 1000)));
      throw new HttpError(429, 'rate_limited', 'Too many requests. Please slow down.');
    }
    await next();
  };

  // Authentication: verify the Supabase JWT, then load roles from the database (never from the token or body).
  const authenticate = async (c: Context<{ Variables: Vars }>, next: () => Promise<void>) => {
    const header = c.req.header('authorization');
    if (header?.startsWith('Bearer ')) {
      const token = header.slice(7).trim();
      const t = await deps.verify(token);
      const u = await repo.loadUser(t);
      if (!u) throw unauthorised();
      if (u.status !== 'active') throw new HttpError(403, 'suspended', 'This account is suspended.');
      c.set('principal', { ...t, roles: u.roles, creatorId: u.creatorId, name: u.name, token });
    }
    await next();
  };
  const staff = async (c: Context<{ Variables: Vars }>, next: () => Promise<void>) => {
    const p = c.get('principal');
    if (!p) throw unauthorised();
    requireStaffMfa(p, enforceMfa);
    await next();
  };
  const me = (c: Context<{ Variables: Vars }>) => {
    const p = c.get('principal');
    if (!p) throw unauthorised();
    return p;
  };
  const idemKey = (c: Context) => {
    const k = c.req.header('idempotency-key');
    if (!k || !/^[A-Za-z0-9-]{16,80}$/.test(k)) throw invalid('An Idempotency-Key header is required.', 'idempotency_key_required');
    return k;
  };
  const jsonBody = async (c: Context) => {
    try {
      return await c.req.json();
    } catch {
      throw invalid('Request body must be valid JSON.');
    }
  };
  const uuidParam = (c: Context, name: string) => {
    const v = c.req.param(name);
    if (!v || !z.string().uuid().safeParse(v).success) throw new HttpError(404, 'not_found', 'Not found.');
    return v;
  };

  app.onError((err, c) => {
    const { status, body } = toResponseBody(err);
    if (status >= 500) log.error('request failed', { requestId: c.get('requestId'), path: c.req.path, err });
    return c.json(body, status as 400);
  });
  app.notFound((c) => c.json({ error: 'no_route', message: 'Not found.' }, 404));

  /* ------------------------------------------------------------- public */
  app.get('/api/health', (c) => c.json({ ok: true }));
  app.get('/api/public/campaigns', limiter(RULES.default), async (c) => c.json(await repo.publicCampaigns()));

  /* ------------------------------------------------------------- webhooks */
  // Raw body is required for HMAC verification, so this route reads text, not JSON.
  app.post('/webhooks/shopify', limiter(RULES.webhook), bodyLimit({ maxSize: 1024 * 1024 }), async (c) => {
    if (!env.SHOPIFY_WEBHOOK_SECRET) throw notConfigured('Shopify webhooks');
    const raw = Buffer.from(await c.req.arrayBuffer());
    if (!verifyShopifyWebhook(raw, c.req.header('x-shopify-hmac-sha256'), env.SHOPIFY_WEBHOOK_SECRET)) {
      log.warn('shopify webhook signature rejected', { topic: c.req.header('x-shopify-topic') });
      return c.json({ error: 'invalid_signature' }, 401);
    }
    if (env.SHOPIFY_STORE_DOMAIN && c.req.header('x-shopify-shop-domain') !== env.SHOPIFY_STORE_DOMAIN) return c.json({ error: 'unknown_shop' }, 401);
    const eventId = c.req.header('x-shopify-webhook-id') ?? c.req.header('x-shopify-event-id');
    const topic = c.req.header('x-shopify-topic') ?? '';
    if (!eventId) return c.json({ error: 'missing_event_id' }, 400);
    // Replay/duplicate protection: each delivery id is processed once.
    const state = await repo.recordWebhookEvent('shopify', eventId, topic);
    if (state === 'processed') return c.json({ ok: true, duplicate: true });
    let payload: unknown;
    try {
      payload = JSON.parse(raw.toString('utf8'));
    } catch {
      return c.json({ error: 'invalid_json' }, 400);
    }
    let result: unknown = { ignored: true };
    if (topic === 'orders/paid') result = await svc.handleOrderPaid(repo, payload, env.CUSTOMER_REF_SALT ?? 'dev-salt-not-for-production', log);
    else if (topic === 'refunds/create') result = await svc.handleRefund(repo, payload);
    await repo.markWebhookProcessed('shopify', eventId);
    return c.json({ ok: true, result });
  });

  /* ------------------------------------------------------------- authenticated */
  app.use('/api/*', authenticate);
  app.use('/api/*', limiter(RULES.default));
  app.on(['POST', 'PATCH'], '/api/*', limiter(RULES.write));

  app.get('/api/me', (c) => {
    const p = me(c);
    return c.json({ id: p.userId, email: p.email, name: p.name, roles: p.roles, creatorId: p.creatorId, emailVerified: p.emailVerified, mfa: p.aal === 'aal2' });
  });

  app.post('/api/creator/profile', async (c) => {
    const p = me(c);
    const input = onboardingSchema.parse(await jsonBody(c));
    const handle = input.displayName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 30) + '-' + p.userId.slice(0, 6);
    const creatorId = await repo.createCreatorProfile(p.userId, { ...input, handle, termsVersion: CREATOR_TERMS_VERSION });
    await repo.audit(p.userId, 'creator.onboard', 'creator', creatorId, { termsVersion: CREATOR_TERMS_VERSION });
    return c.json({ creatorId }, 201);
  });

  app.get('/api/creator/designs', async (c) => {
    const p = requireRole(me(c), 'creator');
    return c.json(p.creatorId ? await repo.listDesignsByCreator(p.creatorId) : []);
  });
  app.post('/api/creator/designs', async (c) => c.json(await svc.createDesign(repo, me(c), await jsonBody(c)), 201));
  app.patch('/api/creator/designs/:id', async (c) => c.json(await svc.updateDesign(repo, me(c), uuidParam(c, 'id'), await jsonBody(c))));
  app.post('/api/creator/designs/:id/submit', async (c) => c.json(await svc.transition(repo, requireRole(me(c), 'creator'), uuidParam(c, 'id'), 'submitted')));
  app.post('/api/creator/designs/:id/archive', async (c) => c.json(await svc.transition(repo, requireRole(me(c), 'creator'), uuidParam(c, 'id'), 'archived')));
  app.post('/api/creator/artwork', limiter(RULES.upload), bodyLimit({ maxSize: 26 * 1024 * 1024, onError: () => { throw new HttpError(413, 'too_large', 'Files must be under 25 MB.'); } }), async (c) => {
    const p = me(c);
    const form = await c.req.parseBody();
    const file = form['file'];
    if (!(file instanceof File)) throw invalid('Attach an image file.');
    return c.json(await svc.uploadArtwork(repo, deps.scanner, p, { bytes: Buffer.from(await file.arrayBuffer()) }));
  });
  app.get('/api/creator/earnings', async (c) => c.json(await svc.creatorEarnings(repo, me(c))));
  app.get('/api/creator/overview', async (c) => c.json(await svc.creatorOverview(repo, me(c))));
  app.get('/api/creator/sales', async (c) => c.json(await svc.creatorSales(repo, me(c))));
  app.get('/api/designs/:id', async (c) => c.json(await svc.designView(repo, me(c), uuidParam(c, 'id'))));

  /* ------------------------------------------------------------- staff */
  app.use('/api/admin/*', staff);
  app.use('/api/finance/*', staff);

  app.get('/api/admin/overview', async (c) => c.json(await svc.adminOverview(repo, me(c))));
  app.get('/api/admin/jobs', async (c) => c.json(await svc.listJobs(repo, me(c))));
  app.get('/api/admin/reviews', async (c) => {
    requireRole(me(c), 'reviewer', 'admin');
    return c.json(await repo.listDesignsByStatus(['submitted', 'under_review', 'approved', 'changes_requested', 'rejected', 'published']));
  });
  app.post('/api/admin/reviews/:id/decision', async (c) => {
    const p = requireRole(me(c), 'reviewer', 'admin');
    const body = decisionSchema.parse(await jsonBody(c));
    return c.json(await svc.transition(repo, p, uuidParam(c, 'id'), body.to, body.reason));
  });
  app.post('/api/admin/reviews/:id/notes', async (c) => {
    const p = requireRole(me(c), 'reviewer', 'admin');
    const id = uuidParam(c, 'id');
    await svc.loadVisibleDesign(repo, p, id);
    const { body } = z.object({ body: z.string().trim().min(1).max(2000) }).strict().parse(await jsonBody(c));
    await repo.addReviewNote(id, p.userId, body);
    return c.json(await svc.designView(repo, p, id));
  });
  app.post('/api/admin/reviews/:id/publish', async (c) => {
    const p = requireRole(me(c), 'admin');
    const id = uuidParam(c, 'id');
    const d = await svc.loadVisibleDesign(repo, p, id);
    if (d.status !== 'approved') throw conflict('Only approved designs can be published.');
    if (!(await svc.validationPassed(repo, d))) throw invalid('Validation has not passed.', 'validation_failed');
    // Idempotent: the same submission always maps to the same job, whatever key the client sends.
    const job = await repo.jobs.enqueue({ kind: 'shopify.product.create', idempotencyKey: `shopify-product:${id}`, payload: { submissionId: id, requestedBy: p.userId } });
    await repo.audit(p.userId, 'design.publish_requested', 'design_submission', id, { jobId: job.id });
    return c.json({ job }, 202);
  });
  app.get('/api/admin/users', async (c) => {
    requireRole(me(c), 'admin');
    const q = z.string().max(80).catch('').parse(c.req.query('q') ?? '');
    const users = await repo.listUsers(q);
    return c.json(await Promise.all(users.map(async (u) => userView(u, u.creatorId ? await repo.listDesignsByCreator(u.creatorId) : []))));
  });
  app.post('/api/admin/users/:id/status', async (c) => {
    const p = requireRole(me(c), 'admin');
    const id = uuidParam(c, 'id');
    const { status, reason } = z.object({ status: z.enum(['active', 'suspended']), reason: z.string().trim().min(10).max(500) }).strict().parse(await jsonBody(c));
    if (id === p.userId) throw conflict('You cannot change your own account status.');
    const target = (await repo.listUsers('')).find((u) => u.id === id);
    if (!target) throw new HttpError(404, 'not_found', 'User not found.');
    if (target.roles.includes('admin')) throw new HttpError(403, 'forbidden', 'Administrators cannot be suspended here.');
    const u = await repo.setUserStatus(id, status);
    await repo.audit(p.userId, `user.${status === 'active' ? 'restore' : 'suspend'}`, 'user', id, { reason });
    return c.json(userView(u, u.creatorId ? await repo.listDesignsByCreator(u.creatorId) : []));
  });
  app.get('/api/admin/orders', async (c) => {
    requireRole(me(c), 'admin', 'finance');
    return c.json((await repo.listOrders(200)).map(orderView));
  });
  app.post('/api/admin/jobs/:id/retry', async (c) => {
    const p = requireRole(me(c), 'admin');
    idemKey(c);
    const job = await repo.jobs.requeue(c.req.param('id')).catch(() => {
      throw conflict('Only failed jobs can be retried.');
    });
    await repo.audit(p.userId, 'job.retry', 'integration_job', job.id);
    return c.json(job);
  });

  // Finance: separate role from review; recent sign-in required for money movement.
  app.get('/api/finance/reconciliation', async (c) => c.json(await svc.reconciliation(repo, me(c))));
  app.get('/api/finance/payouts', async (c) => {
    requireRole(me(c), 'finance');
    const [payouts, users] = await Promise.all([repo.listPayouts(), repo.listUsers('')]);
    return c.json(payouts.map((x) => payoutView(x, users.find((u) => u.creatorId === x.creatorId)?.name ?? 'Unknown creator')));
  });
  app.post('/api/finance/payouts/:id/approve', limiter(RULES.sensitive), async (c) => {
    const p = requireRole(me(c), 'finance');
    requireRecentAuth(p, 15 * 60, Math.floor((deps.now?.() ?? Date.now()) / 1000));
    idemKey(c);
    const id = uuidParam(c, 'id');
    const payout = (await repo.listPayouts()).find((x) => x.id === id);
    if (!payout) throw new HttpError(404, 'not_found', 'Payout not found.');
    const creatorName = async () => (await repo.listUsers('')).find((u) => u.creatorId === payout.creatorId)?.name ?? 'Unknown creator';
    if (payout.status === 'approved') return c.json(payoutView(payout, await creatorName())); // idempotent repeat
    if (payout.status !== 'pending') throw conflict('Only pending payouts can be approved.');
    const out = await repo.approvePayout(id, p.userId);
    await repo.audit(p.userId, 'payout.approve', 'payout', id, { amount: payout.amount });
    return c.json(payoutView(out, await creatorName()));
  });
  app.post('/api/finance/adjustments', limiter(RULES.sensitive), async (c) => {
    const p = requireRole(me(c), 'finance');
    requireRecentAuth(p, 15 * 60, Math.floor((deps.now?.() ?? Date.now()) / 1000));
    return c.json(await svc.createAdjustment(repo, p, await jsonBody(c), idemKey(c)), 201);
  });

  return app;
}
