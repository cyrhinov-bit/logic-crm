CREATE TABLE IF NOT EXISTS pos_stock_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID REFERENCES pos_products(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    reference TEXT,
    date TIMESTAMPTZ DEFAULT NOW(),
    created_by TEXT,
    notes TEXT
);

-- Activez Row Level Security (RLS)
ALTER TABLE pos_stock_movements ENABLE ROW LEVEL SECURITY;

-- Ajoutez les policies par défaut pour autoriser la lecture/écriture
-- (réexécutable : DROP préalable + portée authenticated explicite)
DROP POLICY IF EXISTS "Enable all for authenticated users" ON pos_stock_movements;
CREATE POLICY "Enable all for authenticated users" ON pos_stock_movements FOR ALL TO authenticated USING (true) WITH CHECK (true);
