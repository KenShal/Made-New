import { createHash } from 'node:crypto';
import { z } from 'zod';
import { checkTransition, EDITABLE_BY_CREATOR, type Actor, type DesignStatus } from '@shared/lifecycle';
import type { Principal } from './auth';
import { requireRole } from './auth';
import { conflict, forbidden, invalid, notFound } from './http/errors';
import type { DesignRecord, Repo, StoredLedgerEntry } from './repo/types';
import { policyFor } from '@shared/revenue-policy';
import { processArtwork } from './domain/artwork';
import type { MalwareScanner } from './integrations/scanner';
import { saleEntries, refundEntries, adjustmentEntry, balanceFor, type VerifiedLineItem, type NewLedgerEntry } from './domain/ledger';
import { orderPaidSchema, refundSchema, toMinor } from './integrations/shopify';
import type { Logger } from './logger';

/* ------------------------------------------------------------------ schemas */

const artworkSchema = z.object({
  style: z.enum(['stack', 'verse', 'mark', 'script', 'arc', 'block']),
  lines: z.array(z.string().max(28)).max(6),
  accent: z.string().max(20).optional(),
  assetId: z.string().uuid().optional(),
});

const moneySchema = z.object({ amount: z.number().int(), currency: z.literal('GBP') });

/** Strict: unknown keys (status, creatorId, roles, earnings...) are rejected, preventing mass assignment. */
export const draftSchema = z
  .object({
    title: z.string().trim().min(2).max(60),
    description: z.string().trim().max(600).default(''),
    category: z.enum(['tee', 'heavyweight', 'longsleeve', 'crewneck']),
    colourIds: z.array(z.string().regex(/^[a-z-]{2,20}$/)).min(1).max(12),
    productTypes: z.array(z.enum(['tee', 'heavyweight', 'longsleeve', 'crewneck'])).min(1).max(4),
    suggestedPrice: moneySchema.refine((m) => m.amount >= 2400 && m.amount <= 6500, 'Price must be between £24 and £65'),
    scripture: z.string().trim().max(60).optional().nullable(),
    artwork: artworkSchema,
    backArtwork: artworkSchema.optional().nullable(),
    campaign: z
      .object({
        name: z.string().trim().min(3).max(80),
        goal: moneySchema.refine((m) => m.amount >= 10_000 && m.amount <= 10_000_000),
        beneficiary: z.string().trim().min(2).max(120),
        intendedUse: z.string().trim().min(10).max(600),
        description: z.string().trim().min(10).max(1000),
        endsAt: z.string().date().optional(),
      })
      .strict()
      .optional()
      .nullable(),
    ownershipConfirmed: z.boolean(),
    policyAccepted: z.boolean(),
  })
  .strict();

export const onboardingSchema = z
  .object({
    displayName: z.string().trim().min(2).max(60),
    kind: z.enum(['individual', 'organisation']),
    organisationName: z.string().trim().max(120).optional(),
    location: z.string().trim().min(2).max(80),
    bio: z.string().trim().min(20).max(600),
    purpose: z.string().trim().min(20).max(600),
    termsAccepted: z.literal(true),
  })
  .strict();

export const decisionSchema = z.object({ to: z.enum(['under_review', 'approved', 'changes_requested', 'rejected']), reason: z.string().trim().max(1000).optional() }).strict();

export const CREATOR_TERMS_VERSION = '2026-10';

/* ------------------------------------------------------------------ helpers */

function actorsFor(p: Principal, d: DesignRecord): Actor[] {
  const a: Actor[] = [];
  if (p.creatorId && p.creatorId === d.creatorId) a.push('creator');
  // Reviewers may never review their own work.
  if ((p.roles.includes('reviewer') || p.roles.includes('admin')) && p.creatorId !== d.creatorId) a.push('reviewer');
  if (p.roles.includes('admin')) a.push('publisher');
  return a;
}

const isReviewer = (p: Principal) => p.roles.includes('reviewer') || p.roles.includes('admin');

