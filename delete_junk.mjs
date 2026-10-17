import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

async function run() {
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: 'e.gnonskan@hinovgroup.com',
    password: '04041992'
  });

  if (authError) {
    console.error("Auth error", authError);
  }

  let totalDeleted = 0;
  
  while (true) {
    const { data, error } = await supabase
      .from('pos_products')
      .select('id')
      .eq('name', 'Produit sans nom')
      .limit(1000);

    if (error) {
      console.error("Select error", error);
      break;
    }

    if (data.length === 0) {
      console.log(`Terminé ! Plus aucun 'Produit sans nom' trouvé. Total supprimé : ${totalDeleted}`);
      break;
    }

    const ids = data.map(d => d.id);
    const { error: delError } = await supabase
      .from('pos_products')
      .delete()
      .in('id', ids);
      
    if (delError) {
      console.error("Delete error", delError);
      break;
    } else {
      totalDeleted += ids.length;
      console.log(`Suppression de ${ids.length} produits (Total: ${totalDeleted})...`);
    }
  }
}

run();
