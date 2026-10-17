-- ============================================================================
-- FICHIER : 20261025000000_purge_pos.sql
-- OBJECTIF : Purge complète du Point de Vente. Application CRM uniquement.
--   - recrée le trigger d'escalade de privilèges sans les colonnes POS
--   - supprime les colonnes POS de profiles
--   - supprime les 26 tables POS / encaissement / product_completions
--   - supprime les fonctions POS
-- ============================================================================

BEGIN;

-- 1) Le trigger d'escalade référence pos_role / pos_*_enabled : recréation sans.
CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
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
    OR NEW.crm_prestations_enabled IS DISTINCT FROM OLD.crm_prestations_enabled
    OR NEW.crm_caisse_enabled IS DISTINCT FROM OLD.crm_caisse_enabled
    OR NEW.crm_maintenance_enabled IS DISTINCT FROM OLD.crm_maintenance_enabled
    OR NEW.crm_stocks_enabled IS DISTINCT FROM OLD.crm_stocks_enabled
    OR NEW.crm_tiers_enabled IS DISTINCT FROM OLD.crm_tiers_enabled
    OR NEW.crm_commerciaux_enabled IS DISTINCT FROM OLD.crm_commerciaux_enabled
    OR NEW.crm_commissions_enabled IS DISTINCT FROM OLD.crm_commissions_enabled
    OR NEW.crm_facturation_enabled IS DISTINCT FROM OLD.crm_facturation_enabled
    OR NEW.crm_sup_factures_enabled IS DISTINCT FROM OLD.crm_sup_factures_enabled
    OR NEW.crm_reports_enabled IS DISTINCT FROM OLD.crm_reports_enabled
    OR NEW.crm_team_reports_enabled IS DISTINCT FROM OLD.crm_team_reports_enabled
  THEN
    RAISE EXCEPTION 'Acces refuse : seul la Direction peut modifier role/statut/modules (tentative sur profil %)', OLD.id
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;

-- 2) Colonnes POS de profiles
ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS pos_role,
  DROP COLUMN IF EXISTS pos_returns_enabled,
  DROP COLUMN IF EXISTS pos_catalogue_enabled,
  DROP COLUMN IF EXISTS pos_supply_enabled,
  DROP COLUMN IF EXISTS pos_inventory_enabled,
  DROP COLUMN IF EXISTS pos_stock_enabled;

-- 3) Tables POS + encaissement + completude produits
DROP TABLE IF EXISTS
  public.encaissement_audit_log,
  public.encaissement_declarations,
  public.encaissement_recomptages,
  public.encaissement_litiges,
  public.encaissement_transactions,
  public.encaissement_dossiers,
  public.encaissement_echeances,
  public.encaissement_affectations,
  public.encaissement_frequences,
  public.pos_return_lines,
  public.pos_returns,
  public.pos_transaction_lines,
  public.pos_payments,
  public.pos_transactions,
  public.pos_stock_entry_lines,
  public.pos_stock_entries,
  public.pos_stock_movements,
  public.pos_inventory_lines,
  public.pos_inventories,
  public.pos_cash_sessions,
  public.pos_products,
  public.pos_categories,
  public.pos_brands,
  public.pos_suppliers,
  public.pos_discounts,
  public.pos_settings,
  public.product_completions
  CASCADE;

-- 4) Fonctions POS
DROP FUNCTION IF EXISTS public.is_caissier(uuid);
DROP FUNCTION IF EXISTS public.is_encaisseur(uuid);
DROP FUNCTION IF EXISTS public.is_affecte_a_encaisseur(uuid, uuid);
DROP FUNCTION IF EXISTS public.calculer_echeances_caissier(uuid, date, date);
DROP FUNCTION IF EXISTS public.increment_pos_stock(uuid, numeric);
DROP FUNCTION IF EXISTS public.process_pos_transaction(jsonb, jsonb, jsonb, jsonb, jsonb);
DROP FUNCTION IF EXISTS public.set_pos_product_updated_at();

COMMIT;
