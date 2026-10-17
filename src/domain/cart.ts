import type { Money } from '@shared/money';

/**
 * The browser cart only ever stores variant ids and quantities. Prices shown are
 * re-fetched from the commerce provider; the totals here are a display estimate
 * and Shopify recalculates everything authoritatively at checkout.
 */
export interface CartLine {
  variantId: string;
  productId: string;
  quantity: number;
}

export interface PricedLine extends CartLine {
  unitPrice: Money | null; // null when the variant no longer exists
  available: boolean;
  name: string;
  colourName: string;
  size: string;
  slug: string;
}

export const MAX_LINE_QTY = 10;
export const MAX_LINES = 30;

export type CartAction =
  | { type: 'add'; variantId: string; productId: string; quantity?: number }
  | { type: 'set'; variantId: string; quantity: number }
  | { type: 'remove'; variantId: string }
  | { type: 'clear' }
  | { type: 'hydrate'; lines: CartLine[] };

const clampQty = (n: number) => Math.min(MAX_LINE_QTY, Math.max(0, Math.floor(Number.isFinite(n) ? n : 0)));

export function cartReducer(state: CartLine[], action: CartAction): CartLine[] {
  switch (action.type) {
    case 'add': {
      const qty = clampQty(action.quantity ?? 1);
      if (qty === 0) return state;
      const existing = state.find((l) => l.variantId === action.variantId);
      if (existing) {
        return state.map((l) => (l.variantId === action.variantId ? { ...l, quantity: clampQty(l.quantity + qty) } : l));
      }
      if (state.length >= MAX_LINES) return state;
      return [...state, { variantId: action.variantId, productId: action.productId, quantity: qty }];
    }
    case 'set': {
      const qty = clampQty(action.quantity);
      if (qty === 0) return state.filter((l) => l.variantId !== action.variantId);
      return state.map((l) => (l.variantId === action.variantId ? { ...l, quantity: qty } : l));
    }
    case 'remove':
      return state.filter((l) => l.variantId !== action.variantId);
    case 'clear':
      return [];
    case 'hydrate':
      return sanitiseLines(action.lines);
    default:
      return state;
  }
}

/** Defensive parse of persisted cart data (localStorage is user-controlled). */
export function sanitiseLines(input: unknown): CartLine[] {
  if (!Array.isArray(input)) return [];
  const out: CartLine[] = [];
  for (const raw of input.slice(0, MAX_LINES)) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    if (typeof r.variantId !== 'string' || typeof r.productId !== 'string') continue;
    if (r.variantId.length > 200 || r.productId.length > 200) continue;
    const quantity = clampQty(Number(r.quantity));
    if (quantity === 0) continue;
    if (out.some((l) => l.variantId === r.variantId)) continue;
    out.push({ variantId: r.variantId, productId: r.productId, quantity });
  }
  return out;
}

export function cartCount(lines: readonly CartLine[]): number {
  return lines.reduce((n, l) => n + l.quantity, 0);
}

export function estimateSubtotal(lines: readonly PricedLine[]): Money | null {
  const purchasable = lines.filter((l) => l.available && l.unitPrice);
  if (purchasable.length === 0) return null;
  const currency = purchasable[0]!.unitPrice!.currency;
  let amount = 0;
  for (const l of purchasable) {
    if (l.unitPrice!.currency !== currency) throw new Error('Mixed currencies in cart');
    amount += l.unitPrice!.amount * l.quantity;
  }
  return { amount, currency };
}
