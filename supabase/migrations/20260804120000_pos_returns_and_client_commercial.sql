-- Migration: Module Retour-Ã‰change POS + Assignation Client-Commercial + Module Produits

-- 1. Tables POS Retours
CREATE TABLE IF NOT EXISTS pos_returns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    return_number TEXT UNIQUE NOT NULL,
    transaction_id UUID,
    date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT TIMEZONE('utc'::text, NOW()),
    type TEXT NOT NULL CHECK (type IN ('Retour simple', 'Retour avec Ã©change')),
    total_refund NUMERIC DEFAULT 0,
    total_exchange NUMERIC DEFAULT 0,
    status TEXT NOT NULL CHECK (status IN ('En attente', 'TraitÃ©', 'AnnulÃ©')) DEFAULT 'En attente',
    notes TEXT,
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

CREATE TABLE IF NOT EXISTS pos_return_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    return_id UUID REFERENCES pos_returns(id) ON DELETE CASCADE,
    product_id UUID,
    description TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    unit_price NUMERIC NOT NULL,
    total NUMERIC NOT NULL,
    reason TEXT
);

-- 2. Ajout commercial_id aux clients
ALTER TABLE IF EXISTS clients ADD COLUMN IF NOT EXISTS commercial_id UUID REFERENCES profiles(id);

-- 3. Tables du Module Produits
CREATE TABLE IF NOT EXISTS import_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    filename TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending', 'in_progress', 'completed', 'failed')) DEFAULT 'pending',
    total_rows INTEGER NOT NULL,
    processed_rows INTEGER DEFAULT 0,
    successful_creations INTEGER DEFAULT 0,
    successful_updates INTEGER DEFAULT 0,
    ignored_rows INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()),
    completed_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS import_errors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES import_sessions(id) ON DELETE CASCADE,
    row_number INTEGER NOT NULL,
    field_name TEXT NOT NULL,
    field_value TEXT,
    error_message TEXT NOT NULL,
    severity TEXT NOT NULL CHECK (severity IN ('error', 'warning')) DEFAULT 'error'
);

CREATE TABLE IF NOT EXISTS product_completions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID REFERENCES pos_products(id) ON DELETE CASCADE,
    missing_field TEXT NOT NULL CHECK (missing_field IN ('family', 'category', 'brand', 'supplier', 'image', 'description', 'minStock')),
    current_value TEXT,
    suggested_value TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- 4. Extensions Ã  pos_products
ALTER TABLE IF EXISTS pos_products ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE IF EXISTS pos_products ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive'));
ALTER TABLE IF EXISTS pos_products ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW());

-- 5. Index pour performance
CREATE INDEX IF NOT EXISTS idx_pos_returns_transaction_id ON pos_returns(transaction_id);
CREATE INDEX IF NOT EXISTS idx_pos_return_lines_return_id ON pos_return_lines(return_id);
CREATE INDEX IF NOT EXISTS idx_import_sessions_status ON import_sessions(status);
CREATE INDEX IF NOT EXISTS idx_import_sessions_created_at ON import_sessions(created_at);
CREATE INDEX IF NOT EXISTS idx_import_errors_session_id ON import_errors(session_id);
CREATE INDEX IF NOT EXISTS idx_product_completions_product_id ON product_completions(product_id);
CREATE INDEX IF NOT EXISTS idx_pos_products_barcode ON pos_products(barcode);
CREATE INDEX IF NOT EXISTS idx_pos_products_isbn ON pos_products(isbn);
CREATE INDEX IF NOT EXISTS idx_pos_products_reference ON pos_products(reference);

-- 6. RLS
ALTER TABLE IF EXISTS import_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS import_errors ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS product_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_return_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Activer tout pour les utilisateurs authentifiÃ©s" ON import_sessions FOR ALL TO authenticated USING (true);
CREATE POLICY "Activer tout pour les utilisateurs authentifiÃ©s" ON import_errors FOR ALL TO authenticated USING (true);
CREATE POLICY "Activer tout pour les utilisateurs authentifiÃ©s" ON product_completions FOR ALL TO authenticated USING (true);
CREATE POLICY "Activer tout pour les utilisateurs authentifiÃ©s" ON pos_returns FOR ALL TO authenticated USING (true);
CREATE POLICY "Activer tout pour les utilisateurs authentifiÃ©s" ON pos_return_lines FOR ALL TO authenticated USING (true);

