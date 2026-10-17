-- Durcissement de process_pos_transaction (audit synchro serveur) :
--  1. conflit transaction_number (UNIQUE) avec un id différent → vente déjà
--     enregistrée : on ne fait rien au lieu de boucler en 23505 ;
--  2. stock décrémenté par ligne NOUVELLEMENT insérée (plus de flag header :
--     un rejeu après commit partiel remplit les lignes manquantes ET décrémente) ;
--  3. cost_price persisté sur les lignes (marges historiques correctes) ;
--  4. entrée de stock : violation d'unicité sur reference ignorée (rejeu).
-- Rétrocompatible avec l'appel existant (mêmes 5 paramètres jsonb).

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
  v_existing_id uuid;
  v_affected integer := 0;
BEGIN
  -- 0. Numéro déjà enregistré sous un autre id : la vente existe déjà, rien à faire.
  SELECT id INTO v_existing_id
  FROM pos_transactions
  WHERE transaction_number = p_transaction->>'transaction_number';
  IF FOUND AND v_existing_id IS DISTINCT FROM v_tx_id THEN
    RAISE NOTICE 'Vente % déjà enregistrée sous %, ignorée.', p_transaction->>'transaction_number', v_existing_id;
    RETURN;
  END IF;

  -- 1. Entête : insertion unique, silencieuse si déjà présente (rejeu)
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

  -- 2. Lignes : remplissage idempotent + décrément du stock UNIQUEMENT pour les
  --    lignes nouvellement insérées (reprise après commit partiel correcte).
  IF p_lines IS NOT NULL AND jsonb_array_length(p_lines) > 0 THEN
    FOR line IN SELECT * FROM jsonb_array_elements(p_lines)
    LOOP
      INSERT INTO pos_transaction_lines (id, transaction_id, product_id, description, quantity, unit_price, discount_percent, discount_amount, total, cost_price)
      VALUES (
        (line.value->>'id')::uuid,
        (line.value->>'transaction_id')::uuid,
        NULLIF(line.value->>'product_id', '')::uuid,
        line.value->>'description',
        (line.value->>'quantity')::numeric,
        (line.value->>'unit_price')::numeric,
        (line.value->>'discount_percent')::numeric,
        (line.value->>'discount_amount')::numeric,
        (line.value->>'total')::numeric,
        COALESCE(NULLIF(line.value->>'cost_price', '')::numeric, 0)
      )
      ON CONFLICT (id) DO NOTHING;

      GET DIAGNOSTICS v_affected = ROW_COUNT;
      IF v_affected = 1 AND NULLIF(line.value->>'product_id', '') IS NOT NULL THEN
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

  -- 4. Entrée de stock éventuelle : insertion unique + lignes idempotentes.
  --    Un doublon de reference (UNIQUE, rejeu multi-terminal) est ignoré.
  IF p_stock_entry IS NOT NULL THEN
    BEGIN
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
    EXCEPTION WHEN unique_violation THEN
      RAISE NOTICE 'Entrée de stock % déjà enregistrée (reference), ignorée.', p_stock_entry->>'reference';
    END;

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
