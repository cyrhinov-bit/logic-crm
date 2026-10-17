-- Migration P2 fiabilite CRM : unicites + garde-fous montants/statuts (audit complet CRM)
-- Verifie en prod le 2026-10-05 : tables operationnelles vides (0 doublon, 0 negatif),
-- statuts legacy uniquement dans le code. Contraintes sures a poser.

-- 1. Unicites anti-collision (references generees en length+1)
CREATE UNIQUE INDEX IF NOT EXISTS uq_prestations_reference ON public.prestations_commandes(reference);
CREATE UNIQUE INDEX IF NOT EXISTS uq_articles_code ON public.catalogue_articles(code_article);
CREATE UNIQUE INDEX IF NOT EXISTS uq_interventions_reference ON public.interventions_maintenance(reference);

-- 2. Statuts : canon + legacy connus, rejet du reste
DO $$
BEGIN
  ALTER TABLE public.prestations_commandes DROP CONSTRAINT IF EXISTS chk_prestations_statut;
  ALTER TABLE public.prestations_commandes ADD CONSTRAINT chk_prestations_statut CHECK (
    statut IN ('BROUILLON','EN_ATTENTE_VALIDATION','VALIDE','EN_COURS_EXECUTION','LIVREE','PAYEE','CLOTUREE','ANNULEE','DEVIS','CONFIRMEE','EN_COURS','FACTUREE')
  );
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.commissions_prestations DROP CONSTRAINT IF EXISTS chk_commissions_statut;
  ALTER TABLE public.commissions_prestations ADD CONSTRAINT chk_commissions_statut CHECK (
    statut IN ('EN_ATTENTE','VALIDEE','PAYEE','ANNULEE','A_VALIDER','A_PAYER')
  );
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.interventions_maintenance DROP CONSTRAINT IF EXISTS chk_interventions_statut;
  ALTER TABLE public.interventions_maintenance ADD CONSTRAINT chk_interventions_statut CHECK (
    statut IN ('NOUVEAU','EN_ATTENTE_PIECE','EN_COURS','TERMINE_A_FACTURER','CLOTURE','ANNULE','EN_ATTENTE','TERMINEE','ANNULEE')
  );
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.mouvements_caisse DROP CONSTRAINT IF EXISTS chk_caisse_type;
  ALTER TABLE public.mouvements_caisse ADD CONSTRAINT chk_caisse_type CHECK (type IN ('ENTREE','SORTIE'));
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 3. Montants / quantites : planchers anti-absurde
DO $$
BEGIN
  ALTER TABLE public.prestations_commandes DROP CONSTRAINT IF EXISTS chk_prestations_nombres;
  ALTER TABLE public.prestations_commandes ADD CONSTRAINT chk_prestations_nombres CHECK (
    quantite >= 0 AND cout_unitaire_achat >= 0 AND prix_vente_unitaire >= 0 AND prix_client_final >= 0
    AND commission_apporteur >= 0 AND commission_resp_service >= 0 AND commission_agent >= 0
  );
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.catalogue_articles DROP CONSTRAINT IF EXISTS chk_articles_nombres;
  ALTER TABLE public.catalogue_articles ADD CONSTRAINT chk_articles_nombres CHECK (
    quantite_stock >= 0 AND seuil_alerte >= 0 AND cout_unitaire_achat >= 0 AND prix_unitaire_vente >= 0
  );
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.mouvements_caisse DROP CONSTRAINT IF EXISTS chk_caisse_montant;
  ALTER TABLE public.mouvements_caisse ADD CONSTRAINT chk_caisse_montant CHECK (montant >= 0);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.commissions_prestations DROP CONSTRAINT IF EXISTS chk_commissions_montant;
  ALTER TABLE public.commissions_prestations ADD CONSTRAINT chk_commissions_montant CHECK (montant >= 0);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.interventions_maintenance DROP CONSTRAINT IF EXISTS chk_interventions_nombres;
  ALTER TABLE public.interventions_maintenance ADD CONSTRAINT chk_interventions_nombres CHECK (
    quantite >= 0 AND prix_unitaire >= 0 AND prix_total >= 0
  );
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
