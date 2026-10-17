-- ============================================================================
-- FICHIER : 20261024000000_remove_pos_roles.sql
-- OBJECTIF : Suppression des rôles POS (Caissier, Gerant, Encaisseur).
--            L'application est désormais CRM uniquement : seuls subsistent
--            les rôles de gestion (Directeur, Directeur adjoint, Responsable,
--            Commercial) et le SuperAdmin.
-- ============================================================================

BEGIN;

-- Aucun compte ne doit porter un rôle POS, sinon la nouvelle contrainte échoue
-- (échec volontaire et explicite plutôt que réécriture silencieuse des rôles).
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
ADD CONSTRAINT profiles_role_check
CHECK (
    role IN (
        'Directeur',
        'Directeur adjoint',
        'Responsable',
        'Commercial',
        'SuperAdmin'
    )
);

COMMIT;
