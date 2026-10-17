import type { PosProduct, ProductCompletion, ProductCompletionFilters } from '../../../context/AppContext';
import { v4 as uuidv4 } from 'uuid';

export class ProductCompletionService {
  analyzeProduct(product: PosProduct): ProductCompletion[] {
    const completions: ProductCompletion[] = [];
    const now = new Date().toISOString();

    if (!product.imageUrl) {
      completions.push({
        id: uuidv4(),
        productId: product.id,
        missingField: 'image',
        currentValue: '',
        suggestedValue: '',
        createdAt: now
      });
    }

    if (!product.barcode) {
      completions.push({
        id: uuidv4(),
        productId: product.id,
        missingField: 'image',
        currentValue: '',
        suggestedValue: '',
        createdAt: now
      });
    }

    if (!product.isbn) {
      completions.push({
        id: uuidv4(),
        productId: product.id,
        missingField: 'image',
        currentValue: '',
        suggestedValue: '',
        createdAt: now
      });
    }

    if (!product.categoryId) {
      completions.push({
        id: uuidv4(),
        productId: product.id,
        missingField: 'category',
        currentValue: '',
        suggestedValue: 'À classer',
        createdAt: now
      });
    }

    if (!product.brandId) {
      completions.push({
        id: uuidv4(),
        productId: product.id,
        missingField: 'brand',
        currentValue: '',
        suggestedValue: '',
        createdAt: now
      });
    }

    if (!product.supplierId) {
      completions.push({
        id: uuidv4(),
        productId: product.id,
        missingField: 'supplier',
        currentValue: '',
        suggestedValue: '',
        createdAt: now
      });
    }

    if (!product.minStock || product.minStock <= 0) {
      completions.push({
        id: uuidv4(),
        productId: product.id,
        missingField: 'minStock',
        currentValue: '',
        suggestedValue: '',
        createdAt: now
      });
    }

    if (product.quantity <= product.minStock && product.minStock > 0) {
      completions.push({
        id: uuidv4(),
        productId: product.id,
        missingField: 'minStock',
        currentValue: '',
        suggestedValue: '',
        createdAt: now
      });
    }

    return completions;
  }

  analyzeAllProducts(products: PosProduct[]): ProductCompletion[] {
    return products.flatMap(p => this.analyzeProduct(p));
  }

  getIncompleteProducts(
    products: PosProduct[],
    filters: ProductCompletionFilters
  ): PosProduct[] {
    return products.filter(product => {
      if (filters.noFamily && !product.family) return true;
      if (filters.noCategory && !product.categoryId) return true;
      if (filters.noBrand && !product.brandId) return true;
      if (filters.noSupplier && !product.supplierId) return true;
      if (filters.noImage && !product.imageUrl) return true;
      if (filters.noBarcode && !product.barcode) return true;
      if (filters.noIsbn && !product.isbn) return true;
      if (filters.minStockExceeded && product.quantity <= product.minStock && product.minStock > 0) return true;
      return false;
    });
  }
}

export const productCompletionService = new ProductCompletionService();
