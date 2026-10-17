import { describe, expect, it } from 'vitest';
import { adjustmentEntry, balanceFor, refundEntries, saleEntries, type VerifiedLineItem } from '../src/domain/ledger';
import { REVENUE_POLICIES, assertPolicyBalanced, splitMargin } from '@shared/revenue-policy';

const policy = REVENUE_POLICIES[0]!;
const line = (o: Partial<VerifiedLineItem> = {}): VerifiedLineItem => ({ lineItemId: 'L1', orderItemId: 'oi1', creatorId: 'cr', campaignId: 'cp', quantity: 2, unitPrice: 3800, discount: 0, tax: 1266, productionCostPerUnit: 1290, shippingChargedAllocated: 0, shippingCostAllocated: 0, ...o });
const sum = (xs: { amount: number }[]) => xs.reduce((n, x) => n + x.amount, 0);

describe('revenue policy', () => {
  it('every published policy version sums to 100%', () => REVENUE_POLICIES.forEach(assertPolicyBalanced));
  it('negative margins pay creators and campaigns nothing', () => {
    const s = splitMargin(policy, { netRevenue: 1000, productionCost: 2000, shippingCharged: 0, shippingCostAllocated: 0, currency: 'GBP' });
    expect(s.creator).toBe(0);
    expect(s.campaign).toBe(0);
    expect(s.platform).toBeLessThan(0);
  });
});

describe('sale entries', () => {
  it('splits margin into integer creator/campaign/platform entries that sum to the margin', () => {
    const e = saleEntries('2026-10-15T12:00:00Z', 'GBP', [line()], policy);
    expect(e.map((x) => x.account)).toEqual(['creator', 'campaign', 'platform']);
    e.forEach((x) => expect(Number.isInteger(x.amount)).toBe(true));
    const gross = 3800 * 2;
    const fee = Math.floor((gross - 1266) * 150 / 10000) + 20;
    expect(sum(e)).toBe(gross - 1266 - 1290 * 2 - fee);
    expect(e.every((x) => x.policyVersion === policy.version)).toBe(true);
  });
  it('holds earnings for the policy hold period', () => {
    const [e] = saleEntries('2026-10-15T12:00:00.000Z', 'GBP', [line()], policy);
    expect(e!.availableAt).toBe(new Date(Date.parse('2026-10-15T12:00:00Z') + policy.holdDays * 86400000).toISOString());
  });
  it('uses deterministic idempotency keys per line item and account', () => {
    const a = saleEntries('2026-10-15T12:00:00Z', 'GBP', [line()], policy).map((x) => x.idempotencyKey);
    const b = saleEntries('2026-10-15T12:00:00Z', 'GBP', [line()], policy).map((x) => x.idempotencyKey);
    expect(a).toEqual(b);
    expect(new Set(a).size).toBe(a.length);
  });
  it('lines without a campaign do not create campaign entries', () => {
    const e = saleEntries('2026-10-15T12:00:00Z', 'GBP', [line({ campaignId: null })], policy);
    expect(e.some((x) => x.account === 'campaign')).toBe(false);
  });
});

describe('refund entries', () => {
  const sales = saleEntries('2026-10-15T12:00:00Z', 'GBP', [line({ quantity: 3, tax: 1900 })], policy);
  it('a full refund nets every account to exactly zero', () => {
    const r = refundEntries('2026-10-16T00:00:00Z', [{ refundLineItemId: 'R1', lineItemId: 'L1', quantity: 3, originalQuantity: 3 }], sales);
    for (const acct of ['creator', 'campaign', 'platform'] as const) {
      expect(sum([...sales, ...r].filter((x) => x.account === acct))).toBe(0);
    }
    expect(r.every((x) => x.entryType === 'refund' && x.reversesKey)).toBe(true);
  });
  it('partial refunds then a final refund still net to zero (no rounding drift)', () => {
    const r1 = refundEntries('2026-10-16T00:00:00Z', [{ refundLineItemId: 'R1', lineItemId: 'L1', quantity: 1, originalQuantity: 3 }], sales);
    const r2 = refundEntries('2026-10-17T00:00:00Z', [{ refundLineItemId: 'R2', lineItemId: 'L1', quantity: 2, originalQuantity: 3 }], sales, () => 1);
    expect(sum([...sales, ...r1, ...r2])).toBe(0);
  });
  it('rejects refunding more than was bought', () => {
    expect(() => refundEntries('x', [{ refundLineItemId: 'R', lineItemId: 'L1', quantity: 2, originalQuantity: 3 }], sales, () => 2)).toThrow();
  });
});

describe('adjustments and balances', () => {
  it('requires a reason and a non-zero integer amount', () => {
    expect(() => adjustmentEntry({ creatorId: 'c', amount: 0, currency: 'GBP', reason: 'misprint credit for order', createdBy: 'f', idempotencyKey: 'k', at: '2026-10-16T00:00:00Z' })).toThrow();
    expect(() => adjustmentEntry({ creatorId: 'c', amount: 10.5, currency: 'GBP', reason: 'misprint credit for order', createdBy: 'f', idempotencyKey: 'k', at: '2026-10-16T00:00:00Z' })).toThrow();
    expect(() => adjustmentEntry({ creatorId: 'c', amount: 100, currency: 'GBP', reason: 'short', createdBy: 'f', idempotencyKey: 'k', at: '2026-10-16T00:00:00Z' })).toThrow();
  });
  it('separates pending, eligible and paid balances', () => {
    const b = balanceFor(
      [
        { entryType: 'sale', amount: 1000, availableAt: '2026-11-30T00:00:00Z' },
        { entryType: 'sale', amount: 500, availableAt: '2026-09-01T00:00:00Z' },
        { entryType: 'refund', amount: -100, availableAt: '2026-09-02T00:00:00Z' },
        { entryType: 'payout', amount: -300, availableAt: '2026-09-10T00:00:00Z' },
      ],
      '2026-10-17T00:00:00Z',
    );
    expect(b).toEqual({ pending: 1000, eligible: 100, paidOut: 300, net: 1400 });
  });
});
