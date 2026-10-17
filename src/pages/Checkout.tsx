import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Page } from '@/components/Page';
import { ButtonLink, Container, Eyebrow } from '@/components/ui';
import { useCart } from '@/state/cart';

/** Demo checkout: explains the handoff instead of pretending to take payment. */
export function CheckoutDemo() {
  return (
    <Page title="Checkout preview">
      <Container className="max-w-2xl py-24">
        <Eyebrow className="text-crimson">Preview store</Eyebrow>
        <h1 className="mt-3 font-display text-5xl font-extrabold tracking-tight">This is where Shopify takes over.</h1>
        <p className="mt-5 text-lg text-ink-muted">
          In the live store your bag is sent to Shopify&rsquo;s hosted checkout, which handles payment, tax and shipping. No order was placed and nothing was charged.
        </p>
        <ol className="mt-8 list-decimal space-y-2 pl-5 text-sm text-ink-muted">
          <li>Your bag&rsquo;s variant IDs and quantities are sent to the Shopify Storefront API.</li>
          <li>Shopify prices everything server-side and returns a secure checkout URL.</li>
          <li>After payment, Shopify notifies our server by signed webhook. Only then is the order recorded and earnings calculated.</li>
        </ol>
        <div className="mt-10 flex gap-4">
          <ButtonLink to="/cart" variant="secondary">Back to bag</ButtonLink>
          <ButtonLink to="/shop">Keep shopping</ButtonLink>
        </div>
      </Container>
    </Page>
  );
}

/**
 * Return page after Shopify checkout. The query string is informational only;
 * an order is confirmed only by the signed orders/paid webhook on the server.
 */
export function CheckoutReturn() {
  const [params] = useSearchParams();
  const status = params.get('status');
  const { clear } = useCart();
  const success = status === 'success';
  useEffect(() => {
    if (success) clear();
  }, [success, clear]);
  return (
    <Page title={success ? 'Thank you' : 'Checkout cancelled'}>
      <Container className="max-w-2xl py-24">
        <span className="block h-1 w-12 bg-crimson" aria-hidden />
        <h1 className="mt-6 font-display text-5xl font-extrabold tracking-tight">{success ? 'Thank you. You just funded something real.' : 'Your bag is still here.'}</h1>
        <p className="mt-5 text-lg text-ink-muted">
          {success ? 'Shopify will email your confirmation. Campaign totals update once your payment is verified.' : 'Checkout was cancelled and nothing was charged. Pick up where you left off whenever you like.'}
        </p>
        <div className="mt-10 flex gap-4">
          <ButtonLink to={success ? '/campaigns' : '/cart'}>{success ? 'See the campaigns' : 'Return to bag'}</ButtonLink>
        </div>
      </Container>
    </Page>
  );
}
