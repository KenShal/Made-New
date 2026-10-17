import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { setup, validDraft } from './helpers';

async function draftAs(s: ReturnType<typeof setup>, who: { id: string }) {
  const res = await s.req('POST', '/api/creator/designs', { as: who, body: validDraft });
  expect(res.status).toBe(201);
  return (await res.json()) as { id: string; status: string };
}

describe('authentication', () => {
  it('rejects unauthenticated access to every protected route', async () => {
    const s = setup();
    const id = randomUUID();
    for (const [m, p] of [
      ['GET', '/api/me'], ['GET', '/api/creator/designs'], ['POST', '/api/creator/designs'], ['GET', `/api/designs/${id}`],
      ['GET', '/api/admin/reviews'], ['POST', `/api/admin/reviews/${id}/decision`], ['GET', '/api/admin/users'], ['GET', '/api/finance/payouts'],
    ] as const) {
      const res = await s.req(m, p, m === 'POST' ? { body: {} } : {});
      expect(res.status, `${m} ${p}`).toBe(401);
    }
  });
  it('rejects forged tokens', async () => {
    const s = setup();
    const res = await s.app.request('/api/me', { headers: { Authorization: 'Bearer forged.jwt.token' } });
    expect(res.status).toBe(401);
  });
  it('blocks suspended accounts', async () => {
    const s = setup();
    s.mem.seedUser({ id: 'sus', roles: ['creator'], status: 'suspended', creatorId: 'cr_S' });
    expect((await s.req('GET', '/api/me', { as: { id: 'sus' } })).status).toBe(403);
  });
});

describe('creator isolation', () => {
  it('a creator cannot read, edit, submit or archive another creator’s private design', async () => {
    const s = setup();
    const d = await draftAs(s, s.creatorA);
    expect((await s.req('GET', `/api/designs/${d.id}`, { as: s.creatorB })).status).toBe(404);
    expect((await s.req('PATCH', `/api/creator/designs/${d.id}`, { as: s.creatorB, body: validDraft })).status).toBe(404);
    expect((await s.req('POST', `/api/creator/designs/${d.id}/submit`, { as: s.creatorB })).status).toBe(404);
    expect((await s.req('POST', `/api/creator/designs/${d.id}/archive`, { as: s.creatorB })).status).toBe(404);
    const list = (await (await s.req('GET', '/api/creator/designs', { as: s.creatorB })).json()) as unknown[];
    expect(list).toHaveLength(0);
  });
  it('responses for other creators’ designs are indistinguishable from missing ones (no IDOR oracle)', async () => {
    const s = setup();
    const d = await draftAs(s, s.creatorA);
    const a = await s.req('GET', `/api/designs/${d.id}`, { as: s.creatorB });
    const b = await s.req('GET', `/api/designs/${randomUUID()}`, { as: s.creatorB });
    expect(a.status).toBe(b.status);
    expect(await a.json()).toEqual(await b.json());
  });
  it('reviewers cannot see drafts', async () => {
    const s = setup();
    const d = await draftAs(s, s.creatorA);
    expect((await s.req('GET', `/api/designs/${d.id}`, { as: s.reviewer })).status).toBe(404);
  });
  it('creators never receive internal reviewer notes', async () => {
    const s = setup();
    const d = await draftAs(s, s.creatorA);
    await s.req('POST', `/api/creator/designs/${d.id}/submit`, { as: s.creatorA });
    await s.req('POST', `/api/admin/reviews/${d.id}/notes`, { as: s.reviewer, body: { body: 'Check the licence on the font.' } });
    const view = (await (await s.req('GET', `/api/designs/${d.id}`, { as: s.creatorA })).json()) as { internalNotes: unknown[] };
    expect(view.internalNotes).toHaveLength(0);
  });
});

