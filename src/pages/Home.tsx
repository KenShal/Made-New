import { Page } from '@/components/Page';
import { useCatalogData } from '@/data/useCatalog';
import { HERO_PRODUCT_SLUGS } from '@/data/sample';
import { Hero } from '@/features/home/Hero';
import { Intro } from '@/features/home/Intro';
import { CreatorInvite, FeaturedCampaigns, FeaturedCollection, FinalCta, HowItWorks, Manifesto, Mission, ScrollProgress } from '@/features/home/Sections';
import { CollectionRing } from '@/features/home/Ring';
import { Container, ErrorState, Skeleton } from '@/components/ui';

export default function Home() {
  const data = useCatalogData();
  return (
    <Page title="MADE NEW">
      <Intro />
      {data.status === 'loading' && (
        <Container className="grid min-h-[80vh] items-center gap-8 py-10 lg:grid-cols-2" aria-busy="true">
          <div className="space-y-4">
            <Skeleton className="h-24 w-4/5" />
            <Skeleton className="h-24 w-3/5" />
            <Skeleton className="h-6 w-2/5" />
          </div>
          <Skeleton className="aspect-[5/6] w-full" />
        </Container>
      )}
      {data.status === 'error' && (
        <Container className="py-24">
          <ErrorState error={data.error} onRetry={data.reload} />
        </Container>
      )}
      {data.status === 'ready' && (
        <>
          <ScrollProgress />
          <Hero products={pickHero(data.data.products)} creators={data.data.creators} />
          <CollectionRing products={data.data.products} creators={data.data.creators} />
          <FeaturedCollection products={data.data.products} creators={data.data.creators} campaigns={data.data.campaigns} />
          <Mission />
          <FeaturedCampaigns campaigns={data.data.campaigns} creators={data.data.creators} products={data.data.products} />
          <CreatorInvite />
          <HowItWorks />
          <Manifesto />
          <FinalCta />
        </>
      )}
    </Page>
  );
}

function pickHero<T extends { slug: string }>(products: T[]): T[] {
  const picked = HERO_PRODUCT_SLUGS.map((s) => products.find((p) => p.slug === s)).filter(Boolean) as T[];
  return picked.length >= 2 ? picked : products.slice(0, 4);
}
