-- Clients en lecture partagée : les Responsables (et tous les rôles authentifiés)
-- doivent pouvoir sélectionner un client déjà créé dans les modules
-- Affaires / Devis / Factures / Documents, même s'ils n'en sont pas propriétaires.
-- La gestion (création / modification / suppression) reste scopée propriétaire.
DROP POLICY IF EXISTS "clients_select_owner" ON public.clients;
CREATE POLICY "clients_select_shared" ON public.clients
    FOR SELECT TO authenticated
    USING (true);
