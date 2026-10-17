-- Normalisation flags modules : NULL -> default metier (aligne DB sur le front opt-out).
-- POS + 8 CRM + team : false. reports : true (default historique 20261001180000).
-- Aucun NULL en prod au 2026-10-06 ; garde-fou pour les lignes futures/anciennes.
UPDATE public.profiles SET pos_returns_enabled = false WHERE pos_returns_enabled IS NULL;
UPDATE public.profiles SET pos_catalogue_enabled = false WHERE pos_catalogue_enabled IS NULL;
UPDATE public.profiles SET pos_supply_enabled = false WHERE pos_supply_enabled IS NULL;
UPDATE public.profiles SET pos_inventory_enabled = false WHERE pos_inventory_enabled IS NULL;
UPDATE public.profiles SET pos_stock_enabled = false WHERE pos_stock_enabled IS NULL;
UPDATE public.profiles SET crm_prestations_enabled = false WHERE crm_prestations_enabled IS NULL;
UPDATE public.profiles SET crm_caisse_enabled = false WHERE crm_caisse_enabled IS NULL;
UPDATE public.profiles SET crm_maintenance_enabled = false WHERE crm_maintenance_enabled IS NULL;
UPDATE public.profiles SET crm_stocks_enabled = false WHERE crm_stocks_enabled IS NULL;
UPDATE public.profiles SET crm_tiers_enabled = false WHERE crm_tiers_enabled IS NULL;
UPDATE public.profiles SET crm_commerciaux_enabled = false WHERE crm_commerciaux_enabled IS NULL;
UPDATE public.profiles SET crm_commissions_enabled = false WHERE crm_commissions_enabled IS NULL;
UPDATE public.profiles SET crm_facturation_enabled = false WHERE crm_facturation_enabled IS NULL;
UPDATE public.profiles SET crm_reports_enabled = true WHERE crm_reports_enabled IS NULL;
UPDATE public.profiles SET crm_team_reports_enabled = false WHERE crm_team_reports_enabled IS NULL;
