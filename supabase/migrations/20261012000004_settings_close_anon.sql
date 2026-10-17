-- La policy publique settings a un nom en latin-1 ("paramètres" 0xE8) : DROP par roles, insensible a l'encodage.
DO $$
DECLARE p TEXT;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'settings' AND 'public' = ANY (roles) LOOP
    EXECUTE format('DROP POLICY %I ON public.settings', p);
  END LOOP;
END $$;
