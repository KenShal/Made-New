import type { DesignRecord, OrderRecord, PayoutRecord, UserRecord } from '../repo/types';

/**
 * Response shapes for admin screens. Only the fields each screen needs leave the
 * server; customer PII stays in Shopify, so orders never carry a name or email.
 */
export function orderView(o: OrderRecord) {
  const status = o.financialStatus === 'refunded' ? 'refunded' : o.financialStatus === 'partially_refunded' ? 'partially_refunded' : 'paid';
  return { id: o.id, shopifyOrderId: o.orderNumber || o.shopifyOrderId, createdAt: o.processedAt, customerInitials: '—', total: { amount: o.totalAmount, currency: o.currency }, status, items: o.itemCount ?? 0 };
}

export function userView(u: UserRecord, designs: DesignRecord[]) {
  // reports: content reporting is not built yet, so this is always 0 (see docs/PRODUCTION_READINESS.md).
  return { id: u.id, name: u.name, email: u.email, roles: u.roles, status: u.status, createdAt: u.createdAt ?? null, designs: u.creatorId ? designs.length : 0, reports: 0 };
}

export function payoutView(p: PayoutRecord, creatorName: string) {
  const status = p.status === 'pending' ? 'eligible' : p.status === 'failed' ? 'on_hold' : p.status;
  return { id: p.id, creator: creatorName, amount: p.amount, currency: p.currency, status, reason: p.holdReason ?? undefined };
}