/** Visibility rule shared with RLS: owners see their designs; reviewers see non-drafts. */
export async function loadVisibleDesign(repo: Repo, p: Principal, id: string): Promise<DesignRecord> {
  const d = await repo.getDesign(id);
  if (!d) throw notFound('Design');
  const owner = p.creatorId === d.creatorId;
  if (!owner && !(isReviewer(p) && d.status !== 'draft')) throw notFound('Design');
  return d;
}

export async function validationPassed(repo: Repo, d: DesignRecord): Promise<boolean> {
  if (!d.ownershipConfirmed || !d.policyAccepted) return false;
  for (const id of [d.frontAssetId, d.backAssetId]) {
    if (!id) continue;
    const a = await repo.getAsset(id);
    if (!a || a.creatorId !== d.creatorId || a.scanStatus !== 'clean' || !a.validationPassed) return false;
  }
  const art = d.artwork as { lines?: string[] };
  return Boolean(d.frontAssetId || (art.lines && art.lines.some((l) => l.trim())));
}

async function assertOwnedAssets(repo: Repo, creatorId: string, ids: (string | undefined | null)[]) {
  for (const id of ids) {
    if (!id) continue;
    const a = await repo.getAsset(id);
    if (!a || a.creatorId !== creatorId) throw invalid('Artwork file not found.');
  }
}

/* ------------------------------------------------------------------ designs */

export async function createDesign(repo: Repo, p: Principal, body: unknown) {
  requireRole(p, 'creator');
  if (!p.creatorId) throw forbidden('Complete creator onboarding first.');
  const input = draftSchema.parse(body);
  await assertOwnedAssets(repo, p.creatorId, [input.artwork.assetId, input.backArtwork?.assetId]);
  const d = await repo.createDesign(p.creatorId, { ...input, frontAssetId: input.artwork.assetId ?? null, backAssetId: input.backArtwork?.assetId ?? null });
  await repo.audit(p.userId, 'design.create', 'design_submission', d.id);
  return d;
}

export async function updateDesign(repo: Repo, p: Principal, id: string, body: unknown) {
  requireRole(p, 'creator');
  const d = await loadVisibleDesign(repo, p, id);
  if (d.creatorId !== p.creatorId) throw notFound('Design');
  if (!EDITABLE_BY_CREATOR.includes(d.status)) throw conflict('Only drafts and designs with requested changes can be edited.');
  const input = draftSchema.parse(body);
  await assertOwnedAssets(repo, d.creatorId, [input.artwork.assetId, input.backArtwork?.assetId]);
  return repo.updateDesign(id, { ...input, frontAssetId: input.artwork.assetId ?? null, backAssetId: input.backArtwork?.assetId ?? null });
}

export async function transition(repo: Repo, p: Principal, id: string, to: DesignStatus, reason?: string | null) {
  const d = await loadVisibleDesign(repo, p, id);
  const res = checkTransition({ from: d.status, to, actors: actorsFor(p, d), reason, validationPassed: await validationPassed(repo, d) });
  if (!res.ok) {
    if (res.error === 'forbidden_actor') throw forbidden();
    if (res.error === 'reason_required') throw invalid('A reason of at least 10 characters is required.', 'reason_required');
    if (res.error === 'validation_failed') throw invalid('Artwork validation, ownership confirmation and policy acceptance must pass first.', 'validation_failed');
    throw conflict('That status change is not allowed.');
  }
  const updated = await repo.setDesignStatus(id, d.status, to, { id: p.userId, name: p.name }, reason?.trim() || null);
  await repo.audit(p.userId, 'design.transition', 'design_submission', id, { from: d.status, to, reason: reason ?? null });
  return updated;
}

