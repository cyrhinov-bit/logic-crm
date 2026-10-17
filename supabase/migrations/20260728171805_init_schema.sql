-- 1. Activer l'extension pgcrypto pour les UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. CrÃ©ation des tables

-- Table des services
CREATE TABLE services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- Table des utilisateurs Ã©tendus (Profils liÃ©s Ã  auth.users)
CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('Directeur', 'Responsable')),
    service_id UUID REFERENCES services(id) ON DELETE SET NULL,
    pin TEXT NOT NULL,
    last_login TEXT DEFAULT 'Jamais',
    active BOOLEAN DEFAULT true
);

-- Table des clients
CREATE TABLE clients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    contact TEXT,
    company TEXT,
    address TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- Table des prestations
CREATE TABLE prestations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    price NUMERIC NOT NULL,
    service_id UUID REFERENCES services(id) ON DELETE CASCADE
);

-- Table des paramÃ¨tres globaux
CREATE TABLE settings (
    id INT PRIMARY KEY DEFAULT 1,
    company_name TEXT DEFAULT 'Mon Entreprise',
    company_logo TEXT,
    company_address TEXT,
    company_siret TEXT,
    company_tva TEXT,
    default_terms TEXT
);

-- Table des devis
CREATE TABLE quotes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quote_number TEXT UNIQUE NOT NULL,
    client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
    commercial_id UUID REFERENCES profiles(id),
    subject TEXT,
    subtotal NUMERIC NOT NULL,
    vat NUMERIC NOT NULL,
    total NUMERIC NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('Brouillon', 'EnvoyÃ©', 'AcceptÃ©', 'RefusÃ©')),
    date DATE NOT NULL,
    style TEXT DEFAULT 'Classique',
    accent_color TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- Table des lignes de devis
CREATE TABLE quote_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quote_id UUID REFERENCES quotes(id) ON DELETE CASCADE,
    prestation_id UUID REFERENCES prestations(id) ON DELETE SET NULL,
    description TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    unit_price NUMERIC NOT NULL,
    total NUMERIC NOT NULL
);

-- 3. Row Level Security (RLS) - Pour le moment, accÃ¨s total pour la maquette
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE prestations ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_lines ENABLE ROW LEVEL SECURITY;

-- Autoriser tout (Lecture/Ecriture) pour tous les utilisateurs authentifiÃ©s
CREATE POLICY "Activer tout pour les utilisateurs authentifiÃ©s" ON services FOR ALL TO authenticated USING (true);
CREATE POLICY "Activer tout pour les utilisateurs authentifiÃ©s" ON profiles FOR ALL TO authenticated USING (true);
CREATE POLICY "Activer tout pour les utilisateurs authentifiÃ©s" ON clients FOR ALL TO authenticated USING (true);
CREATE POLICY "Activer tout pour les utilisateurs authentifiÃ©s" ON prestations FOR ALL TO authenticated USING (true);
CREATE POLICY "Activer tout pour les utilisateurs authentifiÃ©s" ON settings FOR ALL TO authenticated USING (true);
CREATE POLICY "Activer tout pour les utilisateurs authentifiÃ©s" ON quotes FOR ALL TO authenticated USING (true);
CREATE POLICY "Activer tout pour les utilisateurs authentifiÃ©s" ON quote_lines FOR ALL TO authenticated USING (true);

-- Autoriser la lecture publique des profils (pour l'Ã©cran de connexion)
CREATE POLICY "Lecture publique des profils" ON profiles FOR SELECT USING (true);

-- Autoriser la lecture publique des devis, lignes, clients et paramÃ¨tres (pour le Portail Client)
CREATE POLICY "Lecture publique des devis" ON quotes FOR SELECT USING (true);
CREATE POLICY "Lecture publique des lignes" ON quote_lines FOR SELECT USING (true);
CREATE POLICY "Lecture publique des clients" ON clients FOR SELECT USING (true);
CREATE POLICY "Lecture publique des paramÃ¨tres" ON settings FOR SELECT USING (true);

-- Insertions par dÃ©faut
INSERT INTO settings (id, company_name) VALUES (1, 'Hinov') ON CONFLICT DO NOTHING;

