-- Ajouter le champ is_active à la table pos_products
ALTER TABLE pos_products ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
