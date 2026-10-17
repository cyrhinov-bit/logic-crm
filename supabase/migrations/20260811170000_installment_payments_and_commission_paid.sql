-- Migration: Paiements par échéances (ventes) + commission proportionnelle
-- 1. Table des échéances d'une vente
-- 2. Colonne paid_amount sur commissions (libération de la commission au prorata des encaissements)
-- 3. Colonne commission_rate sur settings (taux de commission configurable)

-- 1. Table des échéances
CREATE TABLE IF NOT EXISTS vente_echeances (
    id UUID PRIMARY KEY,
    vente_id UUID REFERENCES ventes(id) ON DELETE CASCADE,
    amount NUMERIC NOT NULL,
    due_date DATE NOT NULL,
    paid_amount NUMERIC NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'En attente' CHECK (status IN ('En attente', 'Payée')),
    paid_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- 2. Commission : suivi des sommes réellement payées au commercial
ALTER TABLE commissions ADD COLUMN IF NOT EXISTS paid_amount NUMERIC NOT NULL DEFAULT 0;

-- 3. Paramètres : taux de commission commerciale configurable
ALTER TABLE settings ADD COLUMN IF NOT EXISTS commission_rate NUMERIC;

-- 4. RLS
ALTER TABLE vente_echeances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Activer tout pour les utilisateurs authentifiés" ON vente_echeances FOR ALL TO authenticated USING (true);

-- 5. Index
CREATE INDEX IF NOT EXISTS idx_vente_echeances_vente_id ON vente_echeances(vente_id);
CREATE INDEX IF NOT EXISTS idx_vente_echeances_status ON vente_echeances(status);
CREATE INDEX IF NOT EXISTS idx_commissions_paid_amount ON commissions(paid_amount);