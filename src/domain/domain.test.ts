import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PRODUCTS } from '@/data/sample';
import { safeNext } from '@/lib/validation';
import { TRANSITIONS, checkTransition } from '@shared/lifecycle';
import { MAX_LINE_QTY, cartCount, cartReducer, sanitiseLines } from './cart';
import { queryCatalog } from './catalog';
import { resolveVariant, sizeAvailability } from './variants';

describe('cart', () => {
  it('adds, merges, clamps and removes lines', () => {
    let s = cartReducer([], { type: 'add', variantId: 'v1', productId: 'p1' });
    s = cartReducer(s, { type: 'add', variantId: 'v1', productId: 'p1', quantity: 50 });
    expect(s).toEqual([{ variantId: 'v1', productId: 'p1', quantity: MAX_LINE_QTY }]);
    s = cartReducer(s, { type: 'set', variantId: 'v1', quantity: 0 });
    expect(s).toEqual([]);
    expect(cartReducer([], { type: 'add', variantId: 'v', productId: 'p', quantity: -3 })).toEqual([]);
  });
  it('sanitises tampered persisted carts', () => {
    const lines = sanitiseLines([
      { variantId: 'ok', productId: 'p', quantity: 2 },
      { variantId: 'ok', productId: 'p', quantity: 5 },
      { variantId: 'big', productId: 'p', quantity: 1e9 },
      { variantId: 'neg', productId: 'p', quantity: -1 },
      { variantId: 42, productId: 'p', quantity: 1 },
      { variantId: 'x'.repeat(500), productId: 'p', quantity: 1 },
      { variantId: 'price', productId: 'p', quantity: 1, price: 1 },
      null,
    ]);
    expect(lines.map((l) => l.variantId)).toEqual(['ok', 'big', 'price']);
    expect(lines[1]!.quantity).toBe(MAX_LINE_QTY);
    expect(lines[2]).not.toHaveProperty('price');
    expect(sanitiseLines('nope')).toEqual([]);
    expect(cartCount(lines)).toBe(2 + MAX_LINE_QTY + 1);
  });
});

describe('variant validation', () => {
  const p = PRODUCTS[0]!;
  it('never guesses a default', () => {
    expect(resolveVariant(p, { colourId: null, size: 'M' })).toEqual({ ok: false, reason: 'choose_colour' });
    expect(resolveVariant(p, { colourId: p.colours[0]!.id, size: null })).toEqual({ ok: false, reason: 'choose_size' });
    expect(resolveVariant(p, { colourId: 'nope', size: 'M' })).toEqual({ ok: false, reason: 'unknown' });
  });
  it('blocks sold-out variants and reports availability by size', () => {
    const v = p.variants[0]!;
    const sold = { ...p, variants: p.variants.map((x) => (x.id === v.id ? { ...x, available: false } : x)) };
    expect(resolveVariant(sold, { colourId: v.colourId, size: v.size })).toEqual({ ok: false, reason: 'unavailable' });
    expect(sizeAvailability(sold, v.colourId).get(v.size)).toBe(false);
    expect(resolveVariant(p, { colourId: v.colourId, size: v.size }).ok).toBe(true);
  });
});

describe('catalogue query', () => {
  it('searches, filters and sorts', () => {
    const all = queryCatalog(PRODUCTS, { pageSize: 100 });
    expect(all.total).toBe(PRODUCTS.length);
    const asc = queryCatalog(PRODUCTS, { sort: 'price-asc', pageSize: 100 }).items.map((p) => p.price.amount);
    expect(asc).toEqual([...asc].sort((a, b) => a - b));
    const crew = queryCatalog(PRODUCTS, { category: 'crewneck', pageSize: 100 });
    expect(crew.items.every((p) => p.category === 'crewneck')).toBe(true);
    expect(queryCatalog(PRODUCTS, { q: 'zzzz-nothing' }).total).toBe(0);
  });
});

describe('redirect safety', () => {
  it('only allows same-origin relative paths', () => {
    expect(safeNext('/creator')).toBe('/creator');
    for (const bad of ['//evil.com', '/\\evil.com', 'https://evil.com', 'javascript:alert(1)', null]) expect(safeNext(bad)).toBe('/');
  });
});

describe('lifecycle', () => {
  it('requires reasons and validation where the brief says so', () => {
    expect(checkTransition({ from: 'under_review', to: 'rejected', actors: ['reviewer'], reason: 'no', validationPassed: true })).toEqual({ ok: false, error: 'reason_required' });
    expect(checkTransition({ from: 'draft', to: 'submitted', actors: ['creator'], validationPassed: false })).toEqual({ ok: false, error: 'validation_failed' });
    expect(checkTransition({ from: 'draft', to: 'published', actors: ['publisher'], validationPassed: true })).toEqual({ ok: false, error: 'invalid_transition' });
    expect(checkTransition({ from: 'submitted', to: 'under_review', actors: ['creator'], validationPassed: true })).toEqual({ ok: false, error: 'forbidden_actor' });
  });
  it('matches the database transition_design() table exactly', () => {
    const sql = readFileSync('supabase/migrations/20261017000001_init.sql', 'utf8');
    const body = sql.slice(sql.indexOf('function public.transition_design'), sql.indexOf('end case;'));
    const fromSql = new Set<string>();
    for (const m of body.matchAll(/when d\.status (?:in \(([^)]+)\)|= '(\w+)') and p_to (?:in \(([^)]+)\)|= '(\w+)') then actor := '(\w+)'/g)) {
      const froms = (m[1] ?? `'${m[2]}'`).split(',').map((s) => s.trim().replace(/'/g, ''));
      const tos = (m[3] ?? `'${m[4]}'`).split(',').map((s) => s.trim().replace(/'/g, ''));
      for (const f of froms) for (const t of tos) fromSql.add(`${f}>${t}:${m[5]}`);
    }
    expect(fromSql).toEqual(new Set(TRANSITIONS.map((t) => `${t.from}>${t.to}:${t.actor}`)));
  });
});
