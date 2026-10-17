import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useAppContext } from '../../../context/AppContext';
import { productImageService } from './ProductImageService';
import type { GalleryImage, UploadResult } from './ProductImageService';
import type { PosProduct } from '../../../context/AppContext';

interface ProductImagesValue {
  images: GalleryImage[];
  loading: boolean;
  refresh: () => Promise<void>;
  getImageUrl: (product: PosProduct) => string | null;
  uploadFiles: (files: File[]) => Promise<UploadResult[]>;
  setProductImage: (product: PosProduct, dataUri: string) => Promise<{ filename: string; imageUrl: string }>;
  assignImageToProduct: (image: GalleryImage, productId: string) => Promise<void>;
  deleteImage: (image: GalleryImage) => Promise<void>;
  downloadImage: (image: GalleryImage) => Promise<void>;
  clearProductImage: (product: PosProduct) => Promise<void>;
  syncPending: () => Promise<number>;
  applyAutoMatch: () => Promise<number>;
}

const ProductImagesContext = createContext<ProductImagesValue | null>(null);

export function ProductImagesProvider({ children }: { children: ReactNode }) {
  const { posProducts, updatePosProduct } = useAppContext();
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const gallery = await productImageService.loadGallery(posProducts, true);
      setImages(gallery);
    } finally {
      setLoading(false);
    }
  }, [posProducts]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleImageUpdated = useCallback(async (productId: string, imageUrl: string) => {
    await updatePosProduct(productId, { imageUrl });
  }, [updatePosProduct]);

  const handleImageCleared = useCallback(async (productId: string) => {
    await updatePosProduct(productId, { imageUrl: '' });
  }, [updatePosProduct]);

  const getImageUrl = useCallback((product: PosProduct) => {
    return productImageService.resolveImageUrl(product);
  }, []);

  const uploadFiles = useCallback(async (files: File[]): Promise<UploadResult[]> => {
    const results = await productImageService.uploadFiles(files, posProducts, handleImageUpdated);
    await refresh();
    return results;
  }, [posProducts, handleImageUpdated, refresh]);

  const setProductImage = useCallback(async (product: PosProduct, dataUri: string) => {
    const res = await productImageService.setProductImage(product, dataUri, handleImageUpdated);
    await refresh();
    return res;
  }, [handleImageUpdated, refresh]);

  const assignImageToProduct = useCallback(async (image: GalleryImage, productId: string) => {
    const product = posProducts.find(p => p.id === productId);
    if (!product) return;
    await productImageService.assignImageToProduct(image, product, handleImageUpdated);
    await refresh();
  }, [posProducts, handleImageUpdated, refresh]);

  const deleteImage = useCallback(async (image: GalleryImage) => {
    await productImageService.deleteImage(image, handleImageCleared);
    await refresh();
  }, [handleImageCleared, refresh]);

  const downloadImage = useCallback(async (image: GalleryImage) => {
    await productImageService.downloadCloudImage(image);
    await refresh();
  }, [refresh]);

  const clearProductImage = useCallback(async (product: PosProduct) => {
    await productImageService.clearProductImage(product, handleImageCleared);
    await refresh();
  }, [handleImageCleared, refresh]);

  const syncPending = useCallback(async () => {
    const count = await productImageService.syncPendingImages(posProducts, handleImageUpdated);
    if (count > 0) await refresh();
    return count;
  }, [posProducts, handleImageUpdated, refresh]);

  useEffect(() => {
    const onOnline = () => {
      void productImageService.syncPendingImages(posProducts, handleImageUpdated).then(count => {
        if (count > 0) void refresh();
      });
    };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [posProducts, handleImageUpdated, refresh]);

  const applyAutoMatch = useCallback(async () => {
    let assigned = 0;
    for (const img of images) {
      if (img.productId) continue;
      const product = productImageService.matchProduct(img.baseName, posProducts);
      if (!product) continue;
      await productImageService.assignImageToProduct(img, product, handleImageUpdated);
      assigned++;
    }
    if (assigned > 0) await refresh();
    return assigned;
  }, [images, posProducts, handleImageUpdated, refresh]);

  return (
    <ProductImagesContext.Provider
      value={{
        images,
        loading,
        refresh,
        getImageUrl,
        uploadFiles,
        setProductImage,
        assignImageToProduct,
        deleteImage,
        downloadImage,
        clearProductImage,
        syncPending,
        applyAutoMatch
      }}
    >
      {children}
    </ProductImagesContext.Provider>
  );
}

export function useProductImages(): ProductImagesValue {
  const ctx = useContext(ProductImagesContext);
  if (!ctx) {
    throw new Error('useProductImages doit être utilisé dans <ProductImagesProvider>');
  }
  return ctx;
}
