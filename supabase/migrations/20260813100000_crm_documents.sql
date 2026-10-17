-- Migration: Ajout du module Documents CRM
-- Crée la table crm_documents et configure le bucket de stockage

-- 1. Table des métadonnées des documents
CREATE TABLE IF NOT EXISTS crm_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    size_bytes BIGINT NOT NULL,
    file_path TEXT NOT NULL,
    uploader_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- 2. Sécurité RLS (Table)
ALTER TABLE crm_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Activer tout pour les utilisateurs authentifiés" 
ON crm_documents FOR ALL TO authenticated USING (true);

-- 3. Configuration du Bucket Storage (crm_documents)
-- Note: L'API Storage nécessite des insertions dans storage.buckets et storage.objects
INSERT INTO storage.buckets (id, name, public) 
VALUES ('crm_documents', 'crm_documents', false)
ON CONFLICT (id) DO NOTHING;

-- 4. Sécurité RLS (Storage)
-- Autoriser les utilisateurs authentifiés à tout faire sur le bucket crm_documents
CREATE POLICY "Acces complet aux documents pour utilisateurs authentifies"
ON storage.objects FOR ALL
TO authenticated
USING (bucket_id = 'crm_documents')
WITH CHECK (bucket_id = 'crm_documents');

-- 5. Index pour les performances
CREATE INDEX IF NOT EXISTS idx_crm_documents_uploader ON crm_documents(uploader_id);
