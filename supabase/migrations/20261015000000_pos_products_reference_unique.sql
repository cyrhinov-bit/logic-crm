-- Verrou d'unicité des références produits (insensible casse/espaces).
-- Fait suite à 20261013000000 (fusions appliquées, cas ambigu CHEMISE arbitré
-- manuellement). Créé seulement si aucun doublon ne subsiste ; sinon NOTICE
-- sans erreur (rejouable après arbitrage).

DO $unique_idx$
DECLARE
  v_remaining int;
BEGIN
  SELECT count(*) INTO v_remaining
  FROM (
    SELECT lower(btrim(reference)) AS norm_ref
    FROM pos_products
    GROUP BY 1
    HAVING count(*) > 1
  ) dups;

  IF v_remaining = 0 THEN
    CREATE UNIQUE INDEX IF NOT EXISTS pos_products_reference_unique_ci
      ON pos_products (lower(btrim(reference)));
    RAISE NOTICE 'Index unique pos_products_reference_unique_ci créé.';
  ELSE
    RAISE NOTICE 'Index unique NON créé : % référence(s) en double subsistent (arbitrage manuel requis, puis rejouer cette migration).', v_remaining;
  END IF;
END
$unique_idx$;
