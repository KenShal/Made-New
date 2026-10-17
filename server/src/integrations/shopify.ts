import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { PermanentJobError } from '../domain/jobs';

/**
 * Verify a Shopify webhook: HMAC-SHA256 of the RAW request body with the app's
 * webhook secret, base64-encoded, compared in constant time.
 * https://shopify.dev/docs/apps/build/webhooks/subscribe/https#step-5-verify-the-webhook
 */
export function verifyShopifyWebhook(rawBody: Buffer | string, hmacHeader: string | null | undefined, secret: string): boolean {
  if (!hmacHeader || !secret) return false;
  const digest = createHmac('sha256', secret).update(rawBody).digest();
  let provided: Buffer;
  try {
    provided = Buffer.from(hmacHeader, 'base64');
  } catch {
    return false;
  }
  if (provided.length !== digest.length) return false;
  return timingSafeEqual(provided, digest);
}

const money = z.string().regex(/^-?\d+(\.\d{1,2})?$/);
export function toMinor(amount: string): number {
  const m = /^(-)?(\d+)(?:\.(\d{1,2}))?$/.exec(amount);
  if (!m) throw new Error('Invalid amount');
  const v = Number(m[2]) * 100 + Number((m[3] ?? '').padEnd(2, '0'));
  return m[1] ? -v : v;
}

export const orderPaidSchema = z.object({
  id: z.number().int(),
  admin_graphql_api_id: z.string(),
  name: z.string().max(40),
  currency: z.enum(['GBP', 'USD', 'EUR']),
  financial_status: z.string(),
  processed_at: z.string(),
  total_price: money,
  total_tax: money,
  total_shipping_price_set: z.object({ shop_money: z.object({ amount: money }) }).optional(),
  customer: z.object({ id: z.number() }).nullable().optional(),
  line_items: z
    .array(
      z.object({
        id: z.number().int(),
        variant_id: z.number().int().nullable(),
        product_id: z.number().int().nullable(),
        quantity: z.number().int().positive(),
        price: money,
        total_discount: money,
        tax_lines: z.array(z.object({ price: money })).default([]),
      }),
    )
    .max(250),
});
export type OrderPaid = z.infer<typeof orderPaidSchema>;

export const refundSchema = z.object({
  id: z.number().int(),
  order_id: z.number().int(),
  created_at: z.string(),
  refund_line_items: z.array(z.object({ id: z.number().int(), line_item_id: z.number().int(), quantity: z.number().int().positive() })).max(250),
});
export type RefundCreated = z.infer<typeof refundSchema>;

/** Minimal Admin GraphQL client. The Admin token never leaves the server. */
export function createShopifyAdmin(cfg: { domain: string; token: string; apiVersion: string; fetchImpl?: typeof fetch }) {
  const f = cfg.fetchImpl ?? fetch;
  // Host is fixed from configuration, validated as *.myshopify.com; no user input reaches the URL (SSRF).
  const endpoint = `https://${cfg.domain}/admin/api/${cfg.apiVersion}/graphql.json`;
  async function gql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    const res = await f(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': cfg.token },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(15_000),
    });
    if (res.status === 429 || res.status >= 500) throw new Error(`Shopify ${res.status}`);
    if (!res.ok) throw new PermanentJobError(`Shopify ${res.status}`);
    const json = (await res.json()) as { data?: T; errors?: unknown };
    if (json.errors || !json.data) throw new Error('Shopify GraphQL error');
    return json.data;
  }

  return {
    /** Makes a product visible on a sales channel (e.g. the Headless channel used by the Storefront API). Safe to repeat. */
    async publishToChannel(productId: string, publicationId: string): Promise<void> {
      const data = await gql<{ publishablePublish: { userErrors: { message: string }[] } }>(
        `mutation($id: ID!, $input: [PublicationInput!]!) { publishablePublish(id: $id, input: $input) { userErrors { message } } }`,
        { id: productId, input: [{ publicationId }] },
      );
      if (data.publishablePublish.userErrors.length) throw new PermanentJobError(data.publishablePublish.userErrors[0]!.message);
    },
    /** Idempotent: looks up by our handle first, so a retried job never creates a duplicate product. */
    async upsertProduct(input: {
      handle: string;
      title: string;
      descriptionHtml: string;
      productType: string;
      tags: string[];
      metafields: { key: string; value: string; type: string }[];
      variants: { size: string; colour: string; price: string; sku: string }[];
      imageUrl?: string;
    }): Promise<{ productId: string; variants: { id: string; sku: string }[] }> {
      const existing = await gql<{ productByHandle: { id: string; variants: { nodes: { id: string; sku: string }[] } } | null }>(
        `query($h: String!) { productByHandle(handle: $h) { id variants(first: 100) { nodes { id sku } } } }`,
        { h: input.handle },
      );
      if (existing.productByHandle) return { productId: existing.productByHandle.id, variants: existing.productByHandle.variants.nodes };

      const data = await gql<{ productSet: { product: { id: string; variants: { nodes: { id: string; sku: string }[] } } | null; userErrors: { message: string }[] } }>(
        `mutation($input: ProductSetInput!) { productSet(synchronous: true, input: $input) { product { id variants(first: 100) { nodes { id sku } } } userErrors { message } } }`,
        {
          input: {
            handle: input.handle,
            title: input.title,
            descriptionHtml: input.descriptionHtml,
            productType: input.productType,
            tags: input.tags,
            status: 'ACTIVE',
            metafields: input.metafields.map((m) => ({ namespace: 'made_new', ...m })),
            productOptions: [
              { name: 'Colour', values: [...new Set(input.variants.map((v) => v.colour))].map((name) => ({ name })) },
              { name: 'Size', values: [...new Set(input.variants.map((v) => v.size))].map((name) => ({ name })) },
            ],
            variants: input.variants.map((v) => ({
              optionValues: [{ optionName: 'Colour', name: v.colour }, { optionName: 'Size', name: v.size }],
              price: v.price,
              sku: v.sku,
              inventoryPolicy: 'CONTINUE', // print on demand: no stock limit
            })),
          },
        },
      );
      if (!data.productSet.product || data.productSet.userErrors.length) throw new PermanentJobError(data.productSet.userErrors[0]?.message ?? 'productSet failed');
      return { productId: data.productSet.product.id, variants: data.productSet.product.variants.nodes };
    },
  };
}
export type ShopifyAdmin = ReturnType<typeof createShopifyAdmin>;
