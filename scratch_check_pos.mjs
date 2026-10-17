import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

async function checkData() {
  await supabase.auth.signInWithPassword({
    email: 's.diallo@hinovgroup.com',
    password: '456987'
  });
  
  const tables = ['pos_categories', 'pos_products', 'pos_stock_entries', 'pos_stock_movements'];
  for (const table of tables) {
    const { count, error } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true });
    
    if (error) {
      console.error(`Erreur ${table}:`, error.message);
    } else {
      console.log(`${table}: ${count} enregistrements`);
    }
  }
}

checkData();
