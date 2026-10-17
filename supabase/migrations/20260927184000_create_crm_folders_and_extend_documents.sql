-- Migration: Création table crm_folders et extension crm_documents
-- Corrige les erreurs de synchronisation sur les dossiers et documents CRM

-- 1. Table crm_folders
CREATE TABLE IF NOT EXISTS crm_folders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    owner_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    parent_id UUID REFERENCES crm_folders(id) ON DELETE CASCADE,
    color TEXT DEFAULT '#0D9488',
    is_shared BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- RLS crm_folders
ALTER TABLE crm_folders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Activer tout pour les utilisateurs authentifiés sur crm_folders" ON crm_folders;
CREATE POLICY "Activer tout pour les utilisateurs authentifiés sur crm_folders" 
ON crm_folders FOR ALL TO authenticated USING (true);

-- Index crm_folders
CREATE INDEX IF NOT EXISTS idx_crm_folders_owner ON crm_folders(owner_id);
CREATE INDEX IF NOT EXISTS idx_crm_folders_parent ON crm_folders(parent_id);

-- 2. Extension de crm_documents
ALTER TABLE crm_documents 
ADD COLUMN IF NOT EXISTS folder_id UUID REFERENCES crm_folders(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS affaire_id UUID REFERENCES affaires(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'Autre',
ADD COLUMN IF NOT EXISTS is_shared BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW());

-- Index crm_documents
CREATE INDEX IF NOT EXISTS idx_crm_documents_folder ON crm_documents(folder_id);
CREATE INDEX IF NOT EXISTS idx_crm_documents_affaire ON crm_documents(affaire_id);
CREATE INDEX IF NOT EXISTS idx_crm_documents_client ON crm_documents(client_id);
