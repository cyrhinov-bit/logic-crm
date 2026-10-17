-- Module indépendant : suivi des factures fournisseurs.
-- Aucune dépendance vers les autres modules (pas de FK vers clients, caisse,
-- couts, tiers, factures clients ou POS). Les fournisseurs sont internes au
-- module (table sup_suppliers) avec snapshot du nom dans la facture pour
-- survivre à la suppression du fournisseur.
-- Date: 2026-10-10

CREATE TABLE IF NOT EXISTS public.sup_suppliers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    contact TEXT,
    phone TEXT,
    email TEXT,
    nif TEXT,
    address TEXT,
    notes TEXT,
    created_by TEXT,
    created_by_name TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.sup_invoices (
    id TEXT PRIMARY KEY,
    supplier_id TEXT REFERENCES public.sup_suppliers(id) ON DELETE SET NULL,
    supplier_name TEXT NOT NULL DEFAULT '',
    invoice_number TEXT NOT NULL DEFAULT '',
    issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
    due_date DATE,
    amount_ht NUMERIC NOT NULL DEFAULT 0,
    vat_amount NUMERIC NOT NULL DEFAULT 0,
    amount_ttc NUMERIC NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'REÇUE'
      CHECK (status IN ('BROUILLON', 'REÇUE', 'VALIDÉE', 'PARTIELLEMENT_PAYÉE', 'PAYÉE', 'EN_RETARD', 'LITIGE', 'ANNULÉE')),
    payment_method TEXT,
    description TEXT,
    attachment_name TEXT,
    attachment_mime TEXT,
    attachment_data TEXT,
    created_by TEXT,
    created_by_name TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.sup_payments (
    id TEXT PRIMARY KEY,
    invoice_id TEXT NOT NULL REFERENCES public.sup_invoices(id) ON DELETE CASCADE,
    payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
    amount NUMERIC NOT NULL DEFAULT 0,
    method TEXT,
    reference TEXT,
    notes TEXT,
    created_by TEXT,
    created_by_name TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.sup_suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sup_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sup_payments ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'sup_suppliers_all') THEN
    CREATE POLICY "sup_suppliers_all" ON public.sup_suppliers
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'sup_invoices_all') THEN
    CREATE POLICY "sup_invoices_all" ON public.sup_invoices
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'sup_payments_all') THEN
    CREATE POLICY "sup_payments_all" ON public.sup_payments
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_sup_invoices_supplier ON public.sup_invoices(supplier_id);
CREATE INDEX IF NOT EXISTS idx_sup_invoices_status ON public.sup_invoices(status);
CREATE INDEX IF NOT EXISTS idx_sup_invoices_due ON public.sup_invoices(due_date);
CREATE INDEX IF NOT EXISTS idx_sup_payments_invoice ON public.sup_payments(invoice_id);
