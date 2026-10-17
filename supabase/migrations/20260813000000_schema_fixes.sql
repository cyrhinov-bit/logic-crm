-- Migration: corrections de désynchronisations App <-> Supabase (Consolidation)
-- Regroupe les fichiers migration_schema_fixes.sql et migration_add_members.sql

-- 1. Ajouter colonne "unit" manquante dans prestations
ALTER TABLE prestations ADD COLUMN IF NOT EXISTS unit TEXT DEFAULT 'Jour';

-- 2. Ajouter colonne "status" et "company" manquantes dans clients
ALTER TABLE clients ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Actif';
ALTER TABLE clients ADD COLUMN IF NOT EXISTS company TEXT;

-- 3. Ajouter colonnes manquantes dans settings (logo, TVA, validité)
ALTER TABLE settings ADD COLUMN IF NOT EXISTS header_logo_base64 TEXT;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS default_vat NUMERIC DEFAULT 20;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS default_validity INTEGER DEFAULT 30;

-- 4. Ajouter la colonne manquante 'members' sur la table services
ALTER TABLE services ADD COLUMN IF NOT EXISTS members INTEGER DEFAULT 1;
