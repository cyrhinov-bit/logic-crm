-- Migration: Create Techniciens Maintenance table
CREATE TABLE IF NOT EXISTS public.techniciens_maintenance (
    id TEXT PRIMARY KEY,
    nom TEXT NOT NULL,
    telephone TEXT,
    email TEXT,
    specialite TEXT,
    statut TEXT NOT NULL DEFAULT 'DISPONIBLE',
    cree_par TEXT,
    cree_par_nom TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

-- Enable RLS
ALTER TABLE public.techniciens_maintenance ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated/anon read/write according to ERP policy
CREATE POLICY "Allow all access to techniciens_maintenance"
    ON public.techniciens_maintenance
    FOR ALL
    USING (true)
    WITH CHECK (true);
