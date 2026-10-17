-- Migration: Fix CRM CHECK/NOT NULL bloquants (vérifiés en live le 2026-10-06)
-- 1. prestations_commandes_statut_check n'autorisait que DEVIS/CONFIRMEE/EN_COURS/FACTUREE/PAYEE
--    alors que l'app (type StatutPrestation) utilise BROUILLON, EN_ATTENTE_VALIDATION, VALIDE,
--    EN_COURS_EXECUTION, LIVREE, PAYEE, CLOTUREE, ANNULEE... => tout insert standard rejeté (23514).
-- 2. commissions_prestations_statut_check n'autorisait que A_VALIDER/A_PAYER/PAYEE/ANNULEE
--    alors que l'app crée les commissions avec 'EN_ATTENTE' par défaut => rejeté (23514).
-- 3. interventions_maintenance_statut_check n'autorisait que EN_ATTENTE/EN_COURS/TERMINEE/ANNULEE
--    alors que l'app crée avec 'NOUVEAU' par défaut => rejeté (23514).
-- 4. commissions_prestations.type NOT NULL sans DEFAULT alors que l'app envoie type_beneficiaire
--    (jamais 'type') => rejeté (23502).
-- 5. interventions_maintenance.prix NOT NULL sans DEFAULT alors que l'app envoie prix_total
--    (jamais 'prix') => rejeté (23502).
-- Les FK sont conservées (intégrité), les CHECK métier sont supprimés (la règle vit dans le code TS).

ALTER TABLE public.prestations_commandes DROP CONSTRAINT IF EXISTS prestations_commandes_statut_check;
ALTER TABLE public.commissions_prestations DROP CONSTRAINT IF EXISTS commissions_prestations_statut_check;
ALTER TABLE public.interventions_maintenance DROP CONSTRAINT IF EXISTS interventions_maintenance_statut_check;

UPDATE public.commissions_prestations SET type = 'APPORTEUR' WHERE type IS NULL;
ALTER TABLE public.commissions_prestations ALTER COLUMN type SET DEFAULT 'APPORTEUR';
ALTER TABLE public.commissions_prestations ALTER COLUMN type DROP NOT NULL;

UPDATE public.interventions_maintenance SET prix = 0 WHERE prix IS NULL;
ALTER TABLE public.interventions_maintenance ALTER COLUMN prix SET DEFAULT 0;

-- Force le rechargement du cache PostgREST (évite les PGRST204 fantômes après ALTER)
NOTIFY pgrst, 'reload schema';
