import { useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Page } from '@/components/Page';
import { ProductCard } from '@/components/ProductCard';
import { Button, Container, EmptyState, ErrorState, Eyebrow, Skeleton } from '@/components/ui';
import { useCatalogData } from '@/data/useCatalog';
import { queryCatalog, type SortKey } from '@/domain/catalog';
import { SIZES, type Product, type Size } from '@shared/types';
import { revealParent } from '@/lib/motion';
import { cn } from '@/lib/cn';

const CATEGORIES: { id: Product['category'] | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'tee', label: 'Tees' },
  { id: 'heavyweight', label: 'Heavyweight' },
  { id: 'longsleeve', label: 'Long sleeve' },
  { id: 'crewneck', label: 'Crewneck' },
];

const SORTS: { id: SortKey; label: string }[] = [
  { id: 'featured', label: 'Featured' },
  { id: 'newest', label: 'Newest' },
  { id: 'best-selling', label: 'Best selling' },
  { id: 'price-asc', label: 'Price: low to high' },
  { id: 'price-desc', label: 'Price: high to low' },
];

const list = (v: string | null) => (v ? v.split(',').filter(Boolean) : []);

export default function Shop() {
  const { collectionSlug } = useParams();
  const data = useCatalogData();
  const [params, setParams] = useSearchParams();
  const [filtersOpen, setFiltersOpen] = useState(false);

  const q = params.get('q') ?? '';
  const category = (params.get('category') ?? 'all') as Product['category'] | 'all';
  const sizes = list(params.get('sizes')) as Size[];
  const colours = list(params.get('colours'));
  const sort = (params.get('sort') ?? 'featured') as SortKey;
  const page = Number(params.get('page') ?? '1') || 1;

  const update = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === '' || v === 'all' || (k === 'sort' && v === 'featured')) next.delete(k);
      else next.set(k, v);
    }
    if (!('page' in patch)) next.delete('page');
    setParams(next, { replace: true });
  };
  const toggle = (key: 'sizes' | 'colours', value: string, current: string[]) => update({ [key]: (current.includes(value) ? current.filter((x) => x !== value) : [...current, value]).join(',') });

  const collection = data.status === 'ready' && collectionSlug ? data.data.collections.find((c) => c.slug === collectionSlug) : undefined;
  const result = useMemo(() => {
    if (data.status !== 'ready') return null;
    const pool = collectionSlug ? data.data.products.filter((p) => p.collectionSlugs.includes(collectionSlug)) : data.data.products;
    return queryCatalog(pool, { q, category, sizes, colours, sort, page, pageSize: 8 }, (id) => data.data.creators.find((c) => c.id === id)?.displayName ?? '');
  }, [data, collectionSlug, q, category, sizes, colours, sort, page]);

  const allColours = useMemo(() => {
    if (data.status !== 'ready') return [];
    const m = new Map<string, { id: string; name: string; hex: string }>();
    data.data.products.forEach((p) => p.colours.forEach((c) => m.set(c.id, c)));
    return [...m.values()];
  }, [data]);

  const title = collection?.title ?? (collectionSlug ? 'Collection' : 'Shop');
  const activeCount = sizes.length + colours.length + (category !== 'all' ? 1 : 0);

  if (collectionSlug && data.status === 'ready' && !collection) {
    return (
      <Page title="Collection not found">
        <Container className="py-24">
          <EmptyState title="We couldn't find that collection." action={<Link to="/shop" className="underline">Browse all products</Link>} />
        </Container>
      </Page>
    );
  }

  return (
    <Page title={title}>
      <Container className="pb-24 pt-12 sm:pt-16">
        <Eyebrow>{collectionSlug ? 'Collection' : 'Shop all'}</Eyebrow>
        <h1 className="mt-3 font-display text-giant font-extrabold uppercase">{title}</h1>
        {collection && <p className="mt-4 max-w-xl text-lg text-ink-muted">{collection.description}</p>}

        <div className="sticky top-16 z-30 -mx-4 mt-10 border-y border-line bg-white/95 px-4 py-3 sm:top-[4.5rem] sm:-mx-8 sm:px-8 lg:-mx-12 lg:px-12">
          <div className="flex flex-wrap items-center gap-3">
            <label className="relative flex-1 sm:max-w-xs">
              <span className="sr-only">Search products</span>
              <input type="search" defaultValue={q} maxLength={80} onChange={(e) => update({ q: e.target.value })} placeholder="Search designs, verses, creators" className="h-11 w-full border border-line bg-white pl-10 pr-3 text-sm focus:border-ink focus:outline-none" />
              <svg viewBox="0 0 20 20" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" aria-hidden>
                <circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
                <path d="M13 13l4 4" stroke="currentColor" strokeWidth="1.5" />
              </svg>
            </label>
            <div className="hidden gap-1 lg:flex" role="group" aria-label="Category">
              {CATEGORIES.map((c) => (
                <button key={c.id} type="button" onClick={() => update({ category: c.id })} aria-pressed={category === c.id} className={cn('h-11 px-4 text-xs font-bold uppercase tracking-[0.12em] transition-colors', category === c.id ? 'bg-ink text-white' : 'hover:bg-soft')}>
                  {c.label}
                </button>
              ))}
            </div>
            <button type="button" className="h-11 border border-line px-4 text-xs font-bold uppercase tracking-[0.12em] hover:border-ink" aria-expanded={filtersOpen} aria-controls="filters" onClick={() => setFiltersOpen((o) => !o)}>
              Filters{activeCount > 0 && ` (${activeCount})`}
            </button>
            <label className="ml-auto flex items-center gap-2 text-sm">
              <span className="hidden text-ink-muted sm:inline">Sort</span>
              <select aria-label="Sort products" value={sort} onChange={(e) => update({ sort: e.target.value })} className="h-11 border border-line bg-white px-3 text-sm focus:border-ink focus:outline-none">
                {SORTS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {filtersOpen && (
            <div id="filters" className="grid gap-6 pb-2 pt-5 sm:grid-cols-3">
              <fieldset className="lg:hidden">
                <legend className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-ink-muted">Category</legend>
                <div className="flex flex-wrap gap-2">
                  {CATEGORIES.map((c) => (
                    <button key={c.id} type="button" onClick={() => update({ category: c.id })} aria-pressed={category === c.id} className={cn('h-10 border px-3 text-xs font-semibold', category === c.id ? 'border-ink bg-ink text-white' : 'border-line')}>
                      {c.label}
                    </button>
                  ))}
                </div>
              </fieldset>
              <fieldset>
                <legend className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-ink-muted">Size</legend>
                <div className="flex flex-wrap gap-2">
                  {SIZES.map((s) => (
                    <button key={s} type="button" onClick={() => toggle('sizes', s, sizes)} aria-pressed={sizes.includes(s)} className={cn('h-10 w-12 border text-xs font-semibold', sizes.includes(s) ? 'border-ink bg-ink text-white' : 'border-line hover:border-ink')}>
                      {s}
                    </button>
                  ))}
                </div>
              </fieldset>
              <fieldset>
                <legend className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-ink-muted">Colour</legend>
                <div className="flex flex-wrap gap-2">
                  {allColours.map((c) => (
                    <button key={c.id} type="button" onClick={() => toggle('colours', c.id, colours)} aria-pressed={colours.includes(c.id)} className={cn('flex h-10 items-center gap-2 border px-3 text-xs font-semibold', colours.includes(c.id) ? 'border-ink' : 'border-line hover:border-ink')}>
                      <span className="h-3.5 w-3.5 rounded-full border border-black/15" style={{ backgroundColor: c.hex }} aria-hidden />
                      {c.name}
                    </button>
                  ))}
                </div>
              </fieldset>
              {activeCount > 0 && (
                <div className="sm:col-span-3">
                  <button type="button" className="text-sm underline underline-offset-4" onClick={() => update({ sizes: null, colours: null, category: null })}>
                    Clear filters
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <p className="mt-6 text-sm text-ink-muted" aria-live="polite">
          {result ? `${result.total} ${result.total === 1 ? 'design' : 'designs'}` : 'Loading designs'}
        </p>

        {data.status === 'error' && <ErrorState error={data.error} onRetry={data.reload} />}
        {data.status === 'loading' && (
          <div className="mt-8 grid grid-cols-2 gap-x-4 gap-y-12 sm:gap-x-6 lg:grid-cols-4" aria-busy="true">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i}>
                <Skeleton className="aspect-[4/5]" />
                <Skeleton className="mt-4 h-4 w-2/3" />
              </div>
            ))}
          </div>
        )}
        {result && data.status === 'ready' && (
          <>
            {result.items.length === 0 ? (
              <div className="mt-8">
                <EmptyState title="Nothing matches yet." body="Try a different search or clear a filter or two." action={<Button variant="secondary" onClick={() => setParams(new URLSearchParams(), { replace: true })}>Clear everything</Button>} />
              </div>
            ) : (
              <motion.div key={`${q}|${category}|${sizes}|${colours}|${sort}`} initial="hidden" animate="shown" variants={revealParent} className="mt-8 grid grid-cols-2 gap-x-4 gap-y-12 sm:gap-x-6 lg:grid-cols-4">
                {result.items.map((p, i) => (
                  <ProductCard key={p.id} product={p} creator={data.data.creators.find((c) => c.id === p.creatorId)} campaign={data.data.campaigns.find((c) => c.id === p.campaignId)} priority={i < 4} />
                ))}
              </motion.div>
            )}
            {result.page < result.pageCount && (
              <div className="mt-16 flex justify-center">
                <Button variant="secondary" onClick={() => update({ page: String(result.page + 1) })}>
                  Load more
                </Button>
              </div>
            )}
          </>
        )}
      </Container>
    </Page>
  );
}
