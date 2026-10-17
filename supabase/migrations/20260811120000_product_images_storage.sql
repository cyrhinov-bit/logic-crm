-- 1. Bucket de stockage public pour les images produits
INSERT INTO storage.buckets (id, name, public)
VALUES ('product-images', 'product-images', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Politiques RLS du bucket (lecture publique, écriture/suppression authentifiée)
DROP POLICY IF EXISTS "product_images_public_read" ON storage.objects;
CREATE POLICY "product_images_public_read"
ON storage.objects FOR SELECT
USING (bucket_id = 'product-images');

DROP POLICY IF EXISTS "product_images_authenticated_insert" ON storage.objects;
CREATE POLICY "product_images_authenticated_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'product-images');

DROP POLICY IF EXISTS "product_images_authenticated_update" ON storage.objects;
CREATE POLICY "product_images_authenticated_update"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'product-images');

DROP POLICY IF EXISTS "product_images_authenticated_delete" ON storage.objects;
CREATE POLICY "product_images_authenticated_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'product-images');

-- 3. Colonne image_url sur pos_products (si absente)
ALTER TABLE IF EXISTS pos_products ADD COLUMN IF NOT EXISTS image_url TEXT;
