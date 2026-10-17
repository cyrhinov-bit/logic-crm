-- Migration : Index et contraintes du catalogue produits
-- Objectifs :
--  * empêcher deux produits avec le même code-barres réel (NULL/vide autorisés pour plusieurs produits) ;
--  * accélérer les recherches par code-barres, référence, nom et ISBN ;
--  * supporter le champ unité et la date de mise à jour du modèle produit.

ALTER TABLE IF EXISTS pos_products
    ADD COLUMN IF NOT EXISTS unit TEXT,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE;

-- Index unique partiel : autorise plusieurs barcode NULL ou vides,
-- interdit deux produits avec le même code-barres réel.
CREATE UNIQUE INDEX IF NOT EXISTS uq_pos_products_barcode
    ON pos_products (barcode)
    WHERE barcode IS NOT NULL AND barcode <> '';

CREATE INDEX IF NOT EXISTS idx_pos_products_reference ON pos_products (reference);
CREATE INDEX IF NOT EXISTS idx_pos_products_name       ON pos_products (lower(name));
CREATE INDEX IF NOT EXISTS idx_pos_products_isbn       ON pos_products (isbn);
CREATE INDEX IF NOT EXISTS idx_pos_products_barcode_lookup ON pos_products (barcode) WHERE barcode IS NOT NULL AND barcode <> '';

-- Met à jour updated_at à chaque modification de ligne
CREATE OR REPLACE FUNCTION set_pos_product_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = TIMEZONE('utc'::text, NOW());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pos_products_updated_at ON pos_products;
CREATE TRIGGER trg_pos_products_updated_at
    BEFORE UPDATE ON pos_products
    FOR EACH ROW
    EXECUTE FUNCTION set_pos_product_updated_at();

-- Le bucket de stockage des images doit être créé avant toute utilisation
INSERT INTO storage.buckets (id, name, public)
VALUES ('product-images', 'product-images', true)
ON CONFLICT (id) DO NOTHING;