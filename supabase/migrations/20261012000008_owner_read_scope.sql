-- Scopage propriétaire : chaque utilisateur non-directeur ne voit que ses propres données.
-- Direction (SuperAdmin, Directeur, Directeur adjoint) : accès total (inchangé).
-- Lignes historiques sans propriétaire (NULL) : lecture conservée (grandfather),
-- écriture réservée à la direction.
-- Date: 2026-10-06

-- 0. Helpers
CREATE OR REPLACE FUNCTION public.is_director()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND active = true
      AND role IN ('SuperAdmin', 'Directeur', 'Directeur adjoint')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_owner_or_director(p_owner UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT p_owner IS NULL OR p_owner = auth.uid() OR public.is_director();
$$;

-- 1. Affaires & ventes : Responsable = propriétaire uniquement (comme Commercial).
CREATE OR REPLACE FUNCTION public.can_access_affaire(p_affaire_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_aff_commercial_id UUID;
BEGIN
  IF public.is_director() THEN
    RETURN true;
  END IF;

  SELECT commercial_id INTO v_aff_commercial_id
  FROM public.affaires
  WHERE id = p_affaire_id;

  IF v_aff_commercial_id IS NULL THEN
    RETURN true; -- ligne historique sans propriétaire : lecture conservée
  END IF;

  RETURN v_aff_commercial_id = auth.uid();
END;
$$;

CREATE OR REPLACE FUNCTION public.can_access_vente(p_vente_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_vte_commercial_id UUID;
BEGIN
  IF public.is_director() THEN
    RETURN true;
  END IF;

  SELECT commercial_id INTO v_vte_commercial_id
  FROM public.ventes
  WHERE id = p_vente_id;

  IF v_vte_commercial_id IS NULL THEN
    RETURN true;
  END IF;

  RETURN v_vte_commercial_id = auth.uid();
END;
$$;

-- INSERT/UPDATE affaires : propriétaire uniquement hors direction
DROP POLICY IF EXISTS "Insertion affaires" ON public.affaires;
CREATE POLICY "Insertion affaires" ON public.affaires
    FOR INSERT TO authenticated
    WITH CHECK (
        public.is_director()
        OR commercial_id IS NULL
        OR commercial_id = auth.uid()
    );

DROP POLICY IF EXISTS "Modification affaires autorisees" ON public.affaires;
CREATE POLICY "Modification affaires autorisees" ON public.affaires
    FOR UPDATE TO authenticated
    USING (public.can_access_affaire(id))
    WITH CHECK (
        public.is_director()
        OR commercial_id IS NULL
        OR commercial_id = auth.uid()
    );

-- 2. Devis (quotes + lignes via parent)
DROP POLICY IF EXISTS "Activer tout pour les utilisateurs authentifiés" ON public.quotes;
CREATE POLICY "quotes_select_owner" ON public.quotes
    FOR SELECT TO authenticated
    USING (public.is_owner_or_director(commercial_id));
CREATE POLICY "quotes_insert_owner" ON public.quotes
    FOR INSERT TO authenticated
    WITH CHECK (public.is_director() OR commercial_id IS NULL OR commercial_id = auth.uid());
CREATE POLICY "quotes_update_owner" ON public.quotes
    FOR UPDATE TO authenticated
    USING (commercial_id = auth.uid() OR public.is_director())
    WITH CHECK (public.is_director() OR commercial_id IS NULL OR commercial_id = auth.uid());
CREATE POLICY "quotes_delete_owner" ON public.quotes
    FOR DELETE TO authenticated
    USING (commercial_id = auth.uid() OR public.is_director());

DROP POLICY IF EXISTS "Activer tout pour les utilisateurs authentifiés" ON public.quote_lines;
CREATE POLICY "quote_lines_select_owner" ON public.quote_lines
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.quotes q
        WHERE q.id = quote_lines.quote_id AND public.is_owner_or_director(q.commercial_id)
    ));
CREATE POLICY "quote_lines_insert_owner" ON public.quote_lines
    FOR INSERT TO authenticated
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.quotes q
        WHERE q.id = quote_lines.quote_id AND (public.is_director() OR q.commercial_id IS NULL OR q.commercial_id = auth.uid())
    ));
CREATE POLICY "quote_lines_update_owner" ON public.quote_lines
    FOR UPDATE TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.quotes q
        WHERE q.id = quote_lines.quote_id AND (q.commercial_id = auth.uid() OR public.is_director())
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.quotes q
        WHERE q.id = quote_lines.quote_id AND (public.is_director() OR q.commercial_id IS NULL OR q.commercial_id = auth.uid())
    ));
CREATE POLICY "quote_lines_delete_owner" ON public.quote_lines
    FOR DELETE TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.quotes q
        WHERE q.id = quote_lines.quote_id AND (q.commercial_id = auth.uid() OR public.is_director())
    ));

-- 3. Clients & prospects
DROP POLICY IF EXISTS "Activer tout pour les utilisateurs authentifiés" ON public.clients;
CREATE POLICY "clients_select_owner" ON public.clients
    FOR SELECT TO authenticated
    USING (public.is_owner_or_director(commercial_id));
CREATE POLICY "clients_insert_owner" ON public.clients
    FOR INSERT TO authenticated
    WITH CHECK (public.is_director() OR commercial_id IS NULL OR commercial_id = auth.uid());
CREATE POLICY "clients_update_owner" ON public.clients
    FOR UPDATE TO authenticated
    USING (commercial_id = auth.uid() OR public.is_director())
    WITH CHECK (public.is_director() OR commercial_id IS NULL OR commercial_id = auth.uid());
