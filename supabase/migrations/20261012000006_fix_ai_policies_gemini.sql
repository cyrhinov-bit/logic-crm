-- Correctif controles IA : le role 'SUPERADMIN' (majuscules) ne matche jamais
-- (l'app utilise 'SuperAdmin'), et tout rapport SENT etait lisible par tous.
DROP POLICY IF EXISTS "Users can view their own activities" ON public.ai_daily_activities;
CREATE POLICY "Users can view their own activities"
  ON public.ai_daily_activities FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.is_direction());

DROP POLICY IF EXISTS "Users can view their own reports and directors can view all" ON public.ai_weekly_reports;
CREATE POLICY "Users can view their own reports and directors can view all"
  ON public.ai_weekly_reports FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.is_direction());

-- Colonne lue/ecrite par le front (cle Gemini par utilisateur) mais jamais creee.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS gemini_api_key TEXT;
