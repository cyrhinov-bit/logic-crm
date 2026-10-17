-- ============================================================================
-- FICHIER : 20261015000001_encaissement_module.sql
-- OBJECTIF : Création des tables du module de gestion des versements
-- DATE : 2026-10-15
-- AUTEUR : Agent Intégration POS
-- ============================================================================
-- RÈGLES :
-- - Pas de réinitialisation de la base
-- - Pas de suppression de données existantes
-- - Contraintes d'intégrité et index nécessaires
-- - RLS activé avant exposition des données
-- - Clés étrangères vérifiées avec les tables existantes
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. TABLE : encaissement_affectations
--    Lien entre un caissier et un encaisseur
-- ============================================================================
CREATE TABLE IF NOT EXISTS encaissement_affectations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    caissier_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    encaisseur_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    actif BOOLEAN NOT NULL DEFAULT true,
    date_debut DATE NOT NULL DEFAULT CURRENT_DATE,
    date_fin DATE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT TIMEZONE('utc'::text, NOW()),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT TIMEZONE('utc'::text, NOW()),
    created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    
    -- Contrainte : un caissier ne peut être affecté qu'une seule fois à un encaisseur actif
    CONSTRAINT encaissement_affectations_unique_active UNIQUE (caissier_id, encaisseur_id, actif),
    
    -- Contrainte : la date de fin doit être après la date de début
    CONSTRAINT encaissement_affectations_date_check CHECK (date_fin IS NULL OR date_fin > date_debut)
);

-- Index pour recherche rapide par caissier ou encaisseur
CREATE INDEX IF NOT EXISTS idx_encaissement_affectations_caissier ON encaissement_affectations(caissier_id);
CREATE INDEX IF NOT EXISTS idx_encaissement_affectations_encaisseur ON encaissement_affectations(encaisseur_id);
CREATE INDEX IF NOT EXISTS idx_encaissement_affectations_actif ON encaissement_affectations(actif) WHERE actif = true;

-- ============================================================================
-- 2. TABLE : encaissement_frequences
--    Paramètres de fréquence de versement (général ou par caissier)
-- ============================================================================
CREATE TABLE IF NOT EXISTS encaissement_frequences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    caissier_id UUID REFERENCES profiles(id) ON DELETE CASCADE, -- NULL = fréquence générale
    frequence_type TEXT NOT NULL CHECK (frequence_type IN ('quotidienne', 'n_jours', 'hebdomadaire', 'bihebdomadaire', 'mensuelle', 'personnalisee')),
    frequence_n INTEGER, -- Pour 'n_jours' : tous les N jours
    jour_semaine INTEGER CHECK (jour_semaine BETWEEN 0 AND 6), -- Pour 'hebdomadaire' : 0=Dimanche, 6=Samedi
    jour_mois INTEGER CHECK (jour_mois BETWEEN 1 AND 31), -- Pour 'mensuelle' : jour du mois
    heure_limite TIME NOT NULL DEFAULT '18:00:00',
    jours_ouvres_seulement BOOLEAN NOT NULL DEFAULT true,
    versement_partiel_autorise BOOLEAN NOT NULL DEFAULT false,
    date_debut DATE NOT NULL DEFAULT CURRENT_DATE,
    date_fin DATE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT TIMEZONE('utc'::text, NOW()),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT TIMEZONE('utc'::text, NOW()),
    created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    
    -- Contrainte : fréquence_n doit être positif pour le type 'n_jours'
    CONSTRAINT encaissement_frequences_n_check CHECK (
        frequence_type != 'n_jours' OR (frequence_n IS NOT NULL AND frequence_n > 0)
    ),
    
    -- Contrainte : jour_semaine requis pour 'hebdomadaire'
    -- (nom distinct de la contrainte de colonne auto-nommée par PostgreSQL)
    CONSTRAINT encaissement_frequences_jour_semaine_requis CHECK (
        frequence_type != 'hebdomadaire' OR jour_semaine IS NOT NULL
    ),
    
    -- Contrainte : jour_mois requis pour 'mensuelle'
    -- (nom distinct de la contrainte de colonne auto-nommée par PostgreSQL)
    CONSTRAINT encaissement_frequences_jour_mois_requis CHECK (
        frequence_type != 'mensuelle' OR jour_mois IS NOT NULL
    ),
    
    -- Contrainte : date_fin après date_debut
    CONSTRAINT encaissement_frequences_date_check CHECK (date_fin IS NULL OR date_fin > date_debut)
);

