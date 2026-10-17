-- Migration: Create Invoices, Invoice Items and Invoice Payments tables
-- Phase 2 du module Facturation Client HINOV CRM

-- 1. Table des factures
CREATE TABLE IF NOT EXISTS public.invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_number TEXT UNIQUE NOT NULL,
    quote_id UUID REFERENCES quotes(id) ON DELETE SET NULL,
    client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
    commercial_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    service_id UUID REFERENCES services(id) ON DELETE SET NULL,
    issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
    delivery_date DATE,
    payment_terms TEXT DEFAULT '30 jours',
    due_date DATE NOT NULL,
    subtotal NUMERIC NOT NULL DEFAULT 0,
    tax_amount NUMERIC NOT NULL DEFAULT 0,
    discount_amount NUMERIC NOT NULL DEFAULT 0,
    total_amount NUMERIC NOT NULL DEFAULT 0,
    cost_amount NUMERIC NOT NULL DEFAULT 0,
    commission_rate NUMERIC NOT NULL DEFAULT 10,
    commission_amount NUMERIC NOT NULL DEFAULT 0,
    gross_margin NUMERIC NOT NULL DEFAULT 0,
    hinov_margin NUMERIC NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'ÉMISE' CHECK (status IN ('BROUILLON', 'ÉMISE', 'PARTIELLEMENT_PAYÉE', 'PAYÉE', 'EN_RETARD', 'ANNULÉE')),
    notes TEXT,
    created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

-- 2. Lignes d'articles de la facture
CREATE TABLE IF NOT EXISTS public.invoice_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID REFERENCES invoices(id) ON DELETE CASCADE,
    prestation_id UUID REFERENCES prestations(id) ON DELETE SET NULL,
    description TEXT NOT NULL,
    quantity NUMERIC NOT NULL DEFAULT 1,
    unit_price NUMERIC NOT NULL DEFAULT 0,
    cost_price NUMERIC NOT NULL DEFAULT 0,
    discount_percent NUMERIC NOT NULL DEFAULT 0,
    tax_rate NUMERIC NOT NULL DEFAULT 0,
    total NUMERIC NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

-- 3. Règlements / Paiements de la facture
CREATE TABLE IF NOT EXISTS public.invoice_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID REFERENCES invoices(id) ON DELETE CASCADE,
    payment_number TEXT,
    payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
    amount NUMERIC NOT NULL CHECK (amount > 0),
    payment_method TEXT NOT NULL,
    reference TEXT,
    notes TEXT,
    created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

-- 4. Activer RLS
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_payments ENABLE ROW LEVEL SECURITY;

-- 5. Politiques RLS
CREATE POLICY "Allow all access to invoices"
    ON public.invoices
    FOR ALL
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Allow all access to invoice_items"
    ON public.invoice_items
    FOR ALL
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Allow all access to invoice_payments"
    ON public.invoice_payments
    FOR ALL
    USING (true)
    WITH CHECK (true);

-- 6. Index de performance
CREATE INDEX IF NOT EXISTS idx_invoices_number ON public.invoices(invoice_number);
CREATE INDEX IF NOT EXISTS idx_invoices_quote_id ON public.invoices(quote_id);
CREATE INDEX IF NOT EXISTS idx_invoices_client_id ON public.invoices(client_id);
CREATE INDEX IF NOT EXISTS idx_invoices_commercial_id ON public.invoices(commercial_id);
CREATE INDEX IF NOT EXISTS idx_invoices_service_id ON public.invoices(service_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON public.invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON public.invoices(due_date);
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_id ON public.invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_payments_invoice_id ON public.invoice_payments(invoice_id);
