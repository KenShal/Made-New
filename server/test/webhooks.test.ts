import { describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import { setup } from './helpers';
import { verifyShopifyWebhook } from '../src/integrations/shopify';

const order = (over: Record<string, unknown> = {}) => ({
  id: 5001,
  admin_graphql_api_id: 'gid://shopify/Order/5001',
  name: '#MN-1048',
  currency: 'GBP',
  financial_status: 'paid',
  processed_at: '2026-10-15T12:00:00Z',
  total_price: '76.00',
  total_tax: '12.66',
  customer: { id: 77 },
  line_items: [{ id: 9001, variant_id: 111, product_id: 1, quantity: 2, price: '38.00', total_discount: '0.00', tax_lines: [{ price: '12.66' }] }],
  ...over,
});

function seeded() {
  const s = setup();
  s.mem.seedVariant({ shopifyVariantId: 'gid://shopify/ProductVariant/111', productId: 'p1', creatorId: 'cr_A', campaignId: 'cp_1', productionCostAmount: 1290 });
  return s;
}

describe('Shopify webhook signature', () => {
  it('accepts a correct HMAC and rejects tampered bodies, wrong secrets and malformed headers', () => {
    const body = '{"a":1}';
    const good = createHmac('sha256', 'secret-123456').update(body).digest('base64');
    expect(verifyShopifyWebhook(body, good, 'secret-123456')).toBe(true);
    expect(verifyShopifyWebhook('{"a":2}', good, 'secret-123456')).toBe(false);
    expect(verifyShopifyWebhook(body, good, 'other-secret-1')).toBe(false);
    expect(verifyShopifyWebhook(body, 'not-base64!!', 'secret-123456')).toBe(false);
    expect(verifyShopifyWebhook(body, '', 'secret-123456')).toBe(false);
    expect(verifyShopifyWebhook(body, null, 'secret-123456')).toBe(false);
  });

  it('returns 401 and writes nothing when the signature is invalid', async () => {
    const s = seeded();
    const res = await s.webhook('orders/paid', order(), { secret: 'wrong-secret-0000' });
    expect(res.status).toBe(401);
    expect(s.mem.ledger).toHaveLength(0);
  });

  it('returns 401 when the body was modified after signing', async () => {
    const s = seeded();
    const res = await s.webhook('orders/paid', order({ line_items: [{ id: 9001, variant_id: 111, product_id: 1, quantity: 1, price: '38.00', total_discount: '0.00', tax_lines: [] }] }), { tamper: true });
    expect(res.status).toBe(401);
  });
});

describe('order and refund processing', () => {
  it('records ledger entries for a paid order', async () => {
    const s = seeded();
    const res = await s.webhook('orders/paid', order());
    expect(res.status).toBe(200);
    expect(s.mem.ledger.map((e) => e.account).sort()).toEqual(['campaign', 'creator', 'platform']);
    expect(s.mem.ledger.find((e) => e.account === 'creator')!.creatorId).toBe('cr_A');
  });

  it('duplicate deliveries of the same webhook do not create duplicate ledger entries', async () => {
    const s = seeded();
    await s.webhook('orders/paid', order(), { id: 'evt-1' });
    const second = await s.webhook('orders/paid', order(), { id: 'evt-1' });
    expect(await second.json()).toMatchObject({ duplicate: true });
    expect(s.mem.ledger).toHaveLength(3);
  });

  it('the same order delivered under a different webhook id is still idempotent', async () => {
    const s = seeded();
    await s.webhook('orders/paid', order(), { id: 'evt-1' });
    await s.webhook('orders/paid', order(), { id: 'evt-2' });
    expect(s.mem.ledger).toHaveLength(3);
  });

  it('ignores unpaid orders (never trusts a browser to say an order was paid)', async () => {
    const s = seeded();
    await s.webhook('orders/paid', order({ financial_status: 'pending' }));
    expect(s.mem.ledger).toHaveLength(0);
  });

  it('a full refund reverses every account to zero, and replaying it changes nothing', async () => {
    const s = seeded();
    await s.webhook('orders/paid', order());
    const refund = { id: 7001, order_id: 5001, created_at: '2026-10-16T09:00:00Z', refund_line_items: [{ id: 8001, line_item_id: 9001, quantity: 2 }] };
    await s.webhook('refunds/create', refund, { id: 'r-1' });
    await s.webhook('refunds/create', refund, { id: 'r-1-redelivered' });
    const total = s.mem.ledger.reduce((n, e) => n + e.amount, 0);
    expect(total).toBe(0);
    expect(s.mem.ledger.filter((e) => e.entryType === 'refund')).toHaveLength(3);
  });

  it('partial refunds reverse proportionally and preserve the original sale entries', async () => {
    const s = seeded();
    await s.webhook('orders/paid', order());
    const before = s.mem.ledger.map((e) => ({ ...e }));
    await s.webhook('refunds/create', { id: 7002, order_id: 5001, created_at: '2026-10-16T09:00:00Z', refund_line_items: [{ id: 8002, line_item_id: 9001, quantity: 1 }] });
    // Original rows untouched (append-only)
    expect(s.mem.ledger.slice(0, 3)).toEqual(before);
    const creatorNet = s.mem.ledger.filter((e) => e.account === 'creator').reduce((n, e) => n + e.amount, 0);
    expect(creatorNet).toBeGreaterThan(0);
    expect(creatorNet).toBeLessThan(before.find((e) => e.account === 'creator')!.amount);
  });

  it('rejects malformed payloads with a validation error and no ledger writes', async () => {
    const s = seeded();
    const res = await s.webhook('orders/paid', { id: 'nope' });
    expect(res.status).toBe(422);
    expect(s.mem.ledger).toHaveLength(0);
  });

  it('rejects webhooks from an unknown shop domain', async () => {
    const s = seeded();
    const raw = JSON.stringify(order());
    const hmac = createHmac('sha256', 'test-webhook-secret-123456').update(raw).digest('base64');
    const res = await s.app.request('/webhooks/shopify', { method: 'POST', body: raw, headers: { 'X-Shopify-Hmac-Sha256': hmac, 'X-Shopify-Topic': 'orders/paid', 'X-Shopify-Webhook-Id': 'x', 'X-Shopify-Shop-Domain': 'evil.myshopify.com' } });
    expect(res.status).toBe(401);
  });
});

describe('creator reporting from verified orders', () => {
  type Breakdown = { gross: number; taxes: number; production: number; shipping: number; paymentFees: number; refunds: number; platformFees: number; campaignContributions: number; net: number; pending: number };
  const waterfall = (b: Breakdown) => b.gross - b.taxes - b.production - b.shipping - b.paymentFees - b.refunds - b.platformFees - b.campaignContributions;

  it('earnings statement reconciles to net, before and after a refund', async () => {
    const s = seeded();
    await s.webhook('orders/paid', order());
    let b = ((await (await s.req('GET', '/api/creator/earnings', { as: s.creatorA })).json()) as { breakdown: Breakdown }).breakdown;
    expect(b.gross).toBe(7600);
    expect(b.taxes).toBe(1266);
    expect(b.production).toBe(2580);
    expect(waterfall(b)).toBe(b.net);
    expect(b.pending).toBe(b.net); // inside the hold period

    await s.webhook('refunds/create', { id: 1, order_id: 5001, created_at: '2026-10-16T10:00:00Z', refund_line_items: [{ id: 3001, line_item_id: 9001, quantity: 1 }] });
    b = ((await (await s.req('GET', '/api/creator/earnings', { as: s.creatorA })).json()) as { breakdown: Breakdown }).breakdown;
    expect(b.refunds).toBeGreaterThan(0);
    expect(waterfall(b)).toBe(b.net);
  });

  it('overview and sales series reflect only the signed-in creator’s orders', async () => {
    const s = seeded();
    await s.webhook('orders/paid', order({ processed_at: new Date().toISOString() }));
    const a = (await (await s.req('GET', '/api/creator/overview', { as: s.creatorA })).json()) as { unitsSold: number };
    const b = (await (await s.req('GET', '/api/creator/overview', { as: s.creatorB })).json()) as { unitsSold: number };
    expect(a.unitsSold).toBe(2);
    expect(b.unitsSold).toBe(0);
    const series = (await (await s.req('GET', '/api/creator/sales', { as: s.creatorA })).json()) as { units: number }[];
    expect(series).toHaveLength(90);
    expect(series.reduce((n, d) => n + d.units, 0)).toBe(2);
  });

  it('admin overview hides money totals from reviewers; jobs are admin only', async () => {
    const s = seeded();
    await s.webhook('orders/paid', order());
    const rev = (await (await s.req('GET', '/api/admin/overview', { as: s.reviewer })).json()) as { gross: number; orders: number };
    const adm = (await (await s.req('GET', '/api/admin/overview', { as: s.admin })).json()) as { gross: number };
    expect(rev.gross).toBe(0);
    expect(adm.gross).toBe(7600);
    expect((await s.req('GET', '/api/admin/jobs', { as: s.reviewer })).status).toBe(403);
    expect((await s.req('GET', '/api/admin/jobs', { as: s.admin })).status).toBe(200);
    expect((await s.req('GET', '/api/admin/overview', { as: s.creatorA })).status).toBe(403);
  });
});

describe('finance reconciliation', () => {
  it('matches recorded orders to ledger entries and is finance-only', async () => {
    const s = seeded();
    await s.webhook('orders/paid', order({ processed_at: new Date().toISOString() }));
    const res = await s.req('GET', '/api/finance/reconciliation', { as: s.finance });
    const r = (await res.json()) as { orders: number; shopifyGross: number; unmatchedOrders: string[]; creatorEarnings: number };
    expect(r.orders).toBe(1);
    expect(r.shopifyGross).toBe(7600);
    expect(r.unmatchedOrders).toEqual([]);
    expect(r.creatorEarnings).toBeGreaterThan(0);
    expect((await s.req('GET', '/api/finance/reconciliation', { as: s.reviewer })).status).toBe(403);
  });
});
