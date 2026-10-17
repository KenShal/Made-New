import { PermanentJobError } from '../../domain/jobs';
import { ProviderHttpError, type PodOrderInput, type PodProductInput, type PodProvider } from './provider';

const BASE = 'https://api.printify.com/v1';

/**
 * Printify adapter. Printify has no external-id lookup for products, so we
 * search our own stored mapping first (caller passes providerProductId when
 * known) and tag products with the external id in their title metadata.
 * Order submission uses external_id, which Printify enforces as unique per shop.
 */
export function createPrintify(cfg: { token: string; shopId: string; fetchImpl?: typeof fetch; blueprintId?: number; printProviderId?: number }): PodProvider {
  const f = cfg.fetchImpl ?? fetch;
  async function req<T>(method: string, path: string, body?: unknown): Promise<T | null> {
    const res = await f(`${BASE}${path}`, {
      method,
      headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json', 'User-Agent': 'MADE-NEW' },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20_000),
    });
    if (res.status === 404) return null;
    if (!res.ok) {
      const err = new ProviderHttpError(res.status, `Printify ${res.status}`);
      if (!err.retryable) throw new PermanentJobError(err.message);
      throw err;
    }
    return (await res.json()) as T;
  }
  return {
    name: 'printify',
    async createOrGetProduct(p: PodProductInput) {
      if (!cfg.blueprintId || !cfg.printProviderId) throw new PermanentJobError('Printify blueprint and print provider must be configured');
      const upload = await req<{ id: string }>('POST', '/uploads/images.json', { file_name: `${p.externalId}.png`, url: p.artworkUrl });
      const created = await req<{ id: string }>('POST', `/shops/${cfg.shopId}/products.json`, {
        title: p.title,
        description: `ref:${p.externalId}`,
        blueprint_id: cfg.blueprintId,
        print_provider_id: cfg.printProviderId,
        variants: p.variants.map((v) => ({ id: v.catalogVariantId, price: Math.round(Number(v.retailPrice) * 100), is_enabled: true })),
        print_areas: [{ variant_ids: p.variants.map((v) => v.catalogVariantId), placeholders: [{ position: 'front', images: [{ id: upload!.id, x: 0.5, y: 0.5, scale: 1, angle: 0 }] }] }],
      });
      return { providerProductId: created!.id };
    },
    async submitOrder(o: PodOrderInput) {
      const created = await req<{ id: string }>('POST', `/shops/${cfg.shopId}/orders.json`, {
        external_id: o.externalId,
        line_items: o.items.map((i) => ({ sku: i.syncVariantExternalId, quantity: i.quantity })),
        shipping_method: 1,
        address_to: { first_name: o.recipient.name, address1: o.recipient.address1, address2: o.recipient.address2, city: o.recipient.city, zip: o.recipient.zip, country: o.recipient.countryCode, email: o.recipient.email },
      });
      return { providerOrderId: created!.id, status: 'pending' };
    },
    async getOrder() {
      return null;
    },
  };
}