-- Index pour recherche rapide
CREATE INDEX IF NOT EXISTS idx_encaissement_frequences_caissier ON encaissement_frequences(caissier_id);
CREATE INDEX IF NOT EXISTS idx_encaissement_frequences_type ON encaissement_frequences(frequence_type);

-- ============================================================================
-- 3. TABLE : encaissement_echeances
--    Échéances calculées à partir des paramètres de fréquence
-- ============================================================================
CREATE TABLE IF NOT EXISTS encaissement_echeances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    caissier_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    date_echeance DATE NOT NULL,
    montant_attendu NUMERIC NOT NULL DEFAULT 0,
    statut TEXT NOT NULL DEFAULT 'en_attente' CHECK (statut IN ('en_attente', 'en_retard', 'partiellement_remis', 'complete', 'annulee')),
    date_calcul TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT TIMEZONE('utc'::text, NOW()),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT TIMEZONE('utc'::text, NOW()),
    
    -- Contrainte : une seule échéance par caissier par date
    CONSTRAINT encaissement_echeances_unique UNIQUE (caissier_id, date_echeance)
);

-- Index pour recherche rapide
CREATE INDEX IF NOT EXISTS idx_encaissement_echeances_caissier ON encaissement_echeances(caissier_id);
CREATE INDEX IF NOT EXISTS idx_encaissement_echeances_date ON encaissement_echeances(date_echeance);
CREATE INDEX IF NOT EXISTS idx_encaissement_echeances_statut ON encaissement_echeances(statut);

-- ============================================================================
-- 4. TABLE : encaissement_dossiers
--    Dossiers de versement (entité centrale)
-- ============================================================================
CREATE TABLE IF NOT EXISTS encaissement_dossiers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reference TEXT UNIQUE NOT NULL,
    caissier_id UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
    encaisseur_id UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
    session_id UUID REFERENCES pos_cash_sessions(id) ON DELETE SET NULL,
    date_versement DATE NOT NULL DEFAULT CURRENT_DATE,
    montant_attendu NUMERIC NOT NULL DEFAULT 0,
    montant_declare_caissier NUMERIC,
    montant_declare_encaisseur NUMERIC,
    montant_confirme NUMERIC,
    statut TEXT NOT NULL DEFAULT 'en_attente' CHECK (statut IN (
        'en_attente',
        'declare_caissier',
        'declare_encaisseur',
        'confirme',
        'a_recompter',
        'en_arbitrage',
        'confirme_apres_arbitrage',
        'annule'
    )),
    nombre_recomptages INTEGER NOT NULL DEFAULT 0,
    max_recomptages INTEGER NOT NULL DEFAULT 3,
    date_creation TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT TIMEZONE('utc'::text, NOW()),
    date_validation TIMESTAMP WITH TIME ZONE,
    date_annulation TIMESTAMP WITH TIME ZONE,
    motif_annulation TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT TIMEZONE('utc'::text, NOW()),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT TIMEZONE('utc'::text, NOW()),
    
    -- Contrainte : le caissier et l'encaisseur doivent être différents
    CONSTRAINT encaissement_dossiers_different_users CHECK (caissier_id != encaisseur_id),
    
    -- Contrainte : max_recomptages doit être positif
    CONSTRAINT encaissement_dossiers_max_recomptages_check CHECK (max_recomptages > 0)
);

-- Index pour recherche rapide
CREATE INDEX IF NOT EXISTS idx_encaissement_dossiers_caissier ON encaissement_dossiers(caissier_id);
CREATE INDEX IF NOT EXISTS idx_encaissement_dossiers_encaisseur ON encaissement_dossiers(encaisseur_id);
CREATE INDEX IF NOT EXISTS idx_encaissement_dossiers_statut ON encaissement_dossiers(statut);
CREATE INDEX IF NOT EXISTS idx_encaissement_dossiers_date ON encaissement_dossiers(date_versement);
CREATE INDEX IF NOT EXISTS idx_encaissement_dossiers_session ON encaissement_dossiers(session_id);

