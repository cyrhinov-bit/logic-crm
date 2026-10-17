-- ============================================================================
-- FICHIER : 20260828150003_phase3_3_facturation_paiements.sql
-- OBJECTIF : Table facture_paiements (Encaissements/Remboursements) & intégrité stricte
-- ============================================================================

BEGIN;

-- 1. Enums de paiement
DO $$ BEGIN
    CREATE TYPE payment_type_enum AS ENUM (
        'ENCAISSEMENT',
        'REMBOURSEMENT'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE payment_method_enum AS ENUM (
        'Virement Bancaire',
        'Chèque',
        'Espèces',
        'Mobile Money',
        'Traite'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;


-- 2. Registre des paiements réels
CREATE TABLE IF NOT EXISTS public.facture_paiements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_number TEXT UNIQUE NOT NULL,
    payment_type payment_type_enum NOT NULL DEFAULT 'ENCAISSEMENT',
    vente_id UUID NOT NULL
        REFERENCES public.ventes(id)
        ON DELETE RESTRICT, -- Interdit la suppression de facture ayant reçu un règlement
    echeance_id UUID
        REFERENCES public.vente_echeances(id)
        ON DELETE SET NULL,
    client_id UUID NOT NULL
        REFERENCES public.clients(id)
        ON DELETE RESTRICT,
    payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
    amount NUMERIC NOT NULL CHECK (amount > 0),
    payment_method payment_method_enum NOT NULL,
    reference TEXT,
    proof_document_id UUID
        REFERENCES public.crm_documents(id)
        ON DELETE SET NULL,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'VALIDE'
        CHECK (status IN ('VALIDE', 'REJETE', 'ANNULE')),
    recorded_by UUID
        REFERENCES public.profiles(id)
        ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW())
);

CREATE INDEX IF NOT EXISTS idx_facture_paiements_vente ON public.facture_paiements(vente_id);
CREATE INDEX IF NOT EXISTS idx_facture_paiements_client ON public.facture_paiements(client_id);
CREATE INDEX IF NOT EXISTS idx_facture_paiements_type ON public.facture_paiements(payment_type);
CREATE INDEX IF NOT EXISTS idx_facture_paiements_date ON public.facture_paiements(payment_date);

COMMIT;

