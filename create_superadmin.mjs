import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

async function createSuperAdmin() {
  console.log("Création de l'utilisateur Super Admin...");
  
  const email = 'e.gnonskan@hinovgroup.com';
  const pin = '04041992';
  
  // 1. SignUp
  let { data: authData, error: authError } = await supabase.auth.signUp({
    email: email,
    password: pin,
  });

  if (authError && authError.message.includes('already registered')) {
    console.log("L'utilisateur existe déjà, tentative de connexion...");
    const res = await supabase.auth.signInWithPassword({
      email,
      password: pin,
    });
    authData = res.data;
    authError = res.error;
  }

  if (authError) {
    console.error("Erreur Auth:", authError);
    return;
  }
  
  console.log("Utilisateur Auth prêt :", authData.user?.id);

  // 2. Insert into profiles with the authenticated session if possible
  // NOTE: If RLS prevents it, we can't insert it. Wait, previously we saw RLS prevents insertion into profiles for non-authenticated users.
  // Actually, since email confirmation is enabled, the user might not be able to log in.
  // But let's try to UPSERT anyway.
  if (authData.user) {
    const { error: profileError } = await supabase.from('profiles').upsert([{
      id: authData.user.id,
      email: email,
      name: 'Evariste G.',
      role: 'SuperAdmin',
      pin: pin,
      active: true
    }]);

    if (profileError) {
      console.error("Erreur de création Profil:", profileError.message);
    } else {
      console.log("Profil SuperAdmin créé avec succès !");
    }
  }
}

createSuperAdmin();
