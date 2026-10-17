-- MADE NEW initial schema.
-- Principles:
--   * Row Level Security on every table. Default deny; policies grant the minimum.
--   * Roles live in user_roles and can only be granted by the service role via grant_role().
--   * Design status changes only through transition_design(), which enforces the lifecycle.
--   * Money is bigint minor units + explicit ISO currency.
--   * The ledger, review history and audit log are append-only (UPDATE/DELETE blocked by trigger).

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- types
create type public.app_role as enum ('shopper', 'creator', 'reviewer', 'admin', 'finance');
create type public.design_status as enum ('draft', 'submitted', 'under_review', 'changes_requested', 'approved', 'published', 'rejected', 'archived');
create type public.campaign_status as enum ('draft', 'submitted', 'approved', 'live', 'ended', 'rejected');
create type public.ledger_account as enum ('creator', 'campaign', 'platform');
create type public.ledger_entry_type as enum ('sale', 'refund', 'adjustment', 'payout');
create type public.payout_status as enum ('pending', 'approved', 'paid', 'failed', 'on_hold');
create type public.job_status as enum ('queued', 'running', 'succeeded', 'failed', 'dead');

create domain public.currency_code as char(3) check (value in ('GBP', 'USD', 'EUR'));

-- ---------------------------------------------------------------- helpers
create or replace function public.set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create or replace function public.forbid_mutation() returns trigger language plpgsql as $$
begin raise exception '% is append-only', tg_table_name using errcode = '42501'; end $$;

-- ---------------------------------------------------------------- identity
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 80),
  marketing_consent boolean not null default false,
  marketing_consent_at timestamptz,
  status text not null default 'active' check (status in ('active', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_updated before update on public.profiles for each row execute function public.set_updated_at();

create table public.user_roles (
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.app_role not null,
  granted_by uuid references public.profiles (id),
  granted_at timestamptz not null default now(),
  primary key (user_id, role)
);

create or replace function public.has_role(r public.app_role) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_roles ur join public.profiles p on p.id = ur.user_id
    where ur.user_id = auth.uid() and ur.role = r and p.status = 'active'
  );
$$;

create or replace function public.is_reviewer() returns boolean language sql stable as $$
  select public.has_role('reviewer') or public.has_role('admin');
$$;

-- New auth users get a profile and the shopper role. Display name is the only
-- client-supplied field used; any "role" in user metadata is ignored.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name, marketing_consent, marketing_consent_at)
  values (
    new.id,
    left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(new.email, '@', 1)), 80),
    coalesce((new.raw_user_meta_data ->> 'marketing_consent')::boolean, false),
    case when coalesce((new.raw_user_meta_data ->> 'marketing_consent')::boolean, false) then now() end
  );
  insert into public.user_roles (user_id, role) values (new.id, 'shopper');
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------- audit
create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles (id),
  action text not null,
  entity_type text not null,
  entity_id text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id, created_at desc);
create trigger audit_logs_immutable before update or delete on public.audit_logs for each row execute function public.forbid_mutation();

create or replace function public.audit(p_action text, p_entity_type text, p_entity_id text, p_metadata jsonb default '{}')
returns void language sql security definer set search_path = public as $$
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata) values (auth.uid(), p_action, p_entity_type, p_entity_id, p_metadata);
$$;

