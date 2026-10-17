/**
 * Runs the real Supabase migration in an embedded Postgres (PGlite) with a
 * stub of Supabase's auth schema, then exercises RLS as anon/authenticated.
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';

const MIGRATION = readFileSync(new URL('../../supabase/migrations/20261017000001_init.sql', import.meta.url), 'utf8')
  // gen_random_uuid() is core in Postgres 13+; PGlite does not ship pgcrypto.
  .replace(/create extension if not exists pgcrypto;/i, '');

const AUTH_STUB = `
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
`;

let db: PGlite;
const ids = { creatorA: randomUUID(), creatorB: randomUUID(), reviewer: randomUUID(), admin: randomUUID(), shopper: randomUUID() };
let crA = '';
let draftA = '';
let submittedA = '';

async function as<T = Record<string, unknown>>(user: string | null, sql: string, params: unknown[] = []) {
  await db.exec('reset role');
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [user ?? '']);
  await db.exec(user ? 'set role authenticated' : 'set role anon');
  try {
    return (await db.query<T>(sql, params)).rows;
  } finally {
    await db.exec('reset role');
  }
}
async function rejects(user: string | null, sql: string, params: unknown[] = []) {
  await expect(as(user, sql, params)).rejects.toThrow();
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(AUTH_STUB);
  await db.exec(MIGRATION);
  for (const [name, id] of Object.entries(ids)) {
    await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [id, `${name}@example.test`, JSON.stringify({ display_name: name, role: 'admin' })]);
  }
  for (const [u, r] of [[ids.creatorA, 'creator'], [ids.creatorB, 'creator'], [ids.reviewer, 'reviewer'], [ids.admin, 'admin']] as const) {
    await db.query(`select public.grant_role($1, $2::public.app_role, null)`, [u, r]);
  }
  const mkCreator = async (u: string, handle: string) =>
    (await db.query<{ id: string }>(`insert into public.creator_profiles (user_id, handle, display_name, kind, terms_version, terms_accepted_at) values ($1, $2, $2, 'individual', 'v1', now()) returning id`, [u, handle])).rows[0]!.id;
  crA = await mkCreator(ids.creatorA, 'ada-a');
  await mkCreator(ids.creatorB, 'ben-b');
  await mkCreator(ids.reviewer, 'rev-r');
  const mkDesign = async () =>
    (await db.query<{ id: string }>(`insert into public.design_submissions (creator_id, title, category, suggested_price_amount, artwork, ownership_confirmed, policy_accepted) values ($1, 'Made New', 'tee', 3800, '{"style":"stack","lines":["MADE","NEW"]}', true, true) returning id`, [crA])).rows[0]!.id;
  draftA = await mkDesign();
  submittedA = await mkDesign();
  await as(ids.creatorA, `select public.transition_design($1, 'submitted')`, [submittedA]);
}, 60_000);

describe('database row level security', () => {
  it('ignores role claims in sign-up metadata: new users are shoppers only', async () => {
    const rows = await db.query<{ role: string }>(`select role from public.user_roles where user_id = $1`, [ids.shopper]);
    expect(rows.rows.map((r) => r.role)).toEqual(['shopper']);
  });

  it('anonymous visitors cannot read designs, orders, ledger, payouts, roles or audit logs', async () => {
    for (const t of ['design_submissions', 'orders', 'order_items', 'ledger_entries', 'payouts', 'user_roles', 'audit_logs', 'review_notes', 'artwork_assets']) {
      await rejects(null, `select * from public.${t}`);
    }
  });

  it('creators see only their own designs; reviewers never see drafts', async () => {
    expect(await as(ids.creatorA, `select id from public.design_submissions`)).toHaveLength(2);
    expect(await as(ids.creatorB, `select id from public.design_submissions`)).toHaveLength(0);
    const seen = (await as<{ id: string }>(ids.reviewer, `select id from public.design_submissions`)).map((r) => r.id);
    expect(seen).toEqual([submittedA]);
  });

  it('a creator cannot update another creator’s design or create one in their name', async () => {
    expect(await as(ids.creatorB, `update public.design_submissions set title = 'Stolen' where id = $1 returning id`, [draftA])).toHaveLength(0);
    await rejects(ids.creatorB, `insert into public.design_submissions (creator_id, title, category, suggested_price_amount, artwork) values ($1, 'X', 'tee', 3000, '{}')`, [crA]);
  });

  it('users cannot grant themselves roles or call privileged functions', async () => {
    await rejects(ids.shopper, `insert into public.user_roles (user_id, role) values ($1, 'admin')`, [ids.shopper]);
    await rejects(ids.shopper, `update public.user_roles set role = 'admin' where user_id = $1`, [ids.shopper]);
    await rejects(ids.shopper, `select public.grant_role($1, 'admin', $1)`, [ids.shopper]);
    await rejects(ids.shopper, `select public.service_set_design_status($1, 'submitted', 'published', $2, 'x')`, [submittedA, ids.shopper]);
    await rejects(ids.shopper, `update public.profiles set status = 'active' where id = $1`, [ids.shopper]);
  });

  it('status cannot be changed directly, only through transition_design()', async () => {
    await rejects(ids.creatorA, `update public.design_submissions set status = 'approved' where id = $1`, [draftA]);
    await expect(db.query(`update public.design_submissions set status = 'approved' where id = $1`, [draftA])).rejects.toThrow(/transition_design/);
  });

  it('transition_design enforces actors, reasons and self-review', async () => {
    await rejects(ids.creatorA, `select public.transition_design($1, 'under_review')`, [submittedA]);
    await rejects(ids.creatorB, `select public.transition_design($1, 'submitted')`, [draftA]);
    await as(ids.reviewer, `select public.transition_design($1, 'under_review')`, [submittedA]);
    await rejects(ids.reviewer, `select public.transition_design($1, 'rejected', 'short')`, [submittedA]);
    await as(ids.reviewer, `select public.transition_design($1, 'changes_requested', 'Please increase the artwork resolution.')`, [submittedA]);
    const events = await as<{ from_status: string; to_status: string }>(ids.creatorA, `select from_status, to_status from public.review_events where submission_id = $1 order by id`, [submittedA]);
    expect(events).toEqual([
      { from_status: 'draft', to_status: 'submitted' },
      { from_status: 'submitted', to_status: 'under_review' },
      { from_status: 'under_review', to_status: 'changes_requested' },
    ]);
    await rejects(ids.creatorA, `select public.transition_design($1, 'published')`, [submittedA]);
  });

  it('reviewers cannot review their own designs', async () => {
    const crR = (await db.query<{ id: string }>(`select id from public.creator_profiles where user_id = $1`, [ids.reviewer])).rows[0]!.id;
    const d = (await db.query<{ id: string }>(`insert into public.design_submissions (creator_id, title, category, suggested_price_amount, artwork, ownership_confirmed, policy_accepted) values ($1, 'Mine', 'tee', 3800, '{"lines":["A"]}', true, true) returning id`, [crR])).rows[0]!.id;
    await as(ids.reviewer, `select public.transition_design($1, 'submitted')`, [d]);
    await as(ids.admin, `select public.transition_design($1, 'under_review')`, [d]);
    await rejects(ids.reviewer, `select public.transition_design($1, 'approved')`, [d]);
  });

  it('internal review notes are hidden from creators', async () => {
    await as(ids.reviewer, `insert into public.review_notes (submission_id, author_id, body) values ($1, $2, 'Check the verse reference.')`, [submittedA, ids.reviewer]);
    expect(await as(ids.creatorA, `select * from public.review_notes`)).toHaveLength(0);
    expect(await as(ids.reviewer, `select * from public.review_notes`)).toHaveLength(1);
  });

  it('the ledger, review events and audit log are append-only even for the owner role', async () => {
    await db.query(`insert into public.ledger_entries (entry_type, account, creator_id, amount, currency, policy_version, idempotency_key) values ('sale', 'creator', $1, 500, 'GBP', '2026-10-v1', 'sale:1:creator')`, [crA]);
    await expect(db.query(`update public.ledger_entries set amount = 999999`)).rejects.toThrow(/append-only/);
    await expect(db.query(`delete from public.ledger_entries`)).rejects.toThrow(/append-only/);
    await expect(db.query(`delete from public.review_events`)).rejects.toThrow(/append-only/);
    await expect(db.query(`update public.audit_logs set action = 'x'`)).rejects.toThrow(/append-only/);
    await rejects(ids.creatorA, `insert into public.ledger_entries (entry_type, account, creator_id, amount, currency, policy_version, idempotency_key) values ('adjustment', 'creator', $1, 100000, 'GBP', 'v', 'k')`, [crA]);
  });

  it('creators read only their own ledger entries; creators cannot read orders', async () => {
    expect(await as(ids.creatorA, `select amount from public.ledger_entries`)).toHaveLength(1);
    expect(await as(ids.creatorB, `select amount from public.ledger_entries`)).toHaveLength(0);
    expect(await as(ids.creatorA, `select * from public.orders`)).toHaveLength(0);
  });
});
