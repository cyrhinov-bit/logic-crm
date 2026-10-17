-- Correctif synchro P0 : rendre process_pos_transaction idempotent.
-- Contexte : la version precedente faisait des INSERT secs. Tout rejeu (bouton
-- "Tout re-essayer", reconciliation globale, retry heartbeat) echouait en
-- 23505 duplicate key, generant des toasts/entrees syncErrors en boucle.
-- La nouvelle version :
--  1. n'insere l'entete que si l'id est absent (ON CONFLICT DO NOTHING) ;
--  2. ne decremente le stock qu'a la premiere insertion (pas de double
--     decrementation lors des rejouements) ;
--  3. remplit les lignes/paiements manquants en ON CONFLICT DO NOTHING
--     (reprise apres echec partiel sans erreur).
-- RPC appelee avec un role authentifie : les policies RLS existantes
-- (authenticated ALL) continuent de s'appliquer, aucun changement de droits.

CREATE OR REPLACE FUNCTION public.process_pos_transaction(
  p_transaction jsonb,
  p_lines jsonb,
  p_payments jsonb,
  p_stock_entry jsonb,
  p_stock_entry_lines jsonb
)
RETURNS void
LANGUAGE plpgsql
AS $function$
DECLARE
  line record;
  v_tx_id uuid := (p_transaction->>'id')::uuid;
  v_affected integer := 0;
  v_is_new boolean := false;
BEGIN
  -- 1. Entete : insertion unique, silencieuse si deja presente (rejeu)
  INSERT INTO pos_transactions (id, transaction_number, cashier_id, session_id, date, subtotal, discount_amount, total, status)
  VALUES (
    v_tx_id,
    p_transaction->>'transaction_number',
    NULLIF(p_transaction->>'cashier_id', '')::uuid,
    NULLIF(p_transaction->>'session_id', '')::uuid,
    (p_transaction->>'date')::timestamp with time zone,
    (p_transaction->>'subtotal')::numeric,
    (p_transaction->>'discount_amount')::numeric,
    (p_transaction->>'total')::numeric,
    p_transaction->>'status'
  )
  ON CONFLICT (id) DO NOTHING;

  GET DIAGNOSTICS v_affected = ROW_COUNT;
  v_is_new := (v_affected = 1);

  -- 2. Lignes : remplissage idempotent + decrementation du stock
  --    UNIQUEMENT a la premiere insertion (articles physiques hors Service)
  IF p_lines IS NOT NULL AND jsonb_array_length(p_lines) > 0 THEN
    FOR line IN SELECT * FROM jsonb_array_elements(p_lines)
    LOOP
      INSERT INTO pos_transaction_lines (id, transaction_id, product_id, description, quantity, unit_price, discount_percent, discount_amount, total)
      VALUES (
        (line.value->>'id')::uuid,
        (line.value->>'transaction_id')::uuid,
        NULLIF(line.value->>'product_id', '')::uuid,
        line.value->>'description',
        (line.value->>'quantity')::numeric,
        (line.value->>'unit_price')::numeric,
        (line.value->>'discount_percent')::numeric,
        (line.value->>'discount_amount')::numeric,
        (line.value->>'total')::numeric
      )
      ON CONFLICT (id) DO NOTHING;

      IF v_is_new AND NULLIF(line.value->>'product_id', '') IS NOT NULL THEN
        UPDATE pos_products
        SET quantity = GREATEST(0, quantity - (line.value->>'quantity')::numeric)
        WHERE id = (line.value->>'product_id')::uuid
          AND (family IS NULL OR family != 'Service');
      END IF;
    END LOOP;
  END IF;

  -- 3. Paiements : remplissage idempotent
  IF p_payments IS NOT NULL AND jsonb_array_length(p_payments) > 0 THEN
    FOR line IN SELECT * FROM jsonb_array_elements(p_payments)
    LOOP
      INSERT INTO pos_payments (id, transaction_id, method, amount, reference)
      VALUES (
        (line.value->>'id')::uuid,
        (line.value->>'transaction_id')::uuid,
        line.value->>'method',
        (line.value->>'amount')::numeric,
        line.value->>'reference'
      )
      ON CONFLICT (id) DO NOTHING;
    END LOOP;
  END IF;

  -- 4. Entree de stock eventuelle : insertion unique + lignes idempotentes
  IF p_stock_entry IS NOT NULL THEN
    INSERT INTO pos_stock_entries (id, reference, date, total_amount, status, notes, created_by)
    VALUES (
      (p_stock_entry->>'id')::uuid,
      p_stock_entry->>'reference',
      (p_stock_entry->>'date')::date,
      (p_stock_entry->>'total_amount')::numeric,
      p_stock_entry->>'status',
      p_stock_entry->>'notes',
      NULLIF(p_stock_entry->>'created_by', '')::uuid
    )
    ON CONFLICT (id) DO NOTHING;

    IF p_stock_entry_lines IS NOT NULL AND jsonb_array_length(p_stock_entry_lines) > 0 THEN
      FOR line IN SELECT * FROM jsonb_array_elements(p_stock_entry_lines)
      LOOP
        INSERT INTO pos_stock_entry_lines (id, entry_id, product_id, quantity, purchase_price, total)
        VALUES (
          (line.value->>'id')::uuid,
          (line.value->>'entry_id')::uuid,
          NULLIF(line.value->>'product_id', '')::uuid,
          (line.value->>'quantity')::numeric,
          (line.value->>'purchase_price')::numeric,
          (line.value->>'total')::numeric
        )
        ON CONFLICT (id) DO NOTHING;
      END LOOP;
    END IF;
  END IF;

END;
$function$;
