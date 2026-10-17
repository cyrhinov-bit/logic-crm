-- Migration: Create missing CRM modules tables (Tiers, Commerciaux, Prestations, Caisse, Commissions, Stocks, Maintenance)
-- Contexte: AppContext.tsx fait des upsert/select sur ces 7 tables mais elles n'existent pas dans Supabase
-- (seules techniciens_maintenance et invoices* existent). Sans elles : erreur 42P01 relation does not exist,
-- données visibles uniquement en local (localforage) et jamais persistées sur Supabase.
-- Convention reprise de 20260929190000_create_crm_techniciens.sql : id TEXT PK (uuid v4 généré côté app),
-- pas de FK (évite les 23503), RLS + policy "Allow all" comme le reste de l'ERP.

-- 1. Tiers (Clients / Fournisseurs / Partenaires) — src/types/crmModules.ts ClientFournisseur
CREATE TABLE IF NOT EXISTS public.clients_fournisseurs (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL DEFAULT 'CLIENT',
    nom TEXT NOT NULL,
    telephone TEXT,
    email TEXT,
    adresse TEXT,
    ville TEXT,
    cree_par TEXT,
    cree_par_nom TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

-- 2. Agents commerciaux — AgentCommercial
CREATE TABLE IF NOT EXISTS public.agents_commerciaux (
    id TEXT PRIMARY KEY,
    nom TEXT NOT NULL,
    telephone TEXT,
    email TEXT,
    taux_commission_defaut NUMERIC NOT NULL DEFAULT 0,
    total_ventes NUMERIC NOT NULL DEFAULT 0,
    contrats_clos_count NUMERIC NOT NULL DEFAULT 0,
    cree_par TEXT,
    cree_par_nom TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

-- 3. Prestations & Commandes — PrestationCommande (formules financières 11 colonnes calculées dans AppContext)
CREATE TABLE IF NOT EXISTS public.prestations_commandes (
    id TEXT PRIMARY KEY,
    reference TEXT NOT NULL,
    client_id TEXT,
    client_nom TEXT,
    commercial_id TEXT,
    commercial_nom TEXT,
    apporteur_id TEXT,
    apporteur_nom TEXT,
    resp_service_id TEXT,
    resp_service_nom TEXT,
    responsable_service_id TEXT,
    responsable_service_nom TEXT,
    designation TEXT NOT NULL DEFAULT '',
    quantite NUMERIC NOT NULL DEFAULT 1,
    cout_unitaire_achat NUMERIC NOT NULL DEFAULT 0,
    cout_final_achat NUMERIC NOT NULL DEFAULT 0,
    cout_total_revient NUMERIC NOT NULL DEFAULT 0,
    prix_vente_unitaire NUMERIC NOT NULL DEFAULT 0,
    prix_client_final NUMERIC NOT NULL DEFAULT 0,
    montant_total_vente NUMERIC NOT NULL DEFAULT 0,
    marge_interne NUMERIC NOT NULL DEFAULT 0,
    taux_commission_app NUMERIC NOT NULL DEFAULT 0,
    commission_apporteur_taux NUMERIC NOT NULL DEFAULT 0,
    commission_apporteur NUMERIC NOT NULL DEFAULT 0,
    commission_apporteur_montant NUMERIC NOT NULL DEFAULT 0,
    commission_resp_service NUMERIC NOT NULL DEFAULT 0,
    commission_responsable_montant NUMERIC NOT NULL DEFAULT 0,
    commission_agent NUMERIC NOT NULL DEFAULT 0,
    commission_commercial_montant NUMERIC NOT NULL DEFAULT 0,
    benefice_net NUMERIC NOT NULL DEFAULT 0,
    benefice_reel NUMERIC NOT NULL DEFAULT 0,
    statut TEXT NOT NULL DEFAULT 'BROUILLON',
    cree_par TEXT,
    cree_par_nom TEXT,
    date_creation TEXT,
    date_commande TEXT,
    date_validation TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

-- 4. Journal de caisse — MouvementCaisse
CREATE TABLE IF NOT EXISTS public.mouvements_caisse (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL DEFAULT 'ENTREE',
    categorie TEXT NOT NULL DEFAULT 'AUTRE',
    montant NUMERIC NOT NULL DEFAULT 0,
    date_mouvement TEXT,
    mode_reglement TEXT NOT NULL DEFAULT 'ESPECES',
    motif TEXT NOT NULL DEFAULT '',
    module_code TEXT,
    tier_id TEXT,
    tier_type TEXT,
    beneficiaire_emetteur TEXT,
    reference_piece TEXT,
    date TEXT,
    cree_par TEXT,
    cree_par_nom TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

-- 5. Commissions des prestations (générées auto par syncCommissionsForPrestation) — CommissionPrestation
CREATE TABLE IF NOT EXISTS public.commissions_prestations (
    id TEXT PRIMARY KEY,
    prestation_id TEXT NOT NULL,
    prestation_ref TEXT,
    type_beneficiaire TEXT NOT NULL DEFAULT 'APPORTEUR',
    type TEXT,
    beneficiaire_id TEXT,
    beneficiaire_nom TEXT NOT NULL DEFAULT '',
    montant NUMERIC NOT NULL DEFAULT 0,
    montant_prestation NUMERIC NOT NULL DEFAULT 0,
    montant_commission NUMERIC NOT NULL DEFAULT 0,
    statut TEXT NOT NULL DEFAULT 'EN_ATTENTE',
    date_reglement TEXT,
    mode_reglement TEXT,
    mouvement_caisse_id TEXT,
    cree_par TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

-- 6. Catalogue articles / Stocks métier — CatalogueArticle
CREATE TABLE IF NOT EXISTS public.catalogue_articles (
    id TEXT PRIMARY KEY,
    code_article TEXT NOT NULL,
    designation TEXT NOT NULL,
    categorie TEXT,
    type_article TEXT,
    quantite_stock NUMERIC NOT NULL DEFAULT 0,
    seuil_alerte NUMERIC NOT NULL DEFAULT 5,
    cout_unitaire_achat NUMERIC NOT NULL DEFAULT 0,
    prix_unitaire_vente NUMERIC NOT NULL DEFAULT 0,
    unite TEXT,
    fournisseur_id TEXT,
    cree_par TEXT,
    cree_par_nom TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

-- 7. Interventions de maintenance — InterventionMaintenance
CREATE TABLE IF NOT EXISTS public.interventions_maintenance (
    id TEXT PRIMARY KEY,
    reference TEXT NOT NULL,
    client_id TEXT,
    client_nom TEXT,
    site_agence TEXT NOT NULL DEFAULT '',
    utilisateur_concerne TEXT,
    equipement TEXT NOT NULL DEFAULT '',
    priorite TEXT NOT NULL DEFAULT 'MOYENNE',
    observation TEXT,
    travaux TEXT,
    quantite NUMERIC NOT NULL DEFAULT 1,
    prix_unitaire NUMERIC NOT NULL DEFAULT 0,
    prix_total NUMERIC NOT NULL DEFAULT 0,
    prix NUMERIC NOT NULL DEFAULT 0,
    technicien_assigne TEXT NOT NULL DEFAULT '',
    statut TEXT NOT NULL DEFAULT 'NOUVEAU',
    date_intervention TEXT,
    cree_par TEXT,
    cree_par_nom TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

-- RLS + policies (même politique ouverte que techniciens_maintenance / invoices)
ALTER TABLE public.clients_fournisseurs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agents_commerciaux ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prestations_commandes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mouvements_caisse ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commissions_prestations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalogue_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interventions_maintenance ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow all access to clients_fournisseurs') THEN
    CREATE POLICY "Allow all access to clients_fournisseurs" ON public.clients_fournisseurs FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow all access to agents_commerciaux') THEN
    CREATE POLICY "Allow all access to agents_commerciaux" ON public.agents_commerciaux FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow all access to prestations_commandes') THEN
    CREATE POLICY "Allow all access to prestations_commandes" ON public.prestations_commandes FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow all access to mouvements_caisse') THEN
    CREATE POLICY "Allow all access to mouvements_caisse" ON public.mouvements_caisse FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow all access to commissions_prestations') THEN
    CREATE POLICY "Allow all access to commissions_prestations" ON public.commissions_prestations FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow all access to catalogue_articles') THEN
    CREATE POLICY "Allow all access to catalogue_articles" ON public.catalogue_articles FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow all access to interventions_maintenance') THEN
    CREATE POLICY "Allow all access to interventions_maintenance" ON public.interventions_maintenance FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Index de performance
CREATE INDEX IF NOT EXISTS idx_crm_tiers_type ON public.clients_fournisseurs(type);
CREATE INDEX IF NOT EXISTS idx_crm_tiers_nom ON public.clients_fournisseurs(nom);
CREATE INDEX IF NOT EXISTS idx_prestations_reference ON public.prestations_commandes(reference);
CREATE INDEX IF NOT EXISTS idx_prestations_client ON public.prestations_commandes(client_id);
CREATE INDEX IF NOT EXISTS idx_prestations_statut ON public.prestations_commandes(statut);
CREATE INDEX IF NOT EXISTS idx_caisse_type ON public.mouvements_caisse(type);
CREATE INDEX IF NOT EXISTS idx_caisse_date ON public.mouvements_caisse(date_mouvement);
CREATE INDEX IF NOT EXISTS idx_commissions_prestation ON public.commissions_prestations(prestation_id);
CREATE INDEX IF NOT EXISTS idx_articles_code ON public.catalogue_articles(code_article);
CREATE INDEX IF NOT EXISTS idx_interventions_ref ON public.interventions_maintenance(reference);
CREATE INDEX IF NOT EXISTS idx_interventions_statut ON public.interventions_maintenance(statut);
