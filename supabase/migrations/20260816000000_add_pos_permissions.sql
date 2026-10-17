-- Migration pour ajouter les permissions POS aux caissiers
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS pos_returns_enabled BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS pos_catalogue_enabled BOOLEAN DEFAULT FALSE;
