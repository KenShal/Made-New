import type { Env } from './env';
import type { Logger } from './logger';
import type { Repo } from './repo/types';
import { PermanentJobError, type JobHandler } from './domain/jobs';
import { createShopifyAdmin } from './integrations/shopify';
import { createPrintful } from './integrations/pod/printful';
import { createPrintify } from './integrations/pod/printify';
import type { PodProvider } from './integrations/pod/provider';
import { SIZES } from '@shared/types';

/** Production cost table (minor units) per category; replace with provider catalogue pricing once verified. */
export const PRODUCTION_COST: Record<string, number> = { tee: 1150, heavyweight: 1290, longsleeve: 1450, crewneck: 2200 };

export function podProvider(env: Env): PodProvider | null {
  if (env.POD_PROVIDER === 'printful' && env.PRINTFUL_API_TOKEN) return createPrintful({ token: env.PRINTFUL_API_TOKEN, storeId: env.PRINTFUL_STORE_ID });
  if (env.POD_PROVIDER === 'printify' && env.PRINTIFY_API_TOKEN && env.PRINTIFY_SHOP_ID) return createPrintify({ token: env.PRINTIFY_API_TOKEN, shopId: env.PRINTIFY_SHOP_ID });
  return null;
}

/**
 * Job handlers. Each is idempotent against its provider:
 *  - Shopify products are looked up by handle before creation.
 *  - POD products/orders use our external ids.
 *  - The submission only moves to "published" after Shopify confirms.
 */
export function createHandlers(env: Env, repo: Repo, log: Logger): Record<string, JobHandler> {
  return {
    'shopify.product.create': async (job) => {
      if (!env.SHOPIFY_STORE_DOMAIN || !env.SHOPIFY_ADMIN_ACCESS_TOKEN) throw new PermanentJobError('Shopify Admin API is not configured');
      const { submissionId, requestedBy } = job.payload as { submissionId: string; requestedBy: string };
      const d = await repo.getDesign(submissionId);
      if (!d) throw new PermanentJobError('Submission not found');
      if (d.status === 'published') return { alreadyPublished: true };
      if (d.status !== 'approved') throw new PermanentJobError(`Submission is ${d.status}, not approved`);
      const shopify = createShopifyAdmin({ domain: env.SHOPIFY_STORE_DOMAIN, token: env.SHOPIFY_ADMIN_ACCESS_TOKEN, apiVersion: env.SHOPIFY_API_VERSION });
      const slug = `${d.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}-${d.id.slice(0, 8)}`;
      const price = (d.suggestedPrice.amount / 100).toFixed(2);
      const variants = d.colourIds.flatMap((colour) => SIZES.map((size) => ({ size, colour, price, sku: `MN-${d.id.slice(0, 8)}-${colour}-${size}`.toUpperCase() })));
      const created = await shopify.upsertProduct({
        handle: slug,
        title: d.title,
        descriptionHtml: `<p>${escapeHtml(d.description)}</p>`,
        productType: d.category,
        tags: ['made-new', `creator:${d.creatorId}`],
        metafields: [
          { key: 'creator_id', value: d.creatorId, type: 'single_line_text_field' },
          { key: 'artwork', value: JSON.stringify(d.artwork), type: 'json' },
          ...(d.scripture ? [{ key: 'scripture', value: d.scripture, type: 'single_line_text_field' }] : []),
        ],
        variants,
      });
      if (env.SHOPIFY_PUBLICATION_ID) await shopify.publishToChannel(created.productId, env.SHOPIFY_PUBLICATION_ID);
      else log.warn('SHOPIFY_PUBLICATION_ID not set: product created but not published to a sales channel', { submissionId: d.id });
      await repo.saveProductMapping({
        submissionId: d.id,
        creatorId: d.creatorId,
        slug,
        title: d.title,
        shopifyProductId: created.productId,
        variants: created.variants.map((v) => {
          const parts = v.sku.split('-');
          return { shopifyVariantId: v.id, sku: v.sku, size: parts.at(-1) ?? 'M', colourId: (parts.at(-2) ?? '').toLowerCase(), priceAmount: d.suggestedPrice.amount, productionCostAmount: PRODUCTION_COST[d.category] ?? 1290 };
        }),
      });
      await repo.setDesignStatus(d.id, 'approved', 'published', { id: requestedBy, name: 'Publishing service' }, null);
      await repo.jobs.enqueue({ kind: 'pod.product.create', idempotencyKey: `pod-product:${d.id}`, payload: { submissionId: d.id } });
      log.info('product published', { submissionId: d.id, shopifyProductId: created.productId });
      return { shopifyProductId: created.productId };
    },
    'pod.product.create': async (job) => {
      const pod = podProvider(env);
      if (!pod) throw new PermanentJobError('Print-on-demand provider is not configured');
      const { submissionId } = job.payload as { submissionId: string };
      const d = await repo.getDesign(submissionId);
      if (!d?.frontAssetId) throw new PermanentJobError('Typographic designs need print files rendered before POD sync');
      const asset = await repo.getAsset(d.frontAssetId);
      if (!asset || asset.scanStatus !== 'clean') throw new PermanentJobError('Artwork is not cleared for printing');
      const url = await repo.signedAssetUrl(asset.storagePath, 3600);
      // catalogVariantId mapping must be configured per provider; see docs/DEPLOYMENT.md.
      const r = await pod.createOrGetProduct({ externalId: d.id, title: d.title, artworkUrl: url, variants: [] });
      return r;
    },
  };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
