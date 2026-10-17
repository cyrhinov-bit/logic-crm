-- Ajouter la colonne commission_rate à la table services
ALTER TABLE services ADD COLUMN IF NOT EXISTS commission_rate NUMERIC;
