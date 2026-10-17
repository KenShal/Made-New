import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Page } from '@/components/Page';
import { Garment } from '@/components/Garment';
import { ProductCard } from '@/components/ProductCard';
import { AddToBag, VariantPicker, useVariantSelection } from '@/components/VariantPicker';
import { Container, EmptyState, ErrorState, Eyebrow, Price, Progress, SampleBadge, Skeleton, ButtonLink } from '@/components/ui';
import { useCatalogData } from '@/data/useCatalog';
import type { Campaign, Creator, Product as ProductT } from '@shared/types';
import { formatMoney } from '@shared/money';
import { policyFor } from '@shared/revenue-policy';
import { duration, ease, revealParent } from '@/lib/motion';
import { cn } from '@/lib/cn';

export default function ProductPage() {
  const { productSlug } = useParams();
  const data = useCatalogData();
  if (data.status === 'loading')
    return (
      <Container className="grid gap-10 py-12 lg:grid-cols-[1.3fr_1fr]" aria-busy="true">
        <Skeleton className="aspect-[4/5]" />
        <div className="space-y-4">
          <Skeleton className="h-12 w-3/4" />
          <Skeleton className="h-6 w-1/4" />
          <Skeleton className="h-40" />
        </div>
      </Container>
    );
  if (data.status === 'error') return <Container className="py-24"><ErrorState error={data.error} onRetry={data.reload} /></Container>;
  const product = data.data.products.find((p) => p.slug === productSlug);
  if (!product)
    return (
      <Page title="Not found">
        <Container className="py-24">
          <EmptyState title="That design isn't available." body="It may have been retired or the link may be wrong." action={<ButtonLink to="/shop" variant="secondary">Browse the shop</ButtonLink>} />
        </Container>
      </Page>
    );
  return (
    <ProductDetail
      key={product.id}
      product={product}
      creator={data.data.creators.find((c) => c.id === product.creatorId)}
      campaign={data.data.campaigns.find((c) => c.id === product.campaignId)}
      related={data.data.products.filter((p) => p.id !== product.id && (p.campaignId === product.campaignId || p.creatorId === product.creatorId)).slice(0, 4)}
      creators={data.data.creators}
      campaigns={data.data.campaigns}
    />
  );
}

type View = { key: string; label: string; view: 'front' | 'back'; crop: 'full' | 'detail' };

