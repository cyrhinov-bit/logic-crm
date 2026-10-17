-- Migration : Ajout du rôle 'Encaisseur' à la contrainte profiles_role_check
-- Objectif : Permettre la création de comptes Encaisseurs sans affecter les rôles existants
-- Date : 2026-10-15
-- Auteur : Agent Intégration POS

-- Étape 1 : Supprimer l'ancienne contrainte
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

-- Étape 2 : Créer la nouvelle contrainte incluant 'Encaisseur'
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (
    role IN (
      'Directeur',
      'Directeur adjoint',
      'Responsable',
      'Commercial',
      'Caissier',
      'Gerant',
      'Encaisseur',
      'SuperAdmin'
    )
  );

-- Note : Les données existantes ne sont pas modifiées (aucune migration de données nécessaire)
-- Note : Le rôle 'Encaisseur' sera géré par l'Edge Function create-user et l'interface Utilisateurs
