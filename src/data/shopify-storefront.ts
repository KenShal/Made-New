import type { Collection, Product, Size, Variant } from '@shared/types';
import type { Currency } from '@shared/money';
import type { CartLine } from '@/domain/cart';

/**
 * Shopify Storefront API client. The Storefront access token is a public token
 * intended for browsers with read-only catalogue and cart scopes. Admin API
 * operations (product creation, orders, refunds) happen only in /server.
 *
 * Expected product metafields (namespace "made_new"):
 *   creator_id, campaign_id, scripture, story, artwork (JSON: {style, lines, accent})
 */
const API_VERSION = '2025-01';

const PRODUCT_FIELDS = `
  id handle title description createdAt productType
  priceRange { minVariantPrice { amount currencyCode } }
  options { name values }
  images(first: 6) { nodes { url altText width height } }
  collections(first: 5) { nodes { handle } }
  metafields(identifiers: [
    {namespace: "made_new", key: "creator_id"},
    {namespace: "made_new", key: "campaign_id"},
    {namespace: "made_new", key: "scripture"},
    {namespace: "made_new", key: "story"},
    {namespace: "made_new", key: "artwork"},
    {namespace: "made_new", key: "units_sold"}
  ]) { key value }
  variants(first: 100) { nodes { id availableForSale price { amount currencyCode } selectedOptions { name value } } }
`;

interface SfMoney { amount: string; currencyCode: Currency }
interface SfProduct {
  id: string; handle: string; title: string; description: string; createdAt: string; productType: string;
  priceRange: { minVariantPrice: SfMoney };
  images: { nodes: { url: string; altText: string | null }[] };
  collections: { nodes: { handle: string }[] };
  metafields: ({ key: string; value: string } | null)[];
  variants: { nodes: { id: string; availableForSale: boolean; price: SfMoney; selectedOptions: { name: string; value: string }[] }[] };
}

/** Converts a decimal string like "38.00" to integer minor units without float error. */
export function decimalToMinor(amount: string): number {
  const m = /^(-)?(\d+)(?:\.(\d{1,2}))?$/.exec(amount.trim());
  if (!m) throw new Error(`Invalid money amount: ${amount}`);
  const minor = Number(m[2]) * 100 + Number((m[3] ?? '').padEnd(2, '0'));
  return m[1] ? -minor : minor;
}

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

export function mapProduct(p: SfProduct): Product {
  const meta = Object.fromEntries(p.metafields.filter(Boolean).map((m) => [m!.key, m!.value]));
  let artwork: Product['artwork'] = { style: 'stack', lines: [p.title.toUpperCase()] };
  try {
    if (meta.artwork) artwork = JSON.parse(meta.artwork) as Product['artwork'];
  } catch {
    /* fall back to title artwork */
  }
  if (p.images.nodes[0]) artwork = { ...artwork, imageUrl: p.images.nodes[0].url };

  const colourMap = new Map<string, { id: string; name: string; hex: string; ink: string }>();
  const variants: Variant[] = p.variants.nodes.map((v) => {
    const colour = v.selectedOptions.find((o) => /colou?r/i.test(o.name))?.value ?? 'Default';
    const size = (v.selectedOptions.find((o) => /size/i.test(o.name))?.value ?? 'M') as Size;
    const id = slugify(colour);
    if (!colourMap.has(id)) colourMap.set(id, { id, name: colour, hex: '#F1EEE7', ink: '#171717' });
    return { id: v.id, size, colourId: id, available: v.availableForSale, price: { amount: decimalToMinor(v.price.amount), currency: v.price.currencyCode } };
  });

  return {
    id: p.id,
    slug: p.handle,
    name: p.title,
    description: p.description,
    category: (['tee', 'heavyweight', 'longsleeve', 'crewneck'].includes(p.productType) ? p.productType : 'tee') as Product['category'],
    price: { amount: decimalToMinor(p.priceRange.minVariantPrice.amount), currency: p.priceRange.minVariantPrice.currencyCode },
    colours: [...colourMap.values()],
    variants,
    artwork,
    creatorId: meta.creator_id ?? '',
    campaignId: meta.campaign_id,
    collectionSlugs: p.collections.nodes.map((c) => c.handle),
    scripture: meta.scripture,
    story: meta.story ?? '',
    createdAt: p.createdAt,
    unitsSold: Number(meta.units_sold ?? 0) || 0,
    shippingNote: 'Printed to order. Shipping is calculated at checkout.',
    sample: false,
  };
}

export function createShopifyStorefront(domain: string, token: string) {
  const endpoint = `https://${domain}/api/${API_VERSION}/graphql.json`;

  async function gql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Storefront-Access-Token': token },
      body: JSON.stringify({ query, variables }),
    });
    if (!res.ok) throw new Error(`Shopify request failed (${res.status})`);
    const json = (await res.json()) as { data?: T; errors?: { message: string }[] };
    if (json.errors?.length || !json.data) throw new Error('Shopify returned an error');
    return json.data;
  }

  return {
    async listProducts(): Promise<Product[]> {
      const d = await gql<{ products: { nodes: SfProduct[] } }>(`query { products(first: 100, sortKey: CREATED_AT, reverse: true) { nodes { ${PRODUCT_FIELDS} } } }`);
      return d.products.nodes.map(mapProduct);
    },
    async getProduct(handle: string): Promise<Product | null> {
      const d = await gql<{ product: SfProduct | null }>(`query($h: String!) { product(handle: $h) { ${PRODUCT_FIELDS} } }`, { h: handle });
      return d.product ? mapProduct(d.product) : null;
    },
    async listCollections(): Promise<Collection[]> {
      const d = await gql<{ collections: { nodes: { handle: string; title: string; description: string }[] } }>(`query { collections(first: 50) { nodes { handle title description } } }`);
      return d.collections.nodes.map((c) => ({ slug: c.handle, title: c.title, description: c.description }));
    },
    /** Shopify prices the cart server-side; we only pass variant ids and quantities. */
    async createCheckout(lines: CartLine[]): Promise<string> {
      const d = await gql<{ cartCreate: { cart: { checkoutUrl: string } | null; userErrors: { message: string }[] } }>(
        `mutation($lines: [CartLineInput!]!) { cartCreate(input: { lines: $lines }) { cart { checkoutUrl } userErrors { message } } }`,
        { lines: lines.map((l) => ({ merchandiseId: l.variantId, quantity: l.quantity })) },
      );
      if (!d.cartCreate.cart || d.cartCreate.userErrors.length) {
        throw new Error(d.cartCreate.userErrors[0]?.message ?? 'Could not start checkout');
      }
      const url = new URL(d.cartCreate.cart.checkoutUrl);
      if (url.protocol !== 'https:') throw new Error('Refusing non-HTTPS checkout URL');
      return url.toString();
    },
  };
}
