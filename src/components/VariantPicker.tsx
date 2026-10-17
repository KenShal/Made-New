import { useState } from 'react';
import { motion } from 'framer-motion';
import type { Product, Size } from '@shared/types';
import { SIZES } from '@shared/types';
import { resolveVariant, sizeAvailability, VARIANT_MESSAGES } from '@/domain/variants';
import { useCart } from '@/state/cart';
import { useToast } from '@/state/toast';
import { Button, Price } from './ui';
import { cn } from '@/lib/cn';
import { spring } from '@/lib/motion';

export function useVariantSelection(product: Product, initialColour?: string) {
  const [colourId, setColourId] = useState<string | null>(initialColour ?? product.colours[0]?.id ?? null);
  const [size, setSize] = useState<Size | null>(null);
  return { colourId, setColourId, size, setSize, resolution: resolveVariant(product, { colourId, size }) };
}

export function VariantPicker({ product, selection, compact = false }: { product: Product; selection: ReturnType<typeof useVariantSelection>; compact?: boolean }) {
  const { colourId, setColourId, size, setSize } = selection;
  const avail = sizeAvailability(product, colourId);
  const colourName = product.colours.find((c) => c.id === colourId)?.name;
  return (
    <div className="flex flex-col gap-6">
      <fieldset>
        <legend className="mb-3 flex gap-2 text-sm">
          <span className="font-semibold">Colour</span>
          <span className="text-ink-muted">{colourName}</span>
        </legend>
        <div className="flex flex-wrap gap-3">
          {product.colours.map((c) => (
            <label key={c.id} className="relative cursor-pointer">
              <input type="radio" name={`colour-${product.id}`} value={c.id} checked={colourId === c.id} onChange={() => setColourId(c.id)} className="peer sr-only" />
              <span className="block h-9 w-9 rounded-full border border-black/15 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-crimson" style={{ backgroundColor: c.hex }} aria-hidden />
              {colourId === c.id && <motion.span layoutId={`colour-ring-${product.id}`} transition={spring.indicator} className="absolute -inset-[5px] rounded-full border-[1.5px] border-ink" aria-hidden />}
              <span className="sr-only">{c.name}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-3 flex w-full justify-between text-sm">
          <span className="font-semibold">Size</span>
          {!compact && <span className="text-ink-muted">Boxy unisex fit. Size down for regular.</span>}
        </legend>
        <div className="grid grid-cols-6 gap-2">
          {SIZES.map((s) => {
            const available = avail.get(s) ?? false;
            return (
              <label key={s} className={cn('relative', available ? 'cursor-pointer' : 'cursor-not-allowed')}>
                <input type="radio" name={`size-${product.id}`} value={s} checked={size === s} disabled={!available} onChange={() => setSize(s)} className="peer sr-only" />
                <span
                  className={cn(
                    'grid h-11 place-items-center border text-sm font-semibold transition-colors peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-crimson',
                    size === s ? 'border-ink bg-ink text-white' : 'border-line hover:border-ink',
                    !available && 'border-line bg-soft text-ink-muted line-through decoration-ink-muted/60',
                  )}
                >
                  {s}
                </span>
                {!available && <span className="sr-only">(sold out)</span>}
              </label>
            );
          })}
        </div>
      </fieldset>
    </div>
  );
}

export function AddToBag({ product, selection, onAdded, className }: { product: Product; selection: ReturnType<typeof useVariantSelection>; onAdded?: () => void; className?: string }) {
  const { add, setOpen } = useCart();
  const { notify } = useToast();
  const [attempted, setAttempted] = useState(false);
  const [added, setAdded] = useState(false);
  const r = selection.resolution;

  const onClick = () => {
    setAttempted(true);
    if (!r.ok) return;
    try {
      add(product, r.variant.id);
      setAdded(true);
      window.setTimeout(() => setAdded(false), 1600);
      notify({ title: 'Added to bag', body: `${product.name}, ${product.colours.find((c) => c.id === r.variant.colourId)?.name}, ${r.variant.size}` });
      onAdded?.();
    } catch (e) {
      notify({ title: 'Could not add to bag', body: e instanceof Error ? e.message : undefined, tone: 'error' });
    }
  };

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <Button onClick={onClick} className="w-full" aria-describedby={`atb-msg-${product.id}`}>
        <span className="relative inline-flex h-4 items-center overflow-hidden">
          <motion.span key={added ? 'added' : 'add'} initial={{ y: added ? 16 : 0, opacity: added ? 0 : 1 }} animate={{ y: 0, opacity: 1 }} transition={spring.snappy}>
            {added ? 'Added' : 'Add to bag'}
          </motion.span>
        </span>
        {r.ok && <Price value={r.variant.price} className="font-sans text-[0.8rem] font-semibold tracking-normal opacity-80" />}
      </Button>
      <p id={`atb-msg-${product.id}`} aria-live="polite" className={cn('min-h-[1.25rem] text-xs', attempted && !r.ok ? 'font-medium text-crimson' : 'text-ink-muted')}>
        {!r.ok && attempted ? VARIANT_MESSAGES[r.reason] : added ? (
          <button type="button" className="underline underline-offset-4" onClick={() => setOpen(true)}>
            View bag
          </button>
        ) : null}
      </p>
    </div>
  );
}
