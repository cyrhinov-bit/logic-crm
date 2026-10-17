-- Migration: Nouveau module de rapports (V2)

-- 1. Table des rapports journaliers V2
CREATE TABLE IF NOT EXISTS v2_daily_reports (
    id UUID PRIMARY KEY,
    author_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    project TEXT NOT NULL,
    objectives TEXT,
    tasks JSONB,
    results TEXT,
    difficulties TEXT,
    observations TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()),
    UNIQUE (author_id, date, project)
);

-- 2. Table des rapports hebdomadaires V2
CREATE TABLE IF NOT EXISTS v2_weekly_reports (
    id UUID PRIMARY KEY,
    author_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    week_start DATE NOT NULL,
    project TEXT NOT NULL,
    daily_report_ids JSONB,
    weekly_objectives TEXT,
    tasks_by_day JSONB,
    pending_tasks JSONB,
    summary TEXT,
    next_week_objectives TEXT,
    conclusion TEXT,
    status TEXT NOT NULL DEFAULT 'Brouillon' CHECK (status IN ('Brouillon', 'Validé')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()),
    UNIQUE (author_id, week_start, project)
);

-- 3. RLS
ALTER TABLE v2_daily_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE v2_weekly_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Activer tout pour les utilisateurs authentifiés" ON v2_daily_reports;
DROP POLICY IF EXISTS "Activer tout pour les utilisateurs authentifiés" ON v2_weekly_reports;

CREATE POLICY "Activer tout pour les utilisateurs authentifiés" ON v2_daily_reports FOR ALL TO authenticated USING (true);
CREATE POLICY "Activer tout pour les utilisateurs authentifiés" ON v2_weekly_reports FOR ALL TO authenticated USING (true);

-- 4. Triggers pour updated_at (suppose que set_updated_at() existe, ce qui est le cas d'après 20260815000000_add_updated_at_triggers.sql)
DROP TRIGGER IF EXISTS set_updated_at ON v2_daily_reports;
CREATE TRIGGER set_updated_at
BEFORE UPDATE ON v2_daily_reports
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON v2_weekly_reports;
CREATE TRIGGER set_updated_at
BEFORE UPDATE ON v2_weekly_reports
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- 5. Index
CREATE INDEX IF NOT EXISTS idx_v2_daily_reports_author_date ON v2_daily_reports(author_id, date);
CREATE INDEX IF NOT EXISTS idx_v2_weekly_reports_author_week ON v2_weekly_reports(author_id, week_start);
