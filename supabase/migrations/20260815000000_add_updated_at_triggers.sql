-- Création d'une fonction générique pour mettre à jour la colonne updated_at
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = TIMEZONE('utc'::text, NOW());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Liste des tables qui nécessitent updated_at
DO $$ 
DECLARE 
    t text;
    tables text[] := ARRAY[
        'services', 'profiles', 'clients', 'prestations', 'settings', 'quotes', 'quote_lines',
        'pos_categories', 'pos_brands', 'pos_suppliers', 'pos_stock_entries', 'pos_stock_entry_lines',
        'pos_inventories', 'pos_inventory_lines', 'pos_cash_sessions', 'pos_transactions', 
        'pos_transaction_lines', 'pos_payments', 'pos_discounts', 'pos_settings', 'pos_returns', 
        'pos_return_lines', 'import_sessions', 'import_errors', 'product_completions', 'commissions', 
        'prospect_activities', 'prospect_follow_ups', 'categories', 'ventes', 'vente_lines', 
        'vente_echeances', 'weekly_reports', 'crm_documents', 'pos_stock_movements'
    ];
BEGIN 
    FOREACH t IN ARRAY tables LOOP
        -- Ajout de la colonne updated_at si elle n'existe pas
        EXECUTE format('ALTER TABLE IF EXISTS %I ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE(''utc''::text, NOW())', t);
        
        -- Suppression du trigger s'il existe déjà
        EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_updated_at ON %I', t, t);
        
        -- Création du trigger pour chaque mise à jour
        EXECUTE format('
            CREATE TRIGGER trg_%I_updated_at
            BEFORE UPDATE ON %I
            FOR EACH ROW
            EXECUTE FUNCTION set_updated_at()
        ', t, t);
    END LOOP;
END $$;
