-- Migration consolidee P0 : rend le module Rapport Hebdo 100% fonctionnel
-- Corrige : statuts Soumis/Relu, colonnes manquantes, parsing is_locked,
-- liens morts, RLS trop permissive (confidentialite).

-- 1. Colonnes v2_weekly_reports (idempotent)
ALTER TABLE v2_weekly_reports ADD COLUMN IF NOT EXISTS week_end DATE;
ALTER TABLE v2_weekly_reports ADD COLUMN IF NOT EXISTS ai_summary TEXT;
ALTER TABLE v2_weekly_reports ADD COLUMN IF NOT EXISTS achievements TEXT;
ALTER TABLE v2_weekly_reports ADD COLUMN IF NOT EXISTS difficulties TEXT;
ALTER TABLE v2_weekly_reports ADD COLUMN IF NOT EXISTS director_comment TEXT;
ALTER TABLE v2_weekly_reports ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ;
ALTER TABLE v2_weekly_reports ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE v2_weekly_reports ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE v2_weekly_reports ADD COLUMN IF NOT EXISTS is_locked BOOLEAN DEFAULT false;
ALTER TABLE v2_weekly_reports ADD COLUMN IF NOT EXISTS pdf_url TEXT;

-- 2. Colonnes v2_daily_reports (idempotent)
ALTER TABLE v2_daily_reports ADD COLUMN IF NOT EXISTS is_locked BOOLEAN DEFAULT false;
ALTER TABLE v2_daily_reports ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'Operationnel';
ALTER TABLE v2_daily_reports ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Brouillon';

-- 3. Contraintes de statut alignees sur le code (Brouillon, Soumis, Valide, Relu)
DO $$
BEGIN
    ALTER TABLE v2_weekly_reports DROP CONSTRAINT IF EXISTS v2_weekly_reports_status_check;
    ALTER TABLE v2_weekly_reports ADD CONSTRAINT v2_weekly_reports_status_check
      CHECK (status IN ('Brouillon', 'Soumis', 'Validé', 'Relu'));
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE v2_daily_reports DROP CONSTRAINT IF EXISTS v2_daily_reports_status_check;
    ALTER TABLE v2_daily_reports ADD CONSTRAINT v2_daily_reports_status_check
      CHECK (status IN ('Brouillon', 'Soumis', 'Validé'));
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 4. Trigger updated_at (si fonction set_updated_at existe)
DO $$
BEGIN
    DROP TRIGGER IF EXISTS set_updated_at ON v2_daily_reports;
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON v2_daily_reports
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
    DROP TRIGGER IF EXISTS set_updated_at ON v2_weekly_reports;
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON v2_weekly_reports
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 5. Index
CREATE INDEX IF NOT EXISTS idx_v2_daily_reports_author_date ON v2_daily_reports(author_id, date);
CREATE INDEX IF NOT EXISTS idx_v2_weekly_reports_author_week ON v2_weekly_reports(author_id, week_start);
CREATE INDEX IF NOT EXISTS idx_v2_weekly_reports_status ON v2_weekly_reports(status);

-- 6. RLS : remplace la policy permissive par des policies scopees
-- Auteurs gerent leurs rapports, Direction lit/valide tout.
ALTER TABLE v2_daily_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE v2_weekly_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Activer tout pour les utilisateurs authentifiés" ON v2_daily_reports;
DROP POLICY IF EXISTS "Activer tout pour les utilisateurs authentifiés" ON v2_weekly_reports;
DROP POLICY IF EXISTS "v2_daily_select_scoped" ON v2_daily_reports;
DROP POLICY IF EXISTS "v2_daily_insert_own" ON v2_daily_reports;
DROP POLICY IF EXISTS "v2_daily_update_scoped" ON v2_daily_reports;
DROP POLICY IF EXISTS "v2_daily_delete_own" ON v2_daily_reports;
DROP POLICY IF EXISTS "v2_weekly_select_scoped" ON v2_weekly_reports;
DROP POLICY IF EXISTS "v2_weekly_insert_own" ON v2_weekly_reports;
DROP POLICY IF EXISTS "v2_weekly_update_scoped" ON v2_weekly_reports;
DROP POLICY IF EXISTS "v2_weekly_delete_own" ON v2_weekly_reports;

-- Lecture : son rapport OU membre Direction
CREATE POLICY "v2_daily_select_scoped" ON v2_daily_reports FOR SELECT TO authenticated
USING (
  auth.uid() = author_id
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('Directeur', 'Directeur adjoint', 'SuperAdmin'))
);
CREATE POLICY "v2_weekly_select_scoped" ON v2_weekly_reports FOR SELECT TO authenticated
USING (
  auth.uid() = author_id
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('Directeur', 'Directeur adjoint', 'SuperAdmin'))
);

-- Insertion : uniquement ses propres rapports
CREATE POLICY "v2_daily_insert_own" ON v2_daily_reports FOR INSERT TO authenticated
WITH CHECK (auth.uid() = author_id);
CREATE POLICY "v2_weekly_insert_own" ON v2_weekly_reports FOR INSERT TO authenticated
WITH CHECK (auth.uid() = author_id);

-- Update : auteur OU Direction (pour review/validation)
CREATE POLICY "v2_daily_update_scoped" ON v2_daily_reports FOR UPDATE TO authenticated
USING (
  auth.uid() = author_id
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('Directeur', 'Directeur adjoint', 'SuperAdmin'))
)
WITH CHECK (
  auth.uid() = author_id
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('Directeur', 'Directeur adjoint', 'SuperAdmin'))
);
CREATE POLICY "v2_weekly_update_scoped" ON v2_weekly_reports FOR UPDATE TO authenticated
USING (
  auth.uid() = author_id
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('Directeur', 'Directeur adjoint', 'SuperAdmin'))
)
WITH CHECK (
  auth.uid() = author_id
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('Directeur', 'Directeur adjoint', 'SuperAdmin'))
);

-- Suppression : uniquement l'auteur
CREATE POLICY "v2_daily_delete_own" ON v2_daily_reports FOR DELETE TO authenticated
USING (auth.uid() = author_id);
CREATE POLICY "v2_weekly_delete_own" ON v2_weekly_reports FOR DELETE TO authenticated
USING (auth.uid() = author_id);
