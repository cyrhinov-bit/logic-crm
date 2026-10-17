-- Migration: Alignement schéma CRM - Sync serveur
-- Aligne les tables existantes et crée les tables manquantes référencées par sync.ts / refreshData.

-- =============================================
-- 1. Colonnes manquantes sur les tables existantes
-- =============================================

-- clients : statut (Actif/Inactif) utilisée par Clients.tsx et INSET_CLIENT/UPDATE_CLIENT
ALTER TABLE IF EXISTS clients ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Actif';

-- quotes : service_id, remise, commentaire client + statut 'Révision'
ALTER TABLE IF EXISTS quotes ADD COLUMN IF NOT EXISTS service_id UUID REFERENCES services(id) ON DELETE SET NULL;
ALTER TABLE IF EXISTS quotes ADD COLUMN IF NOT EXISTS discount_percent NUMERIC DEFAULT 0;
ALTER TABLE IF EXISTS quotes ADD COLUMN IF NOT EXISTS discount_amount NUMERIC DEFAULT 0;
ALTER TABLE IF EXISTS quotes ADD COLUMN IF NOT EXISTS client_comment TEXT;

ALTER TABLE quotes DROP CONSTRAINT IF EXISTS quotes_status_check;
ALTER TABLE quotes ADD CONSTRAINT quotes_status_check CHECK (status IN ('Brouillon', 'Envoyé', 'Accepté', 'Refusé', 'Révision'));

-- quote_lines : remise par ligne
ALTER TABLE IF EXISTS quote_lines ADD COLUMN IF NOT EXISTS discount_percent NUMERIC DEFAULT 0;

-- prestations : unité et prix de revient
ALTER TABLE IF EXISTS prestations ADD COLUMN IF NOT EXISTS unit TEXT;
ALTER TABLE IF EXISTS prestations ADD COLUMN IF NOT EXISTS cost_price NUMERIC DEFAULT 0;

-- services : nombre de membres
ALTER TABLE IF EXISTS services ADD COLUMN IF NOT EXISTS members INT;

-- settings : champs complémentaires
ALTER TABLE IF EXISTS settings ADD COLUMN IF NOT EXISTS header_logo_base64 TEXT;
ALTER TABLE IF EXISTS settings ADD COLUMN IF NOT EXISTS default_vat NUMERIC;
ALTER TABLE IF EXISTS settings ADD COLUMN IF NOT EXISTS default_validity INT;
ALTER TABLE IF EXISTS settings ADD COLUMN IF NOT EXISTS site_url TEXT;

-- profiles : rôle 'Commercial' utilisé par l'application
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check CHECK (role IN ('Directeur', 'Responsable', 'Commercial', 'Gerant', 'Caissier'));

-- =============================================
-- 2. Tables CRM manquantes
-- =============================================

CREATE TABLE IF NOT EXISTS invoices (
    id UUID PRIMARY KEY,
    invoice_number TEXT UNIQUE NOT NULL,
    quote_id UUID REFERENCES quotes(id) ON DELETE SET NULL,
    client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
    service_id UUID REFERENCES services(id) ON DELETE SET NULL,
    subtotal NUMERIC NOT NULL,
    vat NUMERIC NOT NULL,
    total NUMERIC NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('Brouillon', 'Envoyé', 'Payé', 'Annulé')),
    date TIMESTAMPTZ NOT NULL DEFAULT TIMEZONE('utc'::text, NOW()),
    due_date TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

