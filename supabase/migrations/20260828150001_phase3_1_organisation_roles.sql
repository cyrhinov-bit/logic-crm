-- ============================================================================
-- FICHIER : 20260828150001_phase3_1_organisation_roles.sql
-- OBJECTIF : Rattachement des responsables, services clients et rôle Directeur adjoint
-- ============================================================================

BEGIN;

-- 1. Service : ajout du Responsable de Service
ALTER TABLE public.services
ADD COLUMN IF NOT EXISTS manager_id UUID
REFERENCES public.profiles(id)
ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_services_manager
ON public.services(manager_id);


-- 2. Client : rattachement au Service d'affectation
ALTER TABLE public.clients
ADD COLUMN IF NOT EXISTS service_id UUID
REFERENCES public.services(id)
ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_clients_service
ON public.clients(service_id);


-- 3. Rôle : intégration du 'Directeur adjoint' sans altérer les comptes existants
ALTER TABLE public.profiles
DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
ADD CONSTRAINT profiles_role_check
CHECK (
    role IN (
        'Directeur',
        'Directeur adjoint',
        'Responsable',
        'Commercial',
        'Caissier',
        'Gerant',
        'SuperAdmin'
    )
);

COMMIT;

