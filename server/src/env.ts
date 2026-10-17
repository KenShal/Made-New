import { z } from 'zod';

/**
 * Server configuration. Every secret comes from the environment (never from the
 * repo). In production, missing integration secrets fail fast at boot.
 */
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  PORT: z.coerce.number().int().default(8787),
  PUBLIC_SITE_URL: z.string().url().default('http://localhost:5173'),
  CORS_ALLOWED_ORIGINS: z.string().default('http://localhost:5173'),

  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_ANON_KEY: z.string().min(20).optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20).optional(),
  SUPABASE_JWT_SECRET: z.string().min(32).optional(),

  SHOPIFY_STORE_DOMAIN: z.string().regex(/^[a-z0-9-]+\.myshopify\.com$/).optional(),
  SHOPIFY_ADMIN_ACCESS_TOKEN: z.string().min(10).optional(),
  SHOPIFY_WEBHOOK_SECRET: z.string().min(10).optional(),
  SHOPIFY_API_VERSION: z.string().default('2025-01'),
  /** Publication (sales channel) id the Storefront API reads from, e.g. gid://shopify/Publication/123. */
  SHOPIFY_PUBLICATION_ID: z.string().startsWith('gid://shopify/Publication/').optional(),

  POD_PROVIDER: z.enum(['printful', 'printify', 'none']).default('none'),
  PRINTFUL_API_TOKEN: z.string().optional(),
  PRINTFUL_STORE_ID: z.string().optional(),
  PRINTIFY_API_TOKEN: z.string().optional(),
  PRINTIFY_SHOP_ID: z.string().optional(),

  CLAMAV_HOST: z.string().optional(),
  CLAMAV_PORT: z.coerce.number().int().default(3310),

  CUSTOMER_REF_SALT: z.string().min(16).optional(),
  REQUIRE_STAFF_MFA: z.enum(['true', 'false']).default('true'),
});

export type Env = z.infer<typeof schema>;

export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  // Treat empty values (e.g. an unfilled line copied from .env.example) as unset.
  const cleaned = Object.fromEntries(Object.entries(source).filter(([, v]) => v !== undefined && v.trim() !== ''));
  const env = schema.parse(cleaned);
  if (env.NODE_ENV === 'production') {
    const required: (keyof Env)[] = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'SHOPIFY_STORE_DOMAIN', 'SHOPIFY_ADMIN_ACCESS_TOKEN', 'SHOPIFY_WEBHOOK_SECRET', 'CUSTOMER_REF_SALT'];
    const missing = required.filter((k) => !env[k]);
    if (missing.length) throw new Error(`Missing required production configuration: ${missing.join(', ')}`);
    if (env.POD_PROVIDER === 'none') throw new Error('POD_PROVIDER must be configured in production');
  }
  return env;
}
