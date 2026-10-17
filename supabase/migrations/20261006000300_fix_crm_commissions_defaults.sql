-- Migration: defaults sur colonnes legacy de commissions_prestations jamais envoyées par l'app
-- (syncCommissionsForPrestation envoie `montant`, pas montant_prestation/montant_commission).
-- Sans DEFAULT, tout insert auto de commission échoue en 23502.
ALTER TABLE public.commissions_prestations ALTER COLUMN montant_prestation SET DEFAULT 0;
ALTER TABLE public.commissions_prestations ALTER COLUMN montant_commission SET DEFAULT 0;
UPDATE public.commissions_prestations SET montant_prestation = 0 WHERE montant_prestation IS NULL;
UPDATE public.commissions_prestations SET montant_commission = 0 WHERE montant_commission IS NULL;
NOTIFY pgrst, 'reload schema';
