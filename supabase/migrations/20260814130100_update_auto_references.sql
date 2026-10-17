-- 2. Remplacer tous les anciens faux identifiants (REF-AUTO-xxx) par le vrai nom du produit
UPDATE pos_products 
SET reference = name 
WHERE reference LIKE 'REF-AUTO-%';
