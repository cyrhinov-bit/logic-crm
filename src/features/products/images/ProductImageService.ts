import { platform } from '../../../platform';
import { db } from '../../../lib/db';
import { supabase } from '../../../lib/supabase';
import type { PosProduct } from '../../../context/AppContext';

export interface GalleryImage {
  filename: string;
  baseName: string;
  ext: string;
  dataUri: string;
  productId?: string;
  productName?: string;
  source: 'local' | 'cloud';
  cloudUrl?: string;
}

export interface UploadResult {
  filename: string;
  matchedProductId?: string;
  matchedProductName?: string;
  uploaded: boolean;
}

const IMAGE_EXT_REGEX = /\.(png|jpe?g)$/i;
export const STORAGE_BUCKET = (import.meta as any).env?.VITE_SUPABASE_STORAGE_BUCKET || 'product-images';

export function normalizeName(value: string): string {
  return (value || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function sanitizeFilename(name: string): string {
  return (name || '').replace(/[<>:"/\\|?*]+/g, '_').trim();
}

export function dataUriToBlob(dataUri: string): Blob {
  const [meta, b64] = dataUri.split(',');
  const mime = /data:([^;]+)/.exec(meta || '')?.[1] || 'image/png';
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export function extFromMime(mime: string): string {
  if (mime === 'image/jpeg') return 'jpg';
  if (mime === 'image/png') return 'png';
  return mime === 'image/gif' ? 'gif' : 'png';
}

function mimeFromExt(ext: string): string {
  return ext.toLowerCase() === 'jpg' || ext.toLowerCase() === 'jpeg' ? 'image/jpeg' : 'image/png';
}

function cloudPath(productId: string, filename: string): string {
  return `products/${productId}/${encodeURIComponent(filename)}`;
}

class ProductImageService {
  private cache = new Map<string, string>();
  private loaded = false;

  private isElectron(): boolean {
    return platform.isDesktop;
  }

  private async saveLocal(filename: string, dataUri: string): Promise<void> {
    if (this.isElectron()) {
      const base64 = dataUri.split(',')[1] || dataUri;
      await platform.files.writeBinaryFile('images', filename, base64);
    } else {
      const existing = (await db.productImages.getItem<Record<string, string>>('data')) || {};
      await db.productImages.setItem('data', { ...existing, [filename]: dataUri });
    }
    this.cache.set(filename, dataUri);
  }

  private async deleteLocal(filename: string): Promise<void> {
    if (this.isElectron()) {
      await platform.files.deleteFile('images', filename);
    } else {
      const existing = (await db.productImages.getItem<Record<string, string>>('data')) || {};
      delete existing[filename];
      await db.productImages.setItem('data', existing);
    }
    this.cache.delete(filename);
  }

  private async uploadToCloud(productId: string, filename: string, dataUri: string): Promise<string | null> {
    try {
      const blob = dataUriToBlob(dataUri);
      const ext = filename.split('.').pop() || 'png';
      const path = cloudPath(productId, filename);
      const { error } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(path, blob, { upsert: true, contentType: mimeFromExt(ext) });
      if (error) {
        console.warn('[ProductImage] Upload cloud échoué :', error.message);
        return null;
      }
      const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
      return data.publicUrl;
    } catch (e) {
      console.warn('[ProductImage] Upload cloud exception :', e);
      return null;
    }
  }

  private async deleteFromCloud(productId: string, filename: string): Promise<void> {
    try {
      await supabase.storage.from(STORAGE_BUCKET).remove([cloudPath(productId, filename)]);
    } catch (e) {
      console.warn('[ProductImage] Suppression cloud échouée :', e);
    }
  }

  matchProduct(baseName: string, products: PosProduct[]): PosProduct | undefined {
    const target = normalizeName(baseName);
    const byName = products.find(p => normalizeName(p.name) === target);
    if (byName) return byName;
    return products.find(p => normalizeName(p.reference) === target);
  }

  async loadGallery(products: PosProduct[] = [], includeCloud = true): Promise<GalleryImage[]> {
    const list: GalleryImage[] = [];

    if (this.isElectron()) {
      const files = await platform.files.listDir('images');
      const imageFiles = files.filter(f => IMAGE_EXT_REGEX.test(f));
      for (const filename of imageFiles) {
        try {
          const base64 = await platform.files.readBinaryFile('images', filename);
          const ext = filename.split('.').pop() || 'png';
          const dataUri = `data:${mimeFromExt(ext)};base64,${base64}`;
          this.cache.set(filename, dataUri);
          const baseName = filename.replace(IMAGE_EXT_REGEX, '');
          const matched = this.matchProduct(baseName, products);
          list.push({
            filename,
            baseName,
            ext,
            dataUri,
            productId: matched?.id,
            productName: matched?.name,
            source: 'local'
          });
        } catch (e) {
          console.warn('[ProductImage] Lecture image impossible :', filename, e);
        }
      }
    } else {
      const existing = (await db.productImages.getItem<Record<string, string>>('data')) || {};
      for (const [filename, dataUri] of Object.entries(existing)) {
        if (!IMAGE_EXT_REGEX.test(filename)) continue;
        this.cache.set(filename, dataUri);
        const baseName = filename.replace(IMAGE_EXT_REGEX, '');
        const matched = this.matchProduct(baseName, products);
        list.push({
          filename,
          baseName,
          ext: filename.split('.').pop() || 'png',
          dataUri,
          productId: matched?.id,
          productName: matched?.name,
          source: 'local'
        });
      }
    }

    if (includeCloud) {
      const cloudImages = this.listCloudImages(products);
      for (const cloud of cloudImages) {
        const duplicate = list.some(img =>
          (cloud.productId && img.productId === cloud.productId) ||
          img.filename === cloud.filename
        );
        if (!duplicate) list.push(cloud);
      }
    }

    this.loaded = true;
    return list;
  }

  listCloudImages(products: PosProduct[] = []): GalleryImage[] {
    const list: GalleryImage[] = [];
    for (const product of products) {
      const url = product.imageUrl || '';
      if (!url.startsWith('http')) continue;
      const filename = this.filenameFromCloudUrl(url) || `${sanitizeFilename(product.name)}.jpg`;
      const baseName = filename.replace(IMAGE_EXT_REGEX, '');
      list.push({
        filename,
        baseName,
        ext: filename.split('.').pop() || 'jpg',
        dataUri: url,
        productId: product.id,
        productName: product.name,
        source: 'cloud',
        cloudUrl: url
      });
    }
    return list;
  }

  filenameFromCloudUrl(url: string): string | null {
    try {
      const clean = url.split('?')[0];
      const segment = clean.substring(clean.lastIndexOf('/') + 1);
      return segment ? decodeURIComponent(segment) : null;
    } catch {
      return null;
    }
  }

  async downloadCloudImage(image: GalleryImage): Promise<void> {
    if (image.source !== 'cloud' || !image.cloudUrl) return;
    const response = await fetch(image.cloudUrl);
    if (!response.ok) throw new Error(`Téléchargement impossible (HTTP ${response.status})`);
    const blob = await response.blob();
    const ext = extFromMime(blob.type) || image.ext || 'jpg';
    const filename = `${sanitizeFilename(image.baseName || image.productName || 'image')}.${ext}`;
    const dataUri = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
    await this.saveLocal(filename, dataUri);
  }

  async uploadFiles(
    files: File[],
    products: PosProduct[],
    onImageUpdated: (productId: string, imageUrl: string) => Promise<void>
  ): Promise<UploadResult[]> {
    const results: UploadResult[] = [];

    for (const file of files) {
      if (!IMAGE_EXT_REGEX.test(file.name)) continue;

      const dataUri = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });

      const originalExt = (file.name.split('.').pop() || 'png').toLowerCase();
      const baseName = file.name.replace(IMAGE_EXT_REGEX, '');
      const matched = this.matchProduct(baseName, products);
      const filename = matched
        ? `${sanitizeFilename(matched.name)}.${originalExt}`
        : sanitizeFilename(file.name);

      await this.saveLocal(filename, dataUri);
      const result: UploadResult = { filename, uploaded: false };

      if (matched) {
        result.matchedProductId = matched.id;
        result.matchedProductName = matched.name;
        const publicUrl = await this.uploadToCloud(matched.id, filename, dataUri);
        const imageUrl = publicUrl || `gallery:${filename}`;
        result.uploaded = !!publicUrl;
        await onImageUpdated(matched.id, imageUrl);
      }

      results.push(result);
    }

    return results;
  }

  async setProductImage(
    product: PosProduct,
    dataUri: string,
    onImageUpdated: (productId: string, imageUrl: string) => Promise<void>
  ): Promise<{ filename: string; imageUrl: string }> {
    const mime = /data:([^;]+)/.exec(dataUri)?.[1] || 'image/png';
    const ext = extFromMime(mime);
    const filename = `${sanitizeFilename(product.name)}.${ext}`;

    await this.saveLocal(filename, dataUri);
    const publicUrl = await this.uploadToCloud(product.id, filename, dataUri);
    const imageUrl = publicUrl || `gallery:${filename}`;
    await onImageUpdated(product.id, imageUrl);

    return { filename, imageUrl };
  }

  async assignImageToProduct(
    image: GalleryImage,
    product: PosProduct,
    onImageUpdated: (productId: string, imageUrl: string) => Promise<void>
  ): Promise<string> {
    const ext = image.ext || 'png';
    const newFilename = `${sanitizeFilename(product.name)}.${ext}`;

    if (newFilename !== image.filename) {
      await this.saveLocal(newFilename, image.dataUri);
      await this.deleteLocal(image.filename);
    }

    const publicUrl = await this.uploadToCloud(product.id, newFilename, image.dataUri);
    const imageUrl = publicUrl || `gallery:${newFilename}`;
    await onImageUpdated(product.id, imageUrl);

    return imageUrl;
  }

  async deleteImage(
    image: GalleryImage,
    onImageCleared: (productId: string) => Promise<void>
  ): Promise<void> {
    if (image.source === 'cloud') {
      if (image.productId) {
        const filename = image.filename || this.filenameFromCloudUrl(image.cloudUrl || '') || '';
        if (filename) await this.deleteFromCloud(image.productId, filename);
        await onImageCleared(image.productId);
      }
      return;
    }
    await this.deleteLocal(image.filename);
    if (image.productId) {
      await this.deleteFromCloud(image.productId, image.filename);
      await onImageCleared(image.productId);
    }
  }

  async clearProductImage(
    product: PosProduct,
    onImageCleared: (productId: string) => Promise<void>
  ): Promise<void> {
    const ref = product?.imageUrl;
    if (ref?.startsWith('gallery:')) {
      const filename = ref.slice('gallery:'.length);
      await this.deleteLocal(filename);
    } else if (ref?.startsWith('http')) {
      const filename = this.filenameFromCloudUrl(ref) || '';
      if (filename) await this.deleteFromCloud(product.id, filename);
    }
    await onImageCleared(product.id);
  }

  resolveImageUrl(product: PosProduct): string | null {
    const ref = product?.imageUrl;
    if (!ref) return null;
    if (ref.startsWith('http') || ref.startsWith('data:')) return ref;
    if (ref.startsWith('gallery:')) {
      const filename = ref.slice('gallery:'.length);
      return this.cache.get(filename) || null;
    }
    return null;
  }

  async syncPendingImages(
    products: PosProduct[],
    onImageUpdated: (productId: string, imageUrl: string) => Promise<void>
  ): Promise<number> {
    if (!this.loaded) await this.loadGallery(products);
    let synced = 0;
    for (const product of products) {
      const ref = product.imageUrl || '';
      if (!ref.startsWith('gallery:')) continue;
      const filename = ref.slice('gallery:'.length);
      const dataUri = this.cache.get(filename);
      if (!dataUri) continue;
      const publicUrl = await this.uploadToCloud(product.id, filename, dataUri);
      if (publicUrl) {
        await onImageUpdated(product.id, publicUrl);
        synced++;
      }
    }
    return synced;
  }
}

export const productImageService = new ProductImageService();
