import { supabase } from '../../../lib/supabase';
import { v4 as uuidv4 } from 'uuid';

export class ProductImageService {
  private readonly BUCKET_NAME = 'product-images';

  /**
   * Upload an image to Supabase Storage and return the public URL.
   * @param file The file to upload (e.g. from an input or camera)
   * @param productId The ID of the product (to organize folders)
   * @returns The public URL of the uploaded image
   */
  async uploadProductImage(file: File, productId: string): Promise<string> {
    if (!file) throw new Error('Aucun fichier fourni.');
    
    // Validate image
    if (!file.type.startsWith('image/')) {
      throw new Error('Le fichier doit être une image.');
    }

    // Limit size to ~5MB
    if (file.size > 5 * 1024 * 1024) {
      throw new Error('La taille de l\'image ne doit pas dépasser 5 Mo.');
    }

    const fileExt = file.name.split('.').pop();
    const fileName = `${uuidv4()}.${fileExt}`;
    const filePath = `products/${productId}/${fileName}`;

    const { error } = await supabase.storage
      .from(this.BUCKET_NAME)
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: true,
      });

    if (error) {
      console.error('Erreur upload:', error);
      throw new Error(`Erreur lors de l'upload de l'image : ${error.message}`);
    }

    return this.getProductImageUrl(filePath);
  }

  /**
   * Get the public URL for a given path.
   */
  getProductImageUrl(path: string): string {
    const { data } = supabase.storage.from(this.BUCKET_NAME).getPublicUrl(path);
    return data.publicUrl;
  }

  /**
   * Delete an image from storage using its path.
   */
  async deleteProductImage(path: string): Promise<void> {
    if (!path) return;
    
    // Extract path from public URL if necessary
    let cleanPath = path;
    if (path.includes('/storage/v1/object/public/')) {
       cleanPath = path.split(`/storage/v1/object/public/${this.BUCKET_NAME}/`)[1];
    }
    
    if (!cleanPath) return;

    const { error } = await supabase.storage.from(this.BUCKET_NAME).remove([cleanPath]);
    if (error) {
      console.error('Erreur suppression image:', error);
      throw new Error(`Erreur lors de la suppression de l'image : ${error.message}`);
    }
  }

  /**
   * Replaces an existing image with a new one.
   */
  async replaceProductImage(file: File, productId: string, oldImageUrl?: string): Promise<string> {
    if (oldImageUrl) {
      try {
        await this.deleteProductImage(oldImageUrl);
      } catch (err) {
        console.warn('Impossible de supprimer l\'ancienne image, continuation de l\'upload...', err);
      }
    }
    return this.uploadProductImage(file, productId);
  }
}

export const productImageService = new ProductImageService();
