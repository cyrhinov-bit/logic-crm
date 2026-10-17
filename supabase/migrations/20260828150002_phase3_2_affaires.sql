-- ============================================================================
-- FICHIER : 20260828150002_phase3_2_affaires.sql
-- OBJECTIF : Création de la table affaires et liaisons optionnelles Devis / Factures
-- ============================================================================

BEGIN;

-- 1. Enum du cycle de vie d'une affaire
DO $$ BEGIN
    CREATE TYPE affaire_status AS ENUM (
        'PROSPECTION',
        'QUALIFIEE',
        'PROPOSITION',
        'NEGOCIATION',
        'GAGNEE',
        'EN_COURS',
        'CLOTUREE',
        'PERDUE',
        'ANNULEE'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;


-- 2. Table des affaires
CREATE TABLE IF NOT EXISTS public.affaires (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reference TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    client_id UUID NOT NULL
        REFERENCES public.clients(id)
        ON DELETE RESTRICT,
    service_id UUID NOT NULL
        REFERENCES public.services(id)
        ON DELETE RESTRICT,
    commercial_id UUID NOT NULL
        REFERENCES public.profiles(id)
        ON DELETE RESTRICT,
    description TEXT,
    status affaire_status NOT NULL DEFAULT 'QUALIFIEE',
    estimated_amount_ht NUMERIC NOT NULL DEFAULT 0
        CHECK (estimated_amount_ht >= 0),
    probability INTEGER NOT NULL DEFAULT 50
        CHECK (probability BETWEEN 0 AND 100),
    source TEXT,
    start_date_planned DATE,
    end_date_planned DATE,
    end_date_real DATE,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW())
);

CREATE INDEX IF NOT EXISTS idx_affaires_client ON public.affaires(client_id);
CREATE INDEX IF NOT EXISTS idx_affaires_service ON public.affaires(service_id);
CREATE INDEX IF NOT EXISTS idx_affaires_commercial ON public.affaires(commercial_id);
CREATE INDEX IF NOT EXISTS idx_affaires_status ON public.affaires(status);


-- 3. Liaison non destructive Devis -> Affaire
ALTER TABLE public.quotes
ADD COLUMN IF NOT EXISTS affaire_id UUID
REFERENCES public.affaires(id)
ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_quotes_affaire_id ON public.quotes(affaire_id);


-- 4. Liaison non destructive Vente/Facture -> Affaire
ALTER TABLE public.ventes
ADD COLUMN IF NOT EXISTS affaire_id UUID
REFERENCES public.affaires(id)
ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ventes_affaire_id ON public.ventes(affaire_id);


-- 5. Commercial porteur direct sur la vente
ALTER TABLE public.ventes
ADD COLUMN IF NOT EXISTS commercial_id UUID
REFERENCES public.profiles(id)
ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ventes_commercial_id ON public.ventes(commercial_id);


-- 6. Date d'échéance principale de la facture
ALTER TABLE public.ventes
ADD COLUMN IF NOT EXISTS due_date DATE;

COMMIT;

