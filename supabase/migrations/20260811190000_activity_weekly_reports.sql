-- Migration: Rapports d'activité journaliers + rapports hebdomadaires + photo de profil
-- 1. Photo de profil (en-tête des PDF de rapport)
-- 2. Table des rapports journaliers
-- 3. Table des rapports hebdomadaires

-- 1. Photo de profil
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS photo TEXT;

-- 2. Table des rapports journaliers
CREATE TABLE IF NOT EXISTS activity_reports (
    id UUID PRIMARY KEY,
    author_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('Activité', 'Prospection')),
    date DATE NOT NULL,
    realisations TEXT,
    difficultes TEXT,
    remarques TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()),
    UNIQUE (author_id, type, date)
);

-- 3. Table des rapports hebdomadaires
CREATE TABLE IF NOT EXISTS weekly_reports (
    id UUID PRIMARY KEY,
    author_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    week_start DATE NOT NULL,
    sections JSONB,
    kpis JSONB,
    status TEXT NOT NULL DEFAULT 'Brouillon' CHECK (status IN ('Brouillon', 'Envoyé', 'Relu')),
    sent_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- 4. RLS
ALTER TABLE activity_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Activer tout pour les utilisateurs authentifiés" ON activity_reports FOR ALL TO authenticated USING (true);
CREATE POLICY "Activer tout pour les utilisateurs authentifiés" ON weekly_reports FOR ALL TO authenticated USING (true);

-- 5. Index
CREATE INDEX IF NOT EXISTS idx_activity_reports_author_date ON activity_reports(author_id, date);
CREATE INDEX IF NOT EXISTS idx_activity_reports_type ON activity_reports(type);
CREATE INDEX IF NOT EXISTS idx_weekly_reports_author_week ON weekly_reports(author_id, week_start);