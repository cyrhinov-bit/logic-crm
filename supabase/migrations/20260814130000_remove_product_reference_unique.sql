-- Remove unique constraint from reference in pos_products
ALTER TABLE pos_products DROP CONSTRAINT IF EXISTS pos_products_reference_key;