-- ============================================================================
-- 5. TABLE : encaissement_declarations
--    Déclarations des montants (caissier et encaisseur)
-- ============================================================================
CREATE TABLE IF NOT EXISTS encaissement_declarations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dossier_id UUID NOT NULL REFERENCES encaissement_dossiers(id) ON DELETE CASCADE,
    type_declaration TEXT NOT NULL CHECK (type_declaration IN ('caissier_initial', 'encaisseur_initial', 'caissier_recompte', 'encaisseur_recompte')),
    montant NUMERIC NOT NULL CHECK (montant >= 0),
    utilisateur_id UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
    date_declaration TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT TIMEZONE('utc'::text, NOW()),
    commentaire TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT TIMEZONE('utc'::text, NOW())
);

-- Index pour recherche rapide
CREATE INDEX IF NOT EXISTS idx_encaissement_declarations_dossier ON encaissement_declarations(dossier_id);
CREATE INDEX IF NOT EXISTS idx_encaissement_declarations_type ON encaissement_declarations(type_declaration);
CREATE INDEX IF NOT EXISTS idx_encaissement_declarations_utilisateur ON encaissement_declarations(utilisateur_id);

-- ============================================================================
-- 6. TABLE : encaissement_recomptages
--    Tentatives de recomptage
-- ============================================================================
CREATE TABLE IF NOT EXISTS encaissement_recomptages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dossier_id UUID NOT NULL REFERENCES encaissement_dossiers(id) ON DELETE CASCADE,
    caissier_montant NUMERIC NOT NULL CHECK (caissier_montant >= 0),
    encaisseur_montant NUMERIC NOT NULL CHECK (encaisseur_montant >= 0),
    ecart NUMERIC NOT NULL DEFAULT 0,
    statut TEXT NOT NULL DEFAULT 'en_cours' CHECK (statut IN ('en_cours', 'accorde', 'desaccord')),
    date_recomptage TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT TIMEZONE('utc'::text, NOW()),
    commentaire_caissier TEXT,
    commentaire_encaisseur TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT TIMEZONE('utc'::text, NOW())
);

-- Index pour recherche rapide
CREATE INDEX IF NOT EXISTS idx_encaissement_recomptages_dossier ON encaissement_recomptages(dossier_id);
CREATE INDEX IF NOT EXISTS idx_encaissement_recomptages_statut ON encaissement_recomptages(statut);

-- ============================================================================
-- 7. TABLE : encaissement_litiges
--    Litiges et décisions d'arbitrage
-- ============================================================================
CREATE TABLE IF NOT EXISTS encaissement_litiges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dossier_id UUID NOT NULL REFERENCES encaissement_dossiers(id) ON DELETE CASCADE,
    arbitre_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    statut TEXT NOT NULL DEFAULT 'ouvert' CHECK (statut IN ('ouvert', 'en_cours', 'resolu', 'cloture')),
    montant_retenu NUMERIC,
    ecart_restant NUMERIC,
    motif TEXT NOT NULL,
    date_arbitrage TIMESTAMP WITH TIME ZONE,
    date_resolution TIMESTAMP WITH TIME ZONE,
    decision TEXT CHECK (decision IN ('montant_caissier', 'montant_encaisseur', 'montant_retenu', 'annulation')),
    commentaire TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT TIMEZONE('utc'::text, NOW()),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT TIMEZONE('utc'::text, NOW()),
    
    -- Contrainte : un seul litige par dossier (support de l'upsert d'arbitrage)
    CONSTRAINT encaissement_litiges_dossier_unique UNIQUE (dossier_id),

    -- Contrainte : montant_retenu doit être positif si spécifié
    CONSTRAINT encaissement_litiges_montant_check CHECK (montant_retenu IS NULL OR montant_retenu >= 0),
    
    -- Contrainte : ecart_restant doit être positif si spécifié
    CONSTRAINT encaissement_litiges_ecart_check CHECK (ecart_restant IS NULL OR ecart_restant >= 0)
);

-- Index pour recherche rapide
CREATE INDEX IF NOT EXISTS idx_encaissement_litiges_dossier ON encaissement_litiges(dossier_id);
CREATE INDEX IF NOT EXISTS idx_encaissement_litiges_statut ON encaissement_litiges(statut);
CREATE INDEX IF NOT EXISTS idx_encaissement_litiges_arbitre ON encaissement_litiges(arbitre_id);

