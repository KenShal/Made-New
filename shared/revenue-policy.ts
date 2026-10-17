import { applyBasisPoints, type Currency } from './money';

/**
 * Versioned revenue-sharing policy. Earnings are ONLY computed by the server
 * (server/src/domain/ledger.ts) from verified Shopify order/refund events.
 * The browser imports this file solely to explain the policy to people.
 *
 * Changing the split means adding a new version, never editing an old one:
 * every ledger entry records the policy version it was computed under.
 */
export interface RevenuePolicy {
  version: string;
  effectiveFrom: string; // ISO date
  /** Share of the net margin (after tax, production, shipping, fees) to the creator. */
  creatorShareBps: number;
  /** Share of the net margin pledged to the creator's linked campaign. */
  campaignShareBps: number;
  /** Platform keeps the remainder of the net margin. */
  platformShareBps: number;
  /** Payment processing estimate applied to gross (Shopify Payments, varies by plan). */
  paymentFeeBps: number;
  paymentFeeFixed: Record<Currency, number>;
  /** Days earnings stay pending before becoming eligible, to absorb refunds. */
  holdDays: number;
}

export const REVENUE_POLICIES: readonly RevenuePolicy[] = [
  {
    version: '2026-10-v1',
    effectiveFrom: '2026-10-01',
    creatorShareBps: 4_000,
    campaignShareBps: 4_000,
    platformShareBps: 2_000,
    paymentFeeBps: 150,
    paymentFeeFixed: { GBP: 20, USD: 30, EUR: 25 },
    holdDays: 30,
  },
];

export function policyFor(dateIso: string): RevenuePolicy {
  const sorted = [...REVENUE_POLICIES].sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));
  const p = sorted.find((x) => x.effectiveFrom <= dateIso.slice(0, 10));
  if (!p) throw new Error(`No revenue policy effective for ${dateIso}`);
  return p;
}

export function assertPolicyBalanced(p: RevenuePolicy): void {
  if (p.creatorShareBps + p.campaignShareBps + p.platformShareBps !== 10_000) {
    throw new Error(`Revenue policy ${p.version} shares must sum to 100%`);
  }
}

export interface MarginInput {
  /** Line revenue excluding tax, after discounts (minor units). */
  netRevenue: number;
  productionCost: number;
  shippingCostAllocated: number;
  shippingCharged: number;
  currency: Currency;
}

export interface MarginSplit {
  paymentFee: number;
  margin: number;
  creator: number;
  campaign: number;
  platform: number;
}

/** Pure split calculation. Negative margins pay nobody (platform absorbs the loss). */
export function splitMargin(p: RevenuePolicy, i: MarginInput): MarginSplit {
  const gross = i.netRevenue + i.shippingCharged;
  const paymentFee = applyBasisPoints(gross, p.paymentFeeBps) + p.paymentFeeFixed[i.currency];
  const margin = i.netRevenue + i.shippingCharged - i.productionCost - i.shippingCostAllocated - paymentFee;
  if (margin <= 0) return { paymentFee, margin, creator: 0, campaign: 0, platform: margin };
  const creator = applyBasisPoints(margin, p.creatorShareBps);
  const campaign = applyBasisPoints(margin, p.campaignShareBps);
  return { paymentFee, margin, creator, campaign, platform: margin - creator - campaign };
}