export async function designView(repo: Repo, p: Principal, id: string) {
  const d = await loadVisibleDesign(repo, p, id);
  const [history, notes] = await Promise.all([repo.reviewEvents(id), isReviewer(p) ? repo.reviewNotes(id) : Promise.resolve([])]);
  const validation = [];
  for (const aid of [d.frontAssetId, d.backAssetId]) {
    if (!aid) continue;
    const a = await repo.getAsset(aid);
    if (a) validation.push(...a.validation, { check: 'Malware scan', passed: a.scanStatus === 'clean', detail: a.scanStatus });
  }
  return { ...d, history, internalNotes: notes, validation };
}

/* ------------------------------------------------------------------ artwork */

export async function uploadArtwork(repo: Repo, scanner: MalwareScanner, p: Principal, file: { bytes: Buffer }) {
  requireRole(p, 'creator');
  if (!p.creatorId) throw forbidden('Complete creator onboarding first.');
  const processed = await processArtwork(file.bytes, p.creatorId);
  if (!processed.output || !processed.storageKey) return { assetId: null, previewUrl: null, validation: processed.checks };
  const scan = await scanner.scan(processed.output);
  if (scan === 'infected') {
    await repo.audit(p.userId, 'asset.rejected_malware', 'creator', p.creatorId);
    throw invalid('This file was rejected by our security scan.', 'malware');
  }
  const asset = await repo.saveAsset(
    {
      creatorId: p.creatorId,
      storagePath: processed.storageKey,
      mimeType: 'image/png',
      bytes: processed.output.length,
      width: processed.width!,
      height: processed.height!,
      sha256: processed.sha256!,
      scanStatus: scan,
      validation: processed.checks,
      validationPassed: processed.ok,
    },
    processed.output,
  );
  const previewUrl = await repo.signedAssetUrl(asset.storagePath, 600);
  return { assetId: asset.id, previewUrl, validation: [...processed.checks, { check: 'Malware scan', passed: scan === 'clean', detail: scan === 'pending' ? 'Queued' : scan }] };
}

/* ------------------------------------------------------------------ commerce */

export function customerRef(customerId: number | undefined | null, salt: string): string | null {
  if (!customerId) return null;
  return createHash('sha256').update(`${salt}:${customerId}`).digest('hex');
}

/**
 * orders/paid: record the order and write sale entries. Safe to replay: order
 * rows upsert on Shopify ids and ledger rows are keyed by line item.
 */
export async function handleOrderPaid(repo: Repo, payload: unknown, salt: string, log: Logger) {
  const o = orderPaidSchema.parse(payload);
  if (!['paid', 'partially_refunded', 'refunded'].includes(o.financial_status)) {
    log.info('order not paid; skipping', { order: o.id, status: o.financial_status });
    return { entries: 0 };
  }
  const variantIds = o.line_items.map((l) => (l.variant_id ? `gid://shopify/ProductVariant/${l.variant_id}` : '')).filter(Boolean);
  const mappings = await repo.variantMappings(variantIds);
  const shippingCharged = toMinor(o.total_shipping_price_set?.shop_money.amount ?? '0');
  const totalUnits = o.line_items.reduce((n, l) => n + l.quantity, 0) || 1;

  const { order, items } = await repo.upsertOrder(
    { shopifyOrderId: o.admin_graphql_api_id, orderNumber: o.name, currency: o.currency, totalAmount: toMinor(o.total_price), taxAmount: toMinor(o.total_tax), financialStatus: o.financial_status, processedAt: o.processed_at, customerRef: customerRef(o.customer?.id, salt) },
    o.line_items.map((l) => {
      const m = mappings.find((x) => x.shopifyVariantId === `gid://shopify/ProductVariant/${l.variant_id}`);
      return {
        shopifyLineItemId: String(l.id),
        variantShopifyId: l.variant_id ? `gid://shopify/ProductVariant/${l.variant_id}` : null,
        creatorId: m?.creatorId ?? null,
        campaignId: m?.campaignId ?? null,
        quantity: l.quantity,
        unitPriceAmount: toMinor(l.price),
        discountAmount: toMinor(l.total_discount),
        taxAmount: l.tax_lines.reduce((n, t) => n + toMinor(t.price), 0),
        productionCostAmount: m?.productionCostAmount ?? 0,
        currency: o.currency,
      };
    }),
  );

  const lines: VerifiedLineItem[] = items.map((i) => ({
    lineItemId: i.shopifyLineItemId,
    orderItemId: i.id,
    creatorId: i.creatorId,
    campaignId: i.campaignId,
    quantity: i.quantity,
    unitPrice: i.unitPriceAmount,
    discount: i.discountAmount,
    tax: i.taxAmount,
    productionCostPerUnit: i.productionCostAmount,
    // Shipping is allocated per unit; shipping cost is treated as equal to the charge (pass-through).
    shippingChargedAllocated: Math.floor((shippingCharged * i.quantity) / totalUnits),
    shippingCostAllocated: Math.floor((shippingCharged * i.quantity) / totalUnits),
  }));
  const inserted = await repo.insertLedgerEntries(saleEntries(order.processedAt, order.currency, lines));
  return { entries: inserted };
}

