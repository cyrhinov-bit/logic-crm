-- Migration: Support de la famille 'Service' pour les prestations (photocopies, scans, impressions)
-- et exclusion des services de la décrémentation de stock physique.

-- 1. Mettre à jour la contrainte CHECK sur pos_categories
ALTER TABLE pos_categories DROP CONSTRAINT IF EXISTS pos_categories_family_check;
ALTER TABLE pos_categories 
  ADD CONSTRAINT pos_categories_family_check 
  CHECK (family IN ('Livre', 'Fourniture', 'Service'));

-- 2. Mettre à jour la contrainte CHECK sur pos_products
ALTER TABLE pos_products DROP CONSTRAINT IF EXISTS pos_products_family_check;
ALTER TABLE pos_products 
  ADD CONSTRAINT pos_products_family_check 
  CHECK (family IN ('Livre', 'Fourniture', 'Service'));

-- 3. Insérer la catégorie par défaut pour les services
INSERT INTO pos_categories (id, name, family)
VALUES ('00000000-0000-0000-0000-000000000000', 'Impressions & Photocopies', 'Service')
ON CONFLICT (id) DO UPDATE SET 
  name = EXCLUDED.name, 
  family = EXCLUDED.family;

-- 4. Mettre à jour la fonction process_pos_transaction pour ne décrémenter QUE les articles physiques (Livre, Fourniture)
CREATE OR REPLACE FUNCTION process_pos_transaction(
  p_transaction jsonb,
  p_lines jsonb,
  p_payments jsonb,
  p_stock_entry jsonb,
  p_stock_entry_lines jsonb
) RETURNS void AS $$
DECLARE
  line record;
BEGIN
  -- 1. Insérer la transaction
  INSERT INTO pos_transactions (id, transaction_number, cashier_id, session_id, date, subtotal, discount_amount, total, status)
  VALUES (
    (p_transaction->>'id')::uuid,
    p_transaction->>'transaction_number',
    (p_transaction->>'cashier_id')::uuid,
    (p_transaction->>'session_id')::uuid,
    (p_transaction->>'date')::timestamp with time zone,
    (p_transaction->>'subtotal')::numeric,
    (p_transaction->>'discount_amount')::numeric,
    (p_transaction->>'total')::numeric,
    p_transaction->>'status'
  );

  -- 2. Insérer les lignes et décrémenter le stock UNIQUEMENT pour les articles physiques (pas les services)
  IF p_lines IS NOT NULL AND jsonb_array_length(p_lines) > 0 THEN
    FOR line IN SELECT * FROM jsonb_array_elements(p_lines)
    LOOP
      INSERT INTO pos_transaction_lines (id, transaction_id, product_id, description, quantity, unit_price, discount_percent, discount_amount, total)
      VALUES (
        (line.value->>'id')::uuid,
        (line.value->>'transaction_id')::uuid,
        (line.value->>'product_id')::uuid,
        line.value->>'description',
        (line.value->>'quantity')::numeric,
        (line.value->>'unit_price')::numeric,
        (line.value->>'discount_percent')::numeric,
        (line.value->>'discount_amount')::numeric,
        (line.value->>'total')::numeric
      );

      -- Décrémenter uniquement les produits qui ne sont PAS des services
      IF (line.value->>'product_id') IS NOT NULL THEN
        UPDATE pos_products
        SET quantity = GREATEST(0, quantity - (line.value->>'quantity')::numeric)
        WHERE id = (line.value->>'product_id')::uuid 
          AND (family IS NULL OR family != 'Service');
      END IF;
    END LOOP;
  END IF;

  -- 3. Insérer les paiements
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
      );
    END LOOP;
  END IF;

  -- 4. Insérer l'entrée de stock si fournie
  IF p_stock_entry IS NOT NULL THEN
    INSERT INTO pos_stock_entries (id, reference, date, total_amount, status, notes, created_by)
    VALUES (
      (p_stock_entry->>'id')::uuid,
      p_stock_entry->>'reference',
      (p_stock_entry->>'date')::date,
      (p_stock_entry->>'total_amount')::numeric,
      p_stock_entry->>'status',
      p_stock_entry->>'notes',
      (p_stock_entry->>'created_by')::uuid
    );

    IF p_stock_entry_lines IS NOT NULL AND jsonb_array_length(p_stock_entry_lines) > 0 THEN
      FOR line IN SELECT * FROM jsonb_array_elements(p_stock_entry_lines)
      LOOP
        INSERT INTO pos_stock_entry_lines (id, entry_id, product_id, quantity, purchase_price, total)
        VALUES (
          (line.value->>'id')::uuid,
          (line.value->>'entry_id')::uuid,
          (line.value->>'product_id')::uuid,
          (line.value->>'quantity')::numeric,
          (line.value->>'purchase_price')::numeric,
          (line.value->>'total')::numeric
        );
      END LOOP;
    END IF;
  END IF;

END;
$$ LANGUAGE plpgsql;

