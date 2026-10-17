-- Ferme les acces anonymes (policies SANS clause TO = PUBLIC inclut anon).
-- Verifie : aucune page publique (src/pages/public) ne lit ces tables, tout l'app est authentifiee.
-- 1. Facturation : restreint a authenticated (montants/marges/commissions).
DROP POLICY IF EXISTS "Allow all access to invoices" ON public.invoices;
DROP POLICY IF EXISTS "Allow all access to invoice_items" ON public.invoice_items;
DROP POLICY IF EXISTS "Allow all access to invoice_payments" ON public.invoice_payments;
CREATE POLICY "invoices_authenticated_all" ON public.invoices FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "invoice_items_authenticated_all" ON public.invoice_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "invoice_payments_authenticated_all" ON public.invoice_payments FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 2. Portail client historique : lecture publique devis/lignes/clients/parametres -> authenticated uniquement.
DROP POLICY IF EXISTS "Lecture publique des devis" ON public.quotes;
DROP POLICY IF EXISTS "Lecture publique des lignes" ON public.quote_lines;
DROP POLICY IF EXISTS "Lecture publique des clients" ON public.clients;
DROP POLICY IF EXISTS "Lecture publique des paramètres" ON public.settings;
-- (Les policies "Activer tout pour les utilisateurs authentifiés" TO authenticated existent deja sur ces 4 tables.)

-- 3. Techniciens : s'assure qu'aucune policy anon ne subsiste (20261009000000 a deja rescoped en authenticated).
DROP POLICY IF EXISTS "Allow all access to techniciens_maintenance" ON public.techniciens_maintenance;
DROP POLICY IF EXISTS "Allow all for anon and auth" ON public.techniciens_maintenance;
