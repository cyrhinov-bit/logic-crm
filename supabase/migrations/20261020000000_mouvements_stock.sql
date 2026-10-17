-- Module Stocks métier : journal des mouvements (traçabilité qui/quoi/quand).
-- Contexte audit : quantite_stock était écrasé sans historique (ajustements invisibles).
-- Table en ajout seul (pas de UPDATE/DELETE côté applicatif) ; article_id sans FK
-- (un mouvement survit à la suppression de l'article, article_code garde la lisibilité).
-- Date: 2026-10-09

CREATE TABLE IF NOT EXISTS public.mouvements_stock (
    id TEXT PRIMARY KEY,
    article_id TEXT,
    article_code TEXT,
    type TEXT NOT NULL DEFAULT 'AJUSTEMENT' CHECK (type IN ('CREATION', 'ENTREE', 'SORTIE', 'AJUSTEMENT', 'SUPPRESSION')),
    quantite NUMERIC NOT NULL DEFAULT 0,
    stock_avant NUMERIC NOT NULL DEFAULT 0,
    stock_apres NUMERIC NOT NULL DEFAULT 0,
    motif TEXT,
    cree_par TEXT,
    cree_par_nom TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.mouvements_stock ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'mouvements_stock_select') THEN
    CREATE POLICY "mouvements_stock_select" ON public.mouvements_stock
      FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'mouvements_stock_insert') THEN
    CREATE POLICY "mouvements_stock_insert" ON public.mouvements_stock
      FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'mouvements_stock_update') THEN
    CREATE POLICY "mouvements_stock_update" ON public.mouvements_stock
      FOR UPDATE TO authenticated
      USING (cree_par::text = (auth.uid())::text
        OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('Directeur', 'Directeur adjoint', 'SuperAdmin')))
      WITH CHECK (cree_par::text = (auth.uid())::text
        OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('Directeur', 'Directeur adjoint', 'SuperAdmin')));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'mouvements_stock_delete') THEN
    CREATE POLICY "mouvements_stock_delete" ON public.mouvements_stock
      FOR DELETE TO authenticated
      USING (cree_par::text = (auth.uid())::text
        OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('Directeur', 'Directeur adjoint', 'SuperAdmin')));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_mouvements_stock_article ON public.mouvements_stock(article_id);
CREATE INDEX IF NOT EXISTS idx_mouvements_stock_date ON public.mouvements_stock(created_at);
