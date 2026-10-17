-- Durcissement RLS profiles : ferme la self-escalade sur role/flags *_enabled/active.
-- Contexte audit activation modules : policy "FOR ALL USING(true)" permettait a tout
-- authentifie de s'octroyer role et modules. On garde fonctionnels :
--  - SELECT authentifie (listes utilisateurs dans l'app)
--  - UPDATE self limite (pin, name, photo, last_login : AuthContext:276,398, AppContext:3987)
--  - UPDATE/DELETE Direction (updateUser, toggleUserStatus, deleteUser)
--  - INSERT/DELETE via service_role uniquement (Edge create-user, scripts)
-- Reutilise public.get_auth_role() (SECURITY DEFINER, phase3_6).

-- 1. Helper direction (reutilise get_auth_role, actif uniquement)
CREATE OR REPLACE FUNCTION public.is_direction()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.get_auth_role() IN ('Directeur', 'Directeur adjoint', 'SuperAdmin');
$$;

-- 2. Policies : remplace la policy ouverte (INSERT/UPDATE/DELETE restreints)
DROP POLICY IF EXISTS "Activer tout pour les utilisateurs authentifiés" ON public.profiles;

-- lecture : tout authentifie (comportement app inchange)
DROP POLICY IF EXISTS profiles_select_authenticated ON public.profiles;
CREATE POLICY profiles_select_authenticated ON public.profiles
  FOR SELECT TO authenticated USING (true);

-- ecriture Direction : tous champs (gestion utilisateurs)
DROP POLICY IF EXISTS profiles_write_direction ON public.profiles;
CREATE POLICY profiles_write_direction ON public.profiles
  FOR UPDATE TO authenticated
  USING (public.is_direction())
  WITH CHECK (public.is_direction());

DROP POLICY IF EXISTS profiles_delete_direction ON public.profiles;
CREATE POLICY profiles_delete_direction ON public.profiles
  FOR DELETE TO authenticated
  USING (public.is_direction());

-- ecriture self : limite sa propre ligne (le trigger filtre les colonnes)
DROP POLICY IF EXISTS profiles_update_self ON public.profiles;
CREATE POLICY profiles_update_self ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Pas de policy INSERT pour authenticated : creation via service_role (Edge) uniquement.

-- 3. Trigger anti-escalade : un non-Direction ne peut modifier que
-- name, pin, photo, last_login sur sa propre ligne. Tout changement de
-- role/active/email/service_id/pos_role/flags passe par la Direction.
CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF public.is_direction() THEN
    RETURN NEW;
  END IF;
  IF NEW.id <> OLD.id
    OR NEW.role IS DISTINCT FROM OLD.role
    OR NEW.active IS DISTINCT FROM OLD.active
    OR NEW.email IS DISTINCT FROM OLD.email
    OR NEW.service_id IS DISTINCT FROM OLD.service_id
    OR NEW.pos_role IS DISTINCT FROM OLD.pos_role
    OR NEW.pos_returns_enabled IS DISTINCT FROM OLD.pos_returns_enabled
    OR NEW.pos_catalogue_enabled IS DISTINCT FROM OLD.pos_catalogue_enabled
    OR NEW.pos_supply_enabled IS DISTINCT FROM OLD.pos_supply_enabled
    OR NEW.pos_inventory_enabled IS DISTINCT FROM OLD.pos_inventory_enabled
    OR NEW.pos_stock_enabled IS DISTINCT FROM OLD.pos_stock_enabled
    OR NEW.crm_prestations_enabled IS DISTINCT FROM OLD.crm_prestations_enabled
    OR NEW.crm_caisse_enabled IS DISTINCT FROM OLD.crm_caisse_enabled
    OR NEW.crm_maintenance_enabled IS DISTINCT FROM OLD.crm_maintenance_enabled
    OR NEW.crm_stocks_enabled IS DISTINCT FROM OLD.crm_stocks_enabled
    OR NEW.crm_tiers_enabled IS DISTINCT FROM OLD.crm_tiers_enabled
    OR NEW.crm_commerciaux_enabled IS DISTINCT FROM OLD.crm_commerciaux_enabled
    OR NEW.crm_commissions_enabled IS DISTINCT FROM OLD.crm_commissions_enabled
    OR NEW.crm_facturation_enabled IS DISTINCT FROM OLD.crm_facturation_enabled
    OR NEW.crm_reports_enabled IS DISTINCT FROM OLD.crm_reports_enabled
    OR NEW.crm_team_reports_enabled IS DISTINCT FROM OLD.crm_team_reports_enabled
  THEN
    RAISE EXCEPTION 'Acces refuse : seul la Direction peut modifier role/statut/modules (tentative sur profil %)', OLD.id
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_privilege_escalation ON public.profiles;
CREATE TRIGGER trg_prevent_privilege_escalation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_profile_privilege_escalation();
