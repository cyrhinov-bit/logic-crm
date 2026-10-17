import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

async function checkProfiles() {
  const { data, error } = await supabase.from('profiles').select('*');
  if (error) {
    console.error("Erreur:", error);
  } else {
    console.log("Profiles existants:", data);
  }
}

checkProfiles();
