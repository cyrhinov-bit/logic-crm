import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

async function createAdmin() {
  console.log("Création de l'utilisateur admin...");
  
  // 1. Essayer de se connecter d'abord (au cas où il a déjà été créé par le script précédent)
  let { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: 'admin@hinov.com',
    password: '123456',
  });

  if (authError || !authData.user) {
    console.log("Compte inexistant ou non confirmé. Tentative de création...");
    const res = await supabase.auth.signUp({
      email: 'admin@hinov.com',
      password: '123456',
    });
    authData = res.data;
    authError = res.error;
    
    if (authError) {
      console.error("Erreur de création Auth:", authError);
      return;
    }
  }
  
  console.log("Utilisateur Auth connecté :", authData.user?.id);

  // 2. Insert into profiles with the authenticated session
  if (authData.user) {
    const { error: profileError } = await supabase.from('profiles').upsert([{
      id: authData.user.id,
      email: 'admin@hinov.com',
      name: 'Administrateur',
      role: 'Directeur',
      pin: '123456',
      active: true
    }]);

    if (profileError) {
      console.error("Erreur de création Profil:", profileError.message);
    } else {
      console.log("Profil Directeur créé avec succès ! Vous pouvez maintenant vous connecter avec admin@hinov.com et le PIN 123456");
    }
  }
}

createAdmin();
