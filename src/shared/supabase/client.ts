import { createClient } from '@supabase/supabase-js';
import type { SharedSupabaseEnv, SharedSupabaseClient } from '../types';

export function getSupabaseConfigFromEnv(env: SharedSupabaseEnv) {
  const url = env.VITE_SUPABASE_URL || env.EXPO_PUBLIC_SUPABASE_URL || 'http://localhost:54321';
  const key = env.VITE_SUPABASE_ANON_KEY || env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'dummy_key';

  return {
    url,
    key,
  };
}

export function createSharedSupabaseClient(url: string, key: string): SharedSupabaseClient {
  // CORRIGÉ : persistance + auto-refresh indispensables. Sans cela, getSession()
  // est vide à chaque reload et chaque run sync retombait en re-login PIN.
  return createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
}
