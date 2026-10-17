-- Migration: durcissement écriture CRM — suppression du "grandfather" UPDATE/DELETE.
-- Contexte audit : les policies crm_update_*/crm_delete_* (20261009000000) autorisent
-- `cree_par IS NULL OR ''` pour TOUS les authentifiés en écriture. Toute ligne historique
-- sans auteur est donc modifiable/supprimable par n'importe quel utilisateur connecté.
-- Correctif : UPDATE/DELETE = auteur (cree_par = auth.uid()) ou Direction uniquement.
-- Les lignes sans auteur deviennent modifiables par la Direction seule.
-- SELECT/INSERT inchangés (SELECT déjà rescoppé par 20261012000008 pour 5 tables).

DO $$
DECLARE
  t TEXT;
  tables_uuid TEXT[] := ARRAY[
    'clients_fournisseurs', 'agents_commerciaux', 'prestations_commandes',
    'mouvements_caisse', 'catalogue_articles', 'interventions_maintenance'
  ];
  own TEXT := '(cree_par::text = (auth.uid())::text '
    'OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN (''Directeur'', ''Directeur adjoint'', ''SuperAdmin'')))';
BEGIN
  FOREACH t IN ARRAY tables_uuid LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'crm_update_' || t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'crm_delete_' || t, t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)', 'crm_update_' || t, t, own, own);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (%s)', 'crm_delete_' || t, t, own);
  END LOOP;
END $$;

DO $$
DECLARE
  t TEXT;
  tables_text TEXT[] := ARRAY['commissions_prestations', 'techniciens_maintenance'];
  own TEXT := '(cree_par = (auth.uid())::text '
    'OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN (''Directeur'', ''Directeur adjoint'', ''SuperAdmin'')))';
BEGIN
  FOREACH t IN ARRAY tables_text LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'crm_update_' || t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'crm_delete_' || t, t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)', 'crm_update_' || t, t, own, own);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (%s)', 'crm_delete_' || t, t, own);
  END LOOP;
END $$;
