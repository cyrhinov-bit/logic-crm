-- Migration: commissions commandes — taux/mode responsable & commercial
-- Règle métier :
-- - Apporteur : prix_client_final * taux_commission_app / 100 (colonne existante)
-- - Responsable / Commercial : bascule MONTANT (forfait) ou TAUX (% de la marge interne)
-- Stratégie additive uniquement (ADD COLUMN IF NOT EXISTS).

ALTER TABLE public.prestations_commandes ADD COLUMN IF NOT EXISTS taux_commission_resp NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE public.prestations_commandes ADD COLUMN IF NOT EXISTS mode_commission_resp TEXT NOT NULL DEFAULT 'MONTANT';
ALTER TABLE public.prestations_commandes ADD COLUMN IF NOT EXISTS taux_commission_agent NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE public.prestations_commandes ADD COLUMN IF NOT EXISTS mode_commission_agent TEXT NOT NULL DEFAULT 'MONTANT';

-- Garde-fous : taux >= 0, modes valides
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_prestations_taux_resp_pos') THEN
    ALTER TABLE public.prestations_commandes ADD CONSTRAINT chk_prestations_taux_resp_pos CHECK (taux_commission_resp >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_prestations_taux_agent_pos') THEN
    ALTER TABLE public.prestations_commandes ADD CONSTRAINT chk_prestations_taux_agent_pos CHECK (taux_commission_agent >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_prestations_mode_resp') THEN
    ALTER TABLE public.prestations_commandes ADD CONSTRAINT chk_prestations_mode_resp CHECK (mode_commission_resp IN ('MONTANT', 'TAUX'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_prestations_mode_agent') THEN
    ALTER TABLE public.prestations_commandes ADD CONSTRAINT chk_prestations_mode_agent CHECK (mode_commission_agent IN ('MONTANT', 'TAUX'));
  END IF;
END $$;