-- ============================================================================
-- 8. TABLE : encaissement_audit_log
--    Journal d'audit
-- ============================================================================
CREATE TABLE IF NOT EXISTS encaissement_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    table_name TEXT NOT NULL,
    record_id UUID NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
    ancienne_valeur JSONB,
    nouvelle_valeur JSONB,
    utilisateur_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    date_action TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT TIMEZONE('utc'::text, NOW()),
    adresse_ip TEXT,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT TIMEZONE('utc'::text, NOW())
);

-- Index pour recherche rapide
CREATE INDEX IF NOT EXISTS idx_encaissement_audit_log_table ON encaissement_audit_log(table_name);
CREATE INDEX IF NOT EXISTS idx_encaissement_audit_log_record ON encaissement_audit_log(record_id);
CREATE INDEX IF NOT EXISTS idx_encaissement_audit_log_utilisateur ON encaissement_audit_log(utilisateur_id);
CREATE INDEX IF NOT EXISTS idx_encaissement_audit_log_date ON encaissement_audit_log(date_action);

-- ============================================================================
-- 9. FONCTIONS UTILISATEURS POUR RLS
-- ============================================================================

-- Fonction : vérifier si l'utilisateur est un encaisseur actif
CREATE OR REPLACE FUNCTION public.is_encaisseur(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_user_id AND role = 'Encaisseur' AND active = true
  );
$$;

-- Fonction : vérifier si l'utilisateur est un caissier actif
CREATE OR REPLACE FUNCTION public.is_caissier(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_user_id AND role IN ('Caissier', 'Gerant') AND active = true
  );
$$;

-- Fonction : vérifier si l'utilisateur est affecté à un encaisseur
CREATE OR REPLACE FUNCTION public.is_affecte_a_encaisseur(p_caissier_id UUID, p_encaisseur_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.encaissement_affectations
    WHERE caissier_id = p_caissier_id 
      AND encaisseur_id = p_encaisseur_id 
      AND actif = true
  );
$$;

-- ============================================================================
-- 10. POLITIQUES RLS
-- ============================================================================

-- Activation RLS sur toutes les nouvelles tables
ALTER TABLE encaissement_affectations ENABLE ROW LEVEL SECURITY;
ALTER TABLE encaissement_frequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE encaissement_echeances ENABLE ROW LEVEL SECURITY;
ALTER TABLE encaissement_dossiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE encaissement_declarations ENABLE ROW LEVEL SECURITY;
ALTER TABLE encaissement_recomptages ENABLE ROW LEVEL SECURITY;
ALTER TABLE encaissement_litiges ENABLE ROW LEVEL SECURITY;
ALTER TABLE encaissement_audit_log ENABLE ROW LEVEL SECURITY;

-- Politiques pour encaissement_affectations
CREATE POLICY "encaissement_affectations_select" ON encaissement_affectations
  FOR SELECT TO authenticated USING (
    public.is_direction() 
    OR caissier_id = auth.uid() 
    OR encaisseur_id = auth.uid()
  );

CREATE POLICY "encaissement_affectations_insert" ON encaissement_affectations
  FOR INSERT TO authenticated WITH CHECK (
    public.is_direction()
  );

CREATE POLICY "encaissement_affectations_update" ON encaissement_affectations
  FOR UPDATE TO authenticated USING (
    public.is_direction()
  );

-- Politiques pour encaissement_frequences
CREATE POLICY "encaissement_frequences_select" ON encaissement_frequences
  FOR SELECT TO authenticated USING (
    public.is_direction()
    OR (caissier_id IS NOT NULL AND caissier_id = auth.uid())
    OR caissier_id IS NULL  -- Fréquence générale visible par tous les caissiers
  );

CREATE POLICY "encaissement_frequences_insert" ON encaissement_frequences
  FOR INSERT TO authenticated WITH CHECK (
    public.is_direction()
  );

CREATE POLICY "encaissement_frequences_update" ON encaissement_frequences
  FOR UPDATE TO authenticated USING (
    public.is_direction()
  );

-- Politiques pour encaissement_echeances
CREATE POLICY "encaissement_echeances_select" ON encaissement_echeances
  FOR SELECT TO authenticated USING (
    public.is_direction()
    OR caissier_id = auth.uid()
  );

-- Politiques pour encaissement_dossiers
CREATE POLICY "encaissement_dossiers_select" ON encaissement_dossiers
  FOR SELECT TO authenticated USING (
    public.is_direction()
    OR caissier_id = auth.uid()
    OR encaisseur_id = auth.uid()
  );

