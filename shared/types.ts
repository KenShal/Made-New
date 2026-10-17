import type { Currency, Money } from './money';
import type { DesignStatus } from './lifecycle';

export type Role = 'shopper' | 'creator' | 'reviewer' | 'admin' | 'finance';

export type Size = 'XS' | 'S' | 'M' | 'L' | 'XL' | 'XXL';
export const SIZES: readonly Size[] = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];

export interface GarmentColour {
  id: string;
  name: string;
  hex: string;
  /** Ink colour that keeps the artwork legible on this garment. */
  ink: string;
}

export type ArtworkStyle = 'stack' | 'verse' | 'mark' | 'script' | 'arc' | 'block';

/** Vector artwork description rendered by the SVG mockup. Lettering is never regenerated. */
export interface Artwork {
  style: ArtworkStyle;
  lines: string[];
  accent?: string;
  /** Uploaded artwork, served via signed URL, takes precedence over vector artwork. */
  imageUrl?: string;
}

export interface Variant {
  id: string; // Shopify variant GID in production
  size: Size;
  colourId: string;
  available: boolean;
  price: Money;
}

export interface Product {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: 'tee' | 'heavyweight' | 'longsleeve' | 'crewneck';
  price: Money; // "from" price, authoritative per-variant price lives on Variant
  colours: GarmentColour[];
  variants: Variant[];
  artwork: Artwork;
  backArtwork?: Artwork;
  creatorId: string;
  campaignId?: string;
  collectionSlugs: string[];
  scripture?: string;
  story: string;
  createdAt: string;
  unitsSold: number;
  shippingNote: string;
  /** True when sourced from the bundled sample catalogue rather than Shopify. */
  sample: boolean;
}

export interface Creator {
  id: string;
  handle: string;
  displayName: string;
  kind: 'individual' | 'organisation';
  location: string;
  bio: string;
  avatarHue: number;
}

export interface Campaign {
  id: string;
  slug: string;
  title: string;
  beneficiary: string;
  creatorId: string;
  description: string;
  intendedUse: string;
  goal: Money;
  /** Only populated from the verified ledger. Null means "not yet verified". */
  raisedVerified: Money | null;
  endsAt?: string;
  status: 'draft' | 'submitted' | 'approved' | 'live' | 'ended';
  sample: boolean;
}

export interface Collection {
  slug: string;
  title: string;
  description: string;
}

export interface ReviewEvent {
  id: string;
  at: string;
  actorName: string;
  from: DesignStatus | null;
  to: DesignStatus;
  reason?: string;
  internal?: boolean;
}

export interface ValidationResult {
  check: string;
  passed: boolean;
  detail: string;
}

export interface DesignSubmission {
  id: string;
  creatorId: string;
  title: string;
  description: string;
  category: Product['category'];
  colourIds: string[];
  productTypes: Product['category'][];
  suggestedPrice: Money;
  scripture?: string;
  artwork: Artwork;
  backArtwork?: Artwork;
  campaign?: {
    name: string;
    goal: Money;
    beneficiary: string;
    intendedUse: string;
    description: string;
    endsAt?: string;
  };
  status: DesignStatus;
  ownershipConfirmed: boolean;
  policyAccepted: boolean;
  validation: ValidationResult[];
  history: ReviewEvent[];
  internalNotes: { at: string; author: string; body: string }[];
  productId?: string;
  shopifyProductId?: string;
  updatedAt: string;
  unitsSold: number;
  earnings: Money;
}

export interface SalesPoint {
  date: string;
  units: number;
  gross: number;
  earnings: number;
}

export interface EarningsBreakdown {
  currency: Currency;
  gross: number;
  taxes: number;
  production: number;
  shipping: number;
  platformFees: number;
  paymentFees: number;
  refunds: number;
  campaignContributions: number;
  net: number;
  pending: number;
  paidOut: number;
  policyVersion: string;
}

export interface LedgerEntry {
  id: string;
  at: string;
  kind: 'sale' | 'refund' | 'adjustment' | 'payout';
  description: string;
  amount: number;
  currency: Currency;
  status: 'pending' | 'eligible' | 'paid' | 'reversed';
  policyVersion: string;
}

export interface Order {
  id: string;
  shopifyOrderId: string;
  createdAt: string;
  customerInitials: string;
  total: Money;
  status: 'paid' | 'fulfilled' | 'partially_refunded' | 'refunded' | 'fulfilment_error';
  items: number;
}

export interface IntegrationJob {
  id: string;
  kind: 'shopify.product.create' | 'pod.product.create' | 'pod.order.submit' | 'webhook.orders.paid';
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  attempts: number;
  idempotencyKey: string;
  lastError?: string;
  updatedAt: string;
}

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  roles: Role[];
  status: 'active' | 'suspended';
  createdAt: string;
  designs: number;
  reports: number;
}
