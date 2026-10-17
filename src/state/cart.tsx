import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useState, type ReactNode } from 'react';
import { cartCount, cartReducer, estimateSubtotal, type CartLine, type PricedLine } from '@/domain/cart';
import { catalog } from '@/data/catalog';
import { safeStorage } from '@/lib/storage';
import type { Money } from '@shared/money';
import type { Product } from '@shared/types';

const KEY = 'mn:cart:v1';

interface CartCtx {
  lines: CartLine[];
  priced: PricedLine[];
  pricing: 'loading' | 'ready' | 'error';
  count: number;
  subtotal: Money | null;
  hasUnavailable: boolean;
  open: boolean;
  bump: number;
  setOpen: (v: boolean) => void;
  add: (product: Product, variantId: string, quantity?: number) => void;
  setQuantity: (variantId: string, quantity: number) => void;
  remove: (variantId: string) => void;
  clear: () => void;
}

const Ctx = createContext<CartCtx | null>(null);

function load(): CartLine[] {
  try {
    return cartReducer([], { type: 'hydrate', lines: JSON.parse(safeStorage.get(KEY) ?? '[]') as CartLine[] });
  } catch {
    return [];
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, dispatch] = useReducer(cartReducer, undefined, load);
  const [open, setOpen] = useState(false);
  const [bump, setBump] = useState(0);
  const [products, setProducts] = useState<Product[] | null>(null);
  const [pricing, setPricing] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => safeStorage.set(KEY, JSON.stringify(lines)), [lines]);

  // Re-price from the catalogue (authoritative source) rather than trusting stored prices.
  useEffect(() => {
    let cancelled = false;
    catalog
      .listProducts()
      .then((p) => {
        if (!cancelled) {
          setProducts(p);
          setPricing('ready');
        }
      })
      .catch(() => !cancelled && setPricing('error'));
    return () => {
      cancelled = true;
    };
  }, []);

  const priced = useMemo<PricedLine[]>(
    () =>
      lines.map((l) => {
        const p = products?.find((x) => x.id === l.productId);
        const v = p?.variants.find((x) => x.id === l.variantId);
        return {
          ...l,
          unitPrice: v?.price ?? null,
          available: Boolean(v?.available),
          name: p?.name ?? 'Unavailable item',
          colourName: p?.colours.find((c) => c.id === v?.colourId)?.name ?? '',
          size: v?.size ?? '',
          slug: p?.slug ?? '',
        };
      }),
    [lines, products],
  );

  const add = useCallback((product: Product, variantId: string, quantity = 1) => {
    const v = product.variants.find((x) => x.id === variantId);
    if (!v || !v.available) throw new Error('That variant is unavailable');
    dispatch({ type: 'add', variantId, productId: product.id, quantity });
    setBump((n) => n + 1);
  }, []);

  const value = useMemo<CartCtx>(
    () => ({
      lines,
      priced,
      pricing,
      count: cartCount(lines),
      subtotal: pricing === 'ready' ? estimateSubtotal(priced) : null,
      hasUnavailable: pricing === 'ready' && priced.some((l) => !l.available),
      open,
      bump,
      setOpen,
      add,
      setQuantity: (variantId, quantity) => dispatch({ type: 'set', variantId, quantity }),
      remove: (variantId) => dispatch({ type: 'remove', variantId }),
      clear: () => dispatch({ type: 'clear' }),
    }),
    [lines, priced, pricing, open, bump, add],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCart(): CartCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useCart must be used inside CartProvider');
  return c;
}
