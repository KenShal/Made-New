/**
 * Platform API for the creator studio and admin centre.
 *
 * - `httpPlatform` talks to /server with the user's Supabase access token. The
 *   server enforces roles, ownership and the review lifecycle; the database
 *   enforces the same rules again through Row Level Security.
 * - `demoPlatform` is an in-memory stand-in used when no backend is configured.
 *   It mirrors the lifecycle rules so the UI behaves realistically, but it is
 *   NOT a security boundary and every screen using it is labelled "Demo data".
 */
import type {
  AdminUser,
  DesignSubmission,
  EarningsBreakdown,
  IntegrationJob,
  LedgerEntry,
  Order,
  SalesPoint,
  ValidationResult,
} from '@shared/types';
import type { DesignStatus } from '@shared/lifecycle';
import { checkTransition, type Actor } from '@shared/lifecycle';
import { config, integrations } from '@/lib/config';
import { accessToken, type SessionUser } from '@/state/auth';
import { getCurrentUser } from '@/state/currentUser';
import { CAMPAIGNS, CREATORS, DEMO_CREATOR_ID, JOBS, LEDGER, ORDERS, SUBMISSIONS, USERS, salesSeries } from './sample';
import { policyFor } from '@shared/revenue-policy';

export interface CreatorOverview {
  unitsSold: number;
  gross: number;
  estimatedEarnings: number;
  confirmedEarnings: number;
  campaignContributions: number;
  pendingPayouts: number;
  published: number;
  awaitingApproval: number;
  currency: 'GBP';
}

export interface AdminOverview {
  totalUsers: number;
  activeCreators: number;
  awaitingReview: number;
  publishedProducts: number;
  orders: number;
  gross: number;
  contributions: number;
  payoutExceptions: number;
  fulfilmentExceptions: number;
  integrationErrors: number;
  currency: 'GBP';
}

export type DraftInput = Pick<DesignSubmission, 'title' | 'description' | 'category' | 'colourIds' | 'productTypes' | 'suggestedPrice' | 'scripture' | 'artwork' | 'backArtwork' | 'campaign' | 'ownershipConfirmed' | 'policyAccepted'>;

export interface OnboardingInput {
  displayName: string;
  kind: 'individual' | 'organisation';
  location: string;
  bio: string;
  purpose: string;
  organisationName?: string;
  termsAccepted: true;
}

export interface Reconciliation {
  currency: 'GBP';
  orders: number;
  shopifyGross: number;
  creatorEarnings: number;
  campaignContributions: number;
  platformShare: number;
  refundEntries: number;
  unmatchedOrders: string[];
}

export interface PayoutRow {
  id: string;
  creator: string;
  amount: number;
  currency: 'GBP';
  status: 'eligible' | 'approved' | 'paid' | 'on_hold';
  reason?: string;
}

export interface PlatformApi {
  readonly demo: boolean;
  // creator
  onboard(input: OnboardingInput): Promise<{ creatorId: string }>;
  creatorOverview(): Promise<CreatorOverview>;
  mySubmissions(): Promise<DesignSubmission[]>;
  getSubmission(id: string): Promise<DesignSubmission>;
  saveDraft(id: string | null, input: DraftInput): Promise<DesignSubmission>;
  submit(id: string): Promise<DesignSubmission>;
  archive(id: string): Promise<DesignSubmission>;
  uploadArtwork(file: File): Promise<{ assetId: string; previewUrl: string; validation: ValidationResult[] }>;
  sales(): Promise<SalesPoint[]>;
  earnings(): Promise<{ breakdown: EarningsBreakdown; ledger: LedgerEntry[] }>;
  // admin
  adminOverview(): Promise<AdminOverview>;
  reviewQueue(): Promise<DesignSubmission[]>;
  review(id: string, to: DesignStatus, reason?: string): Promise<DesignSubmission>;
  addNote(id: string, body: string): Promise<DesignSubmission>;
  publish(id: string): Promise<{ submission: DesignSubmission; job: IntegrationJob }>;
  users(q?: string): Promise<AdminUser[]>;
  setUserStatus(id: string, status: AdminUser['status'], reason: string): Promise<AdminUser>;
  orders(): Promise<Order[]>;
  jobs(): Promise<IntegrationJob[]>;
  retryJob(id: string): Promise<IntegrationJob>;
  reconciliation(): Promise<Reconciliation>;
  payouts(): Promise<PayoutRow[]>;
  approvePayout(id: string): Promise<PayoutRow>;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
  }
}