function ProductDetail({ product, creator, campaign, related, creators, campaigns }: { product: ProductT; creator?: Creator; campaign?: Campaign; related: ProductT[]; creators: Creator[]; campaigns: Campaign[] }) {
  const selection = useVariantSelection(product);
  const colour = product.colours.find((c) => c.id === selection.colourId) ?? product.colours[0]!;
  const views: View[] = [
    { key: 'front', label: 'Front', view: 'front', crop: 'full' },
    { key: 'detail', label: 'Print detail', view: 'front', crop: 'detail' },
    ...(product.backArtwork ? [{ key: 'back', label: 'Back', view: 'back' as const, crop: 'full' as const }] : []),
  ];
  const [active, setActive] = useState(0);
  const v = views[active]!;
  const policy = policyFor(new Date().toISOString());

  return (
    <Page title={product.name}>
      <Container className="pb-24 pt-6 sm:pt-10">
        <nav aria-label="Breadcrumb" className="mb-6 text-xs text-ink-muted">
          <ol className="flex gap-2">
            <li><Link to="/shop" className="hover:text-crimson">Shop</Link></li>
            <li aria-hidden>/</li>
            <li aria-current="page" className="text-ink">{product.name}</li>
          </ol>
        </nav>
        <div className="grid gap-10 lg:grid-cols-[1.3fr_1fr] lg:gap-16">
          <div className="lg:sticky lg:top-24 lg:self-start">
            <div className="relative aspect-[4/5] overflow-hidden bg-soft">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.div key={`${v.key}-${colour.id}`} initial={{ opacity: 0, scale: 1.03 }} animate={{ opacity: 1, scale: 1, transition: { duration: duration.base, ease: ease.editorial } }} exit={{ opacity: 0, transition: { duration: duration.quick } }} className="absolute inset-0">
                  <Garment colour={colour} artwork={v.view === 'back' && product.backArtwork ? product.backArtwork : product.artwork} view={v.view} crop={v.crop} category={product.category} title={`${product.name}, ${v.label.toLowerCase()} view in ${colour.name}`} className="h-full w-full p-[7%]" />
                </motion.div>
              </AnimatePresence>
              {product.sample && <SampleBadge className="absolute left-4 top-4" />}
            </div>
            <div className="mt-3 grid grid-cols-3 gap-3" role="group" aria-label="Product images">
              {views.map((x, i) => (
                <button key={x.key} type="button" onClick={() => setActive(i)} aria-pressed={i === active} aria-label={`Show ${x.label}`} className={cn('relative aspect-square bg-soft transition-[outline-color]', i === active ? 'outline outline-2 outline-offset-2 outline-ink' : 'hover:outline hover:outline-1 hover:outline-line')}>
                  <Garment colour={colour} artwork={x.view === 'back' && product.backArtwork ? product.backArtwork : product.artwork} view={x.view} crop={x.crop} category={product.category} title="" className="h-full w-full p-2" />
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-8">
            <div>
              <Link to={`/discover#${creator?.handle ?? ''}`} className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-muted hover:text-crimson">
                {creator?.displayName ?? 'Independent creator'}
              </Link>
              <h1 className="mt-2 font-display text-5xl font-extrabold leading-[0.95] tracking-tightest">{product.name}</h1>
              <p className="mt-4 flex items-baseline gap-3 text-xl">
                <Price value={product.price} />
                <span className="text-sm text-ink-muted">incl. VAT</span>
              </p>
            </div>
            <p className="text-[1.02rem] leading-relaxed text-ink-muted">{product.description}</p>

            <VariantPicker product={product} selection={selection} />
            {/* Sticky purchase action on mobile */}
            <div className="sticky bottom-0 z-20 -mx-4 border-t border-line bg-white px-4 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-3 sm:static sm:mx-0 sm:border-0 sm:p-0">
              <AddToBag product={product} selection={selection} />
            </div>

            <dl className="divide-y divide-line border-y border-line text-sm">
              <div className="grid grid-cols-[8rem_1fr] gap-4 py-4">
                <dt className="font-semibold">Availability</dt>
                <dd className="text-ink-muted">{selection.resolution.ok ? 'In stock, printed to order' : product.variants.some((x) => x.available) ? 'Choose a colour and size' : 'Sold out'}</dd>
              </div>
              <div className="grid grid-cols-[8rem_1fr] gap-4 py-4">
                <dt className="font-semibold">Shipping</dt>
                <dd className="text-ink-muted">{product.shippingNote}</dd>
              </div>
              {product.scripture && (
                <div className="grid grid-cols-[8rem_1fr] gap-4 py-4">
                  <dt className="font-semibold">Scripture</dt>
                  <dd className="text-ink-muted">{product.scripture}</dd>
                </div>
              )}
            </dl>

            <details className="group border-b border-line pb-4" open>
              <summary className="flex cursor-pointer list-none items-center justify-between font-display text-sm font-bold uppercase tracking-[0.14em]">
                The story
                <span className="transition-transform group-open:rotate-45" aria-hidden>+</span>
              </summary>
              <p className="mt-3 font-serif text-2xl leading-snug">{product.story}</p>
            </details>

            {creator && (
              <section aria-labelledby="creator-h" className="flex gap-4">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full font-display font-extrabold text-white" style={{ backgroundColor: `hsl(${creator.avatarHue} 45% 32%)` }} aria-hidden>
                  {creator.displayName[0]}
                </span>
                <div>
                  <h2 id="creator-h" className="font-display font-bold">{creator.displayName}</h2>
                  <p className="text-xs text-ink-muted">{creator.kind === 'organisation' ? 'Organisation' : 'Independent creator'} · {creator.location}</p>
                  <p className="mt-2 text-sm text-ink-muted">{creator.bio}</p>
                </div>
              </section>
            )}

            {campaign && (
              <section aria-labelledby="campaign-h" className="bg-crimson-blush p-6">
                <Eyebrow className="text-crimson">This design supports</Eyebrow>
                <h2 id="campaign-h" className="mt-2 font-display text-2xl font-extrabold tracking-tight">
                  <Link to={`/campaigns/${campaign.slug}`} className="hover:text-crimson">{campaign.title}</Link>
                </h2>
                <p className="mt-2 text-sm">{campaign.description}</p>
                {campaign.raisedVerified && (
                  <div className="mt-5">
                    <Progress value={campaign.raisedVerified.amount} goal={campaign.goal.amount} label="Campaign progress" />
                    <p className="mt-2 text-xs text-ink-muted">
                      {formatMoney(campaign.raisedVerified)} of {formatMoney(campaign.goal)} {campaign.sample ? '(illustrative)' : '(verified)'}
                    </p>
                  </div>
                )}
                <p className="mt-5 border-t border-crimson/20 pt-4 text-xs leading-relaxed text-ink">
                  <strong>How your purchase helps:</strong> after garment, printing, payment fees and VAT, {policy.campaignShareBps / 100}% of the remaining margin goes to this campaign and {policy.creatorShareBps / 100}% to the creator. <Link to="/how-it-works#proceeds" className="underline underline-offset-2">See the full breakdown</Link>.
                </p>
              </section>
            )}
          </div>
        </div>

        {related.length > 0 && (
          <section className="mt-28" aria-labelledby="related-h">
            <h2 id="related-h" className="font-display text-3xl font-extrabold uppercase tracking-tight">You might also like</h2>
            <motion.div initial="hidden" whileInView="shown" viewport={{ once: true }} variants={revealParent} className="mt-10 grid grid-cols-2 gap-x-4 gap-y-12 sm:gap-x-6 lg:grid-cols-4">
              {related.map((p) => (
                <ProductCard key={p.id} product={p} creator={creators.find((c) => c.id === p.creatorId)} campaign={campaigns.find((c) => c.id === p.campaignId)} />
              ))}
            </motion.div>
          </section>
        )}
      </Container>
    </Page>
  );
}
