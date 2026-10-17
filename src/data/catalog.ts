import type { Campaign, Collection, Creator, Product } from '@shared/types';
import { config, integrations } from '@/lib/config';
import { CAMPAIGNS, COLLECTIONS, CREATORS, PRODUCTS } from './sample';
import { createShopifyStorefront } from './shopify-storefront';
import type { CartLine } from '@/domain/cart';

export interface CatalogSource {
  readonly kind: 'sample' | 'shopify';
  listProducts(): Promise<Product[]>;
  getProduct(slug: string): Promise<Product | null>;
  listCollections(): Promise<Collection[]>;
  listCampaigns(): Promise<Campaign[]>;
  getCampaign(slug: string): Promise<Campaign | null>;
  listCreators(): Promise<Creator[]>;
  /** Hands off to the provider's hosted checkout. Returns the URL to navigate to. */
  createCheckout(lines: CartLine[]): Promise<{ url: string; external: boolean }>;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const sampleCatalog: CatalogSource = {
  kind: 'sample',
  async listProducts() {
    await wait(120);
    return PRODUCTS;
  },
  async getProduct(slug) {
    await wait(80);
    return PRODUCTS.find((p) => p.slug === slug) ?? null;
  },
  async listCollections() {
    return COLLECTIONS;
  },
  async listCampaigns() {
    await wait(80);
    return CAMPAIGNS.filter((c) => c.status === 'live' || c.status === 'ended');
  },
  async getCampaign(slug) {
    return CAMPAIGNS.find((c) => c.slug === slug) ?? null;
  },
  async listCreators() {
    return CREATORS;
  },
  async createCheckout(lines) {
    await wait(300);
    // Validate against the catalogue like a server would: unknown or unavailable variants are rejected.
    const all = PRODUCTS.flatMap((p) => p.variants);
    for (const l of lines) {
      const v = all.find((x) => x.id === l.variantId);
      if (!v || !v.available) throw new Error('An item in your bag is no longer available.');
    }
    return { url: '/checkout/demo', external: false };
  },
};

/**
 * Creators and campaigns are platform records (Supabase), while products, prices,
 * variants and checkout come from Shopify, the commerce source of truth.
 */
function createLiveCatalog(): CatalogSource {
  const shop = createShopifyStorefront(config.shopifyDomain, config.shopifyStorefrontToken);
  const api = async <T,>(path: string): Promise<T> => {
    const res = await fetch(`${config.apiBaseUrl}${path}`, { credentials: 'include' });
    if (!res.ok) throw new Error(`Request failed (${res.status})`);
    return (await res.json()) as T;
  };
  return {
    kind: 'shopify',
    listProducts: () => shop.listProducts(),
    getProduct: (slug) => shop.getProduct(slug),
    listCollections: () => shop.listCollections(),
    listCampaigns: () => api<Campaign[]>('/api/public/campaigns'),
    getCampaign: async (slug) => {
      try {
        return await api<Campaign>(`/api/public/campaigns/${encodeURIComponent(slug)}`);
      } catch {
        return null;
      }
    },
    listCreators: () => api<Creator[]>('/api/public/creators'),
    createCheckout: async (lines) => ({ url: await shop.createCheckout(lines), external: true }),
  };
}

export const catalog: CatalogSource = integrations.shopify && integrations.api ? createLiveCatalog() : sampleCatalog;
