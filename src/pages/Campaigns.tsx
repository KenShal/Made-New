import { Link, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Page } from '@/components/Page';
import { ButtonLink, Container, EmptyState, ErrorState, Eyebrow, Progress, SampleBadge, Skeleton } from '@/components/ui';
import { ProductCard } from '@/components/ProductCard';
import { CampaignCard } from '@/features/home/Sections';
import { useCatalogData } from '@/data/useCatalog';
import { formatMoney } from '@shared/money';
import { revealParent } from '@/lib/motion';

export function CampaignsPage() {
  const data = useCatalogData();
  return (
    <Page title="Campaigns">
      <Container className="pb-24 pt-12 sm:pt-16">
        <Eyebrow>Campaigns</Eyebrow>
        <h1 className="mt-3 font-display text-giant font-extrabold uppercase">Every shirt has a cause.</h1>
        <p className="mt-5 max-w-xl text-lg text-ink-muted">Campaigns are reviewed before they go live. Totals come from completed orders, net of refunds.</p>
        {data.status === 'loading' && <div className="mt-12 grid gap-6 md:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-80" />)}</div>}
        {data.status === 'error' && <div className="mt-12"><ErrorState error={data.error} onRetry={data.reload} /></div>}
        {data.status === 'ready' && (
          data.data.campaigns.length === 0 ? (
            <div className="mt-12"><EmptyState title="No live campaigns yet." /></div>
          ) : (
            <motion.div initial="hidden" animate="shown" variants={revealParent} className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {data.data.campaigns.map((c) => (
                <CampaignCard key={c.id} campaign={c} creator={data.data.creators.find((x) => x.id === c.creatorId)} products={data.data.products.filter((p) => p.campaignId === c.id)} />
              ))}
            </motion.div>
          )
        )}
      </Container>
    </Page>
  );
}

export function CampaignPage() {
  const { campaignSlug } = useParams();
  const data = useCatalogData();
  if (data.status === 'loading') return <Container className="py-16"><Skeleton className="h-96" /></Container>;
  if (data.status === 'error') return <Container className="py-24"><ErrorState error={data.error} onRetry={data.reload} /></Container>;
  const c = data.data.campaigns.find((x) => x.slug === campaignSlug);
  if (!c) return <Container className="py-24"><EmptyState title="Campaign not found." action={<ButtonLink to="/campaigns" variant="secondary">All campaigns</ButtonLink>} /></Container>;
  const creator = data.data.creators.find((x) => x.id === c.creatorId);
  const products = data.data.products.filter((p) => p.campaignId === c.id);
  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: c.title, url });
      else await navigator.clipboard.writeText(url);
    } catch {
      /* user cancelled */
    }
  };
  return (
    <Page title={c.title}>
      <section className="bg-crimson-blush">
        <Container className="grid gap-10 py-16 sm:py-24 lg:grid-cols-[1.4fr_1fr] lg:items-end">
          <div>
            <div className="flex items-center gap-3">
              <Eyebrow className="text-crimson">Campaign</Eyebrow>
              {c.sample && <SampleBadge />}
            </div>
            <h1 className="mt-4 font-display text-giant font-extrabold uppercase">{c.title}</h1>
            <p className="mt-4 text-lg">For {c.beneficiary}{creator && <> · Started by <Link to="/discover" className="underline underline-offset-4">{creator.displayName}</Link></>}</p>
          </div>
          <div className="bg-white p-8">
            {c.raisedVerified ? (
              <>
                <p className="font-display text-4xl font-extrabold tabular-nums">{formatMoney(c.raisedVerified)}</p>
                <p className="mb-4 text-sm text-ink-muted">raised of {formatMoney(c.goal)}</p>
                <Progress value={c.raisedVerified.amount} goal={c.goal.amount} label="Campaign progress" />
                <p className="mt-3 text-xs text-ink-muted">{c.sample ? 'Illustrative sample total' : 'Verified from completed orders, net of refunds'}</p>
              </>
            ) : (
              <p className="text-sm text-ink-muted">Goal {formatMoney(c.goal)}. Totals appear once orders are verified.</p>
            )}
            {c.endsAt && <p className="mt-4 text-xs text-ink-muted">Runs until {new Date(c.endsAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</p>}
            <button type="button" onClick={share} className="mt-6 text-xs font-bold uppercase tracking-[0.14em] text-crimson underline-offset-4 hover:underline">Share this campaign</button>
          </div>
        </Container>
      </section>
      <Container className="grid gap-12 py-16 lg:grid-cols-2">
        <div>
          <h2 className="font-display text-sm font-bold uppercase tracking-[0.14em]">About</h2>
          <p className="mt-3 text-lg leading-relaxed">{c.description}</p>
        </div>
        <div>
          <h2 className="font-display text-sm font-bold uppercase tracking-[0.14em]">How the funds will be used</h2>
          <p className="mt-3 text-lg leading-relaxed">{c.intendedUse}</p>
        </div>
      </Container>
      <Container className="pb-24">
        <h2 className="font-display text-3xl font-extrabold uppercase tracking-tight">Support this mission</h2>
        {products.length ? (
          <motion.div initial="hidden" animate="shown" variants={revealParent} className="mt-10 grid grid-cols-2 gap-x-4 gap-y-12 sm:gap-x-6 lg:grid-cols-4">
            {products.map((p) => <ProductCard key={p.id} product={p} creator={creator} campaign={c} />)}
          </motion.div>
        ) : (
          <p className="mt-4 text-ink-muted">No designs are linked to this campaign yet.</p>
        )}
      </Container>
    </Page>
  );
}

export function DiscoverPage() {
  const data = useCatalogData();
  return (
    <Page title="Discover creators">
      <Container className="pb-24 pt-12 sm:pt-16">
        <Eyebrow>Discover</Eyebrow>
        <h1 className="mt-3 font-display text-giant font-extrabold uppercase">The people behind the print.</h1>
        {data.status === 'loading' && <Skeleton className="mt-12 h-96" />}
        {data.status === 'error' && <div className="mt-12"><ErrorState error={data.error} onRetry={data.reload} /></div>}
        {data.status === 'ready' && (
          <div className="mt-14 space-y-24">
            {data.data.creators.map((cr) => {
              const prods = data.data.products.filter((p) => p.creatorId === cr.id);
              return (
                <section key={cr.id} id={cr.handle} aria-labelledby={`cr-${cr.id}`} className="scroll-mt-28">
                  <div className="flex flex-col justify-between gap-4 border-t border-ink pt-6 md:flex-row md:items-end">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-muted">{cr.kind === 'organisation' ? 'Organisation' : 'Creator'} · {cr.location}</p>
                      <h2 id={`cr-${cr.id}`} className="mt-2 font-display text-4xl font-extrabold tracking-tight">{cr.displayName}</h2>
                    </div>
                    <p className="max-w-md text-ink-muted">{cr.bio}</p>
                  </div>
                  <motion.div initial="hidden" whileInView="shown" viewport={{ once: true }} variants={revealParent} className="mt-8 grid grid-cols-2 gap-x-4 gap-y-10 sm:gap-x-6 lg:grid-cols-4">
                    {prods.map((p) => <ProductCard key={p.id} product={p} creator={cr} campaign={data.data.campaigns.find((c) => c.id === p.campaignId)} />)}
                  </motion.div>
                </section>
              );
            })}
          </div>
        )}
      </Container>
    </Page>
  );
}
