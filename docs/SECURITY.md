# Security controls

This document lists the controls in place and how each is tested. It is not a claim that the application is secure. See [PRODUCTION_READINESS.md](PRODUCTION_READINESS.md) for known gaps and the checks to run before launch.

Report vulnerabilities privately to the MADE NEW team. Do not open a public issue.

## Authentication

| Control | Where | Test |
| --- | --- | --- |
| Supabase Auth with PKCE; passwords at least 12 characters | `src/lib/supabase.ts`, `src/lib/validation.ts` | — |
| API verifies the JWT signature, issuer and audience (JWKS, or the legacy HS256 secret) | `server/src/auth.ts` | `authz.test.ts` (invalid and missing tokens) |
| Suspended accounts are refused on every request | `server/src/app.ts` | `authz.test.ts` |
| Staff (reviewer, admin, finance) must use MFA (`aal2`) when `REQUIRE_STAFF_MFA=true` | `requireStaffMfa` | `authz.test.ts` |
| Payout approval and ledger adjustments need a sign-in within the last 15 minutes | `requireRecentAuth` | `authz.test.ts` |
| Open-redirect protection on `?next=` | `safeNext` | `domain.test.ts` |

## Authorisation

- **Roles are server-side data.** The `user_roles` table is read on each request. Sign-up metadata that claims a role is ignored. RLS test: *ignores role claims in sign-up metadata*.
- **Separation of duties.** Reviewers can move designs through review but cannot see orders, the ledger or payouts. Finance can approve payouts and make adjustments but cannot review designs. Admins can't approve payouts unless they also hold the finance role.
- **Resource checks.** Every design read or write checks ownership. A design you don't own returns the same 404 as a design that doesn't exist, so IDs can't be probed. Tests: *creator isolation*, *no IDOR oracle*.
- **Mass assignment.** Request bodies are parsed with strict zod schemas. Unknown fields (`status`, `creatorId`, prices, roles) are rejected. Test: `authz.test.ts`.
- **Row-level security** is on every table, with explicit grants and column-level update grants. `server/test/rls.test.ts` runs the real migration and checks the following:
  - Anonymous visitors cannot read designs, orders, the ledger, payouts, roles, notes, assets or audit logs.
  - Creators see only their own designs. Reviewers never see drafts.
  - Users cannot grant themselves roles or call privileged functions.
  - Status can only change through `transition_design()`, which enforces actors, reasons and the self-review ban.
  - Internal review notes are hidden from creators.
  - The ledger, review events and audit log reject UPDATE and DELETE, even for the table owner.

The browser's role checks (`RequireRole`) only shape the UI. They are not a security boundary.

## Payments and orders

- No card data is collected or stored. Payment happens on Shopify's hosted checkout.
- Admin API tokens, webhook secrets and the Supabase service role key live only in the server's environment. `npm run check:bundle-secrets` fails the build if any of them, or a `service_role` JWT, appears in the browser bundle.
- **Webhooks:**
  - HMAC-SHA256 is verified on the raw body with a constant-time comparison.
  - The shop domain is checked.
  - The body is limited to 1 MB.
  - Each delivery ID is processed once. A delivery that failed partway through is safely re-processed, because every write is idempotent.
  - Tests: `webhooks.test.ts`, covering bad signatures, tampered bodies, replays, duplicates and partial refunds.
- The browser never tells the server an order was paid. The checkout return page only clears the bag.
- Customer PII stays in Shopify. Orders store a salted hash of the Shopify customer ID.

## Uploads

1. A size limit applies twice: at the HTTP body limit (returns 413) and inside the processor.
2. The file type is detected from magic bytes. The declared MIME type and filename are ignored.
3. The image is decoded with a pixel limit to stop decompression bombs, then re-encoded to PNG. This strips metadata (EXIF and GPS) and neutralises polyglot files.
4. It is scanned with ClamAV. Without a scanner, files stay `pending`, and a pending file can't pass validation, so its design can't be submitted or approved.
5. The file is stored under a random `{creatorId}/{uuid}.png` path in a private bucket. Clients can't write to storage. Reads use 10-minute signed URLs.

Tests: `upload.test.ts`, covering HTML disguised as PNG, corrupt PNGs, polyglot payloads, the scanner rejecting a file, oversize bodies, and wrong roles.

## Web protections (OWASP)

- **XSS:** React escapes all output. Lint forbids `dangerouslySetInnerHTML`. User text is never rendered as HTML. Artwork is server-re-encoded raster, never user SVG.
- **CSRF:** the API uses bearer tokens, not cookies. CORS is limited to `CORS_ALLOWED_ORIGINS`.
- **Headers:**
  - The API sends a strict CSP (`default-src 'none'`), HSTS, `X-Frame-Options: DENY`, `nosniff`, a referrer policy and CORP.
  - The static site ships `public/_headers` with a CSP for Netlify or Cloudflare Pages. Set the same headers on other hosts.
- **Rate limits** are applied per user (or per IP when signed out):
  - general: 300/min
  - writes: 60/min
  - uploads: 20 per 10 min
  - payouts and adjustments: 10 per 10 min
  - webhooks: 600/min

  The limiter is in-memory, so it needs a shared store when running several instances.
- **Idempotency keys** are required on publish, retry, payout approval and adjustments.
- **SQL injection:** all queries are parameterised through supabase-js or Postgres functions, and search input is length-limited and escaped.
- **Error handling:** clients get generic messages and a request ID. Stack traces stay in the logs.

## Logging and audit

- Structured JSON logs. Keys such as `password`, `token`, `secret`, `authorization`, `card` and `signature` are redacted, along with bearer tokens, JWTs and Shopify tokens inside strings. Test: `platform.test.ts`.
- These actions write to the append-only `audit_logs` table:
  - role grants and revocations
  - design transitions
  - suspensions
  - payout approvals
  - adjustments
  - malware rejections
  - job retries

## Dependencies

CI runs `npm audit --audit-level=high` for both packages. Versions are pinned through lockfiles.
