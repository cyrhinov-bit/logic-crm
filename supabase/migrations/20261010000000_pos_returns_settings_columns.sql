-- Migration P0/P1 POS : colonnes manquantes (audit POS)
-- pos_returns : session_id / amount_to_pay / refund_method / complement_transaction_id
--   (l'app les gere en local mais ne les persistait jamais -> rapprochement caisse impossible cote serveur)
-- pos_settings : whatsapp_order_phone / catalog_banner_text / theme_color
--   (edites dans PosSettings, lus par PublicCatalog, mais jetes au parsing + absents du sync)

ALTER TABLE public.pos_returns ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES public.pos_cash_sessions(id) ON DELETE SET NULL;
ALTER TABLE public.pos_returns ADD COLUMN IF NOT EXISTS amount_to_pay NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE public.pos_returns ADD COLUMN IF NOT EXISTS refund_method TEXT NOT NULL DEFAULT 'Espèces';
ALTER TABLE public.pos_returns ADD COLUMN IF NOT EXISTS complement_transaction_id UUID REFERENCES public.pos_transactions(id) ON DELETE SET NULL;

DO $$
BEGIN
  ALTER TABLE public.pos_returns DROP CONSTRAINT IF EXISTS chk_pos_returns_refund_method;
  ALTER TABLE public.pos_returns ADD CONSTRAINT chk_pos_returns_refund_method
    CHECK (refund_method IN ('Espèces', 'Mobile Money'));
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_pos_returns_session_id ON public.pos_returns(session_id);

ALTER TABLE public.pos_settings ADD COLUMN IF NOT EXISTS whatsapp_order_phone TEXT;
ALTER TABLE public.pos_settings ADD COLUMN IF NOT EXISTS catalog_banner_text TEXT;
ALTER TABLE public.pos_settings ADD COLUMN IF NOT EXISTS theme_color TEXT;

-- Cout d'achat fige a la vente (marges historiques stables, M9) :
-- sans snapshot, toute variation du prix d'achat reecrit les marges passees.
ALTER TABLE public.pos_transaction_lines ADD COLUMN IF NOT EXISTS cost_price NUMERIC NOT NULL DEFAULT 0;

-- RPC atomique d'ajustement stock (plancher 0). Utilisee par la file de sync
-- (retours, echanges, entrees, inventaires, repli transaction) pour aligner le
-- stock serveur avec le stock local sans lecture-modification-ecriture concurrente.
CREATE OR REPLACE FUNCTION public.increment_pos_stock(p_product_id UUID, p_delta NUMERIC)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  UPDATE public.pos_products
  SET quantity = GREATEST(0, quantity + COALESCE(p_delta, 0))
  WHERE id = p_product_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_pos_stock(UUID, NUMERIC) TO authenticated;