/* ----------------------------- HTTP implementation ----------------------------- */

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await accessToken();
  const res = await fetch(`${config.apiBaseUrl}${path}`, {
    ...init,
    headers: {
      ...(init.body && !(init.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  if (!res.ok) {
    let msg = 'Something went wrong. Please try again.';
    let code: string | undefined;
    try {
      const body = (await res.json()) as { error?: string; message?: string };
      code = body.error;
      if (body.message) msg = body.message;
    } catch {
      /* non-JSON error */
    }
    throw new ApiError(msg, res.status, code);
  }
  return (await res.json()) as T;
}

const json = (body: unknown, method = 'POST'): RequestInit => ({ method, body: JSON.stringify(body) });
const idem = (): Record<string, string> => ({ 'Idempotency-Key': crypto.randomUUID() });

/**
 * The API returns lean records on list and transition endpoints. Fill the
 * display-only fields the UI expects so every screen renders the same shape.
 */
function normaliseSubmission(raw: Partial<DesignSubmission> & Pick<DesignSubmission, 'id'>): DesignSubmission {
  return {
    validation: [],
    history: [],
    internalNotes: [],
    unitsSold: 0,
    earnings: { amount: 0, currency: 'GBP' },
    ...raw,
  } as DesignSubmission;
}
const sub = (p: Promise<Partial<DesignSubmission> & Pick<DesignSubmission, 'id'>>) => p.then(normaliseSubmission);
const subs = (p: Promise<(Partial<DesignSubmission> & Pick<DesignSubmission, 'id'>)[]>) => p.then((rows) => rows.map(normaliseSubmission));

function normaliseJob(raw: Omit<Partial<IntegrationJob>, 'status'> & { id: string; status: string; runAfter?: string }): IntegrationJob {
  return { attempts: 0, idempotencyKey: '', updatedAt: raw.runAfter ?? new Date().toISOString(), ...raw, status: raw.status === 'dead' ? 'failed' : raw.status } as IntegrationJob;
}

export const httpPlatform: PlatformApi = {
  demo: false,
  onboard: (input) => call('/api/creator/profile', json(input)),
  creatorOverview: () => call('/api/creator/overview'),
  mySubmissions: () => subs(call('/api/creator/designs')),
  getSubmission: (id) => sub(call(`/api/designs/${encodeURIComponent(id)}`)),
  saveDraft: (id, input) => sub(id ? call(`/api/creator/designs/${encodeURIComponent(id)}`, json(input, 'PATCH')) : call('/api/creator/designs', json(input))),
  submit: (id) => sub(call(`/api/creator/designs/${encodeURIComponent(id)}/submit`, { method: 'POST' })),
  archive: (id) => sub(call(`/api/creator/designs/${encodeURIComponent(id)}/archive`, { method: 'POST' })),
  uploadArtwork: (file) => {
    const fd = new FormData();
    fd.append('file', file);
    return call('/api/creator/artwork', { method: 'POST', body: fd });
  },
  sales: () => call('/api/creator/sales'),
  earnings: () => call('/api/creator/earnings'),
  adminOverview: () => call('/api/admin/overview'),
  reviewQueue: () => subs(call('/api/admin/reviews')),
  review: (id, to, reason) => sub(call(`/api/admin/reviews/${encodeURIComponent(id)}/decision`, json({ to, reason }))),
  addNote: (id, body) => sub(call(`/api/admin/reviews/${encodeURIComponent(id)}/notes`, json({ body }))),
  publish: async (id) => {
    const { job } = await call<{ job: IntegrationJob & { runAfter?: string } }>(`/api/admin/reviews/${encodeURIComponent(id)}/publish`, { method: 'POST', headers: idem() });
    return { job: normaliseJob(job), submission: await httpPlatform.getSubmission(id) };
  },
  users: (q) => call(`/api/admin/users${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  setUserStatus: (id, status, reason) => call(`/api/admin/users/${encodeURIComponent(id)}/status`, json({ status, reason })),
  orders: () => call('/api/admin/orders'),
  jobs: () => call<IntegrationJob[]>('/api/admin/jobs').then((rows) => rows.map(normaliseJob)),
  retryJob: (id) => call<IntegrationJob>(`/api/admin/jobs/${encodeURIComponent(id)}/retry`, { method: 'POST', headers: idem() }).then(normaliseJob),
  reconciliation: () => call('/api/finance/reconciliation'),
  payouts: () => call('/api/finance/payouts'),
  approvePayout: (id) => call(`/api/finance/payouts/${encodeURIComponent(id)}/approve`, { method: 'POST', headers: idem() }),
};

/* ----------------------------- Demo implementation ----------------------------- */

const clone = <T,>(v: T): T => structuredClone(v);
const wait = (ms = 160) => new Promise((r) => setTimeout(r, ms));

export const ARTWORK_RULES = {
  maxBytes: 25 * 1024 * 1024,
  types: ['image/png', 'image/jpeg', 'image/webp'] as const,
  minWidth: 3600,
  minHeight: 4800,
  maxPixels: 12_000 * 12_000,
};

/** Client-side pre-checks for fast feedback. The server repeats all of them authoritatively. */
export async function precheckArtwork(file: File): Promise<ValidationResult[]> {
  const results: ValidationResult[] = [];
  const typeOk = (ARTWORK_RULES.types as readonly string[]).includes(file.type);
  results.push({ check: 'File type', passed: typeOk, detail: typeOk ? file.type.replace('image/', '').toUpperCase() : 'Use PNG, JPEG or WebP' });
  const sizeOk = file.size > 0 && file.size <= ARTWORK_RULES.maxBytes;
  results.push({ check: 'File size', passed: sizeOk, detail: sizeOk ? `${(file.size / 1024 / 1024).toFixed(1)} MB` : 'Files must be under 25 MB' });
  if (!typeOk || !sizeOk) return results;
  try {
    const bmp = await createImageBitmap(file);
    const dimOk = bmp.width >= ARTWORK_RULES.minWidth && bmp.height >= ARTWORK_RULES.minHeight && bmp.width * bmp.height <= ARTWORK_RULES.maxPixels;
    results.push({ check: 'Dimensions', passed: dimOk, detail: `${bmp.width} × ${bmp.height} px${dimOk ? '' : ` (minimum ${ARTWORK_RULES.minWidth} × ${ARTWORK_RULES.minHeight})`}` });
    if (file.type === 'image/png' || file.type === 'image/webp') {
      const c = new OffscreenCanvas(64, 64);
      const ctx = c.getContext('2d');
      ctx?.drawImage(bmp, 0, 0, 64, 64);
      const px = ctx?.getImageData(0, 0, 64, 64).data;
      let transparent = false;
      if (px) for (let i = 3; i < px.length; i += 4) if (px[i]! < 250) { transparent = true; break; }
      results.push({ check: 'Transparency', passed: transparent, detail: transparent ? 'Transparent background detected' : 'No transparency found. Solid backgrounds print as a box.' });
    }
    bmp.close();
  } catch {
    results.push({ check: 'Decoding', passed: false, detail: 'The image could not be read' });
  }
  return results;
}

function demoStore() {
  let subs = clone(SUBMISSIONS);
  let users = clone(USERS);
  let jobs = clone(JOBS);
  let payouts: PayoutRow[] = [
    { id: 'po-1', creator: 'Ada Okafor', amount: 41_220, currency: 'GBP', status: 'eligible' },
    { id: 'po-2', creator: 'Harbour Collective', amount: 96_410, currency: 'GBP', status: 'eligible' },
    { id: 'po-3', creator: "St Mark's Youth", amount: 18_830, currency: 'GBP', status: 'on_hold', reason: 'Bank details not yet verified' },
  ];
  return {
    get subs() { return subs; },
    set subs(v) { subs = v; },
    get users() { return users; },
    set users(v) { users = v; },
    get jobs() { return jobs; },
    set jobs(v) { jobs = v; },
    get payouts() { return payouts; },
    set payouts(v) { payouts = v; },
  };
}


function actorsFor(u: SessionUser | null): Actor[] {
  if (!u) return [];
  const a: Actor[] = [];
  if (u.roles.includes('creator')) a.push('creator');
  if (u.roles.includes('reviewer') || u.roles.includes('admin')) a.push('reviewer');
  if (u.roles.includes('admin')) a.push('publisher');
  return a;
}

function requireRole(...roles: SessionUser['roles']) {
  const currentUser = getCurrentUser();
  if (!currentUser || !roles.some((r) => currentUser!.roles.includes(r))) throw new ApiError('You do not have permission to do that.', 403, 'forbidden');
  return currentUser;
}

function createDemoPlatform(): PlatformApi {
  const db = demoStore();
  const ownedBy = (s: DesignSubmission, u: SessionUser) => s.creatorId === u.creatorId;
  const passed = (s: DesignSubmission) => s.validation.length > 0 && s.validation.every((v) => v.passed) && s.ownershipConfirmed && s.policyAccepted;

  const transition = (id: string, to: DesignStatus, reason?: string) => {
    const s = db.subs.find((x) => x.id === id);
    if (!s) throw new ApiError('Design not found', 404);
    const u = getCurrentUser();
    const actors = actorsFor(u).filter((a) => a !== 'creator' || (u && ownedBy(s, u)));
    const res = checkTransition({ from: s.status, to, actors, reason, validationPassed: passed(s) });
    if (!res.ok) {
      const msgs = { invalid_transition: 'That status change is not allowed.', forbidden_actor: 'You do not have permission to do that.', reason_required: 'Please give a reason of at least 10 characters.', validation_failed: 'Artwork validation, ownership confirmation and policy acceptance must all pass first.' };
      throw new ApiError(msgs[res.error], res.error === 'forbidden_actor' ? 403 : 422, res.error);
    }
    s.history.push({ id: crypto.randomUUID(), at: new Date().toISOString(), actorName: u?.name ?? 'Unknown', from: s.status, to, reason });
    s.status = to;
    s.updatedAt = new Date().toISOString();
    return clone(s);
  };

  return {
    demo: true,
    async onboard(input) {
      await wait(300);
      if (!getCurrentUser()) throw new ApiError('Please sign in first.', 401);
      if (!input.termsAccepted) throw new ApiError('Please accept the creator terms.', 422);
      return { creatorId: DEMO_CREATOR_ID };
    },
    async creatorOverview() {
      await wait();
      const u = requireRole('creator');
      const mine = db.subs.filter((s) => s.creatorId === u.creatorId);
      const units = mine.reduce((n, s) => n + s.unitsSold, 0);
      return { unitsSold: units, gross: 2_131_200, estimatedEarnings: 279_420, confirmedEarnings: 238_200, campaignContributions: 279_420, pendingPayouts: 41_220, published: mine.filter((s) => s.status === 'published').length, awaitingApproval: mine.filter((s) => ['submitted', 'under_review', 'changes_requested'].includes(s.status)).length, currency: 'GBP' };
    },
    async mySubmissions() {
      await wait();
      const u = requireRole('creator');
      return clone(db.subs.filter((s) => s.creatorId === u.creatorId && s.status !== 'archived'));
    },
    async getSubmission(id) {
      await wait(100);
      const u = requireRole('creator', 'reviewer', 'admin');
      const s = db.subs.find((x) => x.id === id);
      // Same response for missing and not-owned records, to avoid leaking existence (IDOR).
      if (!s || (!u.roles.some((r) => r === 'reviewer' || r === 'admin') && !ownedBy(s, u))) throw new ApiError('Design not found', 404);
      const out = clone(s);
      if (!u.roles.some((r) => r === 'reviewer' || r === 'admin')) out.internalNotes = [];
      return out;
    },
    async saveDraft(id, input) {
      await wait();
      const u = requireRole('creator');
      if (id) {
        const s = db.subs.find((x) => x.id === id);
        if (!s || !ownedBy(s, u)) throw new ApiError('Design not found', 404);
        if (!['draft', 'changes_requested'].includes(s.status)) throw new ApiError('Only drafts and designs with requested changes can be edited.', 409);
        Object.assign(s, input, { updatedAt: new Date().toISOString() });
        return clone(s);
      }
      const s: DesignSubmission = { ...clone(input), id: `ds-${Math.floor(Math.random() * 90000 + 10000)}`, creatorId: u.creatorId!, status: 'draft', validation: input.artwork.imageUrl ? [] : [{ check: 'Vector artwork', passed: true, detail: 'Typographic artwork generated in the studio' }], history: [], internalNotes: [], updatedAt: new Date().toISOString(), unitsSold: 0, earnings: { amount: 0, currency: 'GBP' } };
      db.subs = [s, ...db.subs];
      return clone(s);
    },
    async submit(id) {
      await wait();
      return transition(id, 'submitted');
    },
    async archive(id) {
      await wait();
      return transition(id, 'archived');
    },
    async uploadArtwork(file) {
      requireRole('creator');
      const validation = await precheckArtwork(file);
      validation.push({ check: 'Malware scan', passed: true, detail: 'Demo mode: scanning runs on the server in production' });
      // Object URLs are private to this tab; nothing is uploaded in demo mode.
      return { assetId: crypto.randomUUID(), previewUrl: URL.createObjectURL(file), validation };
    },
    async sales() {
      await wait();
      requireRole('creator');
      return salesSeries();
    },
    async earnings() {
      await wait();
      requireRole('creator');
      const p = policyFor(new Date().toISOString());
      return { breakdown: { currency: 'GBP', gross: 2_131_200, taxes: 355_200, production: 852_000, shipping: 92_400, platformFees: 139_710, paymentFees: 52_470, refunds: 80_000, campaignContributions: 279_420, net: 279_420, pending: 41_220, paidOut: 238_200, policyVersion: p.version }, ledger: clone(LEDGER) };
    },
    async adminOverview() {
      await wait();
      requireRole('admin', 'reviewer', 'finance');
      return { totalUsers: 1284, activeCreators: CREATORS.length, awaitingReview: db.subs.filter((s) => ['submitted', 'under_review'].includes(s.status)).length, publishedProducts: 8, orders: 2173, gross: 7_942_600, contributions: 1_048_240, payoutExceptions: db.payouts.filter((p) => p.status === 'on_hold').length, fulfilmentExceptions: ORDERS.filter((o) => o.status === 'fulfilment_error').length, integrationErrors: db.jobs.filter((j) => j.status === 'failed').length, currency: 'GBP' };
    },
    async reviewQueue() {
      await wait();
      requireRole('reviewer', 'admin');
      return clone(db.subs.filter((s) => s.status !== 'draft' && s.status !== 'archived'));
    },
    async review(id, to, reason) {
      await wait();
      requireRole('reviewer', 'admin');
      return transition(id, to, reason);
    },
    async addNote(id, body) {
      await wait(80);
      const u = requireRole('reviewer', 'admin');
      const s = db.subs.find((x) => x.id === id);
      if (!s) throw new ApiError('Design not found', 404);
      const text = body.trim().slice(0, 2000);
      if (!text) throw new ApiError('Note cannot be empty', 422);
      s.internalNotes.push({ at: new Date().toISOString(), author: u.name, body: text });
      return clone(s);
    },
    async publish(id) {
      await wait(400);
      requireRole('admin');
      const key = `shopify-product:${id}`;
      let job = db.jobs.find((j) => j.idempotencyKey === key);
      if (!job) {
        job = { id: crypto.randomUUID(), kind: 'shopify.product.create', status: 'queued', attempts: 0, idempotencyKey: key, updatedAt: new Date().toISOString() };
        db.jobs = [job, ...db.jobs];
      }
      const submission = transition(id, 'published');
      return { submission, job: clone(job) };
    },
    async users(q) {
      await wait();
      requireRole('admin');
      const needle = (q ?? '').toLowerCase().trim();
      return clone(db.users.filter((u) => !needle || u.name.toLowerCase().includes(needle) || u.email.toLowerCase().includes(needle)));
    },
    async setUserStatus(id, status, reason) {
      await wait();
      requireRole('admin');
      if (reason.trim().length < 10) throw new ApiError('Please give a reason of at least 10 characters.', 422);
      const u = db.users.find((x) => x.id === id);
      if (!u) throw new ApiError('User not found', 404);
      if (u.roles.includes('admin')) throw new ApiError('Administrators cannot be suspended from this screen.', 403);
      u.status = status;
      return clone(u);
    },
    async orders() {
      await wait();
      requireRole('admin', 'finance');
      return clone(ORDERS);
    },
    async jobs() {
      await wait();
      requireRole('admin');
      return clone(db.jobs);
    },
    async retryJob(id) {
      await wait(300);
      requireRole('admin');
      const j = db.jobs.find((x) => x.id === id);
      if (!j) throw new ApiError('Job not found', 404);
      if (j.status !== 'failed') throw new ApiError('Only failed jobs can be retried.', 409);
      j.status = 'queued';
      j.attempts += 1;
      j.updatedAt = new Date().toISOString();
      return clone(j);
    },
    async reconciliation() {
      await wait();
      requireRole('finance');
      // Sample figures for the demo; the live endpoint computes these from orders and the ledger.
      return { currency: 'GBP', orders: 214, shopifyGross: 1_942_600, creatorEarnings: 156_460, campaignContributions: 156_460, platformShare: 78_230, refundEntries: 6, unmatchedOrders: [] };
    },
    async payouts() {
      await wait();
      requireRole('finance');
      return clone(db.payouts);
    },
    async approvePayout(id) {
      await wait(300);
      requireRole('finance');
      const p = db.payouts.find((x) => x.id === id);
      if (!p) throw new ApiError('Payout not found', 404);
      if (p.status !== 'eligible') throw new ApiError('Only eligible payouts can be approved.', 409);
      p.status = 'approved';
      return clone(p);
    },
  };
}

export const platform: PlatformApi = integrations.api && integrations.supabase ? httpPlatform : createDemoPlatform();

export const CAMPAIGN_OPTIONS = CAMPAIGNS;
