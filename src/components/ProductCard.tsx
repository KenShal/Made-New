import { memo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import type { Campaign, Creator, Product } from '@shared/types';
import { Garment } from './Garment';
import { Price, SampleBadge } from './ui';
import { cardHover, revealChild } from '@/lib/motion';
import { QuickView } from './QuickView';

export const ProductCard = memo(function ProductCard({ product, creator, campaign, priority = false }: { product: Product; creator?: Creator; campaign?: Campaign; priority?: boolean }) {
  const [quick, setQuick] = useState(false);
  const [hoverColour, setHoverColour] = useState(0);
  const front = product.colours[hoverColour] ?? product.colours[0]!;
  const alt = product.colours[1] ?? product.colours[0]!;
  return (
    <motion.article variants={revealChild} className="group/card relative flex flex-col" aria-labelledby={`p-${product.id}`}>
      <motion.div initial="rest" whileHover="hover" animate="rest" variants={cardHover} className="relative">
        <Link to={`/shop/${product.slug}`} className="relative block aspect-[4/5] overflow-hidden bg-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-crimson" tabIndex={-1} aria-hidden>
          <Garment colour={front} artwork={product.artwork} category={product.category} title={`${product.name} in ${front.name}`} className="absolute inset-0 h-full w-full p-6 transition-[opacity,transform] duration-500 ease-editorial group-hover/card:scale-[1.02] [@media(hover:hover)]:group-hover/card:opacity-0" />
          {/* Secondary image: detail crop in the alternate colour, revealed on hover-capable devices only. */}
          <Garment colour={alt} artwork={product.backArtwork ?? product.artwork} category={product.category} view={product.backArtwork ? 'back' : 'front'} crop={product.backArtwork ? 'full' : 'detail'} title="" className="absolute inset-0 hidden h-full w-full p-6 opacity-0 transition-opacity duration-500 ease-editorial [@media(hover:hover)]:block [@media(hover:hover)]:group-hover/card:opacity-100" />
          {!priority && <span className="sr-only">Loaded lazily</span>}
        </Link>
        {product.sample && <SampleBadge className="pointer-events-none absolute left-3 top-3" label="Sample" />}
        <button
          type="button"
          onClick={() => setQuick(true)}
          className="absolute bottom-3 right-3 z-10 h-10 bg-white px-4 text-[0.7rem] font-bold uppercase tracking-[0.14em] text-ink shadow-sm transition-[opacity,transform] duration-300 hover:bg-ink hover:text-white focus-visible:opacity-100 [@media(hover:hover)]:translate-y-2 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/card:translate-y-0 [@media(hover:hover)]:group-hover/card:opacity-100"
          aria-label={`Quick view ${product.name}`}
        >
          Quick view
        </button>
      </motion.div>
      <div className="mt-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 id={`p-${product.id}`} className="font-display text-[1.02rem] font-bold leading-tight tracking-tight">
            <Link to={`/shop/${product.slug}`} className="after:absolute after:inset-0 after:content-[''] hover:text-crimson focus-visible:outline-none">
              {product.name}
            </Link>
          </h3>
          <p className="mt-1 truncate text-sm text-ink-muted">by {creator?.displayName ?? 'Independent creator'}</p>
        </div>
        <Price value={product.price} className="shrink-0 text-sm font-semibold" />
      </div>
      <div className="relative z-10 mt-3 flex items-center justify-between gap-3">
        <ul className="flex gap-1.5" aria-label="Available colours">
          {product.colours.map((c, i) => (
            <li key={c.id}>
              <button type="button" onMouseEnter={() => setHoverColour(i)} onFocus={() => setHoverColour(i)} onClick={() => setHoverColour(i)} className="block h-3.5 w-3.5 rounded-full border border-black/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-crimson" style={{ backgroundColor: c.hex }} aria-label={`Preview in ${c.name}`} aria-pressed={i === hoverColour} />
            </li>
          ))}
        </ul>
        {campaign && <p className="truncate text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-crimson">Funds {campaign.title}</p>}
      </div>
      <QuickView product={product} creator={creator} campaign={campaign} open={quick} onClose={() => setQuick(false)} />
    </motion.article>
  );
});