describe('mass assignment and privilege escalation', () => {
  it('rejects unknown fields such as status, creatorId or earnings in design payloads', async () => {
    const s = setup();
    for (const extra of [{ status: 'approved' }, { creatorId: 'cr_B' }, { earnings: { amount: 999999, currency: 'GBP' } }, { unitsSold: 10 }]) {
      const res = await s.req('POST', '/api/creator/designs', { as: s.creatorA, body: { ...validDraft, ...extra } });
      expect(res.status, JSON.stringify(extra)).toBe(422);
    }
  });
  it('onboarding cannot grant roles', async () => {
    const s = setup();
    const res = await s.req('POST', '/api/creator/profile', { as: s.shopper, body: { displayName: 'Me', kind: 'individual', location: 'Leeds', bio: 'I draw letters and love it lots.', purpose: 'Fund a youth trip to serve.', termsAccepted: true, roles: ['admin'] } });
    expect(res.status).toBe(422);
    const me = (await (await s.req('GET', '/api/me', { as: s.shopper })).json()) as { roles: string[] };
    expect(me.roles).not.toContain('admin');
  });
  it('shoppers and creators cannot reach admin or finance endpoints', async () => {
    const s = setup();
    for (const who of [s.shopper, s.creatorA]) {
      expect((await s.req('GET', '/api/admin/reviews', { as: who })).status).toBe(403);
      expect((await s.req('GET', '/api/admin/users', { as: who })).status).toBe(403);
      expect((await s.req('GET', '/api/finance/payouts', { as: who })).status).toBe(403);
    }
  });
  it('a design reviewer does not get finance permissions', async () => {
    const s = setup();
    expect((await s.req('GET', '/api/finance/payouts', { as: s.reviewer })).status).toBe(403);
    expect((await s.req('POST', '/api/finance/adjustments', { as: s.reviewer, body: {}, headers: { 'Idempotency-Key': randomUUID() } })).status).toBe(403);
  });
  it('finance does not get design review permissions', async () => {
    const s = setup();
    expect((await s.req('GET', '/api/admin/reviews', { as: s.finance })).status).toBe(403);
  });
  it('staff must use multi-factor authentication', async () => {
    const s = setup();
    expect((await s.req('GET', '/api/admin/reviews', { as: s.reviewer, aal: 'aal1' })).status).toBe(403);
    expect((await s.req('GET', '/api/admin/reviews', { as: s.reviewer, aal: 'aal2' })).status).toBe(200);
  });
});

