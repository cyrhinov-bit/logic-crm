-- Migration: Suppression de la TVA du module POS
-- La TVA a été retirée de l'écran de vente. La colonne vat_rate devient inutilisée.

ALTER TABLE IF EXISTS pos_settings DROP COLUMN IF EXISTS vat_rate;
