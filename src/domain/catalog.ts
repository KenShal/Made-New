import type { Product, Size } from '@shared/types';

export type SortKey = 'featured' | 'newest' | 'best-selling' | 'price-asc' | 'price-desc';

export interface CatalogQuery {
  q?: string;
  category?: Product['category'] | 'all';
  sizes?: Size[];
  colours?: string[];
  sort?: SortKey;
  page?: number;
  pageSize?: number;
}

export interface CatalogResult {
  items: Product[];
  total: number;
  page: number;
  pageCount: number;
}

const normalise = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');

export function queryCatalog(products: readonly Product[], query: CatalogQuery, creatorName: (id: string) => string = () => ''): CatalogResult {
  const q = query.q ? normalise(query.q.trim()).slice(0, 80) : '';
  const sizes = query.sizes ?? [];
  const colours = query.colours ?? [];

  let items = products.filter((p) => {
    if (query.category && query.category !== 'all' && p.category !== query.category) return false;
    if (q) {
      const hay = normalise([p.name, p.description, p.scripture ?? '', creatorName(p.creatorId), ...p.artwork.lines].join(' '));
      if (!q.split(/\s+/).every((term) => hay.includes(term))) return false;
    }
    if (sizes.length || colours.length) {
      const match = p.variants.some(
        (v) => v.available && (sizes.length === 0 || sizes.includes(v.size)) && (colours.length === 0 || colours.includes(v.colourId)),
      );
      if (!match) return false;
    }
    return true;
  });

  switch (query.sort ?? 'featured') {
    case 'newest':
      items = [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      break;
    case 'best-selling':
      items = [...items].sort((a, b) => b.unitsSold - a.unitsSold);
      break;
    case 'price-asc':
      items = [...items].sort((a, b) => a.price.amount - b.price.amount);
      break;
    case 'price-desc':
      items = [...items].sort((a, b) => b.price.amount - a.price.amount);
      break;
    default:
      break;
  }

  const pageSize = Math.min(Math.max(query.pageSize ?? 6, 1), 48);
  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(query.page ?? 1, 1), pageCount);
  return { items: items.slice(0, page * pageSize), total, page, pageCount };
}
