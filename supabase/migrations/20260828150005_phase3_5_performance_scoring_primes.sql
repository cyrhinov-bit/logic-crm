-- ============================================================================
-- FICHIER : 20260828150005_phase3_5_performance_scoring_primes.sql
-- OBJECTIF : Règles de calcul, objectifs, classements, primes et audit trail
-- ============================================================================

BEGIN;

-- 1. Enum du statut des primes
DO $$ BEGIN
    CREATE TYPE bonus_status_enum AS ENUM (
        'PROPOSEE',
        'EN_REVISION',
        'VALIDEE',
        'REJETEE',
        'PAYEE'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;


-- 2. Table des règles de scoring paramétrables
CREATE TABLE IF NOT EXISTS public.scoring_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    period_type TEXT NOT NULL CHECK (period_type IN ('MENSUEL', 'TRIMESTRIEL', 'ANNUEL')),
    weight_ca NUMERIC NOT NULL DEFAULT 30 CHECK (weight_ca >= 0),
    weight_margin NUMERIC NOT NULL DEFAULT 30 CHECK (weight_margin >= 0),
    weight_recovery NUMERIC NOT NULL DEFAULT 20 CHECK (weight_recovery >= 0),
    weight_new_clients NUMERIC NOT NULL DEFAULT 10 CHECK (weight_new_clients >= 0),
    weight_won_deals NUMERIC NOT NULL DEFAULT 5 CHECK (weight_won_deals >= 0),
    weight_deadlines NUMERIC NOT NULL DEFAULT 5 CHECK (weight_deadlines >= 0),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW()),
    CONSTRAINT check_weights_sum_100 CHECK (
        (weight_ca + weight_margin + weight_recovery + weight_new_clients + weight_won_deals + weight_deadlines) = 100
    )
);


-- 3. Table des objectifs périodiques
CREATE TABLE IF NOT EXISTS public.objectifs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    target_type TEXT NOT NULL CHECK (target_type IN ('COMMERCIAL', 'SERVICE')),
    commercial_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    service_id UUID REFERENCES public.services(id) ON DELETE CASCADE,
    period_type TEXT NOT NULL CHECK (period_type IN ('MENSUEL', 'TRIMESTRIEL', 'ANNUEL')),
    period_key TEXT NOT NULL,
    target_ca_ht NUMERIC NOT NULL DEFAULT 0 CHECK (target_ca_ht >= 0),
    target_encaissement_ttc NUMERIC NOT NULL DEFAULT 0 CHECK (target_encaissement_ttc >= 0),
    target_marge_ht NUMERIC NOT NULL DEFAULT 0 CHECK (target_marge_ht >= 0),
    target_new_clients INTEGER NOT NULL DEFAULT 0 CHECK (target_new_clients >= 0),
    target_won_deals INTEGER NOT NULL DEFAULT 0 CHECK (target_won_deals >= 0),
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW()),
    CONSTRAINT check_target_integrity CHECK (
        (target_type = 'COMMERCIAL' AND commercial_id IS NOT NULL AND service_id IS NULL) OR
        (target_type = 'SERVICE' AND service_id IS NOT NULL AND commercial_id IS NULL)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_objectifs_commercial_uniq 
    ON public.objectifs(period_type, period_key, commercial_id) 
    WHERE target_type = 'COMMERCIAL';

CREATE UNIQUE INDEX IF NOT EXISTS idx_objectifs_service_uniq 
    ON public.objectifs(period_type, period_key, service_id) 
    WHERE target_type = 'SERVICE';


-- 4. Table des classements historisés
CREATE TABLE IF NOT EXISTS public.classements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    period_key TEXT NOT NULL,
    scope TEXT NOT NULL CHECK (scope IN ('COMMERCIAL', 'SERVICE')),
    commercial_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    service_id UUID REFERENCES public.services(id) ON DELETE CASCADE,
    scoring_rule_id UUID NOT NULL REFERENCES public.scoring_rules(id) ON DELETE RESTRICT,
    score NUMERIC(5,2) NOT NULL,
    rank INTEGER NOT NULL,
    details JSONB NOT NULL,
    calculated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW()),
    CONSTRAINT check_classement_scope CHECK (
        (scope = 'COMMERCIAL' AND commercial_id IS NOT NULL AND service_id IS NULL) OR
        (scope = 'SERVICE' AND service_id IS NOT NULL AND commercial_id IS NULL)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_classements_commercial_uniq 
    ON public.classements(period_key, commercial_id) 
    WHERE scope = 'COMMERCIAL';

CREATE UNIQUE INDEX IF NOT EXISTS idx_classements_service_uniq 
    ON public.classements(period_key, service_id) 
    WHERE scope = 'SERVICE';


-- 5. Table des primes (Individuelles et Collectives)
CREATE TABLE IF NOT EXISTS public.primes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    beneficiary_type TEXT NOT NULL CHECK (beneficiary_type IN ('COMMERCIAL', 'SERVICE')),
    commercial_id UUID REFERENCES public.profiles(id) ON DELETE RESTRICT,
    service_id UUID REFERENCES public.services(id) ON DELETE RESTRICT,
    period_key TEXT NOT NULL,
    scoring_rule_id UUID REFERENCES public.scoring_rules(id) ON DELETE RESTRICT,
    score_obtained NUMERIC(5,2) NOT NULL,
    rank_obtained INTEGER NOT NULL,
    proposed_amount NUMERIC NOT NULL DEFAULT 0 CHECK (proposed_amount >= 0),
    validated_amount NUMERIC CHECK (validated_amount >= 0),
    status bonus_status_enum NOT NULL DEFAULT 'PROPOSEE',
    reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    payment_date DATE,
    comments TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW()),
    CONSTRAINT check_prime_beneficiary CHECK (
        (beneficiary_type = 'COMMERCIAL' AND commercial_id IS NOT NULL AND service_id IS NULL) OR
        (beneficiary_type = 'SERVICE' AND service_id IS NOT NULL AND commercial_id IS NULL)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_primes_commercial_uniq 
    ON public.primes(period_key, commercial_id) 
    WHERE beneficiary_type = 'COMMERCIAL';

CREATE UNIQUE INDEX IF NOT EXISTS idx_primes_service_uniq 
    ON public.primes(period_key, service_id) 
    WHERE beneficiary_type = 'SERVICE';


-- 6. Table d'audit trail des primes (Inaltérable)
CREATE TABLE IF NOT EXISTS public.prime_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prime_id UUID NOT NULL REFERENCES public.primes(id) ON DELETE RESTRICT,
    action TEXT NOT NULL CHECK (action IN ('PROPOSITION', 'MODIFICATION_MONTANT', 'VALIDATION', 'REJET', 'MISE_EN_PAIEMENT')),
    previous_status bonus_status_enum,
    new_status bonus_status_enum,
    previous_amount NUMERIC,
    new_amount NUMERIC,
    author_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    justification TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc', NOW())
);

CREATE INDEX IF NOT EXISTS idx_prime_audit_prime_id ON public.prime_audit_logs(prime_id);
CREATE INDEX IF NOT EXISTS idx_prime_audit_author_id ON public.prime_audit_logs(author_id);

COMMIT;

