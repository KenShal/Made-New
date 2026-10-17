import { policyFor, splitMargin, assertPolicyBalanced, type RevenuePolicy } from '@shared/revenue-policy';
import type { Currency } from '@shared/money';

/**
 * Converts verified commerce events into append-only ledger entries.
 * Pure functions: the caller persists entries with INSERT ... ON CONFLICT
 * (idempotency_key) DO NOTHING, so replaying an event can never double-count.
 */
export interface VerifiedLineItem {
  lineItemId: string; // Shopify line item id
  orderItemId: string; // our order_items.id
  creatorId: string | null;
  campaignId: string | null;
  quantity: number;
  unitPrice: number; // incl. tax, minor units
  discount: number; // total discount on the line, minor units
  tax: number; // total tax on the line, minor units
  productionCostPerUnit: number;
  shippingChargedAllocated: number;
  shippingCostAllocated: number;
}

export interface NewLedgerEntry {
  entryType: 'sale' | 'refund' | 'adjustment' | 'payout';
  account: 'creator' | 'campaign' | 'platform';
  creatorId: string | null;
  campaignId: string | null;
  orderItemId: string | null;
  amount: number;
  currency: Currency;
  policyVersion: string;
  idempotencyKey: string;
  reversesKey?: string;
  reason?: string;
  createdBy?: string;
  availableAt: string;
}

function addDays(iso: string, days: number): string {
  return new Date(new Date(iso).getTime() + days * 86_400_000).toISOString();
}

export function saleEntries(orderProcessedAt: string, currency: Currency, items: VerifiedLineItem[], policy: RevenuePolicy = policyFor(orderProcessedAt)): NewLedgerEntry[] {
  assertPolicyBalanced(policy);
  const availableAt = addDays(orderProcessedAt, policy.holdDays);
  const out: NewLedgerEntry[] = [];
  for (const i of items) {
    if (!Number.isInteger(i.quantity) || i.quantity <= 0) throw new Error('Invalid quantity');
    const gross = i.unitPrice * i.quantity - i.discount;
    const netRevenue = gross - i.tax;
    const split = splitMargin(policy, {
      netRevenue,
      productionCost: i.productionCostPerUnit * i.quantity,
      shippingCharged: i.shippingChargedAllocated,
      shippingCostAllocated: i.shippingCostAllocated,
      currency,
    });
    const base = { entryType: 'sale' as const, orderItemId: i.orderItemId, currency, policyVersion: policy.version, availableAt };
    // Items without a creator (platform merchandise) put the whole margin on the platform account.
    const creatorShare = i.creatorId ? split.creator : 0;
    const campaignShare = i.campaignId ? split.campaign : 0;
    const platformShare = split.margin <= 0 ? split.margin : split.margin - creatorShare - campaignShare;
    if (creatorShare) out.push({ ...base, account: 'creator', creatorId: i.creatorId, campaignId: null, amount: creatorShare, idempotencyKey: `sale:${i.lineItemId}:creator` });
    if (campaignShare) out.push({ ...base, account: 'campaign', creatorId: i.creatorId, campaignId: i.campaignId, amount: campaignShare, idempotencyKey: `sale:${i.lineItemId}:campaign` });
    out.push({ ...base, account: 'platform', creatorId: i.creatorId, campaignId: null, amount: platformShare, idempotencyKey: `sale:${i.lineItemId}:platform` });
  }
  return out;
}

export interface RefundLine {
  refundLineItemId: string;
  lineItemId: string;
  quantity: number;
  originalQuantity: number;
}

/**
 * Refunds reverse the original sale entries proportionally by quantity. The
 * original entries are never edited; reversals are new negative entries.
 * Rounding: reversals use floor on the absolute value, and the final unit of a
 * line takes the remainder so a full refund always nets the line to exactly zero.
 */
export function refundEntries(refundedAt: string, refund: RefundLine[], originals: NewLedgerEntry[], alreadyRefundedQty: (lineItemId: string) => number = () => 0): NewLedgerEntry[] {
  const out: NewLedgerEntry[] = [];
  for (const r of refund) {
    if (r.quantity <= 0 || r.quantity > r.originalQuantity) throw new Error('Invalid refund quantity');
    const prior = alreadyRefundedQty(r.lineItemId);
    if (prior + r.quantity > r.originalQuantity) throw new Error('Refund exceeds purchased quantity');
    const sale = originals.filter((e) => e.entryType === 'sale' && e.idempotencyKey.startsWith(`sale:${r.lineItemId}:`));
    for (const e of sale) {
      const perUnit = Math.floor(Math.abs(e.amount) / r.originalQuantity);
      const isFinal = prior + r.quantity === r.originalQuantity;
      const alreadyReversed = perUnit * prior;
      const magnitude = isFinal ? Math.abs(e.amount) - alreadyReversed : perUnit * r.quantity;
      if (magnitude === 0) continue;
      out.push({
        entryType: 'refund',
        account: e.account,
        creatorId: e.creatorId,
        campaignId: e.campaignId,
        orderItemId: e.orderItemId,
        amount: -Math.sign(e.amount) * magnitude,
        currency: e.currency,
        policyVersion: e.policyVersion,
        idempotencyKey: `refund:${r.refundLineItemId}:${e.account}`,
        reversesKey: e.idempotencyKey,
        availableAt: refundedAt,
      });
    }
  }
  return out;
}

export function adjustmentEntry(input: { creatorId: string; amount: number; currency: Currency; reason: string; createdBy: string; idempotencyKey: string; at: string }): NewLedgerEntry {
  if (!Number.isInteger(input.amount) || input.amount === 0) throw new Error('Adjustment must be a non-zero integer');
  if (input.reason.trim().length < 10) throw new Error('Adjustment requires a reason');
  return {
    entryType: 'adjustment',
    account: 'creator',
    creatorId: input.creatorId,
    campaignId: null,
    orderItemId: null,
    amount: input.amount,
    currency: input.currency,
    policyVersion: policyFor(input.at).version,
    idempotencyKey: `adjustment:${input.idempotencyKey}`,
    reason: input.reason.trim(),
    createdBy: input.createdBy,
    availableAt: input.at,
  };
}

export interface Balance {
  pending: number;
  eligible: number;
  paidOut: number;
  net: number;
}

export function balanceFor(entries: Pick<NewLedgerEntry, 'entryType' | 'amount' | 'availableAt'>[], now: string): Balance {
  let pending = 0;
  let eligible = 0;
  let paidOut = 0;
  for (const e of entries) {
    if (e.entryType === 'payout') {
      paidOut += -e.amount;
      eligible += e.amount;
    } else if (e.availableAt > now) pending += e.amount;
    else eligible += e.amount;
  }
  return { pending, eligible, paidOut, net: pending + eligible + paidOut };
}
