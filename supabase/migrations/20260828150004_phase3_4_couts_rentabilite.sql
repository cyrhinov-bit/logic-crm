-- ============================================================================
-- FICHIER : 20260828150004_phase3_4_couts_rentabilite.sql
-- OBJECTIF : Table couts avec ventilation analytique Direct/Indirect et HT/TTC
-- ============================================================================

BEGIN;

-- 1. Enums de coûts
DO $$ BEGIN
    CREATE TYPE cost_type_enum AS ENUM ('DIRECT', 'INDIRECT');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE cost_category_enum AS ENUM (
        'SOUS_TRAITANCE',
        'ACHAT_MATERIEL',
        'TRANSPORT',
        'LOGICIEL_LICENCE',
        'HONORAIRES',
        'LOYER_CHARGES',
        'TELECOM',
        'AUTRE'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;


-- 2. Table des coûts
CREATE TABLE IF NOT EXISTS public.couts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reference TEXT UNIQUE NOT NULL,
    cost_type cost_type_enum NOT NULL,
    category cost_category_enum NOT NULL,
    amount_ht NUMERIC NOT NULL CHECK (amount_ht > 0),
    vat_rate NUMERIC NOT NULL DEFAULT 0 CHECK (vat_rate >= 0),
    vat_amount NUMERIC NOT NULL DEFAULT 0 CHECK (vat_amount >= 0),
    amount_ttc NUMERIC NOT NULL CHECK (amount_ttc >= amount_ht),
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    affaire_id UUID
        REFERENCES public.affaires(id)
        ON DELETE RESTRICT,
    service_id UUID NOT NULL
        REFERENCES public.services(id)
        ON DELETE RESTRICT,
    supplier_name TEXT,
    invoice_ref TEXT,
    description TEXT NOT NULL,
    proof_document_id UUID
        REFERENCES public.crm_documents(id)
        ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'VALIDE'
        CHECK (status IN ('ENGAGE', 'VALIDE', 'PAYE', 'ANNULE')),
    created_by UUID
        REFERENCES public.profiles(id)
        ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW()),
    CONSTRAINT check_direct_cost_has_affaire CHECK (
        (cost_type = 'DIRECT' AND affaire_id IS NOT NULL) OR
        (cost_type = 'INDIRECT' AND affaire_id IS NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_couts_affaire ON public.couts(affaire_id);
CREATE INDEX IF NOT EXISTS idx_couts_service ON public.couts(service_id);
CREATE INDEX IF NOT EXISTS idx_couts_type ON public.couts(cost_type);

COMMIT;

