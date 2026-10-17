-- Migration: Création des tables du module POS (catalogue, stock, inventaire, caisse, ventes)
-- Ce fichier est appliqué avant 20260804120000 pour que les FKs/index y référençant existent.

-- 1. Catalogue
CREATE TABLE IF NOT EXISTS pos_categories (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL,
    family TEXT NOT NULL CHECK (family IN ('Livre', 'Fourniture')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

CREATE TABLE IF NOT EXISTS pos_brands (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

CREATE TABLE IF NOT EXISTS pos_suppliers (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL,
    contact TEXT,
    phone TEXT,
    email TEXT,
    address TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

CREATE TABLE IF NOT EXISTS pos_products (
    id UUID PRIMARY KEY,
    reference TEXT UNIQUE NOT NULL,
    barcode TEXT,
    isbn TEXT,
    name TEXT NOT NULL,
    family TEXT NOT NULL CHECK (family IN ('Livre', 'Fourniture')),
    category_id UUID REFERENCES pos_categories(id),
    brand_id UUID REFERENCES pos_brands(id),
    supplier_id UUID REFERENCES pos_suppliers(id),
    purchase_price NUMERIC NOT NULL DEFAULT 0,
    selling_price NUMERIC NOT NULL DEFAULT 0,
    quantity NUMERIC NOT NULL DEFAULT 0,
    min_stock NUMERIC NOT NULL DEFAULT 0,
    image_url TEXT,
    description TEXT,
    status TEXT DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- 2. Stocks & entrées
CREATE TABLE IF NOT EXISTS pos_stock_entries (
    id UUID PRIMARY KEY,
    reference TEXT UNIQUE NOT NULL,
    supplier_id UUID REFERENCES pos_suppliers(id),
    date DATE NOT NULL,
    total_amount NUMERIC NOT NULL DEFAULT 0,
    status TEXT NOT NULL CHECK (status IN ('Brouillon', 'Validé', 'Annulé')) DEFAULT 'Brouillon',
    notes TEXT,
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

CREATE TABLE IF NOT EXISTS pos_stock_entry_lines (
    id UUID PRIMARY KEY,
    entry_id UUID REFERENCES pos_stock_entries(id) ON DELETE CASCADE,
    product_id UUID REFERENCES pos_products(id),
    quantity NUMERIC NOT NULL DEFAULT 0,
    purchase_price NUMERIC NOT NULL DEFAULT 0,
    total NUMERIC NOT NULL DEFAULT 0
);

-- 3. Inventaires
CREATE TABLE IF NOT EXISTS pos_inventories (
    id UUID PRIMARY KEY,
    reference TEXT UNIQUE NOT NULL,
    date DATE NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('En cours', 'Terminé', 'Annulé')) DEFAULT 'En cours',
    notes TEXT,
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

CREATE TABLE IF NOT EXISTS pos_inventory_lines (
    id UUID PRIMARY KEY,
    inventory_id UUID REFERENCES pos_inventories(id) ON DELETE CASCADE,
    product_id UUID REFERENCES pos_products(id),
    expected_qty NUMERIC NOT NULL DEFAULT 0,
    counted_qty NUMERIC NOT NULL DEFAULT 0,
    difference NUMERIC NOT NULL DEFAULT 0
);

-- 4. Sessions de caisse
CREATE TABLE IF NOT EXISTS pos_cash_sessions (
    id UUID PRIMARY KEY,
    cashier_id UUID,
    opened_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT TIMEZONE('utc'::text, NOW()),
    closed_at TIMESTAMP WITH TIME ZONE,
    initial_fund NUMERIC NOT NULL DEFAULT 0,
    final_amount NUMERIC,
    expected_amount NUMERIC,
    difference NUMERIC,
    status TEXT NOT NULL CHECK (status IN ('Ouverte', 'Fermée')) DEFAULT 'Ouverte'
);

-- 5. Transactions, lignes et paiements (la TVA a été retirée de l'écran de vente)
CREATE TABLE IF NOT EXISTS pos_transactions (
    id UUID PRIMARY KEY,
    transaction_number TEXT UNIQUE NOT NULL,
    cashier_id UUID,
    session_id UUID REFERENCES pos_cash_sessions(id),
    date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT TIMEZONE('utc'::text, NOW()),
    subtotal NUMERIC NOT NULL DEFAULT 0,
    discount_amount NUMERIC NOT NULL DEFAULT 0,
    total NUMERIC NOT NULL DEFAULT 0,
    status TEXT NOT NULL CHECK (status IN ('Validée', 'Annulée', 'Retournée')) DEFAULT 'Validée',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

CREATE TABLE IF NOT EXISTS pos_transaction_lines (
    id UUID PRIMARY KEY,
    transaction_id UUID REFERENCES pos_transactions(id) ON DELETE CASCADE,
    product_id UUID REFERENCES pos_products(id),
    description TEXT NOT NULL,
    quantity NUMERIC NOT NULL DEFAULT 0,
    unit_price NUMERIC NOT NULL DEFAULT 0,
    discount_percent NUMERIC NOT NULL DEFAULT 0,
    discount_amount NUMERIC NOT NULL DEFAULT 0,
    total NUMERIC NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS pos_payments (
    id UUID PRIMARY KEY,
    transaction_id UUID REFERENCES pos_transactions(id) ON DELETE CASCADE,
    method TEXT NOT NULL CHECK (method IN ('Espèces', 'Carte', 'Mobile Money', 'Mixte')),
    amount NUMERIC NOT NULL DEFAULT 0,
    reference TEXT
);

-- 6. Promotions / remises
CREATE TABLE IF NOT EXISTS pos_discounts (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('Pourcentage', 'Montant')),
    value NUMERIC NOT NULL DEFAULT 0,
    max_percent NUMERIC,
    max_amount NUMERIC,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- 7. Paramètres POS (ligne unique id=1)
CREATE TABLE IF NOT EXISTS pos_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    library_name TEXT NOT NULL DEFAULT 'Ma Librairie',
    address TEXT,
    phone TEXT,
    email TEXT,
    currency TEXT NOT NULL DEFAULT 'FCFA',
    ticket_message TEXT,
    printer_type TEXT DEFAULT 'Thermique 80mm',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

INSERT INTO pos_settings (id, library_name) VALUES (1, 'Ma Librairie')
ON CONFLICT (id) DO NOTHING;

-- 8. Index de performance
CREATE INDEX IF NOT EXISTS idx_pos_products_category_id ON pos_products(category_id);
CREATE INDEX IF NOT EXISTS idx_pos_products_brand_id ON pos_products(brand_id);
CREATE INDEX IF NOT EXISTS idx_pos_products_supplier_id ON pos_products(supplier_id);
CREATE INDEX IF NOT EXISTS idx_pos_stock_entry_lines_entry_id ON pos_stock_entry_lines(entry_id);
CREATE INDEX IF NOT EXISTS idx_pos_inventory_lines_inventory_id ON pos_inventory_lines(inventory_id);
CREATE INDEX IF NOT EXISTS idx_pos_transactions_session_id ON pos_transactions(session_id);
CREATE INDEX IF NOT EXISTS idx_pos_transaction_lines_transaction_id ON pos_transaction_lines(transaction_id);
CREATE INDEX IF NOT EXISTS idx_pos_payments_transaction_id ON pos_payments(transaction_id);
CREATE INDEX IF NOT EXISTS idx_pos_cash_sessions_cashier_id ON pos_cash_sessions(cashier_id);

-- 9. RLS : accès pour tous les utilisateurs authentifiés (même règle que les autres tables métier)
ALTER TABLE pos_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_stock_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_stock_entry_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_inventories ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_inventory_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_cash_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_transaction_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_discounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Activer tout pour les utilisateurs authentifiés" ON pos_categories FOR ALL TO authenticated USING (true);
CREATE POLICY "Activer tout pour les utilisateurs authentifiés" ON pos_brands FOR ALL TO authenticated USING (true);
CREATE POLICY "Activer tout pour les utilisateurs authentifiés" ON pos_suppliers FOR ALL TO authenticated USING (true);
CREATE POLICY "Activer tout pour les utilisateurs authentifiés" ON pos_products FOR ALL TO authenticated USING (true);
CREATE POLICY "Activer tout pour les utilisateurs authentifiés" ON pos_stock_entries FOR ALL TO authenticated USING (true);
CREATE POLICY "Activer tout pour les utilisateurs authentifiés" ON pos_stock_entry_lines FOR ALL TO authenticated USING (true);
CREATE POLICY "Activer tout pour les utilisateurs authentifiés" ON pos_inventories FOR ALL TO authenticated USING (true);
CREATE POLICY "Activer tout pour les utilisateurs authentifiés" ON pos_inventory_lines FOR ALL TO authenticated USING (true);
CREATE POLICY "Activer tout pour les utilisateurs authentifiés" ON pos_cash_sessions FOR ALL TO authenticated USING (true);
CREATE POLICY "Activer tout pour les utilisateurs authentifiés" ON pos_transactions FOR ALL TO authenticated USING (true);
CREATE POLICY "Activer tout pour les utilisateurs authentifiés" ON pos_transaction_lines FOR ALL TO authenticated USING (true);
CREATE POLICY "Activer tout pour les utilisateurs authentifiés" ON pos_payments FOR ALL TO authenticated USING (true);
CREATE POLICY "Activer tout pour les utilisateurs authentifiés" ON pos_discounts FOR ALL TO authenticated USING (true);
CREATE POLICY "Activer tout pour les utilisateurs authentifiés" ON pos_settings FOR ALL TO authenticated USING (true);
