-- Retrait de l'integration Gemini du projet.
-- Supprime la colonne de cle API Gemini par utilisateur (plus utilisee par l'application).
ALTER TABLE public.profiles DROP COLUMN IF EXISTS gemini_api_key;
