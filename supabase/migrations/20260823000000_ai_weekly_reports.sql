-- Migration: Rapport d'activités hebdomadaire IA

-- 1. Table des activités quotidiennes (AI)
CREATE TABLE IF NOT EXISTS ai_daily_activities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    week_id TEXT NOT NULL, -- e.g., '2026-W34'
    date DATE NOT NULL,
    day TEXT NOT NULL, -- 'Lundi', 'Mardi', etc.
    activity_description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()),
    UNIQUE (user_id, date)
);

-- 2. Table des rapports hebdomadaires (AI)
CREATE TABLE IF NOT EXISTS ai_weekly_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    week_id TEXT NOT NULL, -- e.g., '2026-W34'
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    report_content JSONB,
    status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'SENT')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()),
    UNIQUE (user_id, week_id)
);

-- 3. RLS
ALTER TABLE ai_daily_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_weekly_reports ENABLE ROW LEVEL SECURITY;

-- Policies for ai_daily_activities
CREATE POLICY "Users can view their own activities" 
ON ai_daily_activities FOR SELECT 
TO authenticated 
USING (auth.uid() = user_id OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'SUPERADMIN'));

CREATE POLICY "Users can insert their own activities" 
ON ai_daily_activities FOR INSERT 
TO authenticated 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own activities" 
ON ai_daily_activities FOR UPDATE 
TO authenticated 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own activities" 
ON ai_daily_activities FOR DELETE 
TO authenticated 
USING (auth.uid() = user_id);


-- Policies for ai_weekly_reports
CREATE POLICY "Users can view their own reports and directors can view all" 
ON ai_weekly_reports FOR SELECT 
TO authenticated 
USING (auth.uid() = user_id OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'SUPERADMIN') OR status = 'SENT');

CREATE POLICY "Users can insert their own reports" 
ON ai_weekly_reports FOR INSERT 
TO authenticated 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own reports" 
ON ai_weekly_reports FOR UPDATE 
TO authenticated 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own reports" 
ON ai_weekly_reports FOR DELETE 
TO authenticated 
USING (auth.uid() = user_id);

-- 4. Triggers pour updated_at
DROP TRIGGER IF EXISTS set_updated_at ON ai_daily_activities;
CREATE TRIGGER set_updated_at
BEFORE UPDATE ON ai_daily_activities
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON ai_weekly_reports;
CREATE TRIGGER set_updated_at
BEFORE UPDATE ON ai_weekly_reports
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- 5. Index
CREATE INDEX IF NOT EXISTS idx_ai_daily_activities_user_week ON ai_daily_activities(user_id, week_id);
CREATE INDEX IF NOT EXISTS idx_ai_weekly_reports_user_week ON ai_weekly_reports(user_id, week_id);
