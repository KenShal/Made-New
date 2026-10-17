import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Page } from '@/components/Page';
import { Button, ButtonLink, Container, EmptyState, Price } from '@/components/ui';
import { QuantityStepper } from '@/components/CartDrawer';
import { useCart } from '@/state/cart';
import { catalog } from '@/data/catalog';
import { useToast } from '@/state/toast';

export default function CartPage() {
  const { priced, subtotal, setQuantity, remove, hasUnavailable, pricing, lines } = useCart();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const { notify } = useToast();

  const checkout = async () => {
    setBusy(true);
    setError(null);
    try {
      const { url, external } = await catalog.createCheckout(lines);
      if (external) window.location.assign(url);
      else navigate(url);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Checkout is unavailable right now.';
      setError(msg);
      notify({ title: 'Checkout could not start', body: msg, tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page title="Your bag">
      <Container className="pb-24 pt-12">
        <h1 className="font-display text-giant font-extrabold uppercase">Your bag</h1>
        {priced.length === 0 ? (
          <div className="mt-10">
            <EmptyState title="Nothing here yet." body="Find a design that says what you believe." action={<ButtonLink to="/shop">Explore the collection</ButtonLink>} />
          </div>
        ) : (
          <div className="mt-10 grid gap-12 lg:grid-cols-[1.6fr_1fr]">
            <ul className="divide-y divide-line border-y border-line">
              {priced.map((l) => (
                <li key={l.variantId} className="flex flex-wrap items-center gap-6 py-6">
                  <div className="min-w-[12rem] flex-1">
                    <Link to={`/shop/${l.slug}`} className="font-display text-lg font-bold hover:text-crimson">{l.name}</Link>
                    <p className="text-sm text-ink-muted">{[l.colourName, l.size].filter(Boolean).join(' · ')}</p>
                    {!l.available && <p className="mt-1 text-sm font-medium text-crimson" role="alert">This item is no longer available. Remove it to continue.</p>}
                  </div>
                  {l.available && <QuantityStepper value={l.quantity} onChange={(n) => setQuantity(l.variantId, n)} label={l.name} />}
                  <div className="w-24 text-right font-semibold">{l.unitPrice && <Price value={{ ...l.unitPrice, amount: l.unitPrice.amount * l.quantity }} />}</div>
                  <button type="button" onClick={() => remove(l.variantId)} className="text-xs uppercase tracking-[0.14em] text-ink-muted hover:text-crimson" aria-label={`Remove ${l.name}`}>
                    Remove
                  </button>
                </li>
              ))}
            </ul>
            <aside className="h-fit bg-soft p-8" aria-labelledby="summary-h">
              <h2 id="summary-h" className="font-display text-xl font-extrabold">Summary</h2>
              <dl className="mt-6 space-y-3 text-sm">
                <div className="flex justify-between"><dt>Estimated subtotal</dt><dd className="font-semibold">{subtotal ? <Price value={subtotal} /> : pricing === 'loading' ? 'Updating…' : '—'}</dd></div>
                <div className="flex justify-between text-ink-muted"><dt>Shipping</dt><dd>Calculated at checkout</dd></div>
              </dl>
              <p className="mt-6 text-xs leading-relaxed text-ink-muted">You&rsquo;ll pay on Shopify&rsquo;s secure checkout. MADE NEW never sees or stores your card details. Final prices, discounts and taxes are confirmed there.</p>
              <Button className="mt-6 w-full" onClick={checkout} busy={busy} disabled={hasUnavailable || pricing !== 'ready'}>
                Secure checkout
              </Button>
              {error && <p role="alert" className="mt-3 text-sm text-crimson">{error}</p>}
            </aside>
          </div>
        )}
      </Container>
    </Page>
  );
}
