-- Correctif trigger anti-escalade : bypass maintenance superuser directe.
-- Contexte : en connexion directe postgres (scripts admin, revert), auth.uid() est NULL
-- donc is_direction() = false et le trigger bloquait tout. Or PostgREST ne se connecte
-- jamais en postgres (session_user = 'authenticator' + SET ROLE), donc ce bypass ne
-- change rien au chemin applicatif : RLS + trigger restent pleinement appliques via API.
CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Maintenance superuser directe (jamais le chemin PostgREST/Edge)
  IF session_user = 'postgres' THEN
    RETURN NEW;
  END IF;
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
