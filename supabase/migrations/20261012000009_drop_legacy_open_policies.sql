-- Nettoyage des policies permissives historiques (noms avec encodage mixte).
-- Sans ce nettoyage, les USING(true) neutraliseraient le scopage propriétaire (OR logique).
-- Date: 2026-10-06

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (
        policyname LIKE 'Activer tout%'
        OR policyname LIKE 'Allow all access%'
        OR policyname LIKE '%authenticated_all'
      )
      AND tablename IN (
        'quotes', 'quote_lines', 'clients', 'prospects',
        'invoices', 'invoice_items', 'invoice_payments',
        'affaires', 'ventes', 'vente_lines',
        'facture_paiements', 'couts'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
    RAISE NOTICE 'Policy supprimee : %.%', r.tablename, r.policyname;
  END LOOP;
END $$;