CREATE POLICY "clients_delete_owner" ON public.clients
    FOR DELETE TO authenticated
    USING (commercial_id = auth.uid() OR public.is_director());

DROP POLICY IF EXISTS "Activer tout pour les utilisateurs authentifiés" ON public.prospects;
CREATE POLICY "prospects_select_owner" ON public.prospects
    FOR SELECT TO authenticated
    USING (public.is_owner_or_director(commercial_id));
CREATE POLICY "prospects_insert_owner" ON public.prospects
    FOR INSERT TO authenticated
    WITH CHECK (public.is_director() OR commercial_id IS NULL OR commercial_id = auth.uid());
CREATE POLICY "prospects_update_owner" ON public.prospects
    FOR UPDATE TO authenticated
    USING (commercial_id = auth.uid() OR public.is_director())
    WITH CHECK (public.is_director() OR commercial_id IS NULL OR commercial_id = auth.uid());
CREATE POLICY "prospects_delete_owner" ON public.prospects
    FOR DELETE TO authenticated
    USING (commercial_id = auth.uid() OR public.is_director());

-- 4. Factures (+ lignes et règlements via parent ; propriétaire = commercial_id ou créateur)
DROP POLICY IF EXISTS "Allow all access to invoices" ON public.invoices;
DROP POLICY IF EXISTS "invoices_authenticated_all" ON public.invoices;
CREATE POLICY "invoices_select_owner" ON public.invoices
    FOR SELECT TO authenticated
    USING (public.is_director() OR commercial_id IS NULL OR commercial_id = auth.uid() OR created_by = auth.uid());
CREATE POLICY "invoices_insert_owner" ON public.invoices
    FOR INSERT TO authenticated
    WITH CHECK (public.is_director() OR commercial_id IS NULL OR commercial_id = auth.uid() OR created_by = auth.uid());
CREATE POLICY "invoices_update_owner" ON public.invoices
    FOR UPDATE TO authenticated
    USING (public.is_director() OR commercial_id = auth.uid() OR created_by = auth.uid())
    WITH CHECK (public.is_director() OR commercial_id IS NULL OR commercial_id = auth.uid() OR created_by = auth.uid());
CREATE POLICY "invoices_delete_owner" ON public.invoices
    FOR DELETE TO authenticated
    USING (public.is_director() OR commercial_id = auth.uid() OR created_by = auth.uid());

DROP POLICY IF EXISTS "Allow all access to invoice_items" ON public.invoice_items;
DROP POLICY IF EXISTS "invoice_items_authenticated_all" ON public.invoice_items;
CREATE POLICY "invoice_items_select_owner" ON public.invoice_items
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.invoices i
        WHERE i.id = invoice_items.invoice_id
          AND (public.is_director() OR i.commercial_id IS NULL OR i.commercial_id = auth.uid() OR i.created_by = auth.uid())
    ));
CREATE POLICY "invoice_items_write_owner" ON public.invoice_items
    FOR ALL TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.invoices i
        WHERE i.id = invoice_items.invoice_id
          AND (public.is_director() OR i.commercial_id = auth.uid() OR i.created_by = auth.uid())
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.invoices i
        WHERE i.id = invoice_items.invoice_id
          AND (public.is_director() OR i.commercial_id IS NULL OR i.commercial_id = auth.uid() OR i.created_by = auth.uid())
    ));

DROP POLICY IF EXISTS "Allow all access to invoice_payments" ON public.invoice_payments;
DROP POLICY IF EXISTS "invoice_payments_authenticated_all" ON public.invoice_payments;
CREATE POLICY "invoice_payments_select_owner" ON public.invoice_payments
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.invoices i
        WHERE i.id = invoice_payments.invoice_id
          AND (public.is_director() OR i.commercial_id IS NULL OR i.commercial_id = auth.uid() OR i.created_by = auth.uid())
    ));
CREATE POLICY "invoice_payments_write_owner" ON public.invoice_payments
    FOR ALL TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.invoices i
        WHERE i.id = invoice_payments.invoice_id
          AND (public.is_director() OR i.commercial_id = auth.uid() OR i.created_by = auth.uid())
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.invoices i
        WHERE i.id = invoice_payments.invoice_id
          AND (public.is_director() OR i.commercial_id IS NULL OR i.commercial_id = auth.uid() OR i.created_by = auth.uid())
    ));

-- 5. CRM métier : lecture propriétaire (les UPDATE/DELETE sont déjà scopés).
-- Référentiels partagés (catalogue_articles, techniciens_maintenance, agents_commerciaux)
-- gardés en lecture commune (listes de choix inter-utilisateurs).
DO $$
DECLARE
  t TEXT;
  tables_owner TEXT[] := ARRAY[
    'clients_fournisseurs', 'prestations_commandes',
    'mouvements_caisse', 'commissions_prestations', 'interventions_maintenance'
  ];
  own TEXT := '((cree_par IS NULL) OR (cree_par::text = '''') OR (cree_par::text = (auth.uid())::text) '
    'OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND active = true AND role IN (''SuperAdmin'', ''Directeur'', ''Directeur adjoint'')))';
BEGIN
  FOREACH t IN ARRAY tables_owner LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'crm_select_' || t, t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (%s)', 'crm_select_' || t, t, own);
  END LOOP;
END $$;

-- NOTE : profils/utilisateurs, services, prestations (catalogue), paramètres :
-- lecture commune conservée (annuaire et référentiels nécessaires à la saisie).
-- Le contrôle fin est appliqué côté applicatif (src/lib/scope.ts).
