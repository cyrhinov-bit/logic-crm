-- Migration P0 securite CRM : scoper les policies ouvertes + fermer la lecture publique des profils
-- Contexte audit : tables CRM en "Allow all" (anon inclus), profils lisibles en public (fuite PIN).
-- Principe : SELECT partage aux authentifies (donnee metier partagee), INSERT aux authentifies,
-- UPDATE/DELETE : auteur (cree_par) ou Direction. Legacy (cree_par NULL, et '' pour les TEXT) grandfatherise.
-- NB schema drift prod : cree_par est UUID sur 6 tables, TEXT sur commissions/techniciens.

-- 1. Fermer la lecture publique des profils (PIN)
DROP POLICY IF EXISTS "Lecture publique des profils" ON public.profiles;

-- 2. Scoper les 8 tables CRM (UUID cree_par)
DO $$
DECLARE
  t TEXT;
  tables_uuid TEXT[] := ARRAY[
    'clients_fournisseurs', 'agents_commerciaux', 'prestations_commandes',
    'mouvements_caisse', 'catalogue_articles', 'interventions_maintenance'
  ];
  own TEXT := '(cree_par IS NULL OR cree_par::text = '''' OR cree_par::text = (auth.uid())::text '
    'OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN (''Directeur'', ''Directeur adjoint'', ''SuperAdmin'')))';
BEGIN
  FOREACH t IN ARRAY tables_uuid LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Allow all access to ' || t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Allow all for anon and auth', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'crm_select_' || t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'crm_insert_' || t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'crm_update_' || t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'crm_delete_' || t, t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (true)', 'crm_select_' || t, t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (true)', 'crm_insert_' || t, t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)', 'crm_update_' || t, t, own, own);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (%s)', 'crm_delete_' || t, t, own);
  END LOOP;
END $$;

-- 3. Scoper les 2 tables a cree_par TEXT (commissions, techniciens)
DO $$
DECLARE
  t TEXT;
  tables_text TEXT[] := ARRAY['commissions_prestations', 'techniciens_maintenance'];
  own TEXT := '(cree_par IS NULL OR cree_par = '''' OR cree_par = (auth.uid())::text '
    'OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN (''Directeur'', ''Directeur adjoint'', ''SuperAdmin'')))';
BEGIN
  FOREACH t IN ARRAY tables_text LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Allow all access to ' || t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Allow all for anon and auth', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'crm_select_' || t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'crm_insert_' || t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'crm_update_' || t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'crm_delete_' || t, t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (true)', 'crm_select_' || t, t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (true)', 'crm_insert_' || t, t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)', 'crm_update_' || t, t, own, own);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (%s)', 'crm_delete_' || t, t, own);
  END LOOP;
END $$;
