import { randomUUID } from 'node:crypto';
import type { Role } from '@shared/types';
import { memoryJobStore } from '../domain/jobs';
import type { NewLedgerEntry } from '../domain/ledger';
import type { AssetRecord, DesignRecord, OrderItemRecord, OrderRecord, PayoutRecord, Repo, ReviewEventRecord, StoredLedgerEntry, UserRecord, VariantMapping } from './types';

/** In-memory repository for tests and local development without Supabase. */
export function memoryRepo() {
  const users = new Map<string, UserRecord>();
  const designs = new Map<string, DesignRecord>();
  const events = new Map<string, ReviewEventRecord[]>();
  const notes = new Map<string, { at: string; author: string; body: string }[]>();
  const assets = new Map<string, AssetRecord>();
  const objects = new Map<string, Buffer>();
  const webhooks = new Map<string, boolean>();
  const variants = new Map<string, VariantMapping>();
  const orders = new Map<string, OrderRecord>();
  const items = new Map<string, OrderItemRecord>();
  const ledger: StoredLedgerEntry[] = [];
  const payouts = new Map<string, PayoutRecord>();
  const auditLog: { actorId: string | null; action: string; entityType: string; entityId: string; metadata?: Record<string, unknown> }[] = [];
  const jobs = memoryJobStore();
  let ledgerSeq = 0;

  const repo: Repo = {
    jobs,
    async loadUser(t) {
      return users.get(t.userId) ?? null;
    },
    async createCreatorProfile(userId) {
      const u = users.get(userId);
      if (!u) throw new Error('no user');
      if (u.creatorId) return u.creatorId;
      u.creatorId = `cr_${randomUUID()}`;
      if (!u.roles.includes('creator')) u.roles.push('creator');
      return u.creatorId;
    },
    async listDesignsByCreator(creatorId) {
      return [...designs.values()].filter((d) => d.creatorId === creatorId);
    },
    async listDesignsByStatus(statuses) {
      return [...designs.values()].filter((d) => statuses.includes(d.status));
    },
    async getDesign(id) {
      const d = designs.get(id);
      return d ? structuredClone(d) : null;
    },
    async createDesign(creatorId, input) {
      const d: DesignRecord = { ...input, id: randomUUID(), creatorId, status: 'draft', updatedAt: new Date().toISOString() };
      designs.set(d.id, d);
      return structuredClone(d);
    },
    async updateDesign(id, input) {
      const d = designs.get(id)!;
      Object.assign(d, input, { updatedAt: new Date().toISOString() });
      return structuredClone(d);
    },
    async setDesignStatus(id, from, to, actor, reason) {
      const d = designs.get(id)!;
      if (d.status !== from) throw new Error('concurrent modification');
      d.status = to;
      d.updatedAt = new Date().toISOString();
      const list = events.get(id) ?? [];
      list.push({ id: randomUUID(), at: d.updatedAt, actorId: actor.id, actorName: actor.name, from, to, reason });
      events.set(id, list);
      return structuredClone(d);
    },
    async reviewEvents(id) {
      return events.get(id) ?? [];
    },
    async addReviewNote(id, authorId, body) {
      const list = notes.get(id) ?? [];
      list.push({ at: new Date().toISOString(), author: users.get(authorId)?.name ?? authorId, body });
      notes.set(id, list);
    },
    async reviewNotes(id) {
      return notes.get(id) ?? [];
    },
    async getAsset(id) {
      return assets.get(id) ?? null;
    },
    async saveAsset(a, bytes) {
      const rec = { ...a, id: randomUUID() };
      assets.set(rec.id, rec);
      objects.set(a.storagePath, bytes);
      return rec;
    },
    async signedAssetUrl(path, ttl) {
      return `memory://${path}?ttl=${ttl}`;
    },
    async recordWebhookEvent(provider, eventId) {
      const k = `${provider}:${eventId}`;
      if (webhooks.get(k) === true) return 'processed';
      webhooks.set(k, false);
      return 'new';
    },
    async markWebhookProcessed(provider, eventId) {
      webhooks.set(`${provider}:${eventId}`, true);
    },
    async variantMappings(ids) {
      return ids.map((i) => variants.get(i)).filter(Boolean) as VariantMapping[];
    },
    async upsertOrder(order, its) {
      let o = [...orders.values()].find((x) => x.shopifyOrderId === order.shopifyOrderId);
      if (!o) {
        o = { ...order, id: randomUUID() };
        orders.set(o.id, o);
      }
      const out: OrderItemRecord[] = [];
      for (const i of its) {
        let rec = [...items.values()].find((x) => x.shopifyLineItemId === i.shopifyLineItemId);
        if (!rec) {
          rec = { ...i, id: randomUUID(), orderId: o.id };
          items.set(rec.id, rec);
        }
        out.push(rec);
      }
      return { order: o, items: out };
    },
    async orderItemsByShopifyLineIds(ids) {
      return [...items.values()].filter((i) => ids.includes(i.shopifyLineItemId));
    },
    async insertLedgerEntries(entries: NewLedgerEntry[]) {
      let n = 0;
      for (const e of entries) {
        if (ledger.some((l) => l.idempotencyKey === e.idempotencyKey)) continue;
        ledger.push({ ...e, id: String(++ledgerSeq), createdAt: new Date().toISOString() });
        n++;
      }
      return n;
    },
    async ledgerByKeyPrefix(prefixes) {
      return ledger.filter((l) => prefixes.some((p) => l.idempotencyKey.startsWith(p)));
    },
    async ledgerReversing(keys) {
      return ledger.filter((l) => l.reversesKey && keys.includes(l.reversesKey));
    },
    async ledgerForCreator(creatorId) {
      return ledger.filter((l) => l.account === 'creator' && l.creatorId === creatorId);
    },
    async ledgerAttributedToCreator(creatorId) {
      return ledger.filter((l) => l.creatorId === creatorId);
    },
    async ledgerSince(iso) {
      return ledger.filter((l) => l.createdAt >= iso);
    },
    async orderItemsByOrderIds(ids) {
      return [...items.values()].filter((i) => ids.includes(i.orderId));
    },
    async orderItemsForCreator(creatorId) {
      return [...items.values()].filter((i) => i.creatorId === creatorId).map((i) => ({ ...i, processedAt: orders.get(i.orderId)?.processedAt ?? new Date(0).toISOString() }));
    },
    async listUsers(q) {
      const n = q.toLowerCase();
      return [...users.values()].filter((u) => !n || u.name.toLowerCase().includes(n) || u.email.toLowerCase().includes(n));
    },
    async setUserStatus(id, status) {
      const u = users.get(id)!;
      u.status = status;
      return u;
    },
    async listOrders() {
      return [...orders.values()].map((o) => ({ ...o, itemCount: [...items.values()].filter((i) => i.orderId === o.id).reduce((n, i) => n + i.quantity, 0) }));
    },
    async listPayouts() {
      return [...payouts.values()];
    },
    async approvePayout(id, approverId) {
      const p = payouts.get(id)!;
      p.status = 'approved';
      p.approvedBy = approverId;
      return p;
    },
    async saveProductMapping(input) {
      const productId = `prod_${input.submissionId}`;
      for (const v of input.variants) variants.set(v.shopifyVariantId, { shopifyVariantId: v.shopifyVariantId, productId, creatorId: input.creatorId, campaignId: null, productionCostAmount: v.productionCostAmount });
      return productId;
    },
    async audit(actorId, action, entityType, entityId, metadata) {
      auditLog.push({ actorId, action, entityType, entityId, metadata });
    },
    async publicCampaigns() {
      return [];
    },
  };

  return {
    repo,
    seedUser(u: Partial<UserRecord> & { id: string; roles: Role[] }) {
      const rec: UserRecord = { name: u.id, email: `${u.id}@example.test`, status: 'active', creatorId: null, ...u };
      users.set(rec.id, rec);
      return rec;
    },
    seedVariant(v: VariantMapping) {
      variants.set(v.shopifyVariantId, v);
    },
    seedPayout(p: PayoutRecord) {
      payouts.set(p.id, p);
    },
    seedAsset(a: AssetRecord) {
      assets.set(a.id, a);
    },
    ledger,
    auditLog,
    designs,
    objects,
  };
}
