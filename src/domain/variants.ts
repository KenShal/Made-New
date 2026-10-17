import type { Product, Size, Variant } from '@shared/types';

export type VariantSelection = { colourId: string | null; size: Size | null };

export type VariantResolution =
  | { ok: true; variant: Variant }
  | { ok: false; reason: 'choose_colour' | 'choose_size' | 'unavailable' | 'unknown' };

/** Resolve an explicit selection to a purchasable variant. Never guesses a default. */
export function resolveVariant(product: Product, sel: VariantSelection): VariantResolution {
  if (!sel.colourId) return { ok: false, reason: 'choose_colour' };
  if (!sel.size) return { ok: false, reason: 'choose_size' };
  const v = product.variants.find((x) => x.colourId === sel.colourId && x.size === sel.size);
  if (!v) return { ok: false, reason: 'unknown' };
  if (!v.available) return { ok: false, reason: 'unavailable' };
  return { ok: true, variant: v };
}

export function sizeAvailability(product: Product, colourId: string | null): Map<Size, boolean> {
  const m = new Map<Size, boolean>();
  for (const v of product.variants) {
    if (colourId && v.colourId !== colourId) continue;
    m.set(v.size, (m.get(v.size) ?? false) || v.available);
  }
  return m;
}

export const VARIANT_MESSAGES: Record<Exclude<VariantResolution, { ok: true }>['reason'], string> = {
  choose_colour: 'Choose a colour',
  choose_size: 'Choose a size',
  unavailable: 'That size is sold out in this colour',
  unknown: 'That combination is not available',
};
