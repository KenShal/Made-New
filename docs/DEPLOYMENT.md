# Deployment

MADE NEW has three deployable parts:

1. **Web app.** A static build in `dist/`, served by any static host (Netlify, Cloudflare Pages, Vercel or S3 + CloudFront).
2. **API server.** `server/`, a Node 20 service (Fly.io, Render, Railway or a container).
3. **Supabase project.** Postgres, Auth and Storage.

Shopify is the commerce backend. Printful or Printify handles printing.

> **Secrets:** never commit `.env` files. Set server secrets in the host's secret manager. The browser build may contain only `VITE_PUBLIC_*` values, which are public by design. CI runs `npm run check:bundle-secrets` after every build.

## 1. Supabase

1. Create a project. Copy the **Project URL**, the **anon (public) key** and the **service_role key**. The service role key goes on the server only.
2. Apply the migrations, either with `supabase link --project-ref <ref>` then `supabase db push`, or by running the files in `supabase/migrations/` in order in the SQL editor.
3. **Auth settings:**
   - Turn on email confirmation.
   - Set the Site URL and redirect URLs to your web origin, including `/login`.
   - Turn on **TOTP MFA**. Staff accounts must enrol before they can use the admin centre when `REQUIRE_STAFF_MFA=true`.
   - Keep leaked-password protection on, along with the default auth rate limits.
4. **Create the first admin.** Roles can only be granted with the service role. In the SQL editor (which runs as the database owner):
   ```sql
   select public.grant_role('<user uuid>', 'admin', null);
   select public.grant_role('<user uuid>', 'reviewer', null);
   -- Finance is separate on purpose; give it to a different person where possible.
   select public.grant_role('<finance user uuid>', 'finance', null);
   ```
5. **Backups.** Turn on point-in-time recovery (Pro plan or above) and test a restore before launch. The ledger and audit log are append-only. Treat them as financial records and keep them for the period your accountant advises (UK: usually 6 years).
6. Don't load `supabase/seed.sql` into production. It contains development sample data.

## 2. Shopify

1. Create a **custom app** in the Shopify admin (Settings, Apps and sales channels, Develop apps).
2. Admin API scopes, kept to the minimum:
   - `write_products` and `read_products`, to create products from approved designs.
   - `read_orders`, for order and refund webhooks.
   - `write_publications` and `read_publications`, to publish products to the storefront channel.
3. Install the app and copy the **Admin API access token** into `SHOPIFY_ADMIN_ACCESS_TOKEN`. Copy the app's **API secret key** into `SHOPIFY_WEBHOOK_SECRET`.
4. Install the **Headless** sales channel. Create a storefront and copy its **public Storefront API token** into `VITE_PUBLIC_SHOPIFY_STOREFRONT_TOKEN`. Find that channel's publication ID with the Admin GraphQL query `{ publications(first: 10) { nodes { id name } } }`, then set `SHOPIFY_PUBLICATION_ID`.
5. **Webhooks.** Create them through the app (Admin API or the app configuration), so they're signed with the app secret. Use JSON format, the same API version as `SHOPIFY_API_VERSION`, and endpoint `https://<api-host>/webhooks/shopify` for each:
   - `orders/paid`
   - `refunds/create`
6. **Checkout return.** Set the order status page's "continue shopping" link, or a post-purchase redirect, to `https://<web-host>/checkout/return?status=success`. This page only clears the bag. Orders are recorded only from the signed webhook.
7. Set up taxes and shipping in Shopify. MADE NEW reads tax per line and total shipping from the webhook.

## 3. Print on demand

- Set `POD_PROVIDER` to `printful` or `printify`, then set that provider's token and store or shop ID.
- **Fulfilment.** The simplest reliable route is the provider's own Shopify app (the Printful or Printify app). It receives Shopify orders and fulfils them, and MADE NEW does not submit orders itself. The `submitOrder` adapters exist in `server/src/integrations/pod/`, but they are not yet wired to `orders/paid`.
- **Variant mapping.** Each MADE NEW size and colour must map to the provider's catalogue variant ID for your blank garment (for example, Printful's catalogue variant for a heavyweight tee in Bone, size M). Put this mapping in `server/src/handlers.ts` before enabling POD product sync. Production costs used for earnings live in `PRODUCTION_COST`, in the same file. Keep them in line with your provider's prices.

## 4. Malware scanning

Run `clamd` (for example, the `clamav/clamav` container) where the API can reach it on TCP. Set `CLAMAV_HOST` and `CLAMAV_PORT`. Without it, uploads stay `pending` and their designs can't be submitted.

## 5. API server

```bash
cd server
npm ci
npm run build        # bundles to dist/index.js
NODE_ENV=production node dist/index.js
```

- `sharp` installs a native binary. Build on the same OS and architecture you deploy to, or run `npm ci` in the container.
- **Production fails at boot** if a required variable is missing.
- **Rate limiting** is in memory. Run a single instance, or replace `memoryStore` in `server/src/http/rate-limit.ts` with a shared store such as Redis or Upstash before scaling out.
- **Integration jobs** run in-process every 15 seconds. For heavier use, run them in a separate worker.
- **Client IPs.** Put the API behind exactly one TLS proxy that appends to `X-Forwarded-For`. The rate limiter keys signed-out callers on the last hop, which is the one your proxy adds. If you have more proxy layers, adjust this in `server/src/app.ts`.

