-- Migration P1 : colonne d'acces Rapports Equipe manquante en prod + nettoyage data
-- Contexte : crm_reports_enabled existe en prod mais pas crm_team_reports_enabled
-- (migration 20261001180000 partiellement appliquee). Sans cette colonne, l'acces
-- supervision repose uniquement sur les valeurs par defaut par role.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS crm_team_reports_enabled BOOLEAN DEFAULT false;

-- Backfill : Direction activee par defaut (sans ecraser d'eventuels acces custom existants)
UPDATE profiles SET crm_team_reports_enabled = true
WHERE role IN ('Directeur', 'Directeur adjoint', 'SuperAdmin')
AND (crm_team_reports_enabled IS NULL OR crm_team_reports_enabled = false);

-- Repair data : un brouillon ne doit jamais porter de date de soumission
-- (residu de l'ancien double-save avant la soumission atomique)
UPDATE v2_weekly_reports SET submitted_at = NULL WHERE status = 'Brouillon' AND submitted_at IS NOT NULL;