describe('review lifecycle', () => {
  it('runs draft → submitted → under review → approved → publish job, with an audit trail', async () => {
    const s = setup();
    const d = await draftAs(s, s.creatorA);
    expect((await s.req('POST', `/api/creator/designs/${d.id}/submit`, { as: s.creatorA })).status).toBe(200);
    expect((await s.req('POST', `/api/admin/reviews/${d.id}/decision`, { as: s.reviewer, body: { to: 'under_review' } })).status).toBe(200);
    expect((await s.req('POST', `/api/admin/reviews/${d.id}/decision`, { as: s.reviewer, body: { to: 'approved' } })).status).toBe(200);
    // Reviewers cannot publish; admins can, and publishing twice yields the same job.
    expect((await s.req('POST', `/api/admin/reviews/${d.id}/publish`, { as: s.reviewer })).status).toBe(403);
    const j1 = (await (await s.req('POST', `/api/admin/reviews/${d.id}/publish`, { as: s.admin })).json()) as { job: { id: string } };
    const j2 = (await (await s.req('POST', `/api/admin/reviews/${d.id}/publish`, { as: s.admin })).json()) as { job: { id: string } };
    expect(j1.job.id).toBe(j2.job.id);
    const actions = s.mem.auditLog.filter((a) => a.entityId === d.id).map((a) => a.action);
    expect(actions).toEqual(['design.create', 'design.transition', 'design.transition', 'design.transition', 'design.publish_requested', 'design.publish_requested']);
  });
  it('rejecting or requesting changes requires a reason', async () => {
    const s = setup();
    const d = await draftAs(s, s.creatorA);
    await s.req('POST', `/api/creator/designs/${d.id}/submit`, { as: s.creatorA });
    await s.req('POST', `/api/admin/reviews/${d.id}/decision`, { as: s.reviewer, body: { to: 'under_review' } });
    expect((await s.req('POST', `/api/admin/reviews/${d.id}/decision`, { as: s.reviewer, body: { to: 'rejected' } })).status).toBe(422);
    expect((await s.req('POST', `/api/admin/reviews/${d.id}/decision`, { as: s.reviewer, body: { to: 'changes_requested', reason: 'Please increase the resolution to 4500px.' } })).status).toBe(200);
    // Creator can now edit and resubmit
    expect((await s.req('PATCH', `/api/creator/designs/${d.id}`, { as: s.creatorA, body: { ...validDraft, title: 'Made New v2' } })).status).toBe(200);
    expect((await s.req('POST', `/api/creator/designs/${d.id}/submit`, { as: s.creatorA })).status).toBe(200);
  });
  it('creators cannot approve their own work, even if they are also reviewers', async () => {
    const s = setup();
    const dual = s.mem.seedUser({ id: randomUUID(), roles: ['creator', 'reviewer'], creatorId: 'cr_D' });
    const d = await draftAs(s, dual);
    await s.req('POST', `/api/creator/designs/${d.id}/submit`, { as: dual });
    expect((await s.req('POST', `/api/admin/reviews/${d.id}/decision`, { as: dual, body: { to: 'under_review' } })).status).toBe(403);
  });
  it('approval cannot bypass failed artwork validation', async () => {
    const s = setup();
    s.mem.seedAsset({ id: 'bad', creatorId: 'cr_A', storagePath: 'cr_A/x.png', mimeType: 'image/png', bytes: 10, width: 100, height: 100, sha256: 'a'.repeat(64), scanStatus: 'clean', validation: [{ check: 'Dimensions', passed: false, detail: 'too small' }], validationPassed: false });
    const d = await draftAs(s, s.creatorA);
    // Attaching an unvalidated asset makes submission impossible.
    const upd = await s.req('PATCH', `/api/creator/designs/${d.id}`, { as: s.creatorA, body: { ...validDraft, artwork: { ...validDraft.artwork } } });
    expect(upd.status).toBe(200);
    s.mem.designs.get(d.id)!.frontAssetId = 'bad';
    expect((await s.req('POST', `/api/creator/designs/${d.id}/submit`, { as: s.creatorA })).status).toBe(422);
  });
  it('creators cannot attach another creator’s uploaded asset', async () => {
    const s = setup();
    s.mem.seedAsset({ id: '0b9d1c62-0c55-4d6c-9a43-8f3d4c2f9e11', creatorId: 'cr_B', storagePath: 'cr_B/y.png', mimeType: 'image/png', bytes: 10, width: 4500, height: 5400, sha256: 'b'.repeat(64), scanStatus: 'clean', validation: [], validationPassed: true });
    const res = await s.req('POST', '/api/creator/designs', { as: s.creatorA, body: { ...validDraft, artwork: { ...validDraft.artwork, assetId: '0b9d1c62-0c55-4d6c-9a43-8f3d4c2f9e11' } } });
    expect(res.status).toBe(422);
  });
  it('published designs cannot be edited by their creator', async () => {
    const s = setup();
    const d = await draftAs(s, s.creatorA);
    s.mem.designs.get(d.id)!.status = 'published';
    expect((await s.req('PATCH', `/api/creator/designs/${d.id}`, { as: s.creatorA, body: validDraft })).status).toBe(409);
  });
});

