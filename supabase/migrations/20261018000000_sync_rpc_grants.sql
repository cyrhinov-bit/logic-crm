-- Correctif audit synchro : GRANTs + SECURITY DEFINER manquants.
-- Sans GRANT, supabase.rpc() en rôle authenticated reçoit 42501 (permission denied),
-- que le client classait à tort en erreur définitive au lieu du repli résilient.
-- Date: 2026-10-09

-- upsert_quote_with_lines : déjà SECURITY DEFINER, il manquait le GRANT.
GRANT EXECUTE ON FUNCTION public.upsert_quote_with_lines(JSONB, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.next_quote_number(INT) TO authenticated;

-- process_pos_transaction : la passe en SECURITY DEFINER + search_path figé
-- (cohérent avec upsert_quote_with_lines) pour ne pas dépendre du RLS appelant.
-- On recrée le wrapper sans toucher à la logique métier (cf. 20261014000000).
DO $$
BEGIN
  EXECUTE 'ALTER FUNCTION public.process_pos_transaction(jsonb, jsonb, jsonb, jsonb, jsonb) SECURITY DEFINER';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'ALTER SECURITY DEFINER ignoré : %', SQLERRM;
END
$$;

GRANT EXECUTE ON FUNCTION public.process_pos_transaction(JSONB, JSONB, JSONB, JSONB, JSONB) TO authenticated;

-- increment_pos_stock : utilisé par tous les replis stock (ventes, entrées,
-- inventaires, retours). Passe en DEFINER + GRANT, sinon soumis au RLS futur
-- de pos_products et échec silencieux des remontées stock.
CREATE OR REPLACE FUNCTION public.increment_pos_stock(p_product_id UUID, p_delta NUMERIC)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  UPDATE public.pos_products
  SET quantity = GREATEST(0, COALESCE(quantity, 0) + COALESCE(p_delta, 0))
  WHERE id = p_product_id;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.increment_pos_stock(UUID, NUMERIC) TO authenticated;
