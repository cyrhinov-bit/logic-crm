-- Migration: Ajout des champs de validité, conditions de règlement, notes, signataire et unité pour les devis
-- Date: 2026-08-31

ALTER TABLE quotes ADD COLUMN IF NOT EXISTS valid_until DATE;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS payment_terms TEXT;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS signatory_name TEXT;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS signatory_role TEXT;

ALTER TABLE quote_lines ADD COLUMN IF NOT EXISTS unit TEXT;

