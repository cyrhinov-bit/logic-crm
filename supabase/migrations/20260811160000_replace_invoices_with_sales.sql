-- Migration: Remplacement du module Factures par le module Ventes
-- Une vente est conclue sur un devis Accepté via un modal renseignant le prix de revient par ligne.
-- La marge = Total HT - Coût de revient ; la commission = 10% de la marge (commercial assigné).

-- 1. Suppression des tables Factures si elles existent (retour en arrière de l'ancienne migration)
DROP TABLE IF EXISTS invoice_lines CASCADE;
DROP TABLE IF EXISTS invoices CASCADE;

-- 2. Table des ventes
CREATE TABLE IF NOT EXISTS ventes (
    id UUID PRIMARY KEY,
    sale_number TEXT UNIQUE NOT NULL,
    quote_id UUID REFERENCES quotes(id) ON DELETE SET NULL,
    client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
    service_id UUID REFERENCES services(id) ON DELETE SET NULL,
    subtotal NUMERIC NOT NULL,
    vat NUMERIC NOT NULL,
    total NUMERIC NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('Enregistrée', 'Payée', 'Annulée')),
    date DATE NOT NULL,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- 3. Lignes de vente (coût de revient par ligne pour le calcul de marge)
CREATE TABLE IF NOT EXISTS vente_lines (
    id UUID PRIMARY KEY,
    vente_id UUID REFERENCES ventes(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    unit_price NUMERIC NOT NULL,
    cost_price NUMERIC DEFAULT 0,
    total NUMERIC NOT NULL
);

-- 4. Commissions : liaison sur la vente
ALTER TABLE commissions DROP COLUMN IF EXISTS invoice_id;
ALTER TABLE commissions ADD COLUMN IF NOT EXISTS vente_id UUID REFERENCES ventes(id) ON DELETE SET NULL;

-- 5. RLS
ALTER TABLE ventes ENABLE ROW LEVEL SECURITY;
ALTER TABLE vente_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Activer tout pour les utilisateurs authentifiés" ON ventes FOR ALL TO authenticated USING (true);
CREATE POLICY "Activer tout pour les utilisateurs authentifiés" ON vente_lines FOR ALL TO authenticated USING (true);

-- 6. Index
CREATE INDEX IF NOT EXISTS idx_ventes_number ON ventes(sale_number);
CREATE INDEX IF NOT EXISTS idx_ventes_client_id ON ventes(client_id);
CREATE INDEX IF NOT EXISTS idx_ventes_quote_id ON ventes(quote_id);
CREATE INDEX IF NOT EXISTS idx_vente_lines_vente_id ON vente_lines(vente_id);
CREATE INDEX IF NOT EXISTS idx_commissions_vente_id ON commissions(vente_id);