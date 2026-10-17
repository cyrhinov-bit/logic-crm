-- ============================================================================
-- FICHIER : 20261015000002_encaissement_transactions_link.sql
-- OBJECTIF : Table de liaison entre transactions POS et dossiers de versement
-- DATE : 2026-10-15
-- ============================================================================
-- Problème résolu : Empêcher qu'une même transaction soit rattachée à plusieurs
--                   remises confirmées de manière incompatible.
-- Solution : Table de liaison avec contrainte UNIQUE sur transaction_id.
-- ============================================================================

BEGIN;

-- Table de liaison entre transactions et dossiers de versement
CREATE TABLE IF NOT EXISTS encaissement_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dossier_id UUID NOT NULL REFERENCES encaissement_dossiers(id) ON DELETE CASCADE,
    transaction_id UUID NOT NULL REFERENCES pos_transactions(id) ON DELETE RESTRICT,
    montant_espèces NUMERIC NOT NULL DEFAULT 0,
    montant_mobile_money NUMERIC NOT NULL DEFAULT 0,
    montant_carte NUMERIC NOT NULL DEFAULT 0,
    date_ajout TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT TIMEZONE('utc'::text, NOW()),
    
    -- Contrainte : une transaction ne peut être liée qu'à un seul dossier
    CONSTRAINT encaissement_transactions_unique_tx UNIQUE (transaction_id),
    
    -- Contrainte : les montants doivent être positifs ou nuls
    CONSTRAINT encaissement_transactions_montant_check CHECK (
        montant_espèces >= 0 AND montant_mobile_money >= 0 AND montant_carte >= 0
    )
);

-- Index pour recherche rapide
CREATE INDEX IF NOT EXISTS idx_encaissement_transactions_dossier ON encaissement_transactions(dossier_id);
CREATE INDEX IF NOT EXISTS idx_encaissement_transactions_tx ON encaissement_transactions(transaction_id);

-- RLS
ALTER TABLE encaissement_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "encaissement_transactions_select" ON encaissement_transactions
  FOR SELECT TO authenticated USING (
    public.is_direction()
    OR EXISTS (
      SELECT 1 FROM encaissement_dossiers d
      WHERE d.id = dossier_id 
        AND (d.caissier_id = auth.uid() OR d.encaisseur_id = auth.uid())
    )
  );

CREATE POLICY "encaissement_transactions_insert" ON encaissement_transactions
  FOR INSERT TO authenticated WITH CHECK (
    public.is_direction()
    OR EXISTS (
      SELECT 1 FROM encaissement_dossiers d
      WHERE d.id = dossier_id 
        AND d.caissier_id = auth.uid()
    )
  );

COMMIT;

-- ============================================================================
-- RETOUR ARRIÈRE
-- ============================================================================
-- BEGIN;
--   DROP TABLE IF EXISTS encaissement_transactions;
-- COMMIT;
-- ============================================================================
