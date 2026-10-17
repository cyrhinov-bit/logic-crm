-- Colonnes ecrites par l'app (buildDbInvoice) mais jamais creees : tout upsert
-- invoices echouait en PGRST204 "Could not find column". Ajout aligne sur le front.
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS client_nom TEXT;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS commercial_nom TEXT;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS service_nom TEXT;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS period_year INTEGER;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS period_month INTEGER;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS payment_date DATE;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS amount_paid NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS remaining_amount NUMERIC NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_invoices_period ON public.invoices(period_year, period_month);