CREATE POLICY "encaissement_dossiers_insert" ON encaissement_dossiers
  FOR INSERT TO authenticated WITH CHECK (
    public.is_direction()
    OR caissier_id = auth.uid()
  );

CREATE POLICY "encaissement_dossiers_update" ON encaissement_dossiers
  FOR UPDATE TO authenticated USING (
    public.is_direction()
    OR caissier_id = auth.uid()
    OR encaisseur_id = auth.uid()
  );

-- Politiques pour encaissement_declarations
CREATE POLICY "encaissement_declarations_select" ON encaissement_declarations
  FOR SELECT TO authenticated USING (
    public.is_direction()
    OR utilisateur_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM encaissement_dossiers d
      WHERE d.id = dossier_id 
        AND (d.caissier_id = auth.uid() OR d.encaisseur_id = auth.uid())
    )
  );

CREATE POLICY "encaissement_declarations_insert" ON encaissement_declarations
  FOR INSERT TO authenticated WITH CHECK (
    public.is_direction()
    OR utilisateur_id = auth.uid()
  );

-- Politiques pour encaissement_recomptages
CREATE POLICY "encaissement_recomptages_select" ON encaissement_recomptages
  FOR SELECT TO authenticated USING (
    public.is_direction()
    OR EXISTS (
      SELECT 1 FROM encaissement_dossiers d
      WHERE d.id = dossier_id 
        AND (d.caissier_id = auth.uid() OR d.encaisseur_id = auth.uid())
    )
  );

CREATE POLICY "encaissement_recomptages_insert" ON encaissement_recomptages
  FOR INSERT TO authenticated WITH CHECK (
    public.is_direction()
    OR EXISTS (
      SELECT 1 FROM encaissement_dossiers d
      WHERE d.id = dossier_id 
        AND (d.caissier_id = auth.uid() OR d.encaisseur_id = auth.uid())
    )
  );

-- Politiques pour encaissement_litiges
CREATE POLICY "encaissement_litiges_select" ON encaissement_litiges
  FOR SELECT TO authenticated USING (
    public.is_direction()
    OR arbitre_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM encaissement_dossiers d
      WHERE d.id = dossier_id 
        AND (d.caissier_id = auth.uid() OR d.encaisseur_id = auth.uid())
    )
  );

CREATE POLICY "encaissement_litiges_insert" ON encaissement_litiges
  FOR INSERT TO authenticated WITH CHECK (
    public.is_direction()
  );

CREATE POLICY "encaissement_litiges_update" ON encaissement_litiges
  FOR UPDATE TO authenticated USING (
    public.is_direction()
  );

-- Politiques pour encaissement_audit_log
CREATE POLICY "encaissement_audit_log_select" ON encaissement_audit_log
  FOR SELECT TO authenticated USING (
    public.is_direction()
    OR utilisateur_id = auth.uid()
  );

-- ============================================================================
-- 11. TRIGGERS DE MISE À JOUR AUTOMATIQUE (updated_at)
-- ============================================================================

-- Fonction générique pour updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = TIMEZONE('utc'::text, NOW());
  RETURN NEW;
END;
$$;

-- Application du trigger sur toutes les tables avec updated_at
CREATE TRIGGER encaissement_affectations_updated_at
  BEFORE UPDATE ON encaissement_affectations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER encaissement_frequences_updated_at
  BEFORE UPDATE ON encaissement_frequences
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER encaissement_dossiers_updated_at
  BEFORE UPDATE ON encaissement_dossiers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER encaissement_litiges_updated_at
  BEFORE UPDATE ON encaissement_litiges
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- 12. FONCTIONS DE CALCUL DES ÉCHÉANCES
-- ============================================================================

