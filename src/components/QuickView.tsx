import { Link } from 'react-router-dom';
import type { Campaign, Creator, Product } from '@shared/types';
import { Dialog, CloseButton } from './Dialog';
import { Garment } from './Garment';
import { AddToBag, VariantPicker, useVariantSelection } from './VariantPicker';
import { Price, SampleBadge } from './ui';

export function QuickView({ product, creator, campaign, open, onClose }: { product: Product; creator?: Creator; campaign?: Campaign; open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} label={`Quick view: ${product.name}`}>
      {open && <QuickViewBody product={product} creator={creator} campaign={campaign} onClose={onClose} />}
    </Dialog>
  );
}

function QuickViewBody({ product, creator, campaign, onClose }: { product: Product; creator?: Creator; campaign?: Campaign; onClose: () => void }) {
  const selection = useVariantSelection(product);
  const colour = product.colours.find((c) => c.id === selection.colourId) ?? product.colours[0]!;
  return (
    <div className="grid sm:grid-cols-2">
      <div className="relative aspect-[4/5] bg-soft">
        <Garment colour={colour} artwork={product.artwork} category={product.category} title={`${product.name} in ${colour.name}`} className="absolute inset-0 h-full w-full p-8" />
        {product.sample && <SampleBadge className="absolute left-4 top-4" />}
      </div>
      <div className="flex flex-col gap-6 p-6 sm:p-10">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-muted">{creator?.displayName}</p>
            <h2 className="mt-1 font-display text-3xl font-extrabold tracking-tight">{product.name}</h2>
            <Price value={product.price} className="mt-2 block text-lg" />
          </div>
          <div className="-mr-3 -mt-3">
            <CloseButton onClick={onClose} />
          </div>
        </div>
        <p className="text-ink-muted">{product.description}</p>
        <VariantPicker product={product} selection={selection} compact />
        <AddToBag product={product} selection={selection} />
        {campaign && <p className="border-l-2 border-crimson pl-3 text-sm">Part of the margin from this design supports <strong>{campaign.title}</strong>.</p>}
        <Link to={`/shop/${product.slug}`} onClick={onClose} className="text-sm font-semibold underline underline-offset-4 hover:text-crimson">
          View full details
        </Link>
      </div>
    </div>
  );
}
