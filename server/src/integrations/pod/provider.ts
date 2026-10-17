/**
 * Print-on-demand provider adapter. Implementations must be idempotent using
 * `externalId` (our stable reference), because jobs may be retried after a
 * network failure where the remote side already succeeded.
 *
 * Nothing here is assumed to work until credentials, store linkage and
 * product/variant mappings have been verified against the provider account
 * (see docs/DEPLOYMENT.md, "Print-on-demand").
 */
export interface PodProductInput {
  externalId: string; // e.g. our product id
  title: string;
  artworkUrl: string; // short-lived signed URL to the re-encoded PNG
  backArtworkUrl?: string;
  variants: { externalId: string; catalogVariantId: number; retailPrice: string }[];
}

export interface PodOrderInput {
  externalId: string; // Shopify order id
  recipient: { name: string; address1: string; address2?: string; city: string; zip: string; countryCode: string; email?: string };
  items: { syncVariantExternalId: string; quantity: number }[];
}

export interface PodProvider {
  readonly name: 'printful' | 'printify';
  createOrGetProduct(input: PodProductInput): Promise<{ providerProductId: string }>;
  submitOrder(input: PodOrderInput): Promise<{ providerOrderId: string; status: string }>;
  getOrder(externalId: string): Promise<{ providerOrderId: string; status: string; trackingUrl?: string } | null>;
}

export class ProviderHttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
  get retryable() {
    return this.status === 429 || this.status >= 500;
  }
}