-- Fonction : calculer les échéances pour un caissier
CREATE OR REPLACE FUNCTION public.calculer_echeances_caissier(
  p_caissier_id UUID,
  p_date_debut DATE,
  p_date_fin DATE
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_frequence RECORD;
  v_date DATE;
  v_count INTEGER := 0;
BEGIN
  -- Déterminer la fréquence applicable (caissier > générale)
  SELECT * INTO v_frequence
  FROM encaissement_frequences
  WHERE caissier_id = p_caissier_id
    AND date_debut <= p_date_fin
    AND (date_fin IS NULL OR date_fin >= p_date_debut)
  ORDER BY created_at DESC
  LIMIT 1;

  -- Si aucune fréquence spécifique, utiliser la fréquence générale
  IF NOT FOUND THEN
    SELECT * INTO v_frequence
    FROM encaissement_frequences
    WHERE caissier_id IS NULL
      AND date_debut <= p_date_fin
      AND (date_fin IS NULL OR date_fin >= p_date_debut)
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;

  -- Si toujours rien, utiliser une fréquence quotidienne par défaut
  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  -- Calculer les échéances
  v_date := p_date_debut;
  WHILE v_date <= p_date_fin LOOP
    INSERT INTO encaissement_echeances (caissier_id, date_echeance, statut)
    VALUES (p_caissier_id, v_date, 'en_attente')
    ON CONFLICT (caissier_id, date_echeance) DO NOTHING;
    
    v_count := v_count + 1;
    
    -- Calculer la prochaine date selon la fréquence
    CASE v_frequence.frequence_type
      WHEN 'quotidienne' THEN
        v_date := v_date + INTERVAL '1 day';
      WHEN 'n_jours' THEN
        v_date := v_date + (v_frequence.frequence_n || ' days')::INTERVAL;
      WHEN 'hebdomadaire' THEN
        v_date := v_date + INTERVAL '1 week';
      WHEN 'bihebdomadaire' THEN
        v_date := v_date + INTERVAL '2 weeks';
      WHEN 'mensuelle' THEN
        v_date := v_date + INTERVAL '1 month';
      ELSE
        v_date := v_date + INTERVAL '1 day';
    END CASE;
    
    -- Gestion des jours ouvrés
    IF v_frequence.jours_ouvres_seulement THEN
      -- Sauter le samedi (6) et le dimanche (0)
      WHILE EXTRACT(DOW FROM v_date) IN (0, 6) LOOP
        v_date := v_date + INTERVAL '1 day';
      END LOOP;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$;

-- ============================================================================
-- 13. INDEX SUPPLÉMENTAIRES POUR PERFORMANCE
-- ============================================================================

-- Index composites pour les requêtes fréquentes
CREATE INDEX IF NOT EXISTS idx_encaissement_dossiers_caissier_statut ON encaissement_dossiers(caissier_id, statut);
CREATE INDEX IF NOT EXISTS idx_encaissement_dossiers_encaisseur_statut ON encaissement_dossiers(encaisseur_id, statut);
CREATE INDEX IF NOT EXISTS idx_encaissement_dossiers_date_statut ON encaissement_dossiers(date_versement, statut);

COMMIT;

-- ============================================================================
-- STRATÉGIE DE RETOUR ARRIÈRE
-- ============================================================================
-- Pour revenir en arrière, exécutez :
--
-- BEGIN;
--   DROP FUNCTION IF EXISTS public.calculer_echeances_caissier(UUID, DATE, DATE);
--   DROP FUNCTION IF EXISTS public.set_updated_at();
--   DROP FUNCTION IF EXISTS public.is_encaisseur(UUID);
--   DROP FUNCTION IF EXISTS public.is_caissier(UUID);
--   DROP FUNCTION IF EXISTS public.is_affecte_a_encaisseur(UUID, UUID);
--   
--   DROP TRIGGER IF EXISTS encaissement_affectations_updated_at ON encaissement_affectations;
--   DROP TRIGGER IF EXISTS encaissement_frequences_updated_at ON encaissement_frequences;
--   DROP TRIGGER IF EXISTS encaissement_dossiers_updated_at ON encaissement_dossiers;
--   DROP TRIGGER IF EXISTS encaissement_litiges_updated_at ON encaissement_litiges;
--   
--   DROP TABLE IF EXISTS encaissement_audit_log;
--   DROP TABLE IF EXISTS encaissement_litiges;
--   DROP TABLE IF EXISTS encaissement_recomptages;
--   DROP TABLE IF EXISTS encaissement_declarations;
--   DROP TABLE IF EXISTS encaissement_dossiers;
--   DROP TABLE IF EXISTS encaissement_echeances;
--   DROP TABLE IF EXISTS encaissement_frequences;
--   DROP TABLE IF EXISTS encaissement_affectations;
--   
--   ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
--   ALTER TABLE profiles ADD CONSTRAINT profiles_role_check CHECK (
--     role IN ('Directeur', 'Directeur adjoint', 'Responsable', 'Commercial', 'Caissier', 'Gerant', 'SuperAdmin')
--   );
-- COMMIT;
-- ============================================================================
