-- Migration: Mise à niveau de v2_weekly_reports et v2_daily_reports
-- Permet la synchronisation sans contrainte bloquante pour tous les statuts et colonnes de rapports

-- 1. Mise à jour de la contrainte CHECK de statut sur v2_weekly_reports
DO $$
BEGIN
    ALTER TABLE v2_weekly_reports DROP CONSTRAINT IF EXISTS v2_weekly_reports_status_check;
    ALTER TABLE v2_weekly_reports ADD CONSTRAINT v2_weekly_reports_status_check CHECK (status IN ('Brouillon', 'Soumis', 'Validé', 'Relu'));
EXCEPTION
    WHEN OTHERS THEN NULL;
END $$;

-- 2. Ajout des colonnes étendues sur v2_weekly_reports si absentes
ALTER TABLE v2_weekly_reports ADD COLUMN IF NOT EXISTS week_end DATE;
ALTER TABLE v2_weekly_reports ADD COLUMN IF NOT EXISTS ai_summary TEXT;
ALTER TABLE v2_weekly_reports ADD COLUMN IF NOT EXISTS achievements TEXT;
ALTER TABLE v2_weekly_reports ADD COLUMN IF NOT EXISTS difficulties TEXT;
ALTER TABLE v2_weekly_reports ADD COLUMN IF NOT EXISTS director_comment TEXT;
ALTER TABLE v2_weekly_reports ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE v2_weekly_reports ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE v2_weekly_reports ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES profiles(id);
ALTER TABLE v2_weekly_reports ADD COLUMN IF NOT EXISTS is_locked BOOLEAN DEFAULT false;
ALTER TABLE v2_weekly_reports ADD COLUMN IF NOT EXISTS pdf_url TEXT;

-- 3. Ajout des colonnes sur v2_daily_reports si absentes
ALTER TABLE v2_daily_reports ADD COLUMN IF NOT EXISTS is_locked BOOLEAN DEFAULT false;
ALTER TABLE v2_daily_reports ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'Opérationnel';
ALTER TABLE v2_daily_reports ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Brouillon';