describe('finance controls', () => {
  it('payout approval requires finance, a recent sign-in and an idempotency key', async () => {
    const s = setup();
    const id = randomUUID();
    s.mem.seedPayout({ id, creatorId: 'cr_A', amount: 41220, currency: 'GBP', status: 'pending' });
    const stale = Math.floor(Date.now() / 1000) - 3600;
    expect((await s.req('POST', `/api/finance/payouts/${id}/approve`, { as: s.finance, authTime: stale, headers: { 'Idempotency-Key': randomUUID() } })).status).toBe(403);
    expect((await s.req('POST', `/api/finance/payouts/${id}/approve`, { as: s.finance })).status).toBe(422);
    const key = randomUUID();
    const ok = await s.req('POST', `/api/finance/payouts/${id}/approve`, { as: s.finance, headers: { 'Idempotency-Key': key } });
    expect(ok.status).toBe(200);
    const again = await s.req('POST', `/api/finance/payouts/${id}/approve`, { as: s.finance, headers: { 'Idempotency-Key': key } });
    expect(again.status).toBe(200);
    expect(s.mem.auditLog.filter((a) => a.action === 'payout.approve')).toHaveLength(1);
  });
  it('adjustments are idempotent and audited', async () => {
    const s = setup();
    const key = randomUUID();
    const body = { creatorId: 'cr_A', amount: 410, reason: 'Reprint credit for misprinted order' };
    expect((await s.req('POST', '/api/finance/adjustments', { as: s.finance, body, headers: { 'Idempotency-Key': key } })).status).toBe(201);
    await s.req('POST', '/api/finance/adjustments', { as: s.finance, body, headers: { 'Idempotency-Key': key } });
    expect(s.mem.ledger.filter((e) => e.entryType === 'adjustment')).toHaveLength(1);
  });
  it('creators only see their own earnings', async () => {
    const s = setup();
    s.mem.seedVariant({ shopifyVariantId: 'gid://shopify/ProductVariant/111', productId: 'p1', creatorId: 'cr_A', campaignId: null, productionCostAmount: 1290 });
    await s.webhook('orders/paid', { id: 1, admin_graphql_api_id: 'gid://shopify/Order/1', name: '#1', currency: 'GBP', financial_status: 'paid', processed_at: '2026-10-15T12:00:00Z', total_price: '38.00', total_tax: '6.33', line_items: [{ id: 1, variant_id: 111, product_id: 1, quantity: 1, price: '38.00', total_discount: '0.00', tax_lines: [{ price: '6.33' }] }] });
    const a = (await (await s.req('GET', '/api/creator/earnings', { as: s.creatorA })).json()) as { ledger: unknown[] };
    const b = (await (await s.req('GET', '/api/creator/earnings', { as: s.creatorB })).json()) as { ledger: unknown[] };
    expect(a.ledger.length).toBe(1);
    expect(b.ledger.length).toBe(0);
  });
});

describe('input validation and headers', () => {
  it('rejects malformed JSON, invalid ids and oversized strings', async () => {
    const s = setup();
    const bad = await s.app.request('/api/creator/designs', { method: 'POST', headers: { Authorization: `Bearer ${s.token(s.creatorA)}`, 'Content-Type': 'application/json' }, body: '{nope' });
    expect(bad.status).toBe(422);
    expect((await s.req('GET', '/api/designs/../../etc/passwd', { as: s.creatorA })).status).toBe(404);
    expect((await s.req('GET', "/api/designs/1' OR '1'='1", { as: s.creatorA })).status).toBe(404);
    expect((await s.req('POST', '/api/creator/designs', { as: s.creatorA, body: { ...validDraft, title: 'x'.repeat(500) } })).status).toBe(422);
    expect((await s.req('POST', '/api/creator/designs', { as: s.creatorA, body: { ...validDraft, suggestedPrice: { amount: 1, currency: 'GBP' } } })).status).toBe(422);
  });
  it('sets security headers and never leaks internals on errors', async () => {
    const s = setup();
    const res = await s.req('GET', '/api/health');
    expect(res.headers.get('x-frame-options')).toBe('DENY');
    expect(res.headers.get('content-security-policy')).toContain("default-src 'none'");
    expect(res.headers.get('strict-transport-security')).toContain('max-age');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
  });
  it('only allows configured CORS origins', async () => {
    const s = setup();
    const ok = await s.app.request('/api/health', { headers: { Origin: 'http://localhost:5173' } });
    const evil = await s.app.request('/api/health', { headers: { Origin: 'https://evil.example' } });
    expect(ok.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
    expect(evil.headers.get('access-control-allow-origin')).toBeNull();
  });
});