export async function handleRefund(repo: Repo, payload: unknown) {
  const r = refundSchema.parse(payload);
  const lineIds = r.refund_line_items.map((l) => String(l.line_item_id));
  const items = await repo.orderItemsByShopifyLineIds(lineIds);
  const originals = await repo.ledgerByKeyPrefix(lineIds.map((id) => `sale:${id}:`));
  const priorRefunds = await repo.ledgerReversing(originals.map((e) => e.idempotencyKey));
  const applied = await repo.ledgerByKeyPrefix(r.refund_line_items.map((l) => `refund:${l.id}:`));
  const entries: NewLedgerEntry[] = [];
  for (const rl of r.refund_line_items) {
    const item = items.find((i) => i.shopifyLineItemId === String(rl.line_item_id));
    if (!item) continue; // unknown line (e.g. non-MADE NEW product)
    if (applied.some((e) => e.idempotencyKey.startsWith(`refund:${rl.id}:`))) continue; // already applied (replay)
    const priorQty = (() => {
      // Derive previously refunded units from prior reversals of the platform entry.
      const sale = originals.find((e) => e.idempotencyKey === `sale:${rl.line_item_id}:platform`);
      if (!sale || sale.amount === 0) return 0;
      const reversed = priorRefunds.filter((e) => e.reversesKey === sale.idempotencyKey).reduce((n, e) => n + Math.abs(e.amount), 0);
      return Math.round((reversed / Math.abs(sale.amount)) * item.quantity);
    })();
    entries.push(...refundEntries(r.created_at, [{ refundLineItemId: String(rl.id), lineItemId: String(rl.line_item_id), quantity: rl.quantity, originalQuantity: item.quantity }], originals, () => priorQty));
  }
  return { entries: await repo.insertLedgerEntries(entries) };
}

const ENTRY_DESCRIPTIONS: Record<StoredLedgerEntry['entryType'], string> = {
  sale: 'Creator share of a verified sale',
  refund: 'Refund reversal',
  adjustment: 'Manual adjustment',
  payout: 'Payout',
};

function ledgerView(e: StoredLedgerEntry, now: string) {
  const status = e.entryType === 'payout' ? 'paid' : e.entryType === 'refund' ? 'reversed' : e.availableAt > now ? 'pending' : 'eligible';
  return { id: e.id, at: e.createdAt, kind: e.entryType, description: e.reason ? `${ENTRY_DESCRIPTIONS[e.entryType]}: ${e.reason}` : ENTRY_DESCRIPTIONS[e.entryType], amount: e.amount, currency: e.currency, status, policyVersion: e.policyVersion };
}

/**
 * Earnings statement derived only from verified order items and ledger entries.
 * The waterfall reconciles: gross - taxes - production - shipping - payment fees
 * equals the margin, which is exactly the sum of the creator, campaign and
 * platform sale entries. Shipping is passed through at cost, so it nets to zero.
 */
