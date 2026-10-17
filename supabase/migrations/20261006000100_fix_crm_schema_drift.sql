-- Migration: Fix CRM schema drift (colonnes manquantes vs payloads AppContext.tsx)
-- Vérifié en live le 2026-10-06 via upsert anon-key : PGRST204 sur 5 tables
-- (agents_commerciaux, prestations_commandes, commissions_prestations, catalogue_articles, interventions_maintenance).
-- clients_fournisseurs, mouvements_caisse, techniciens_maintenance : OK, inchangés.
-- Stratégie additive uniquement (ADD COLUMN IF NOT EXISTS), aucun DROP/RENAME pour ne pas casser l'existant.
-- Les dates métier restent en TEXT (l'app envoie 'YYYY-MM-DD' ou ISO, TIMESTAMPTZ casserait certains casts).

-- 1. agents_commerciaux : updateCrmCommercial envoie total_ventes + contrats_clos_count, add envoie cree_par_nom
ALTER TABLE public.agents_commerciaux ADD COLUMN IF NOT EXISTS total_ventes NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE public.agents_commerciaux ADD COLUMN IF NOT EXISTS contrats_clos_count NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE public.agents_commerciaux ADD COLUMN IF NOT EXISTS cree_par_nom TEXT;

-- 2. prestations_commandes : addCrmPrestation/updateCrmPrestation (AppContext 4291-4400) + type PrestationCommande
ALTER TABLE public.prestations_commandes ADD COLUMN IF NOT EXISTS resp_service_id TEXT;
ALTER TABLE public.prestations_commandes ADD COLUMN IF NOT EXISTS resp_service_nom TEXT;
ALTER TABLE public.prestations_commandes ADD COLUMN IF NOT EXISTS cout_final_achat NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE public.prestations_commandes ADD COLUMN IF NOT EXISTS prix_vente_unitaire NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE public.prestations_commandes ADD COLUMN IF NOT EXISTS prix_client_final NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE public.prestations_commandes ADD COLUMN IF NOT EXISTS taux_commission_app NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE public.prestations_commandes ADD COLUMN IF NOT EXISTS commission_apporteur NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE public.prestations_commandes ADD COLUMN IF NOT EXISTS commission_resp_service NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE public.prestations_commandes ADD COLUMN IF NOT EXISTS commission_agent NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE public.prestations_commandes ADD COLUMN IF NOT EXISTS benefice_net NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE public.prestations_commandes ADD COLUMN IF NOT EXISTS cree_par_nom TEXT;
ALTER TABLE public.prestations_commandes ADD COLUMN IF NOT EXISTS date_creation TEXT;
ALTER TABLE public.prestations_commandes ADD COLUMN IF NOT EXISTS date_validation TEXT;
ALTER TABLE public.prestations_commandes ADD COLUMN IF NOT EXISTS notes TEXT;

-- 3. commissions_prestations : syncCommissionsForPrestation (AppContext 4213-4288) envoie type_beneficiaire + montant + cree_par
ALTER TABLE public.commissions_prestations ADD COLUMN IF NOT EXISTS type_beneficiaire TEXT NOT NULL DEFAULT 'APPORTEUR';
ALTER TABLE public.commissions_prestations ADD COLUMN IF NOT EXISTS montant NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE public.commissions_prestations ADD COLUMN IF NOT EXISTS cree_par TEXT;

-- 4. catalogue_articles : addCrmArticle (AppContext 4543-4567) envoie categorie + cree_par_nom
ALTER TABLE public.catalogue_articles ADD COLUMN IF NOT EXISTS categorie TEXT;
ALTER TABLE public.catalogue_articles ADD COLUMN IF NOT EXISTS cree_par_nom TEXT;

-- 5. interventions_maintenance : addCrmIntervention (AppContext 4597-4631) envoie reference + prix_total + cree_par_nom
ALTER TABLE public.interventions_maintenance ADD COLUMN IF NOT EXISTS reference TEXT;
ALTER TABLE public.interventions_maintenance ADD COLUMN IF NOT EXISTS prix_total NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE public.interventions_maintenance ADD COLUMN IF NOT EXISTS cree_par_nom TEXT;

-- Index complémentaires (IF NOT EXISTS, sur colonnes désormais garanties)
CREATE INDEX IF NOT EXISTS idx_prestations_resp_service ON public.prestations_commandes(resp_service_id);
CREATE INDEX IF NOT EXISTS idx_commissions_type_benef ON public.commissions_prestations(type_beneficiaire);
CREATE INDEX IF NOT EXISTS idx_articles_categorie ON public.catalogue_articles(categorie);
CREATE INDEX IF NOT EXISTS idx_interventions_ref ON public.interventions_maintenance(reference);
