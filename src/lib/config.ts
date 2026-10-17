/**
 * Public, browser-safe configuration. Only VITE_PUBLIC_* variables are exposed by Vite.
 * Never put secrets here: the Shopify Storefront token is a public, scoped token
 * designed for browsers; Admin API tokens live only on the server.
 */
const env = import.meta.env;

export const config = {
  apiBaseUrl: (env.VITE_PUBLIC_API_BASE_URL as string | undefined) ?? '',
  supabaseUrl: (env.VITE_PUBLIC_SUPABASE_URL as string | undefined) ?? '',
  supabaseAnonKey: (env.VITE_PUBLIC_SUPABASE_ANON_KEY as string | undefined) ?? '',
  shopifyDomain: (env.VITE_PUBLIC_SHOPIFY_STORE_DOMAIN as string | undefined) ?? '',
  shopifyStorefrontToken: (env.VITE_PUBLIC_SHOPIFY_STOREFRONT_TOKEN as string | undefined) ?? '',
  privacyEmail: (env.VITE_PUBLIC_PRIVACY_EMAIL as string | undefined) || 'privacy@madenew.example',
  appEnv: ((env.VITE_PUBLIC_APP_ENV as string | undefined) ?? 'development') as 'development' | 'staging' | 'production',
};

export const integrations = {
  supabase: Boolean(config.supabaseUrl && config.supabaseAnonKey),
  shopify: Boolean(config.shopifyDomain && config.shopifyStorefrontToken),
  api: Boolean(config.apiBaseUrl),
};

/** Demo mode: no live backend is configured, so the app runs on labelled sample data. */
export const DEMO_MODE = !integrations.supabase || !integrations.shopify;

if (config.appEnv === 'production' && DEMO_MODE) {
  // Refuse to silently present sample data as a real store in production builds.
  console.error('[MADE NEW] Production build is missing Supabase or Shopify configuration. Running in demo mode.');
}
