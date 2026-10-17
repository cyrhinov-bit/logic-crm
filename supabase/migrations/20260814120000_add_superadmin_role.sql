-- add superadmin role
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check CHECK (role IN ('SuperAdmin', 'Directeur', 'Responsable', 'Commercial', 'Gerant', 'Caissier'));
