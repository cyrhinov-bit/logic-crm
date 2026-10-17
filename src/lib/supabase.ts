import { createSharedServiceFacade, createSharedSupabaseClient, getSupabaseConfigFromEnv } from '@/shared';

const { url, key } = getSupabaseConfigFromEnv({
  VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
  VITE_SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY,
});

if (!url || !key) {
  console.warn("⚠️ Clés Supabase manquantes dans le fichier .env ! L'application ne pourra pas se connecter à la base de données.");
}

export const supabase = createSharedSupabaseClient(url, key);
export const sharedServiceFacade = createSharedServiceFacade(supabase);
