# Architecture

```
 Browser (React SPA)                API server (Hono, Node 20)              Supabase
 ─────────────────────              ───────────────────────────             ─────────────────────────
 Storefront  ── Storefront API ──▶  Shopify (catalogue, cart, checkout)
 Creator studio ─┐                                                          Auth (email, MFA)
 Admin centre ───┼─ Bearer JWT ──▶  /api/*  ── verify JWT ──▶ roles from ─▶ Postgres + RLS
                 │                    │        (JWKS)           user_roles   Storage (private bucket)
 Supabase Auth ◀─┘                    │
                                      ├── /webhooks/shopify ◀── Shopify (orders/paid, refunds/create, HMAC-signed)
                                      ├── job runner ──▶ Shopify Admin API (productSet)
                                      │              ──▶ Printful / Printify
                                      └── ClamAV (clamd) for upload scanning
```

## Responsibilities

| Concern | Owner | Notes |
| --- | --- | --- |
| Identity, sessions, MFA | Supabase Auth | PKCE flow in the browser. The API verifies the access token with the project's JWKS (or the legacy HS256 secret if configured). |
| Roles | `user_roles` table | Read on every request by the API. Never taken from the token, request body or sign-up metadata. Only the service role can grant roles (`grant_role()`). |
| Catalogue, cart, checkout, payment | Shopify | The browser sends variant IDs and quantities to the Storefront API and is redirected to Shopify's hosted checkout. MADE NEW never sees card data. |
| Order truth | Shopify webhooks | Orders are recorded only from HMAC-verified `orders/paid` webhooks. The checkout return page is informational only. |
| Earnings | API server + ledger | Computed only on the server, from verified webhook data, under a versioned revenue policy (`shared/revenue-policy.ts`). Stored as append-only ledger entries in integer minor units. |
| Design workflow | `transition_design()` + API service | One transition table (`shared/lifecycle.ts`) is mirrored in SQL. A test fails if the two drift apart. |
| Artwork | API server + private bucket | Uploads are validated, re-encoded to PNG, scanned and stored under random paths. Previews use short-lived signed URLs. |
| Printing and fulfilment | Print-on-demand provider | Adapters for Printful and Printify create the print product. Order fulfilment should run through the provider's Shopify app (see the production-readiness review). |

## Design lifecycle

```
draft ──submit──▶ submitted ──start review──▶ under_review ──approve──▶ approved ──publish──▶ published
  │                    ▲                          │                                              │
  │                    └──── resubmit ── changes_requested ◀── request changes (reason)           │
  │                                               │                                              │
  └──archive──▶ archived ◀──archive── rejected ◀──┘ reject (reason)            archive (reason) ─┘
```

- Creators can edit only in `draft` and `changes_requested`.
- Rejecting, requesting changes and archiving a published design need a reason of at least 10 characters.
- Submitting, approving and publishing need validation to pass: ownership confirmed, policy accepted, artwork present, and every attached asset validated and scanned clean.
- Reviewers cannot review their own designs.
- Publishing enqueues an idempotent job (`shopify-product:{designId}`) that creates the Shopify product and records the variant mapping. Only once that job succeeds does the design become `published` (via `service_set_design_status`, service role only).

## Money

- All amounts are integers in minor units (pence) with an explicit currency.
- Policy `2026-10-v1`: payment fee estimate is 1.5% + 20p. The margin is net revenue (ex. tax) plus shipping charged, minus production, shipping cost and payment fee. It is split 40% creator, 40% linked campaign and 20% platform. Earnings are held for 30 days. If a design has no campaign, the campaign share stays with the platform. A negative margin pays nobody.
- Ledger keys make every write idempotent: `sale:{lineItemId}:{account}`, `refund:{refundLineId}:{account}`, `adjustment:{key}`. A replayed webhook can never double-count.
- Refunds add negative reversal entries. Original entries are never edited. The final refunded unit takes the rounding remainder, so a full refund nets each line to exactly zero.
- A policy change means adding a new version. Each entry records the version it was computed under.

## Data stores

- `supabase/migrations/20261017000001_init.sql`: schema, RLS, grants, lifecycle functions, append-only triggers.
- `supabase/migrations/20261017000002_storage.sql`: `artwork-private` (no client writes; owner and reviewer read) and `product-public` buckets.
- `supabase/seed.sql`: local development seed data only.

## Front end

- Vite + React 18 + TypeScript (strict), Tailwind, Framer Motion, Recharts (lazy-loaded with the creator and admin areas only).
- `src/data/platform.ts` is the single client for the API, with an HTTP implementation and a demo implementation. `server/test/contract.test.ts` checks that every client call has a server route.
- Motion respects `prefers-reduced-motion` and a site-level toggle. The hero carousel pauses on hover, focus and hidden tabs. It never autoplays under reduced motion.
- The landing page uses CSS 3D transforms through Framer Motion (no WebGL): a layered 3D hero stage with pointer and scroll tilt, a collection ring that turns as you scroll, scroll-linked manifesto lines and a scroll progress bar. Sections lock into place with CSS scroll snapping (`proximity`, home page only), and the ring has one snap stop per garment. Under reduced motion these become static layouts (the ring becomes a grid).
