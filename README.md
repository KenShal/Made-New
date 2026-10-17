# MADE NEW

**Wear the message. Fund the mission.**

MADE NEW is a Christian streetwear fundraising platform. Creators design T-shirts, the MADE NEW team reviews them, approved designs are sold through Shopify and printed on demand, and a published share of every sale goes to the creator and to the campaign they've linked.

> *"Therefore, if anyone is in Christ, the new creation has come: the old has gone, the new is here!"* (2 Corinthians 5:17)

## What's in this repository

| Area | Where | What it does |
| --- | --- | --- |
| Web app | `src/` | React + TypeScript storefront, creator studio and admin centre |
| Shared rules | `shared/` | Money, design lifecycle and the versioned revenue policy, used by both the browser and the server |
| API server | `server/` | Hono (Node) API: auth, design workflow, artwork uploads, Shopify webhooks, ledger, payouts, integration jobs |
| Database | `supabase/` | Postgres schema, row-level security, storage buckets and seed data |
| Tests | `src/**/*.test.*`, `server/test/`, `e2e/` | Unit, API, database security, browser and accessibility tests |
| Docs | `docs/` | Architecture, security, deployment and an honest production-readiness review |

## Demo mode

If Supabase or Shopify is not configured, the app runs in **demo mode**:

- Every product, campaign, creator, order and figure is **sample data**, and it is labelled as sample data on screen.
- A banner shows on every page. Checkout explains the Shopify handoff instead of taking payment. Nothing is charged and no order is created.
- The sign-in page offers sample personas (creator, reviewer, admin, finance, shopper). They exist only in your browser tab and grant no real access.

The demo adapter mirrors the real lifecycle rules so screens behave realistically, but it is **not a security boundary**. Real access control lives in the API server and in Postgres row-level security.

## Quick start

Requires Node 20+.

```bash
npm install
npm --prefix server install
npm run dev            # web app on http://localhost:5173 (demo mode)
```

To run against real services, copy `.env.example` to `.env.local` and `server/.env.example` to `server/.env`, then fill them in. [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) explains every variable. **Never commit `.env` files.** They are git-ignored.

```bash
npm run server:dev     # API on http://localhost:8787
```

## Checks

```bash
npm run typecheck                 # web app + shared
npm run lint
npm test                          # web unit/component tests
npm --prefix server test          # API, webhook, ledger, upload, RLS and contract tests
npm --prefix server run typecheck
npm run build && npm run check:bundle-secrets
npx playwright test               # browser + axe accessibility tests (desktop and mobile)
```

The database tests run the real migration in an embedded Postgres (PGlite) with a stub of Supabase's `auth` schema. They then exercise RLS as anonymous visitors, creators, reviewers and admins. Run them against a real Supabase project before launch as well (see [docs/PRODUCTION_READINESS.md](docs/PRODUCTION_READINESS.md)).

If your environment already has Chromium installed, point Playwright at it with `CHROMIUM_PATH=/path/to/chromium`. Otherwise run `npx playwright install chromium` once.

## Routes

**Public:** `/`, `/shop`, `/shop/:productSlug`, `/collections/:collectionSlug`, `/discover`, `/campaigns`, `/campaigns/:campaignSlug`, `/how-it-works`, `/cart`, `/checkout/return`, `/login`, `/register`, `/legal/:doc` (privacy, terms, creator-terms, content-policy, shipping)

**Creator:** `/creator/onboarding`, `/creator/dashboard`, `/creator/designs`, `/creator/designs/new`, `/creator/designs/:id`, `/creator/campaigns`, `/creator/analytics`, `/creator/earnings`, `/creator/settings`

**Admin:** `/admin`, `/admin/design-reviews`, `/admin/design-reviews/:id`, `/admin/users`, `/admin/products`, `/admin/orders`, `/admin/earnings`, `/admin/payouts`, `/admin/settings`

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Security controls](docs/SECURITY.md)
- [Deployment and environment variables](docs/DEPLOYMENT.md)
- [Production-readiness review](docs/PRODUCTION_READINESS.md)

This codebase has automated tests and documented security controls. That does not make it complete or free of issues. Read the production-readiness review before taking real orders.
