import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { config, integrations } from './config';

/**
 * Browser Supabase client using the public anon key. All data access is still
 * governed by Row Level Security; the anon key grants nothing on its own.
 * Sessions use PKCE. The service-role key must never appear in this bundle.
 */
export const supabase: SupabaseClient | null = integrations.supabase
  ? createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;
