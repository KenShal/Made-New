import { PermanentJobError } from '../../domain/jobs';
import { ProviderHttpError, type PodOrderInput, type PodProductInput, type PodProvider } from './provider';

const BASE = 'https://api.printful.com';

/** Printful adapter (REST API). External IDs make every call idempotent. */
export function createPrintful(cfg: { token: string; storeId?: string; fetchImpl?: typeof fetch }): PodProvider {
  const f = cfg.fetchImpl ?? fetch;
  async function req<T>(method: string, path: string, body?: unknown): Promise<T | null> {
    const res = await f(`${BASE}${path}`, {
      method,
      headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json', ...(cfg.storeId ? { 'X-PF-Store-Id': cfg.storeId } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20_000),
    });
    if (res.status === 404) return null;
    if (!res.ok) {
      const err = new ProviderHttpError(res.status, `Printful ${res.status}`);
      if (!err.retryable) throw new PermanentJobError(err.message);
      throw err;
    }
    return ((await res.json()) as { result: T }).result;
  }
  return {
    name: 'printful',
    async createOrGetProduct(p: PodProductInput) {
      const existing = await req<{ sync_product: { id: number } }>('GET', `/store/products/@${encodeURIComponent(p.externalId)}`);
      if (existing) return { providerProductId: String(existing.sync_product.id) };
      const created = await req<{ id: number }>('POST', '/store/products', {
        sync_product: { external_id: p.externalId, name: p.title },
        sync_variants: p.variants.map((v) => ({
          external_id: v.externalId,
          variant_id: v.catalogVariantId,
          retail_price: v.retailPrice,
          files: [{ type: 'front', url: p.artworkUrl }, ...(p.backArtworkUrl ? [{ type: 'back', url: p.backArtworkUrl }] : [])],
        })),
      });
      return { providerProductId: String(created!.id) };
    },
    async submitOrder(o: PodOrderInput) {
      const existing = await req<{ id: number; status: string }>('GET', `/orders/@${encodeURIComponent(o.externalId)}`);
      if (existing) return { providerOrderId: String(existing.id), status: existing.status };
      const created = await req<{ id: number; status: string }>('POST', '/orders?confirm=true', {
        external_id: o.externalId,
        recipient: { name: o.recipient.name, address1: o.recipient.address1, address2: o.recipient.address2, city: o.recipient.city, zip: o.recipient.zip, country_code: o.recipient.countryCode, email: o.recipient.email },
        items: o.items.map((i) => ({ external_variant_id: i.syncVariantExternalId, quantity: i.quantity })),
      });
      return { providerOrderId: String(created!.id), status: created!.status };
    },
    async getOrder(externalId) {
      const o = await req<{ id: number; status: string; shipments?: { tracking_url: string }[] }>('GET', `/orders/@${encodeURIComponent(externalId)}`);
      return o ? { providerOrderId: String(o.id), status: o.status, trackingUrl: o.shipments?.[0]?.tracking_url } : null;
    },
  };
}
