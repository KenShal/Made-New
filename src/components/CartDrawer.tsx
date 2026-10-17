import { Link, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useCart } from '@/state/cart';
import { Dialog, CloseButton } from './Dialog';
import { Button, Price } from './ui';
import { MAX_LINE_QTY } from '@/domain/cart';
import { ease } from '@/lib/motion';

export function QuantityStepper({ value, onChange, label }: { value: number; onChange: (n: number) => void; label: string }) {
  return (
    <div className="inline-flex h-9 items-center border border-line" role="group" aria-label={`Quantity for ${label}`}>
      <button type="button" className="grid h-full w-9 place-items-center hover:bg-soft disabled:opacity-40" onClick={() => onChange(value - 1)} aria-label="Decrease quantity">
        −
      </button>
      <span className="w-8 text-center text-sm tabular-nums" aria-live="polite">
        {value}
      </span>
      <button type="button" className="grid h-full w-9 place-items-center hover:bg-soft disabled:opacity-40" onClick={() => onChange(value + 1)} disabled={value >= MAX_LINE_QTY} aria-label="Increase quantity">
        +
      </button>
    </div>
  );
}

export function CartDrawer() {
  const { open, setOpen, priced, subtotal, setQuantity, remove, hasUnavailable, pricing, count } = useCart();
  const navigate = useNavigate();
  const close = () => setOpen(false);
  return (
    <Dialog open={open} onClose={close} label="Shopping bag" variant="drawer">
      <div className="flex h-16 items-center justify-between border-b border-line pl-6 pr-3">
        <h2 className="font-display text-lg font-extrabold tracking-tight">
          Bag <span className="text-ink-muted">({count})</span>
        </h2>
        <CloseButton onClick={close} label="Close bag" />
      </div>
      <div className="flex-1 overflow-y-auto px-6">
        {pricing === 'error' && <p role="alert" className="mt-6 text-sm text-crimson">We couldn&rsquo;t refresh prices. Please try again shortly.</p>}
        {priced.length === 0 ? (
          <div className="flex h-full flex-col items-start justify-center gap-4">
            <p className="font-display text-3xl font-extrabold tracking-tight">Your bag is empty.</p>
            <p className="text-ink-muted">Every design here carries a story and funds a cause.</p>
            <Button variant="secondary" onClick={() => { close(); navigate('/shop'); }}>
              Explore the collection
            </Button>
          </div>
        ) : (
          <ul className="divide-y divide-line">
            <AnimatePresence initial={false}>
              {priced.map((l) => (
                <motion.li key={l.variantId} layout exit={{ opacity: 0, x: 40, transition: { duration: 0.2, ease: ease.exit } }} className="flex gap-4 py-5">
                  <div className="flex-1">
                    <Link to={`/shop/${l.slug}`} onClick={close} className="font-display font-bold hover:text-crimson">
                      {l.name}
                    </Link>
                    <p className="text-sm text-ink-muted">{[l.colourName, l.size].filter(Boolean).join(' · ')}</p>
                    {!l.available && <p className="mt-1 text-sm font-medium text-crimson">No longer available. Please remove it to continue.</p>}
                    <div className="mt-3 flex items-center gap-4">
                      {l.available && <QuantityStepper value={l.quantity} onChange={(n) => setQuantity(l.variantId, n)} label={l.name} />}
                      <button type="button" className="text-xs uppercase tracking-[0.14em] text-ink-muted underline-offset-4 hover:text-crimson hover:underline" onClick={() => remove(l.variantId)}>
                        Remove
                      </button>
                    </div>
                  </div>
                  <div className="text-right text-sm font-semibold">{l.unitPrice && <Price value={{ ...l.unitPrice, amount: l.unitPrice.amount * l.quantity }} />}</div>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </div>
      {priced.length > 0 && (
        <div className="border-t border-line px-6 py-5">
          <div className="flex justify-between text-sm">
            <span>Estimated subtotal</span>
            <span className="font-semibold">{subtotal ? <Price value={subtotal} /> : '—'}</span>
          </div>
          <p className="mt-1 text-xs text-ink-muted">Shipping and taxes are calculated securely at checkout.</p>
          <Button className="mt-4 w-full" disabled={hasUnavailable || pricing !== 'ready'} onClick={() => { close(); navigate('/cart'); }}>
            Review bag & checkout
          </Button>
        </div>
      )}
    </Dialog>
  );
}
