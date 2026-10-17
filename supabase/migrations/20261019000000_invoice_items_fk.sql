-- Correctif suivi factures : garantir les FK invoice_items/invoice_payments -> invoices.
-- En prod, PostgREST répond "Could not find a relationship between 'invoices'
-- and 'invoice_items' in the schema cache" : la contrainte est absente
-- (CREATE TABLE IF NOT EXISTS ne rajoute jamais une FK sur une table existante).
-- Conséquence : l'embed `invoices?select=*,invoice_items(*)` échoue en 400,
-- le refresh ne charge aucune facture (0 partout sur navigateur frais).
-- Le front charge désormais les lignes séparément, mais la FK reste nécessaire
-- (intégrité + suppressions en cascade + futurs embeds).
-- Date: 2026-10-09

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_class rt ON rt.oid = c.confrelid
    WHERE c.contype = 'f'
      AND t.relname = 'invoice_items'
      AND a.attname = 'invoice_id'
      AND rt.relname = 'invoices'
  ) THEN
    ALTER TABLE public.invoice_items
      ADD CONSTRAINT invoice_items_invoice_id_fkey
      FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE CASCADE;
    RAISE NOTICE 'FK invoice_items.invoice_id -> invoices(id) créée.';
  ELSE
    RAISE NOTICE 'FK invoice_items.invoice_id -> invoices(id) déjà présente.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_class rt ON rt.oid = c.confrelid
    WHERE c.contype = 'f'
      AND t.relname = 'invoice_payments'
      AND a.attname = 'invoice_id'
      AND rt.relname = 'invoices'
  ) THEN
    ALTER TABLE public.invoice_payments
      ADD CONSTRAINT invoice_payments_invoice_id_fkey
      FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE CASCADE;
    RAISE NOTICE 'FK invoice_payments.invoice_id -> invoices(id) créée.';
  ELSE
    RAISE NOTICE 'FK invoice_payments.invoice_id -> invoices(id) déjà présente.';
  END IF;
END
$$;

-- Force le rechargement du schema cache PostgREST (no-op si déjà à jour).
NOTIFY pgrst, 'reload schema';
