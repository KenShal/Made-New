import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Env } from '../env';
import type { Role } from '@shared/types';
import type { Job, JobStore } from '../domain/jobs';
import type { NewLedgerEntry } from '../domain/ledger';
import type { AssetRecord, DesignRecord, OrderItemRecord, OrderRecord, Repo, StoredLedgerEntry, UserRecord } from './types';

/**
 * Supabase-backed repository using the service role. The service role bypasses
 * RLS, so every call here is reached only after the service layer has
 * authorised the principal. Browser clients use the anon key and remain fully
 * subject to RLS. Ledger, review history and audit tables are append-only at
 * the database level regardless of role.
 */
export function supabaseRepo(env: Env): Repo {
  const db: SupabaseClient = createClient(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });

  const must = <T>(r: { data: T | null; error: { message: string } | null }): T => {
    if (r.error) throw new Error(`Database error: ${r.error.message}`);
    return r.data as T;
  };

  const toDesign = (r: Record<string, unknown>): DesignRecord => ({
    id: r.id as string,
    creatorId: r.creator_id as string,
    title: r.title as string,
    description: r.description as string,
    category: r.category as DesignRecord['category'],
    colourIds: r.colour_ids as string[],
    productTypes: r.product_types as string[],
    suggestedPrice: { amount: r.suggested_price_amount as number, currency: r.currency as 'GBP' },
    scripture: r.scripture as string | null,
    artwork: r.artwork,
    backArtwork: r.back_artwork,
    frontAssetId: r.front_asset_id as string | null,
    backAssetId: r.back_asset_id as string | null,
    status: r.status as DesignRecord['status'],
    ownershipConfirmed: r.ownership_confirmed as boolean,
    policyAccepted: r.policy_accepted as boolean,
    updatedAt: r.updated_at as string,
  });
  const fromDesign = (d: Partial<DesignRecord>) => ({
    ...(d.title !== undefined && { title: d.title }),
    ...(d.description !== undefined && { description: d.description }),
    ...(d.category !== undefined && { category: d.category }),
    ...(d.colourIds !== undefined && { colour_ids: d.colourIds }),
    ...(d.productTypes !== undefined && { product_types: d.productTypes }),
    ...(d.suggestedPrice !== undefined && { suggested_price_amount: d.suggestedPrice.amount, currency: d.suggestedPrice.currency }),
    ...(d.scripture !== undefined && { scripture: d.scripture }),
    ...(d.artwork !== undefined && { artwork: d.artwork }),
    ...(d.backArtwork !== undefined && { back_artwork: d.backArtwork }),
    ...(d.frontAssetId !== undefined && { front_asset_id: d.frontAssetId }),
    ...(d.backAssetId !== undefined && { back_asset_id: d.backAssetId }),
    ...(d.ownershipConfirmed !== undefined && { ownership_confirmed: d.ownershipConfirmed }),
    ...(d.policyAccepted !== undefined && { policy_accepted: d.policyAccepted }),
  });
  const toLedger = (r: Record<string, unknown>): StoredLedgerEntry => ({
    id: String(r.id),
    createdAt: r.created_at as string,
    entryType: r.entry_type as StoredLedgerEntry['entryType'],
    account: r.account as StoredLedgerEntry['account'],
    creatorId: r.creator_id as string | null,
    campaignId: r.campaign_id as string | null,
    orderItemId: r.order_item_id as string | null,
    amount: Number(r.amount),
    currency: r.currency as 'GBP',
    policyVersion: r.policy_version as string,
    idempotencyKey: r.idempotency_key as string,
    reversesKey: (r.reverses_key as string | undefined) ?? undefined,
    reason: (r.reason as string | null) ?? undefined,
    availableAt: r.available_at as string,
  });
  const toOrderItem = (r: Record<string, unknown>): OrderItemRecord => ({
    id: r.id as string,
    orderId: r.order_id as string,
    shopifyLineItemId: r.shopify_line_item_id as string,
    variantShopifyId: null,
    creatorId: r.creator_id as string | null,
    campaignId: r.campaign_id as string | null,
    quantity: r.quantity as number,
    unitPriceAmount: Number(r.unit_price_amount),
    discountAmount: Number(r.discount_amount),
    taxAmount: Number(r.tax_amount),
    productionCostAmount: Number(r.production_cost_amount),
    currency: r.currency as 'GBP',
  });

  const jobs: JobStore = {
    async enqueue(j) {
      const ins = await db.from('integration_jobs').upsert({ kind: j.kind, idempotency_key: j.idempotencyKey, payload: j.payload }, { onConflict: 'idempotency_key', ignoreDuplicates: true }).select();
      if (ins.error) throw new Error(ins.error.message);
      const row = must(await db.from("integration_jobs").select("*").eq("idempotency_key", j.idempotencyKey).single()) as Record<string, unknown>;
      return toJob(row);
    },
    async claimReady(now, limit) {
      // Claim via conditional update so two workers never take the same job.
      const ready = must(await db.from('integration_jobs').select('id').eq('status', 'queued').lte('run_after', now).limit(limit)) as { id: string }[];
      const claimed: Job[] = [];
      for (const r of ready) {
        const u = await db.from('integration_jobs').update({ status: 'running', locked_at: now }).eq('id', r.id).eq('status', 'queued').select().maybeSingle();
        if (u.data) claimed.push(toJob(u.data));
      }
      return claimed;
    },
    async complete(id, result) {
      const cur = must(await db.from('integration_jobs').select('attempts').eq('id', id).single()) as { attempts: number };
      must(await db.from('integration_jobs').update({ status: 'succeeded', result, attempts: cur.attempts + 1, locked_at: null }).eq('id', id));
    },
    async fail(id, error, retryAt) {
      const cur = must(await db.from('integration_jobs').select('attempts, max_attempts').eq('id', id).single()) as { attempts: number; max_attempts: number };
      const attempts = cur.attempts + 1;
      must(await db.from('integration_jobs').update({ status: retryAt ? 'queued' : attempts >= cur.max_attempts ? 'dead' : 'failed', last_error: error, attempts, run_after: retryAt ?? undefined, locked_at: null }).eq('id', id));
    },
    async get(id) {
      const r = await db.from('integration_jobs').select('*').eq('id', id).maybeSingle();
      return r.data ? toJob(r.data) : null;
    },
    async list(limit) {
      return (must(await db.from('integration_jobs').select('*').order('updated_at', { ascending: false }).limit(limit)) as Record<string, unknown>[]).map(toJob);
    },
    async requeue(id) {
      const r = must(await db.from('integration_jobs').update({ status: 'queued', run_after: new Date().toISOString() }).eq('id', id).in('status', ['failed', 'dead']).select().single()) as Record<string, unknown>;
      return toJob(r);
    },
  };

  return {
    jobs,
    async loadUser(t) {
      const p = await db.from('profiles').select('id, display_name, status').eq('id', t.userId).maybeSingle();
      if (!p.data) return null;
      const roles = (must(await db.from('user_roles').select('role').eq('user_id', t.userId)) as { role: Role }[]).map((r) => r.role);
      const cr = await db.from('creator_profiles').select('id').eq('user_id', t.userId).eq('status', 'active').maybeSingle();
      return { id: t.userId, name: p.data.display_name, email: t.email, roles, status: p.data.status, creatorId: cr.data?.id ?? null } satisfies UserRecord;
    },
    async createCreatorProfile(userId, i) {
      const existing = await db.from('creator_profiles').select('id').eq('user_id', userId).maybeSingle();
      if (existing.data) return existing.data.id as string;
      const row = must(await db.from('creator_profiles').insert({ user_id: userId, handle: i.handle, display_name: i.displayName, kind: i.kind, location: i.location, bio: i.bio, purpose: i.purpose, terms_version: i.termsVersion, terms_accepted_at: new Date().toISOString() }).select('id').single()) as { id: string };
      if (i.organisationName) must(await db.from('creator_private').insert({ creator_id: row.id, organisation_legal_name: i.organisationName }));
      must(await db.rpc('grant_role', { p_user: userId, p_role: 'creator', p_granted_by: userId }));
      return row.id;
    },
    async listDesignsByCreator(creatorId) {
      return (must(await db.from('design_submissions').select('*').eq('creator_id', creatorId).neq('status', 'archived').order('updated_at', { ascending: false })) as Record<string, unknown>[]).map(toDesign);
    },
    async listDesignsByStatus(statuses) {
      return (must(await db.from('design_submissions').select('*').in('status', statuses).order('updated_at')) as Record<string, unknown>[]).map(toDesign);
    },
    async getDesign(id) {
      const r = await db.from('design_submissions').select('*').eq('id', id).maybeSingle();
      return r.data ? toDesign(r.data) : null;
    },
    async createDesign(creatorId, input) {
      return toDesign(must(await db.from('design_submissions').insert({ creator_id: creatorId, ...fromDesign(input) }).select().single()));
    },
    async updateDesign(id, input) {
      return toDesign(must(await db.from('design_submissions').update(fromDesign(input)).eq('id', id).select().single()));
    },
    async setDesignStatus(id, from, to, actor, reason) {
      // Atomic: status + review event in one database function, guarded by the expected current status.
      const r = must(await db.rpc('service_set_design_status', { p_id: id, p_from: from, p_to: to, p_actor: actor.id, p_reason: reason }));
      return toDesign(r as Record<string, unknown>);
    },
    async reviewEvents(id) {
      const rows = must(await db.from('review_events').select('id, created_at, actor_id, from_status, to_status, reason, profiles(display_name)').eq('submission_id', id).order('created_at')) as Record<string, unknown>[];
      return rows.map((r) => ({ id: String(r.id), at: r.created_at as string, actorId: r.actor_id as string | null, actorName: ((r.profiles as { display_name?: string } | null)?.display_name) ?? 'System', from: r.from_status as DesignRecord['status'] | null, to: r.to_status as DesignRecord['status'], reason: r.reason as string | null }));
    },
    async addReviewNote(id, authorId, body) {
      must(await db.from('review_notes').insert({ submission_id: id, author_id: authorId, body }));
    },
    async reviewNotes(id) {
      const rows = must(await db.from('review_notes').select('created_at, body, profiles(display_name)').eq('submission_id', id).order('created_at')) as Record<string, unknown>[];
      return rows.map((r) => ({ at: r.created_at as string, body: r.body as string, author: (r.profiles as { display_name?: string } | null)?.display_name ?? 'Reviewer' }));
    },
    async getAsset(id) {
      const r = await db.from('artwork_assets').select('*').eq('id', id).maybeSingle();
      if (!r.data) return null;
      const a = r.data;
      return { id: a.id, creatorId: a.creator_id, storagePath: a.storage_path, mimeType: 'image/png', bytes: a.bytes, width: a.width, height: a.height, sha256: a.sha256, scanStatus: a.scan_status, validation: a.validation, validationPassed: a.validation_passed } satisfies AssetRecord;
    },
    async saveAsset(a, bytes) {
      const up = await db.storage.from('artwork-private').upload(a.storagePath, bytes, { contentType: 'image/png', upsert: false });
      if (up.error) throw new Error('Storage upload failed');
      const row = must(await db.from('artwork_assets').insert({ creator_id: a.creatorId, storage_path: a.storagePath, mime_type: a.mimeType, bytes: a.bytes, width: a.width, height: a.height, sha256: a.sha256, scan_status: a.scanStatus, validation: a.validation, validation_passed: a.validationPassed }).select('id').single()) as { id: string };
      return { ...a, id: row.id };
    },
    async signedAssetUrl(path, ttl) {
      const r = await db.storage.from('artwork-private').createSignedUrl(path, ttl);
      if (r.error || !r.data) throw new Error('Could not sign URL');
      return r.data.signedUrl;
    },
    async recordWebhookEvent(provider, eventId, topic) {
      const existing = await db.from('webhook_events').select('processed_at').eq('provider', provider).eq('event_id', eventId).maybeSingle();
      if (existing.data?.processed_at) return 'processed';
      if (!existing.data) await db.from('webhook_events').upsert({ provider, event_id: eventId, topic }, { onConflict: 'provider,event_id', ignoreDuplicates: true });
      return 'new';
    },
    async markWebhookProcessed(provider, eventId) {
      must(await db.from('webhook_events').update({ processed_at: new Date().toISOString() }).eq('provider', provider).eq('event_id', eventId));
    },
    async variantMappings(ids) {
      if (!ids.length) return [];
      const rows = must(await db.from('product_variants').select('shopify_variant_id, product_id, production_cost_amount, products(creator_id, campaign_id)').in('shopify_variant_id', ids)) as Record<string, unknown>[];
      return rows.map((r) => {
        const p = r.products as { creator_id: string; campaign_id: string | null };
        return { shopifyVariantId: r.shopify_variant_id as string, productId: r.product_id as string, creatorId: p.creator_id, campaignId: p.campaign_id, productionCostAmount: r.production_cost_amount as number };
      });
    },
    async upsertOrder(order, items) {
      const o = must(await db.from('orders').upsert({ shopify_order_id: order.shopifyOrderId, order_number: order.orderNumber, currency: order.currency, total_amount: order.totalAmount, tax_amount: order.taxAmount, financial_status: order.financialStatus, processed_at: order.processedAt, customer_ref: order.customerRef }, { onConflict: 'shopify_order_id' }).select().single()) as Record<string, unknown>;
      const its = must(await db.from('order_items').upsert(items.map((i) => ({ order_id: o.id, shopify_line_item_id: i.shopifyLineItemId, creator_id: i.creatorId, campaign_id: i.campaignId, quantity: i.quantity, unit_price_amount: i.unitPriceAmount, discount_amount: i.discountAmount, tax_amount: i.taxAmount, production_cost_amount: i.productionCostAmount, currency: i.currency })), { onConflict: 'shopify_line_item_id', ignoreDuplicates: false }).select()) as Record<string, unknown>[];
      return { order: { id: o.id as string, shopifyOrderId: order.shopifyOrderId, orderNumber: order.orderNumber, currency: order.currency, totalAmount: order.totalAmount, taxAmount: order.taxAmount, financialStatus: order.financialStatus, processedAt: order.processedAt, customerRef: order.customerRef } satisfies OrderRecord, items: its.map(toOrderItem) };
    },
    async orderItemsByShopifyLineIds(ids) {
      return (must(await db.from('order_items').select('*').in('shopify_line_item_id', ids)) as Record<string, unknown>[]).map(toOrderItem);
    },
    async insertLedgerEntries(entries: NewLedgerEntry[]) {
      if (!entries.length) return 0;
      // Resolve reversal references to row ids, then insert ignoring duplicate idempotency keys.
      const keys = entries.map((e) => e.reversesKey).filter(Boolean) as string[];
      const refs = keys.length ? ((must(await db.from('ledger_entries').select('id, idempotency_key').in('idempotency_key', keys)) as { id: number; idempotency_key: string }[])) : [];
      const rows = entries.map((e) => ({ entry_type: e.entryType, account: e.account, creator_id: e.creatorId, campaign_id: e.campaignId, order_item_id: e.orderItemId, amount: e.amount, currency: e.currency, policy_version: e.policyVersion, idempotency_key: e.idempotencyKey, reverses_entry_id: refs.find((r) => r.idempotency_key === e.reversesKey)?.id ?? null, reason: e.reason ?? null, created_by: e.createdBy ?? null, available_at: e.availableAt }));
      const r = must(await db.from('ledger_entries').upsert(rows, { onConflict: 'idempotency_key', ignoreDuplicates: true }).select('id')) as unknown[];
      return r.length;
    },
    async ledgerByKeyPrefix(prefixes) {
      if (!prefixes.length) return [];
      const filter = prefixes.map((p) => `idempotency_key.like.${p.replace(/[,()%_]/g, '')}%`).join(',');
      return (must(await db.from('ledger_entries').select('*, reverses:reverses_entry_id(idempotency_key)').or(filter)) as Record<string, unknown>[]).map((r) => ({ ...toLedger(r), reversesKey: (r.reverses as { idempotency_key?: string } | null)?.idempotency_key }));
    },
    async ledgerReversing(keys) {
      if (!keys.length) return [];
      const ids = (must(await db.from('ledger_entries').select('id').in('idempotency_key', keys)) as { id: number }[]).map((r) => r.id);
      if (!ids.length) return [];
      return (must(await db.from('ledger_entries').select('*, reverses:reverses_entry_id(idempotency_key)').in('reverses_entry_id', ids)) as Record<string, unknown>[]).map((r) => ({ ...toLedger(r), reversesKey: (r.reverses as { idempotency_key?: string } | null)?.idempotency_key }));
    },
    async ledgerForCreator(creatorId) {
      return (must(await db.from('ledger_entries').select('*').eq('account', 'creator').eq('creator_id', creatorId).order('created_at', { ascending: false }).limit(500)) as Record<string, unknown>[]).map(toLedger);
    },
    async ledgerAttributedToCreator(creatorId) {
      return (must(await db.from('ledger_entries').select('*').eq('creator_id', creatorId).order('created_at', { ascending: false }).limit(5000)) as Record<string, unknown>[]).map(toLedger);
    },
    async ledgerSince(iso) {
      return (must(await db.from('ledger_entries').select('*').gte('created_at', iso).limit(20000)) as Record<string, unknown>[]).map(toLedger);
    },
    async orderItemsByOrderIds(ids) {
      if (!ids.length) return [];
      return (must(await db.from('order_items').select('*').in('order_id', ids)) as Record<string, unknown>[]).map(toOrderItem);
    },
    async orderItemsForCreator(creatorId) {
      const rows = must(await db.from('order_items').select('*, orders!inner(processed_at)').eq('creator_id', creatorId).limit(5000)) as Record<string, unknown>[];
      return rows.map((r) => ({ ...toOrderItem(r), processedAt: (r.orders as { processed_at: string }).processed_at }));
    },
    async listUsers(q) {
      let query = db.from('profiles').select('id, display_name, status, created_at, user_roles(role), creator_profiles(id)').limit(100);
      if (q) query = query.ilike('display_name', `%${q.replace(/[%_]/g, '')}%`);
      const rows = must(await query) as Record<string, unknown>[];
      return rows.map((r) => ({ id: r.id as string, name: r.display_name as string, email: '', roles: ((r.user_roles as { role: Role }[]) ?? []).map((x) => x.role), status: r.status as 'active', creatorId: ((r.creator_profiles as { id: string }[] | null) ?? [])[0]?.id ?? null, createdAt: r.created_at as string }));
    },
    async setUserStatus(id, status) {
      must(await db.from('profiles').update({ status }).eq('id', id));
      return (await this.listUsers('')).find((u) => u.id === id)!;
    },
    async listOrders(limit) {
      const rows = must(await db.from('orders').select('*, order_items(quantity)').order('processed_at', { ascending: false }).limit(limit)) as Record<string, unknown>[];
      return rows.map((r) => ({ id: r.id as string, shopifyOrderId: r.shopify_order_id as string, orderNumber: r.order_number as string, currency: r.currency as 'GBP', totalAmount: Number(r.total_amount), taxAmount: Number(r.tax_amount), financialStatus: r.financial_status as string, processedAt: r.processed_at as string, customerRef: null, itemCount: ((r.order_items as { quantity: number }[] | null) ?? []).reduce((n, i) => n + i.quantity, 0) }));
    },
    async listPayouts() {
      const rows = must(await db.from('payouts').select('*').order('created_at', { ascending: false }).limit(200)) as Record<string, unknown>[];
      return rows.map((r) => ({ id: r.id as string, creatorId: r.creator_id as string, amount: Number(r.amount), currency: r.currency as 'GBP', status: r.status as 'pending', approvedBy: r.approved_by as string | null, holdReason: r.hold_reason as string | null }));
    },
    async approvePayout(id, approverId) {
      const r = must(await db.from('payouts').update({ status: 'approved', approved_by: approverId, approved_at: new Date().toISOString() }).eq('id', id).eq('status', 'pending').select().single()) as Record<string, unknown>;
      return { id: r.id as string, creatorId: r.creator_id as string, amount: Number(r.amount), currency: r.currency as 'GBP', status: 'approved', approvedBy: approverId };
    },
    async saveProductMapping(i) {
      const p = must(await db.from('products').upsert({ submission_id: i.submissionId, creator_id: i.creatorId, slug: i.slug, title: i.title, shopify_product_id: i.shopifyProductId, status: 'active', published_at: new Date().toISOString() }, { onConflict: 'submission_id' }).select('id').single()) as { id: string };
      must(await db.from('product_variants').upsert(i.variants.map((v) => ({ product_id: p.id, shopify_variant_id: v.shopifyVariantId, size: v.size, colour_id: v.colourId, price_amount: v.priceAmount, production_cost_amount: v.productionCostAmount })), { onConflict: 'shopify_variant_id' }));
      return p.id;
    },
    async audit(actorId, action, entityType, entityId, metadata = {}) {
      must(await db.from('audit_logs').insert({ actor_id: actorId, action, entity_type: entityType, entity_id: entityId, metadata }));
    },
    async publicCampaigns() {
      const rows = must(await db.from('campaigns').select('id, slug, title, beneficiary, description, intended_use, goal_amount, currency, ends_at, status, creator_id, campaign_totals(raised_amount)').in('status', ['live', 'ended'])) as Record<string, unknown>[];
      return rows.map((r) => ({ id: r.id, slug: r.slug, title: r.title, beneficiary: r.beneficiary, description: r.description, intendedUse: r.intended_use, creatorId: r.creator_id, goal: { amount: Number(r.goal_amount), currency: r.currency }, raisedVerified: { amount: Number((r.campaign_totals as { raised_amount: number }[] | null)?.[0]?.raised_amount ?? 0), currency: r.currency }, endsAt: r.ends_at, status: r.status, sample: false }));
    },
  };
}

function toJob(r: Record<string, unknown>): Job {
  return { id: r.id as string, kind: r.kind as string, idempotencyKey: r.idempotency_key as string, status: r.status as Job['status'], attempts: r.attempts as number, maxAttempts: r.max_attempts as number, payload: r.payload, result: r.result, lastError: (r.last_error as string | null) ?? undefined, runAfter: r.run_after as string };
}
