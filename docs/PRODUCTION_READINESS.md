# Production-readiness review

**Status (17 October 2026): not ready to take real orders.** The application, schema and tests are complete enough to run a closed pilot against real Supabase and Shopify test stores. The items below must be resolved or consciously accepted before launch.

This review is honest about what has and hasn't been verified. Passing tests do not mean the system is free of defects.

## What has been verified

| Check | Result |
| --- | --- |
| TypeScript strict typecheck (web, shared, server) | Passing |
| ESLint | Passing |
| Web unit and component tests (cart, variants, catalogue, carousel, route guard, lifecycle parity with SQL) | 17 passing |
| Server tests (auth, RBAC, IDOR, mass assignment, MFA, recent-auth, webhooks HMAC and replay, refunds, ledger maths, earnings reconciliation, uploads, rate limits, log redaction, jobs, config, client/server contract) | 96 passing |
| Database RLS tests: real migration in PGlite with a stubbed `auth` schema | 11 passing |
| Browser tests (Playwright, desktop and mobile): navigation, carousel keyboard, buttons and pause, reduced motion, add to bag, checkout handoff, route protection, role separation | 30 passing, including the axe scans |
| axe-core WCAG 2.1 AA scan of public pages and a product page (serious and critical violations) | None found |
| Client bundle secret scan | Passing |
| `npm audit --audit-level=high` on runtime dependencies (web and server) | No high or critical advisories. One moderate advisory remains in `react-router` 6, which needs the v7 upgrade. |

These ran in demo mode and against in-memory or embedded databases. **None of them ran against a real Supabase project, Shopify store, Printful or Printify account, or ClamAV.**

## Must do before launch

1. **Live integration testing.**
   - Run the full flow on a Shopify development store and a Supabase staging project: sign up, onboard, upload, submit, review, approve, publish, see the product in the storefront, buy with a test card, receive `orders/paid`, refund and receive `refunds/create`, then check the ledger.
   - The Shopify GraphQL calls (`productByHandle`, `productSet`, `publishablePublish`) and the POD adapters are written against the documented APIs but have not been run against real accounts. `productByHandle` is deprecated in newer Admin API versions. Move to `productByIdentifier` when you upgrade `SHOPIFY_API_VERSION`.
2. **Run the RLS tests against real Supabase.** PGlite stands in for Postgres with a stub `auth` schema. Re-run the same assertions against a Supabase branch, and run Supabase's security advisor (`get_advisors`) on the project.
3. **Print-on-demand.**
   - Map MADE NEW sizes and colours to the provider's catalogue variant IDs (`server/src/handlers.ts`).
   - Typographic (studio-made) designs need print-ready files rendered at 300 dpi before POD sync. That renderer isn't built. Uploaded artwork is the only path to POD today.
   - Route fulfilment through the provider's Shopify app. The `submitOrder` adapters are not wired up.
   - Set `PRODUCTION_COST` to your real costs. Earnings depend on it.
4. **Payouts.**
   - Approving a payout records the approval and audit entry. It does not move money.
   - Not built yet:
     - creating payout batches from eligible balances
     - a payout provider integration (for example Stripe Connect or Wise)
     - marking payouts as paid, with matching `payout` ledger entries
     - creator payout onboarding (the settings page says so)
5. **Campaigns.**
   - Creators describe a campaign when they submit a design, and live campaigns are read from the API.
   - Not built yet:
     - campaign review screens and endpoints (approve or reject a campaign and its beneficiary)
     - campaign editing
   - The schema and RLS for campaigns exist.
6. **Legal and compliance.**
   - The privacy policy, terms, creator terms and content policy are placeholders and must be reviewed by a solicitor.
   - If campaigns raise money for registered charities, UK commercial participator rules (Charities Act 1992, s.60) need specific statements at the point of sale and written agreements with each charity.
   - Check VAT treatment of the creator and campaign shares with an accountant.
   - Set up a cookie and analytics consent mechanism before adding any analytics. None is included.
7. **Privacy requests.** Export and deletion open an email to `VITE_PUBLIC_PRIVACY_EMAIL`, and fulfilling them is a manual process. Write that process down, including what is anonymised versus kept (financial records).
8. **Security testing.** Commission an independent penetration test once the live stack is running. Fix anything high or critical before launch.
9. **Operations.**
   - Error monitoring (for example Sentry, with PII scrubbing) and uptime checks on `/api/health` and the webhook endpoint.
   - Alerts on failed or dead integration jobs and on webhook signature failures.
   - Backups with a tested restore.

## Should do soon after

- **Shared rate-limit store.** The current one is in memory, per instance. Swap in Redis or Upstash before running more than one API instance.
- **Separate job worker.** Jobs run in-process every 15 seconds. Move them to a worker or a scheduled function.
- **Email notifications.** Design decisions and payouts appear in the app only. The `notifications` table exists, but email delivery is not built.
- **Content reporting and moderation.** The admin users table shows a reports column, but reporting isn't built, so it is always 0.
- **Supabase repository tests.** API tests use the in-memory repository, so `server/src/repo/supabase.ts` is covered only by typechecking. Add integration tests against a local Supabase (`supabase start`).
- **Bundle size.** The main bundle is about 300 kB (83 kB gzipped). Lazy-load `@supabase/supabase-js` so the storefront doesn't pay for it.
- **CSP.** Framer Motion needs `style-src 'unsafe-inline'`. Script CSP is strict. Review `public/_headers` for your real API and image hosts.
- **Admin order view.** It shows totals and item counts only. Customer details stay in Shopify by design. Link through to the Shopify order for support.
- **React Router 7.** Upgrade to clear the remaining moderate advisory.
- **Session revocation.** Suspending a user blocks API access at once, but their Supabase session stays valid until it expires. Also revoke sessions from the Supabase dashboard or Admin API when suspending.

## Design decisions to confirm with the MADE NEW team

- **Revenue split.** 40% creator, 40% campaign, 20% platform of the margin, with a 30-day hold (policy `2026-10-v1`). If a design has no campaign, the campaign share stays with the platform. Confirm this, or publish a different version.
- **Staff MFA** is required for reviewers, admins and finance.
- **Brand contrast.** Secondary text `#737373` is used as specified on white. On the soft and blush backgrounds it is darkened to `#666462` to meet WCAG AA (4.5:1).