CREATE TABLE IF NOT EXISTS invoice_lines (
    id UUID PRIMARY KEY,
    invoice_id UUID REFERENCES invoices(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    unit_price NUMERIC NOT NULL,
    cost_price NUMERIC DEFAULT 0,
    total NUMERIC NOT NULL
);

CREATE TABLE IF NOT EXISTS commissions (
    id UUID PRIMARY KEY,
    invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
    client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
    commercial_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    service_id UUID REFERENCES services(id) ON DELETE SET NULL,
    total_ht NUMERIC DEFAULT 0,
    cost_total NUMERIC DEFAULT 0,
    margin_amount NUMERIC DEFAULT 0,
    margin_percent NUMERIC DEFAULT 0,
    commission_percent NUMERIC DEFAULT 0,
    commission_amount NUMERIC DEFAULT 0,
    status TEXT NOT NULL CHECK (status IN ('En attente', 'Validée', 'Payée')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

CREATE TABLE IF NOT EXISTS prospects (
    id UUID PRIMARY KEY,
    prospect_number TEXT UNIQUE NOT NULL,
    commercial_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    service_id UUID REFERENCES services(id) ON DELETE SET NULL,
    category_id UUID,
    type TEXT NOT NULL CHECK (type IN ('Entreprise', 'Particulier')),
    name TEXT NOT NULL,
    company TEXT,
    phone TEXT,
    email TEXT,
    address TEXT,
    city TEXT,
    source TEXT,
    interest_level TEXT NOT NULL CHECK (interest_level IN ('Faible', 'Moyen', 'Élevé', 'Très élevé')),
    budget NUMERIC DEFAULT 0,
    need TEXT,
    comments TEXT,
    status TEXT NOT NULL CHECK (status IN ('Nouveau', 'Premier contact', 'Besoin identifié', 'Rendez-vous', 'Offre en préparation', 'Négociation', 'À convertir', 'Converti', 'Perdu')),
    responsible_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

CREATE TABLE IF NOT EXISTS prospect_activities (
    id UUID PRIMARY KEY,
    prospect_id UUID REFERENCES prospects(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('Appel', 'Email', 'Visite', 'Réunion', 'Démonstration', 'Compte rendu', 'Autre')),
    description TEXT,
    date TIMESTAMPTZ NOT NULL,
    created_by UUID REFERENCES profiles(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS prospect_follow_ups (
    id UUID PRIMARY KEY,
    prospect_id UUID REFERENCES prospects(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    time TEXT,
    priority TEXT NOT NULL CHECK (priority IN ('Basse', 'Moyenne', 'Haute', 'Urgente')),
    observation TEXT,
    status TEXT NOT NULL CHECK (status IN ('En attente', 'Terminée', 'Annulée'))
);

CREATE TABLE IF NOT EXISTS categories (
    id UUID PRIMARY KEY,
    service_id UUID REFERENCES services(id) ON DELETE CASCADE,
    name TEXT NOT NULL
);

-- =============================================
-- 3. RLS + Policies
-- =============================================

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE prospects ENABLE ROW LEVEL SECURITY;
ALTER TABLE prospect_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE prospect_follow_ups ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Activer tout pour les utilisateurs authentifiés" ON invoices FOR ALL TO authenticated USING (true);
CREATE POLICY "Activer tout pour les utilisateurs authentifiés" ON invoice_lines FOR ALL TO authenticated USING (true);
CREATE POLICY "Activer tout pour les utilisateurs authentifiés" ON commissions FOR ALL TO authenticated USING (true);
CREATE POLICY "Activer tout pour les utilisateurs authentifiés" ON prospects FOR ALL TO authenticated USING (true);
CREATE POLICY "Activer tout pour les utilisateurs authentifiés" ON prospect_activities FOR ALL TO authenticated USING (true);
CREATE POLICY "Activer tout pour les utilisateurs authentifiés" ON prospect_follow_ups FOR ALL TO authenticated USING (true);
CREATE POLICY "Activer tout pour les utilisateurs authentifiés" ON categories FOR ALL TO authenticated USING (true);

-- =============================================
-- 4. Index
-- =============================================

CREATE INDEX IF NOT EXISTS idx_invoices_number ON invoices(invoice_number);
CREATE INDEX IF NOT EXISTS idx_invoice_lines_invoice_id ON invoice_lines(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoices_client_id ON invoices(client_id);
CREATE INDEX IF NOT EXISTS idx_commissions_commercial_id ON commissions(commercial_id);
CREATE INDEX IF NOT EXISTS idx_prospects_status ON prospects(status);
CREATE INDEX IF NOT EXISTS idx_prospects_commercial_id ON prospects(commercial_id);
CREATE INDEX IF NOT EXISTS idx_prospect_activities_prospect_id ON prospect_activities(prospect_id);
CREATE INDEX IF NOT EXISTS idx_prospect_follow_ups_prospect_id ON prospect_follow_ups(prospect_id);
CREATE INDEX IF NOT EXISTS idx_categories_service_id ON categories(service_id);