-- Champs entreprise pour le modèle de devis PDF (bandeau devi.pdf) :
-- capital, téléphone, email, IBAN (pied de page + coordonnées bancaires).
ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS company_capital TEXT,
  ADD COLUMN IF NOT EXISTS company_phone TEXT,
  ADD COLUMN IF NOT EXISTS company_email TEXT,
  ADD COLUMN IF NOT EXISTS bank_iban TEXT;
