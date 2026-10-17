-- ============================================================================
-- FICHIER : 20260828150006_phase3_6_securite_rls_immutabilite.sql
-- OBJECTIF : Fonctions d'accès, triggers de blocage physique et policies RLS
-- ============================================================================

BEGIN;

-- 1. Fonctions de contrôle d'accès SECURITY DEFINER avec search_path fixé
CREATE OR REPLACE FUNCTION public.get_auth_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid() AND active = true;
$$;

CREATE OR REPLACE FUNCTION public.get_auth_service_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT service_id FROM public.profiles WHERE id = auth.uid() AND active = true;
$$;

CREATE OR REPLACE FUNCTION public.can_access_affaire(p_affaire_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role TEXT := public.get_auth_role();
  v_service_id UUID := public.get_auth_service_id();
  v_aff_service_id UUID;
  v_aff_commercial_id UUID;
BEGIN
  IF v_role IN ('SuperAdmin', 'Directeur', 'Directeur adjoint') THEN
    RETURN true;
  END IF;

  SELECT service_id, commercial_id INTO v_aff_service_id, v_aff_commercial_id
  FROM public.affaires
  WHERE id = p_affaire_id;

  IF v_role = 'Responsable' AND v_service_id = v_aff_service_id THEN
    RETURN true;
  END IF;

  IF v_role = 'Commercial' AND v_aff_commercial_id = auth.uid() THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.can_access_vente(p_vente_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role TEXT := public.get_auth_role();
  v_service_id UUID := public.get_auth_service_id();
  v_vte_service_id UUID;
  v_vte_commercial_id UUID;
BEGIN
  IF v_role IN ('SuperAdmin', 'Directeur', 'Directeur adjoint') THEN
    RETURN true;
  END IF;

  SELECT service_id, commercial_id INTO v_vte_service_id, v_vte_commercial_id
  FROM public.ventes
  WHERE id = p_vente_id;

  IF v_role = 'Responsable' AND v_service_id = v_vte_service_id THEN
    RETURN true;
  END IF;

  IF v_role = 'Commercial' AND v_vte_commercial_id = auth.uid() THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;


-- 2. Triggers de protection physique (Immuabilité des paiements & audits)
CREATE OR REPLACE FUNCTION public.prevent_payment_modification_or_deletion()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'Les écritures de paiements sont immuables. Toute correction doit faire l''objet d''un paiement de type REMBOURSEMENT ou d''une écriture compensatoire.';
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_facture_paiements ON public.facture_paiements;
CREATE TRIGGER trg_protect_facture_paiements
BEFORE UPDATE OR DELETE ON public.facture_paiements
FOR EACH ROW
EXECUTE FUNCTION public.prevent_payment_modification_or_deletion();

CREATE OR REPLACE FUNCTION public.prevent_prime_audit_modification_or_deletion()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'Le journal d''audit des primes est inaltérable et ne peut être modifié ou supprimé.';
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_prime_audit_logs ON public.prime_audit_logs;
CREATE TRIGGER trg_protect_prime_audit_logs
BEFORE UPDATE OR DELETE ON public.prime_audit_logs
FOR EACH ROW
EXECUTE FUNCTION public.prevent_prime_audit_modification_or_deletion();


-- 3. Activation du Row Level Security (RLS)
ALTER TABLE public.affaires ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.facture_paiements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.couts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scoring_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.objectifs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.primes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prime_audit_logs ENABLE ROW LEVEL SECURITY;


-- 4. Politiques RLS avec WITH CHECK

-- Table AFFAIRES
DROP POLICY IF EXISTS "Lecture affaires autorisees" ON public.affaires;
CREATE POLICY "Lecture affaires autorisees" ON public.affaires
    FOR SELECT TO authenticated
    USING (public.can_access_affaire(id));

DROP POLICY IF EXISTS "Insertion affaires" ON public.affaires;
CREATE POLICY "Insertion affaires" ON public.affaires
    FOR INSERT TO authenticated
    WITH CHECK (
        public.get_auth_role() IN ('SuperAdmin', 'Directeur', 'Directeur adjoint')
        OR (public.get_auth_role() = 'Responsable' AND service_id = public.get_auth_service_id())
        OR (public.get_auth_role() = 'Commercial' AND commercial_id = auth.uid() AND service_id = public.get_auth_service_id())
    );

DROP POLICY IF EXISTS "Modification affaires autorisees" ON public.affaires;
CREATE POLICY "Modification affaires autorisees" ON public.affaires
    FOR UPDATE TO authenticated
    USING (public.can_access_affaire(id))
    WITH CHECK (
        public.get_auth_role() IN ('SuperAdmin', 'Directeur', 'Directeur adjoint')
        OR (public.get_auth_role() = 'Responsable' AND service_id = public.get_auth_service_id())
        OR (public.get_auth_role() = 'Commercial' AND commercial_id = auth.uid() AND service_id = public.get_auth_service_id())
    );

-- Table FACTURE_PAIEMENTS (Lecture et Insertion uniquement)
DROP POLICY IF EXISTS "Lecture paiements autorises" ON public.facture_paiements;
CREATE POLICY "Lecture paiements autorises" ON public.facture_paiements
    FOR SELECT TO authenticated
    USING (public.can_access_vente(vente_id));

DROP POLICY IF EXISTS "Insertion paiements" ON public.facture_paiements;
CREATE POLICY "Insertion paiements" ON public.facture_paiements
    FOR INSERT TO authenticated
    WITH CHECK (
        public.get_auth_role() IN ('SuperAdmin', 'Directeur', 'Directeur adjoint')
        OR (public.get_auth_role() = 'Responsable' AND public.can_access_vente(vente_id))
    );

-- Table COUTS
DROP POLICY IF EXISTS "Lecture couts autorises" ON public.couts;
CREATE POLICY "Lecture couts autorises" ON public.couts
    FOR SELECT TO authenticated
    USING (
        public.get_auth_role() IN ('SuperAdmin', 'Directeur', 'Directeur adjoint')
        OR (public.get_auth_role() = 'Responsable' AND service_id = public.get_auth_service_id())
        OR (public.get_auth_role() = 'Commercial' AND cost_type = 'DIRECT' AND public.can_access_affaire(affaire_id))
    );

DROP POLICY IF EXISTS "Insertion couts" ON public.couts;
CREATE POLICY "Insertion couts" ON public.couts
    FOR INSERT TO authenticated
    WITH CHECK (
        public.get_auth_role() IN ('SuperAdmin', 'Directeur', 'Directeur adjoint')
        OR (public.get_auth_role() = 'Responsable' AND service_id = public.get_auth_service_id())
    );

DROP POLICY IF EXISTS "Modification couts" ON public.couts;
CREATE POLICY "Modification couts" ON public.couts
    FOR UPDATE TO authenticated
    USING (
        public.get_auth_role() IN ('SuperAdmin', 'Directeur', 'Directeur adjoint')
        OR (public.get_auth_role() = 'Responsable' AND service_id = public.get_auth_service_id())
    )
    WITH CHECK (
        public.get_auth_role() IN ('SuperAdmin', 'Directeur', 'Directeur adjoint')
        OR (public.get_auth_role() = 'Responsable' AND service_id = public.get_auth_service_id())
    );

-- Table SCORING_RULES
DROP POLICY IF EXISTS "Lecture regles scoring" ON public.scoring_rules;
CREATE POLICY "Lecture regles scoring" ON public.scoring_rules
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Gestion regles scoring Direction" ON public.scoring_rules;
CREATE POLICY "Gestion regles scoring Direction" ON public.scoring_rules
    FOR ALL TO authenticated
    USING (public.get_auth_role() IN ('SuperAdmin', 'Directeur', 'Directeur adjoint'))
    WITH CHECK (public.get_auth_role() IN ('SuperAdmin', 'Directeur', 'Directeur adjoint'));

-- Table OBJECTIFS
DROP POLICY IF EXISTS "Lecture objectifs" ON public.objectifs;
CREATE POLICY "Lecture objectifs" ON public.objectifs
    FOR SELECT TO authenticated
    USING (
        public.get_auth_role() IN ('SuperAdmin', 'Directeur', 'Directeur adjoint')
        OR (target_type = 'SERVICE' AND service_id = public.get_auth_service_id())
        OR (target_type = 'COMMERCIAL' AND commercial_id = auth.uid())
    );

DROP POLICY IF EXISTS "Gestion objectifs Direction" ON public.objectifs;
CREATE POLICY "Gestion objectifs Direction" ON public.objectifs
    FOR ALL TO authenticated
    USING (public.get_auth_role() IN ('SuperAdmin', 'Directeur', 'Directeur adjoint'))
    WITH CHECK (public.get_auth_role() IN ('SuperAdmin', 'Directeur', 'Directeur adjoint'));

-- Table CLASSEMENTS
DROP POLICY IF EXISTS "Lecture classements" ON public.classements;
CREATE POLICY "Lecture classements" ON public.classements
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Calcul classements Direction" ON public.classements;
CREATE POLICY "Calcul classements Direction" ON public.classements
    FOR ALL TO authenticated
    USING (public.get_auth_role() IN ('SuperAdmin', 'Directeur', 'Directeur adjoint'))
    WITH CHECK (public.get_auth_role() IN ('SuperAdmin', 'Directeur', 'Directeur adjoint'));

-- Table PRIMES & AUDIT
DROP POLICY IF EXISTS "Lecture primes autorisees" ON public.primes;
CREATE POLICY "Lecture primes autorisees" ON public.primes
    FOR SELECT TO authenticated
    USING (
        public.get_auth_role() IN ('SuperAdmin', 'Directeur', 'Directeur adjoint')
        OR (beneficiary_type = 'SERVICE' AND service_id = public.get_auth_service_id())
        OR (beneficiary_type = 'COMMERCIAL' AND commercial_id = auth.uid())
    );

DROP POLICY IF EXISTS "Arbitrage primes Direction" ON public.primes;
CREATE POLICY "Arbitrage primes Direction" ON public.primes
    FOR ALL TO authenticated
    USING (public.get_auth_role() IN ('SuperAdmin', 'Directeur'))
    WITH CHECK (public.get_auth_role() IN ('SuperAdmin', 'Directeur'));

DROP POLICY IF EXISTS "Lecture audit primes Direction" ON public.prime_audit_logs;
CREATE POLICY "Lecture audit primes Direction" ON public.prime_audit_logs
    FOR SELECT TO authenticated
    USING (public.get_auth_role() IN ('SuperAdmin', 'Directeur', 'Directeur adjoint'));

DROP POLICY IF EXISTS "Insertion audit primes" ON public.prime_audit_logs;
CREATE POLICY "Insertion audit primes" ON public.prime_audit_logs
    FOR INSERT TO authenticated
    WITH CHECK (public.get_auth_role() IN ('SuperAdmin', 'Directeur'));

COMMIT;