## 6. Web app

```bash
npm ci
npm run build
npm run check:bundle-secrets
```

Deploy `dist/`. All routes must fall back to `index.html` (SPA fallback). `netlify.toml` plus `public/_redirects` configure Netlify, and `vercel.json` configures Vercel, so importing the repo on either host works with no extra settings.

**GitHub Pages (demo only).** `.github/workflows/pages.yml` builds the demo-mode site with hash URLs (`/#/shop`, since Pages has no fallback to `index.html`) and pushes it to the `gh-pages` branch on every push to `main`. Turn it on once under Settings, Pages: "Deploy from a branch", branch `gh-pages`, folder `/ (root)`. Pages ignores `_headers`, so it has no CSP. Use Netlify, Vercel or Cloudflare Pages for the real site. `public/_headers` sets a CSP and security headers on Netlify and Cloudflare Pages. Edit its `connect-src` to include your API origin. On other hosts, configure the same headers yourself.

## Environment variables

### Web app (`.env.local`, or the static host's build settings)

| Variable | Required | Purpose |
| --- | --- | --- |
| `VITE_PUBLIC_API_BASE_URL` | Live mode | Origin of the API server, e.g. `https://api.madenew.example`. |
| `VITE_PUBLIC_SUPABASE_URL` | Live mode | Supabase Project URL. |
| `VITE_PUBLIC_SUPABASE_ANON_KEY` | Live mode | Supabase **anon** key. It's public, and RLS protects data. Never the service role key. |
| `VITE_PUBLIC_SHOPIFY_STORE_DOMAIN` | Live mode | `your-store.myshopify.com`. |
| `VITE_PUBLIC_SHOPIFY_STOREFRONT_TOKEN` | Live mode | Public Storefront API token from the Headless channel. |
| `VITE_PUBLIC_PRIVACY_EMAIL` | Recommended | Address that data-export and account-deletion requests are sent to. |
| `VITE_PUBLIC_APP_ENV` | No | `development`, `staging` or `production`. In production, a missing integration logs an error and the site shows demo mode clearly. |

If Supabase or Shopify is missing, the app runs in labelled demo mode.

### API server (`server/.env` locally, or the host's secret manager)

| Variable | Required in production | Purpose |
| --- | --- | --- |
| `NODE_ENV` | Yes | `production` turns on fail-fast checks. |
| `PORT` | No | Listen port (default 8787). |
| `PUBLIC_SITE_URL` | Yes | Web origin, used in links. |
| `CORS_ALLOWED_ORIGINS` | Yes | Comma-separated browser origins allowed to call the API. |
| `SUPABASE_URL` | Yes | Supabase Project URL. Also used to find the JWKS for token verification. |
| `SUPABASE_ANON_KEY` | Yes | Anon key. |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | **Secret.** Bypasses RLS, so it's used only for server-side writes (webhooks, ledger, jobs, storage). |
| `SUPABASE_JWT_SECRET` | No | **Secret.** Needed only for projects still on the legacy HS256 JWT secret. Otherwise asymmetric keys are verified through JWKS. |
| `SHOPIFY_STORE_DOMAIN` | Yes | `your-store.myshopify.com`. Webhooks from other shops are rejected. |
| `SHOPIFY_ADMIN_ACCESS_TOKEN` | Yes | **Secret.** Admin API token for the custom app. |
| `SHOPIFY_WEBHOOK_SECRET` | Yes | **Secret.** The app's API secret key, used to verify webhook HMACs. |
| `SHOPIFY_API_VERSION` | No | Admin API version (default `2025-01`). Keep it in line with the webhook API version. |
| `SHOPIFY_PUBLICATION_ID` | Recommended | Sales channel that new products are published to. Without it, products are created but not shown in the storefront. |
| `POD_PROVIDER` | Yes | `printful` or `printify`. `none` is refused in production. |
| `PRINTFUL_API_TOKEN`, `PRINTFUL_STORE_ID` | With Printful | **Secret** token and store ID. |
| `PRINTIFY_API_TOKEN`, `PRINTIFY_SHOP_ID` | With Printify | **Secret** token and shop ID. |
| `CLAMAV_HOST`, `CLAMAV_PORT` | Strongly recommended | clamd address. Without it, uploads cannot pass validation. |
| `CUSTOMER_REF_SALT` | Yes | **Secret.** Random string of 32+ characters, used to hash Shopify customer IDs so no customer PII is stored. Don't change it after launch. |
| `REQUIRE_STAFF_MFA` | No | Default `true`. Leave it on in production. |

Blank values are treated as unset, so copying `.env.example` and filling in only what you need works.

## Rotating secrets

- **Shopify Admin token or webhook secret:** rotate in the app settings, update the host secret, then redeploy. Webhooks signed with the old secret will fail until the redeploy.
- **Supabase service role key:** rotate in Project settings, then API, then update the host secret.
- If a secret is ever committed, rotate it at once. Removing it from git history is not enough.
