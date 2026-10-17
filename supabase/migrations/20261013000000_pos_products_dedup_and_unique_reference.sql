-- F1 : déduplication du catalogue + unicité de référence insensible à la casse.
-- Contexte : la contrainte d'unicité sur pos_products.reference avait été supprimée
-- (20260814130000), permettant des doublons cross-terminaux (ex : PARAPLUIE /
-- parapluie, deux UUID différents). L'app contrôle désormais à la création
-- (ProductEntryForm : local + serveur), cette migration répare l'existant et
-- verrouille côté serveur.
--
-- Stratégie prudente :
--  1. normalise les références (trim ; vide → REF-<8 premiers de l'id>) ;
--  2. fusionne UNIQUEMENT les groupes sans ambiguïté (même référence normalisée
--     ET même nom normalisé) : conserve la fiche la plus utilisée (lignes de vente,
--     puis mouvements, puis la plus ancienne), repointe les 5 tables enfants,
--     cumule les quantités, supprime les doublons ;
--  3. signale (NOTICE) les groupes ambigus (même référence, noms différents) SANS
--     les toucher — arbitrage manuel requis ;
--  4. crée l'index unique sur lower(trim(reference)) si aucun doublon ne subsiste.

BEGIN;

-- 1. Normalisation
UPDATE pos_products
SET reference = 'REF-' || upper(substring(id::text from 1 for 8))
WHERE reference IS NULL OR btrim(reference) = '';

UPDATE pos_products
SET reference = btrim(reference)
WHERE reference <> btrim(reference);

-- 2. Fusion des groupes non ambigus
DO $merge$
DECLARE
  grp RECORD;
  keeper_id uuid;
  loser_ids uuid[];
  merged_count int := 0;
BEGIN
  FOR grp IN
    SELECT lower(btrim(reference)) AS norm_ref, lower(btrim(name)) AS norm_name,
           array_agg(id ORDER BY id) AS ids, count(*) AS n
    FROM pos_products
    GROUP BY 1, 2
    HAVING count(*) > 1
  LOOP
    -- Gardien : la fiche la plus utilisée (ventes > mouvements > ancienneté)
    SELECT p.id INTO keeper_id
    FROM pos_products p
    LEFT JOIN LATERAL (
      SELECT count(*) AS c FROM pos_transaction_lines l WHERE l.product_id = p.id
    ) tl ON true
    LEFT JOIN LATERAL (
      SELECT count(*) AS c FROM pos_stock_movements m WHERE m.product_id = p.id
    ) ml ON true
    WHERE p.id = ANY (grp.ids)
    ORDER BY tl.c DESC, ml.c DESC, p.created_at ASC NULLS LAST, p.id
    LIMIT 1;

    loser_ids := array_remove(grp.ids, keeper_id);

    -- Repointage des enfants vers le gardien (dont product_completions,
    -- sinon le DELETE des doublons supprime ces lignes par cascade)
    UPDATE pos_transaction_lines SET product_id = keeper_id WHERE product_id = ANY (loser_ids);
    UPDATE pos_stock_entry_lines SET product_id = keeper_id WHERE product_id = ANY (loser_ids);
    UPDATE pos_inventory_lines SET product_id = keeper_id WHERE product_id = ANY (loser_ids);
    UPDATE pos_return_lines SET product_id = keeper_id WHERE product_id = ANY (loser_ids);
    UPDATE pos_stock_movements SET product_id = keeper_id WHERE product_id = ANY (loser_ids);
    UPDATE product_completions SET product_id = keeper_id WHERE product_id = ANY (loser_ids);

    -- Cumul des quantités sur le gardien
    UPDATE pos_products keeper
    SET quantity = keeper.quantity + COALESCE((
      SELECT sum(loser.quantity) FROM pos_products loser WHERE loser.id = ANY (loser_ids)
    ), 0)
    WHERE keeper.id = keeper_id;

    DELETE FROM pos_products WHERE id = ANY (loser_ids);

    merged_count := merged_count + 1;
    RAISE NOTICE 'Doublons fusionnés : ref=% nom=% gardien=% supprimés=%', grp.norm_ref, grp.norm_name, keeper_id, array_length(loser_ids, 1);
  END LOOP;

  IF merged_count = 0 THEN
    RAISE NOTICE 'Aucun groupe de doublons exacts à fusionner.';
  ELSE
    RAISE NOTICE 'Groupes fusionnés : %', merged_count;
  END IF;
END
$merge$;

-- 3. Groupes ambigus restants (même référence, noms différents) : signalés, non touchés
DO $report$
DECLARE
  rec RECORD;
  found boolean := false;
BEGIN
  FOR rec IN
    SELECT lower(btrim(reference)) AS norm_ref,
           string_agg(DISTINCT btrim(name) || ' (' || id::text || ')', ' | ') AS variants,
           count(*) AS n
    FROM pos_products
    GROUP BY 1
    HAVING count(*) > 1
  LOOP
    found := true;
    RAISE NOTICE 'AMBIGU — arbitrage manuel requis : ref=% variantes=%', rec.norm_ref, rec.variants;
  END LOOP;
  IF NOT found THEN
    RAISE NOTICE 'Aucune référence en double restante.';
  END IF;
END
$report$;

-- 4. Verrou d'unicité (insensible casse/espaces). Créé seulement si aucun doublon
-- de référence ne subsiste ; sinon NOTICE (les fusions déjà appliquées sont
-- conservées — pas de rollback — et la migration peut être rejouée après arbitrage).
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

COMMIT;
