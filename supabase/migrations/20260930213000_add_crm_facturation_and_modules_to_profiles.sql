-- Migration: Add crm_facturation_enabled and ensure all CRM module permissions exist on profiles
ALTER TABLE IF EXISTS profiles
ADD COLUMN IF NOT EXISTS crm_prestations_enabled BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS crm_caisse_enabled BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS crm_maintenance_enabled BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS crm_stocks_enabled BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS crm_tiers_enabled BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS crm_commerciaux_enabled BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS crm_commissions_enabled BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS crm_facturation_enabled BOOLEAN DEFAULT FALSE;
