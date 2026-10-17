import type { DesignStatus } from '@shared/lifecycle';
import type { Role } from '@shared/types';
import type { Currency } from '@shared/money';
import type { NewLedgerEntry } from '../domain/ledger';
import type { JobStore } from '../domain/jobs';
import type { VerifiedToken } from '../auth';

export interface DesignRecord {
  id: string;
  creatorId: string;
  title: string;
  description: string;
  category: 'tee' | 'heavyweight' | 'longsleeve' | 'crewneck';
  colourIds: string[];
  productTypes: string[];
  suggestedPrice: { amount: number; currency: Currency };
  scripture?: string | null;
  artwork: unknown;
  backArtwork?: unknown;
  frontAssetId?: string | null;
  backAssetId?: string | null;
  campaign?: unknown;
  status: DesignStatus;
  ownershipConfirmed: boolean;
  policyAccepted: boolean;
  updatedAt: string;
}

export interface ReviewEventRecord {
  id: string;
  at: string;
  actorId: string | null;
  actorName: string;
  from: DesignStatus | null;
  to: DesignStatus;
  reason?: string | null;
}

export interface AssetRecord {
  id: string;
  creatorId: string;
  storagePath: string;
  mimeType: 'image/png';
  bytes: number;
  width: number;
  height: number;
  sha256: string;
  scanStatus: 'pending' | 'clean' | 'infected' | 'error';
  validation: { check: string; passed: boolean; detail: string }[];
  validationPassed: boolean;
}

export interface StoredLedgerEntry extends NewLedgerEntry {
  id: string;
  createdAt: string;
}

export interface OrderRecord {
  id: string;
  shopifyOrderId: string;
  orderNumber: string;
  currency: Currency;
  totalAmount: number;
  taxAmount: number;
  financialStatus: string;
  processedAt: string;
  customerRef: string | null;
  itemCount?: number;
}

export interface OrderItemRecord {
  id: string;
  orderId: string;
  shopifyLineItemId: string;
  variantShopifyId: string | null;
  creatorId: string | null;
  campaignId: string | null;
  quantity: number;
  unitPriceAmount: number;
  discountAmount: number;
  taxAmount: number;
  productionCostAmount: number;
  currency: Currency;
}

export interface VariantMapping {
  shopifyVariantId: string;
  productId: string;
  creatorId: string;
  campaignId: string | null;
  productionCostAmount: number;
}

export interface PayoutRecord {
  id: string;
  creatorId: string;
  amount: number;
  currency: Currency;
  status: 'pending' | 'approved' | 'paid' | 'failed' | 'on_hold';
  approvedBy?: string | null;
  holdReason?: string | null;
}

export interface UserRecord {
  id: string;
  name: string;
  email: string;
  roles: Role[];
  status: 'active' | 'suspended';
  creatorId: string | null;
  createdAt?: string;
}

/**
 * Persistence boundary. Implementations: SupabaseRepo (production; user-scoped
 * calls go through RLS) and MemoryRepo (tests, local dev without Supabase).
 * Authorisation decisions live in the service layer, NOT here, so both
 * implementations are subject to the same checks.
 */
export interface Repo {
  jobs: JobStore;

  loadUser(token: VerifiedToken): Promise<UserRecord | null>;
  createCreatorProfile(userId: string, input: { handle: string; displayName: string; kind: 'individual' | 'organisation'; location: string; bio: string; purpose: string; organisationName?: string; termsVersion: string }): Promise<string>;

  listDesignsByCreator(creatorId: string): Promise<DesignRecord[]>;
  listDesignsByStatus(statuses: DesignStatus[]): Promise<DesignRecord[]>;
  getDesign(id: string): Promise<DesignRecord | null>;
  createDesign(creatorId: string, input: Omit<DesignRecord, 'id' | 'creatorId' | 'status' | 'updatedAt'>): Promise<DesignRecord>;
  updateDesign(id: string, input: Partial<Omit<DesignRecord, 'id' | 'creatorId' | 'status' | 'updatedAt'>>): Promise<DesignRecord>;
  /** Persists a status change and its review event atomically. */
  setDesignStatus(id: string, from: DesignStatus, to: DesignStatus, actor: { id: string; name: string }, reason: string | null): Promise<DesignRecord>;
  reviewEvents(designId: string): Promise<ReviewEventRecord[]>;
  addReviewNote(designId: string, authorId: string, body: string): Promise<void>;
  reviewNotes(designId: string): Promise<{ at: string; author: string; body: string }[]>;

  getAsset(id: string): Promise<AssetRecord | null>;
  saveAsset(asset: Omit<AssetRecord, 'id'>, bytes: Buffer): Promise<AssetRecord>;
  signedAssetUrl(storagePath: string, ttlSeconds: number): Promise<string>;

  /**
   * Records a delivery. Returns 'processed' when it was already fully handled
   * (duplicate delivery), otherwise 'new'. A delivery that failed mid-way is
   * re-processed; every downstream write is idempotent.
   */
  recordWebhookEvent(provider: string, eventId: string, topic: string): Promise<'new' | 'processed'>;
  markWebhookProcessed(provider: string, eventId: string): Promise<void>;
  variantMappings(shopifyVariantIds: string[]): Promise<VariantMapping[]>;
  upsertOrder(order: Omit<OrderRecord, 'id'>, items: Omit<OrderItemRecord, 'id' | 'orderId'>[]): Promise<{ order: OrderRecord; items: OrderItemRecord[] }>;
  orderItemsByShopifyLineIds(ids: string[]): Promise<OrderItemRecord[]>;
  /** INSERT ... ON CONFLICT (idempotency_key) DO NOTHING. Returns rows actually inserted. */
  insertLedgerEntries(entries: NewLedgerEntry[]): Promise<number>;
  ledgerByKeyPrefix(prefixes: string[]): Promise<StoredLedgerEntry[]>;
  /** Entries that reverse any of the given sale idempotency keys. */
  ledgerReversing(saleKeys: string[]): Promise<StoredLedgerEntry[]>;
  ledgerForCreator(creatorId: string): Promise<StoredLedgerEntry[]>;
  /** Every account's entries attributed to a creator's products (creator, campaign and platform shares). */
  ledgerAttributedToCreator(creatorId: string): Promise<StoredLedgerEntry[]>;
  ledgerSince(iso: string): Promise<StoredLedgerEntry[]>;
  orderItemsByOrderIds(orderIds: string[]): Promise<OrderItemRecord[]>;
  orderItemsForCreator(creatorId: string): Promise<(OrderItemRecord & { processedAt: string })[]>;

  listUsers(q: string): Promise<UserRecord[]>;
  setUserStatus(id: string, status: 'active' | 'suspended'): Promise<UserRecord>;
  listOrders(limit: number): Promise<OrderRecord[]>;
  listPayouts(): Promise<PayoutRecord[]>;
  approvePayout(id: string, approverId: string): Promise<PayoutRecord>;

  saveProductMapping(input: { submissionId: string; creatorId: string; slug: string; title: string; shopifyProductId: string; variants: { shopifyVariantId: string; sku: string; size: string; colourId: string; priceAmount: number; productionCostAmount: number }[] }): Promise<string>;

  audit(actorId: string | null, action: string, entityType: string, entityId: string, metadata?: Record<string, unknown>): Promise<void>;
  publicCampaigns(): Promise<unknown[]>;
}
