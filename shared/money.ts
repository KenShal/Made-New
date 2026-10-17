/**
 * Money is always stored as an integer number of minor units (pence, cents)
 * alongside an explicit ISO 4217 currency. Never use floats for amounts.
 */
export type Currency = 'GBP' | 'USD' | 'EUR';

export interface Money {
  amount: number; // integer minor units
  currency: Currency;
}

export function money(amount: number, currency: Currency): Money {
  if (!Number.isInteger(amount)) throw new Error('Money amounts must be integer minor units');
  return { amount, currency };
}

export function addMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return { amount: a.amount + b.amount, currency: a.currency };
}

export function multiplyMoney(m: Money, qty: number): Money {
  if (!Number.isInteger(qty)) throw new Error('Quantity must be an integer');
  return { amount: m.amount * qty, currency: m.currency };
}

export function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) throw new Error(`Currency mismatch: ${a.currency} vs ${b.currency}`);
}

/** Basis points (1 bp = 0.01%) applied with banker-safe floor rounding to minor units. */
export function applyBasisPoints(amount: number, bps: number): number {
  return Math.floor((amount * bps) / 10_000);
}

const formatters = new Map<string, Intl.NumberFormat>();

export function formatMoney(m: Money, locale = 'en-GB'): string {
  const key = `${locale}:${m.currency}`;
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.NumberFormat(locale, { style: 'currency', currency: m.currency });
    formatters.set(key, f);
  }
  return f.format(m.amount / 100);
}