-- Only the service role (server, migrations) may grant or revoke roles.
create or replace function public.grant_role(p_user uuid, p_role public.app_role, p_granted_by uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.user_roles (user_id, role, granted_by) values (p_user, p_role, p_granted_by) on conflict do nothing;
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (p_granted_by, 'role.grant', 'user', p_user::text, jsonb_build_object('role', p_role));
end $$;

create or replace function public.revoke_role(p_user uuid, p_role public.app_role, p_revoked_by uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.user_roles where user_id = p_user and role = p_role;
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (p_revoked_by, 'role.revoke', 'user', p_user::text, jsonb_build_object('role', p_role));
end $$;

-- ---------------------------------------------------------------- creators
create table public.creator_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles (id) on delete cascade,
  handle text not null unique check (handle ~ '^[a-z0-9][a-z0-9._-]{1,38}[a-z0-9]$'),
  display_name text not null check (char_length(display_name) between 2 and 60),
  kind text not null check (kind in ('individual', 'organisation')),
  location text check (char_length(location) <= 80),
  bio text check (char_length(bio) <= 600),
  purpose text check (char_length(purpose) <= 600),
  terms_version text not null,
  terms_accepted_at timestamptz not null,
  status text not null default 'active' check (status in ('active', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger creator_profiles_updated before update on public.creator_profiles for each row execute function public.set_updated_at();

-- Private creator data kept apart from the public profile row.
create table public.creator_private (
  creator_id uuid primary key references public.creator_profiles (id) on delete cascade,
  organisation_legal_name text check (char_length(organisation_legal_name) <= 120),
  payout_provider_account_ref text, -- provider token/reference only, never raw bank details
  updated_at timestamptz not null default now()
);

create or replace function public.my_creator_id() returns uuid language sql stable security definer set search_path = public as $$
  select id from public.creator_profiles where user_id = auth.uid() and status = 'active';
$$;

-- ---------------------------------------------------------------- campaigns
create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  creator_id uuid not null references public.creator_profiles (id),
  title text not null check (char_length(title) between 3 and 80),
  beneficiary text not null check (char_length(beneficiary) between 2 and 120),
  description text not null check (char_length(description) <= 1000),
  intended_use text not null check (char_length(intended_use) <= 600),
  goal_amount bigint not null check (goal_amount between 10000 and 10000000),
  currency public.currency_code not null default 'GBP',
  ends_at date,
  image_asset_id uuid,
  status public.campaign_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index campaigns_creator_idx on public.campaigns (creator_id);
create trigger campaigns_updated before update on public.campaigns for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------- designs
create table public.design_submissions (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.creator_profiles (id),
  title text not null check (char_length(title) between 2 and 60),
  description text not null default '' check (char_length(description) <= 600),
  category text not null check (category in ('tee', 'heavyweight', 'longsleeve', 'crewneck')),
  colour_ids text[] not null default '{}' check (cardinality(colour_ids) <= 12),
  product_types text[] not null default '{}' check (product_types <@ array['tee', 'heavyweight', 'longsleeve', 'crewneck']),
  suggested_price_amount integer not null check (suggested_price_amount between 2400 and 6500),
  currency public.currency_code not null default 'GBP',
  scripture text check (char_length(scripture) <= 60),
  artwork jsonb not null,
  back_artwork jsonb,
  front_asset_id uuid,
  back_asset_id uuid,
  campaign_id uuid references public.campaigns (id),
  status public.design_status not null default 'draft',
  ownership_confirmed boolean not null default false,
  policy_accepted boolean not null default false,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index design_submissions_creator_idx on public.design_submissions (creator_id, updated_at desc);
create index design_submissions_status_idx on public.design_submissions (status, updated_at);
create trigger design_submissions_updated before update on public.design_submissions for each row execute function public.set_updated_at();

-- Status, ownership and timestamps can only change inside transition_design().
create or replace function public.guard_design_update() returns trigger language plpgsql as $$
begin
  if new.creator_id <> old.creator_id then raise exception 'creator_id is immutable' using errcode = '42501'; end if;
  if new.status <> old.status and coalesce(current_setting('made_new.transition', true), '') <> 'on' then
    raise exception 'status changes must use transition_design()' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger design_submissions_guard before update on public.design_submissions for each row execute function public.guard_design_update();

create table public.artwork_assets (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.creator_profiles (id),
  storage_path text not null unique, -- random UUID path in the private bucket
  mime_type text not null check (mime_type in ('image/png', 'image/jpeg', 'image/webp')),
  bytes integer not null check (bytes between 1 and 26214400),
  width integer not null check (width between 1 and 12000),
  height integer not null check (height between 1 and 12000),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  scan_status text not null default 'pending' check (scan_status in ('pending', 'clean', 'infected', 'error')),
  validation jsonb not null default '[]'::jsonb,
  validation_passed boolean not null default false,
  created_at timestamptz not null default now()
);
create index artwork_assets_creator_idx on public.artwork_assets (creator_id);
alter table public.design_submissions add constraint design_front_asset_fk foreign key (front_asset_id) references public.artwork_assets (id);
alter table public.design_submissions add constraint design_back_asset_fk foreign key (back_asset_id) references public.artwork_assets (id);

create table public.review_events (
  id bigint generated always as identity primary key,
  submission_id uuid not null references public.design_submissions (id) on delete cascade,
  actor_id uuid references public.profiles (id),
  from_status public.design_status,
  to_status public.design_status not null,
  reason text check (char_length(reason) <= 1000),
  created_at timestamptz not null default now()
);
create index review_events_submission_idx on public.review_events (submission_id, created_at);
create trigger review_events_immutable before update or delete on public.review_events for each row execute function public.forbid_mutation();

create table public.review_notes (
  id bigint generated always as identity primary key,
  submission_id uuid not null references public.design_submissions (id) on delete cascade,
  author_id uuid not null references public.profiles (id),
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create trigger review_notes_immutable before update or delete on public.review_notes for each row execute function public.forbid_mutation();

-- True when every attached asset has passed validation and malware scanning.
create or replace function public.design_validation_passed(p_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select d.ownership_confirmed and d.policy_accepted
     and not exists (
       select 1 from public.artwork_assets a
       where a.id in (d.front_asset_id, d.back_asset_id)
         and (a.scan_status <> 'clean' or not a.validation_passed)
     )
     and (d.front_asset_id is not null or (d.artwork ? 'lines' and jsonb_array_length(d.artwork -> 'lines') > 0))
  from public.design_submissions d where d.id = p_id;
$$;

-- Lifecycle enforcement. Mirrors shared/lifecycle.ts (tested for parity).
create or replace function public.transition_design(p_id uuid, p_to public.design_status, p_reason text default null)
returns public.design_submissions language plpgsql security definer set search_path = public as $$
declare
  d public.design_submissions;
  actor text;
  needs_reason boolean := false;
  needs_validation boolean := false;
  is_owner boolean;
  v_from public.design_status;
begin
  select * into d from public.design_submissions where id = p_id for update;
  if not found then raise exception 'not found' using errcode = 'P0002'; end if;
  v_from := d.status;
  is_owner := d.creator_id = public.my_creator_id();

  case
    when d.status in ('draft', 'changes_requested') and p_to = 'submitted' then actor := 'creator'; needs_validation := true;
    when d.status in ('draft', 'rejected') and p_to = 'archived' then actor := 'creator';
    when d.status = 'published' and p_to = 'archived' then actor := 'publisher'; needs_reason := true;
    when d.status = 'submitted' and p_to = 'under_review' then actor := 'reviewer';
    when d.status = 'under_review' and p_to = 'approved' then actor := 'reviewer'; needs_validation := true;
    when d.status = 'under_review' and p_to in ('changes_requested', 'rejected') then actor := 'reviewer'; needs_reason := true;
    when d.status = 'approved' and p_to = 'published' then actor := 'publisher'; needs_validation := true;
    else raise exception 'invalid transition % -> %', d.status, p_to using errcode = '22023';
  end case;

  if actor = 'creator' and not is_owner then raise exception 'forbidden' using errcode = '42501'; end if;
  if actor = 'reviewer' and not public.is_reviewer() then raise exception 'forbidden' using errcode = '42501'; end if;
  -- Publishing runs from the server after Shopify confirms; it requires an admin acting through the service.
  if actor = 'publisher' and not public.has_role('admin') then raise exception 'forbidden' using errcode = '42501'; end if;
  if actor = 'reviewer' and is_owner then raise exception 'reviewers cannot review their own designs' using errcode = '42501'; end if;
  if needs_reason and coalesce(char_length(trim(p_reason)), 0) < 10 then raise exception 'reason required' using errcode = '22023'; end if;
  if needs_validation and not public.design_validation_passed(p_id) then raise exception 'validation failed' using errcode = '22023'; end if;

  perform set_config('made_new.transition', 'on', true);
  update public.design_submissions
     set status = p_to, submitted_at = case when p_to = 'submitted' then now() else submitted_at end
   where id = p_id returning * into d;
  perform set_config('made_new.transition', 'off', true);

  insert into public.review_events (submission_id, actor_id, from_status, to_status, reason)
  values (p_id, auth.uid(), v_from, p_to, nullif(trim(p_reason), ''));
  perform public.audit('design.transition', 'design_submission', p_id::text, jsonb_build_object('to', p_to));
  return d;
end $$;

-- ---------------------------------------------------------------- catalogue
create table public.products (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null unique references public.design_submissions (id),
  creator_id uuid not null references public.creator_profiles (id),
  campaign_id uuid references public.campaigns (id),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null,
  shopify_product_id text unique,
  pod_provider text check (pod_provider in ('printful', 'printify')),
  pod_product_id text,
  status text not null default 'pending' check (status in ('pending', 'active', 'archived', 'error')),
  production_cost_amount integer not null default 0 check (production_cost_amount >= 0),
  currency public.currency_code not null default 'GBP',
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger products_updated before update on public.products for each row execute function public.set_updated_at();

create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  shopify_variant_id text unique,
  pod_variant_id text,
  size text not null check (size in ('XS', 'S', 'M', 'L', 'XL', 'XXL')),
  colour_id text not null,
  price_amount integer not null check (price_amount > 0),
  production_cost_amount integer not null check (production_cost_amount >= 0),
  currency public.currency_code not null default 'GBP',
  unique (product_id, size, colour_id)
);

-- ---------------------------------------------------------------- orders
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  shopify_order_id text not null unique,
  order_number text,
  currency public.currency_code not null,
  total_amount bigint not null check (total_amount >= 0),
  tax_amount bigint not null default 0,
  shipping_charged_amount bigint not null default 0,
  financial_status text not null,
  fulfilment_status text not null default 'unfulfilled',
  customer_ref text, -- salted hash; customer PII stays in Shopify
  processed_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  shopify_line_item_id text not null unique,
  product_id uuid references public.products (id),
  variant_id uuid references public.product_variants (id),
  creator_id uuid references public.creator_profiles (id),
  campaign_id uuid references public.campaigns (id),
  quantity integer not null check (quantity > 0),
  unit_price_amount bigint not null,
  discount_amount bigint not null default 0,
  tax_amount bigint not null default 0,
  production_cost_amount bigint not null default 0,
  currency public.currency_code not null
);
create index order_items_creator_idx on public.order_items (creator_id);

-- ---------------------------------------------------------------- money
create table public.ledger_entries (
  id bigint generated always as identity primary key,
  entry_type public.ledger_entry_type not null,
  account public.ledger_account not null,
  creator_id uuid references public.creator_profiles (id),
  campaign_id uuid references public.campaigns (id),
  order_item_id uuid references public.order_items (id),
  amount bigint not null, -- signed minor units
  currency public.currency_code not null,
  policy_version text not null,
  idempotency_key text not null unique,
  reverses_entry_id bigint references public.ledger_entries (id),
  reason text,
  created_by uuid references public.profiles (id),
  available_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  check ((account = 'creator') = (creator_id is not null) or account <> 'creator'),
  check (entry_type <> 'adjustment' or (reason is not null and created_by is not null))
);
create index ledger_creator_idx on public.ledger_entries (creator_id, created_at desc);
create index ledger_campaign_idx on public.ledger_entries (campaign_id);
create trigger ledger_immutable before update or delete on public.ledger_entries for each row execute function public.forbid_mutation();

create table public.payouts (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.creator_profiles (id),
  amount bigint not null check (amount > 0),
  currency public.currency_code not null,
  status public.payout_status not null default 'pending',
  idempotency_key text not null unique,
  approved_by uuid references public.profiles (id),
  approved_at timestamptz,
  provider_ref text,
  hold_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger payouts_updated before update on public.payouts for each row execute function public.set_updated_at();

-- Verified campaign totals: only from ledger entries (sales net of refunds).
create or replace view public.campaign_totals with (security_invoker = false) as
  select c.id as campaign_id, c.currency, coalesce(sum(l.amount), 0)::bigint as raised_amount
  from public.campaigns c
  left join public.ledger_entries l on l.campaign_id = c.id and l.account = 'campaign' and l.entry_type in ('sale', 'refund', 'adjustment')
  where c.status in ('live', 'ended')
  group by c.id, c.currency;

-- ---------------------------------------------------------------- ops
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null,
  body jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

create table public.integration_jobs (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  idempotency_key text not null unique,
  status public.job_status not null default 'queued',
  attempts integer not null default 0,
  max_attempts integer not null default 8,
  payload jsonb not null default '{}'::jsonb,
  result jsonb,
  last_error text,
  run_after timestamptz not null default now(),
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index integration_jobs_ready_idx on public.integration_jobs (status, run_after);
create trigger integration_jobs_updated before update on public.integration_jobs for each row execute function public.set_updated_at();

create table public.webhook_events (
  provider text not null,
  event_id text not null,
  topic text not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  primary key (provider, event_id)
);

-- ================================================================ RLS
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.audit_logs enable row level security;
alter table public.creator_profiles enable row level security;
alter table public.creator_private enable row level security;
alter table public.campaigns enable row level security;
alter table public.design_submissions enable row level security;
alter table public.artwork_assets enable row level security;
alter table public.review_events enable row level security;
alter table public.review_notes enable row level security;
alter table public.products enable row level security;
alter table public.product_variants enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.ledger_entries enable row level security;
alter table public.payouts enable row level security;
alter table public.notifications enable row level security;
alter table public.integration_jobs enable row level security;
alter table public.webhook_events enable row level security;

-- Start from nothing, then grant precisely.
revoke all on all tables in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;
grant usage on schema public to anon, authenticated;
-- Policy helper functions are evaluated for anonymous visitors too.
grant execute on function public.has_role(public.app_role), public.is_reviewer(), public.my_creator_id() to anon, authenticated;
grant execute on function public.transition_design(uuid, public.design_status, text) to authenticated;

-- profiles: self read; self update of display name and consent only (column grant).
grant select on public.profiles to authenticated;
grant update (display_name, marketing_consent, marketing_consent_at) on public.profiles to authenticated;
create policy profiles_self_read on public.profiles for select to authenticated using (id = auth.uid() or public.has_role('admin'));
create policy profiles_self_update on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- user_roles: users can see their own roles. No client writes at all.
grant select on public.user_roles to authenticated;
create policy user_roles_self_read on public.user_roles for select to authenticated using (user_id = auth.uid() or public.has_role('admin'));

-- audit logs: admins read. Inserts only via security definer functions.
grant select on public.audit_logs to authenticated;
create policy audit_admin_read on public.audit_logs for select to authenticated using (public.has_role('admin'));

-- creator profiles: public read of active profiles; owner manages own (except status).
grant select on public.creator_profiles to anon, authenticated;
grant insert (user_id, handle, display_name, kind, location, bio, purpose, terms_version, terms_accepted_at) on public.creator_profiles to authenticated;
grant update (display_name, location, bio, purpose) on public.creator_profiles to authenticated;
create policy creators_public_read on public.creator_profiles for select to anon, authenticated using (status = 'active' or user_id = auth.uid() or public.is_reviewer());
create policy creators_self_insert on public.creator_profiles for insert to authenticated with check (user_id = auth.uid());
create policy creators_self_update on public.creator_profiles for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select, insert, update (organisation_legal_name) on public.creator_private to authenticated;
create policy creator_private_owner on public.creator_private for all to authenticated
  using (creator_id = public.my_creator_id() or public.has_role('finance'))
  with check (creator_id = public.my_creator_id());

-- campaigns: public sees live/ended; owner sees and edits own drafts; reviewers see all.
grant select on public.campaigns to anon, authenticated;
grant insert (slug, creator_id, title, beneficiary, description, intended_use, goal_amount, currency, ends_at, image_asset_id) on public.campaigns to authenticated;
grant update (title, beneficiary, description, intended_use, goal_amount, ends_at, image_asset_id) on public.campaigns to authenticated;
create policy campaigns_public_read on public.campaigns for select to anon, authenticated using (status in ('live', 'ended') or creator_id = public.my_creator_id() or public.is_reviewer());
create policy campaigns_owner_insert on public.campaigns for insert to authenticated with check (creator_id = public.my_creator_id() and status = 'draft');
create policy campaigns_owner_update on public.campaigns for update to authenticated using (creator_id = public.my_creator_id() and status in ('draft', 'submitted')) with check (creator_id = public.my_creator_id());

-- design submissions: private to owner and reviewers. Owner may edit only while draft/changes requested.
grant select on public.design_submissions to authenticated;
grant insert (creator_id, title, description, category, colour_ids, product_types, suggested_price_amount, currency, scripture, artwork, back_artwork, front_asset_id, back_asset_id, campaign_id, ownership_confirmed, policy_accepted) on public.design_submissions to authenticated;
grant update (title, description, category, colour_ids, product_types, suggested_price_amount, scripture, artwork, back_artwork, front_asset_id, back_asset_id, campaign_id, ownership_confirmed, policy_accepted) on public.design_submissions to authenticated;
create policy designs_owner_read on public.design_submissions for select to authenticated using (creator_id = public.my_creator_id() or (public.is_reviewer() and status <> 'draft'));
create policy designs_owner_insert on public.design_submissions for insert to authenticated with check (creator_id = public.my_creator_id() and status = 'draft');
create policy designs_owner_update on public.design_submissions for update to authenticated
  using (creator_id = public.my_creator_id() and status in ('draft', 'changes_requested'))
  with check (creator_id = public.my_creator_id()
    and (front_asset_id is null or exists (select 1 from public.artwork_assets a where a.id = front_asset_id and a.creator_id = public.my_creator_id()))
    and (back_asset_id is null or exists (select 1 from public.artwork_assets a where a.id = back_asset_id and a.creator_id = public.my_creator_id()))
    and (campaign_id is null or exists (select 1 from public.campaigns c where c.id = campaign_id and c.creator_id = public.my_creator_id())));

-- artwork assets: rows are created only by the server after validation. Owners and reviewers read.
grant select on public.artwork_assets to authenticated;
create policy assets_owner_read on public.artwork_assets for select to authenticated using (creator_id = public.my_creator_id() or public.is_reviewer());

-- review events: owner and reviewers read; inserts only via transition_design().
grant select on public.review_events to authenticated;
create policy review_events_read on public.review_events for select to authenticated
  using (public.is_reviewer() or exists (select 1 from public.design_submissions d where d.id = submission_id and d.creator_id = public.my_creator_id()));

-- internal notes: reviewers only. Creators never see these.
grant select, insert on public.review_notes to authenticated;
create policy review_notes_reviewers on public.review_notes for select to authenticated using (public.is_reviewer());
create policy review_notes_insert on public.review_notes for insert to authenticated with check (public.is_reviewer() and author_id = auth.uid());

-- catalogue: public sees active products only.
grant select on public.products, public.product_variants to anon, authenticated;
create policy products_public_read on public.products for select to anon, authenticated using (status = 'active' or creator_id = public.my_creator_id() or public.has_role('admin'));
create policy variants_public_read on public.product_variants for select to anon, authenticated using (exists (select 1 from public.products p where p.id = product_id and (p.status = 'active' or public.has_role('admin'))));

-- orders: never visible to creators or shoppers through the API. Admin/finance only.
grant select on public.orders, public.order_items to authenticated;
create policy orders_staff_read on public.orders for select to authenticated using (public.has_role('admin') or public.has_role('finance'));
create policy order_items_staff_read on public.order_items for select to authenticated using (public.has_role('admin') or public.has_role('finance'));

-- ledger: creators read their own creator-account entries; finance reads all. No client writes.
grant select on public.ledger_entries to authenticated;
create policy ledger_read on public.ledger_entries for select to authenticated using ((account = 'creator' and creator_id = public.my_creator_id()) or public.has_role('finance'));

-- payouts: creator reads own; finance reads all. Approvals go through the server with the service role.
grant select on public.payouts to authenticated;
create policy payouts_read on public.payouts for select to authenticated using (creator_id = public.my_creator_id() or public.has_role('finance'));

-- notifications: owner reads and marks read.
grant select, update (read_at) on public.notifications to authenticated;
create policy notifications_owner on public.notifications for select to authenticated using (user_id = auth.uid());
create policy notifications_owner_update on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- jobs and webhook events: admin read only.
grant select on public.integration_jobs to authenticated;
create policy jobs_admin_read on public.integration_jobs for select to authenticated using (public.has_role('admin'));

grant select on public.campaign_totals to anon, authenticated;

-- Server-only status change used by background jobs (e.g. publishing after Shopify
-- confirms). Callable only by the service role. Guards on the expected current status.
create or replace function public.service_set_design_status(p_id uuid, p_from public.design_status, p_to public.design_status, p_actor uuid, p_reason text)
returns public.design_submissions language plpgsql security definer set search_path = public as $$
declare d public.design_submissions;
begin
  perform set_config('made_new.transition', 'on', true);
  update public.design_submissions set status = p_to, submitted_at = case when p_to = 'submitted' then now() else submitted_at end
   where id = p_id and status = p_from returning * into d;
  perform set_config('made_new.transition', 'off', true);
  if not found then raise exception 'status changed concurrently' using errcode = '40001'; end if;
  insert into public.review_events (submission_id, actor_id, from_status, to_status, reason) values (p_id, p_actor, p_from, p_to, p_reason);
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata) values (p_actor, 'design.transition', 'design_submission', p_id::text, jsonb_build_object('from', p_from, 'to', p_to));
  return d;
end $$;
revoke execute on function public.service_set_design_status(uuid, public.design_status, public.design_status, uuid, text) from public, anon, authenticated;
revoke execute on function public.grant_role(uuid, public.app_role, uuid), public.revoke_role(uuid, public.app_role, uuid), public.audit(text, text, text, jsonb) from public, anon, authenticated;