export async function creatorEarnings(repo: Repo, p: Principal, now = new Date().toISOString()) {
  requireRole(p, 'creator');
  if (!p.creatorId) throw forbidden('Complete creator onboarding first.');
  const [own, attributed, items] = await Promise.all([repo.ledgerForCreator(p.creatorId), repo.ledgerAttributedToCreator(p.creatorId), repo.orderItemsForCreator(p.creatorId)]);
  const sum = (f: (e: StoredLedgerEntry) => boolean) => attributed.filter(f).reduce((n, e) => n + e.amount, 0);
  const gross = items.reduce((n, i) => n + i.unitPriceAmount * i.quantity - i.discountAmount, 0);
  const taxes = items.reduce((n, i) => n + i.taxAmount, 0);
  const production = items.reduce((n, i) => n + i.productionCostAmount * i.quantity, 0);
  const creatorSales = sum((e) => e.entryType === 'sale' && e.account === 'creator');
  const campaignSales = sum((e) => e.entryType === 'sale' && e.account === 'campaign');
  const platformSales = sum((e) => e.entryType === 'sale' && e.account === 'platform');
  const balance = balanceFor(own, now);
  const latest = own.reduce<string | null>((v, e) => (!v || e.createdAt > v ? e.createdAt : v), null);
  const breakdown = {
    currency: 'GBP' as const,
    gross,
    taxes,
    production,
    shipping: 0,
    paymentFees: Math.max(0, gross - taxes - production - (creatorSales + campaignSales + platformSales)),
    refunds: -sum((e) => e.entryType === 'refund' && e.account === 'creator'),
    platformFees: platformSales,
    campaignContributions: campaignSales,
    net: balance.net,
    pending: balance.pending,
    paidOut: balance.paidOut,
    policyVersion: latest ? own.find((e) => e.createdAt === latest)!.policyVersion : policyFor(now).version,
  };
  return { breakdown, ledger: own.map((e) => ledgerView(e, now)) };
}

export async function creatorOverview(repo: Repo, p: Principal, now = new Date().toISOString()) {
  requireRole(p, 'creator');
  if (!p.creatorId) throw forbidden('Complete creator onboarding first.');
  const [{ breakdown }, designs, items] = await Promise.all([creatorEarnings(repo, p, now), repo.listDesignsByCreator(p.creatorId), repo.orderItemsForCreator(p.creatorId)]);
  const payouts = (await repo.listPayouts()).filter((x) => x.creatorId === p.creatorId && (x.status === 'pending' || x.status === 'approved'));
  return {
    unitsSold: items.reduce((n, i) => n + i.quantity, 0),
    gross: breakdown.gross,
    estimatedEarnings: breakdown.net,
    confirmedEarnings: breakdown.net - breakdown.pending,
    campaignContributions: breakdown.campaignContributions,
    pendingPayouts: payouts.reduce((n, x) => n + x.amount, 0),
    published: designs.filter((d) => d.status === 'published').length,
    awaitingApproval: designs.filter((d) => ['submitted', 'under_review', 'changes_requested'].includes(d.status)).length,
    currency: 'GBP' as const,
  };
}

/** Daily sales for the last 90 days, from verified order items only. */
export async function creatorSales(repo: Repo, p: Principal, now = new Date()) {
  requireRole(p, 'creator');
  if (!p.creatorId) throw forbidden('Complete creator onboarding first.');
  const [items, ledger] = await Promise.all([repo.orderItemsForCreator(p.creatorId), repo.ledgerForCreator(p.creatorId)]);
  const days = new Map<string, { date: string; units: number; gross: number; earnings: number }>();
  for (let d = 89; d >= 0; d--) {
    const date = new Date(now.getTime() - d * 86_400_000).toISOString().slice(0, 10);
    days.set(date, { date, units: 0, gross: 0, earnings: 0 });
  }
  for (const i of items) {
    const day = days.get(i.processedAt.slice(0, 10));
    if (!day) continue;
    day.units += i.quantity;
    day.gross += i.unitPriceAmount * i.quantity - i.discountAmount;
    day.earnings += ledger.filter((e) => e.entryType === 'sale' && e.orderItemId === i.id).reduce((n, e) => n + e.amount, 0);
  }
  return [...days.values()];
}

export async function adminOverview(repo: Repo, p: Principal) {
  requireRole(p, 'admin', 'reviewer', 'finance');
  const [users, queue, published, orders, payouts, jobs] = await Promise.all([
    repo.listUsers(''),
    repo.listDesignsByStatus(['submitted', 'under_review']),
    repo.listDesignsByStatus(['published']),
    repo.listOrders(1000),
    repo.listPayouts(),
    repo.jobs.list(200),
  ]);
  const finance = p.roles.includes('finance') || p.roles.includes('admin');
  return {
    totalUsers: users.length,
    activeCreators: users.filter((u) => u.creatorId && u.status === 'active').length,
    awaitingReview: queue.length,
    publishedProducts: published.length,
    orders: orders.length,
    // Money totals are only shown to finance and admins.
    gross: finance ? orders.reduce((n, o) => n + o.totalAmount, 0) : 0,
    contributions: 0,
    payoutExceptions: finance ? payouts.filter((x) => x.status === 'on_hold' || x.status === 'failed').length : 0,
    fulfilmentExceptions: 0,
    integrationErrors: jobs.filter((j) => j.status === 'failed' || j.status === 'dead').length,
    currency: 'GBP' as const,
  };
}

/**
 * Finance reconciliation over the last 30 days: compares Shopify orders recorded
 * from webhooks with the ledger, and reports what is owed to creators and campaigns.
 */
export async function reconciliation(repo: Repo, p: Principal, now = new Date()) {
  requireRole(p, 'finance');
  const since = new Date(now.getTime() - 30 * 86_400_000).toISOString();
  const orders = (await repo.listOrders(5000)).filter((o) => o.processedAt >= since && o.financialStatus !== 'pending');
  const [items, recent] = await Promise.all([repo.orderItemsByOrderIds(orders.map((o) => o.id)), repo.ledgerSince(new Date(now.getTime() - 31 * 86_400_000).toISOString())]);
  const sold = new Set(recent.filter((e) => e.entryType === 'sale').map((e) => e.orderItemId));
  const unmatched = orders.filter((o) => items.some((i) => i.orderId === o.id && !sold.has(i.id)));
  const total = (account: StoredLedgerEntry['account']) => recent.filter((e) => e.account === account).reduce((n, e) => n + e.amount, 0);
  return {
    currency: 'GBP' as const,
    orders: orders.length,
    shopifyGross: orders.reduce((n, o) => n + o.totalAmount, 0),
    creatorEarnings: total('creator'),
    campaignContributions: total('campaign'),
    platformShare: total('platform'),
    refundEntries: recent.filter((e) => e.entryType === 'refund').length,
    unmatchedOrders: unmatched.map((o) => o.orderNumber || o.shopifyOrderId),
  };
}

export async function listJobs(repo: Repo, p: Principal) {
  requireRole(p, 'admin');
  return (await repo.jobs.list(100)).map((j) => ({ id: j.id, kind: j.kind, status: j.status === 'dead' ? 'failed' : j.status, attempts: j.attempts, idempotencyKey: j.idempotencyKey, lastError: j.lastError, updatedAt: j.runAfter }));
}

export const adjustmentSchema = z.object({ creatorId: z.string().min(1), amount: z.number().int(), reason: z.string().trim().min(10).max(500) }).strict();

export async function createAdjustment(repo: Repo, p: Principal, body: unknown, idempotencyKey: string) {
  requireRole(p, 'finance');
  const input = adjustmentSchema.parse(body);
  const entry = adjustmentEntry({ ...input, currency: 'GBP', createdBy: p.userId, idempotencyKey, at: new Date().toISOString() });
  const n = await repo.insertLedgerEntries([entry]);
  await repo.audit(p.userId, 'ledger.adjustment', 'creator', input.creatorId, { amount: input.amount, reason: input.reason, duplicate: n === 0 });
  return { created: n === 1 };
}
