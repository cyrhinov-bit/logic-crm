import type { PosProduct } from '../../../../context/AppContext';

/**
 * Interface de persistance fournie par la couche supérieure (AppContext).
 * L'application est offline-first : l'état React + localforage + queueSyncAction
 * restent la source de vérité. Le repository s'appuie dessus pour les mutations.
 */
export interface ProductPersistence {
  create: (product: PosProduct) => Promise<void>;
  update: (id: string, data: Partial<PosProduct>) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

/**
 * ProductRepository — accès aux données produits.
 *
 * Centralise les lectures (findAll, findById, findByBarcode, search…)
 * et les écritures en masse (bulkInsert). Le jeu de données est injecté par
 * AppContext (via ProductService.setProducts) de sorte qu'il n'existe
 * QU'UNE SEULE source de vérité : `posProducts`.
 */
export class ProductRepository {
  private products: PosProduct[] = [];

  setProducts(products: PosProduct[]): void {
    this.products = products;
  }

  findAll(): PosProduct[] {
    return [...this.products];
  }

  count(): number {
    return this.products.length;
  }

  findById(id: string): PosProduct | undefined {
    return this.products.find(p => p.id === id);
  }

  findByBarcode(barcode: string): PosProduct | undefined {
    if (!barcode) return undefined;
    const clean = String(barcode).trim();
    return this.products.find(p => !!p.barcode && p.barcode === clean);
  }

  findByReference(reference: string): PosProduct | undefined {
    const clean = (reference || '').trim().toLowerCase();
    if (!clean) return undefined;
    return this.products.find(p => p.reference.toLowerCase() === clean);
  }

  findByIsbn(isbn: string): PosProduct | undefined {
    if (!isbn) return undefined;
    const clean = String(isbn).trim();
    return this.products.find(p => !!p.isbn && p.isbn === clean);
  }

  search(query: string): PosProduct[] {
    const q = (query || '').trim().toLowerCase();
    if (!q) return this.findAll();
    return this.products.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.reference.toLowerCase().includes(q) ||
      (p.barcode || '').toLowerCase().includes(q) ||
      (p.isbn || '').toLowerCase().includes(q)
    );
  }

  /** Insère en masse en évitant les doublons (id / référence / code-barres). */
  bulkInsert(products: PosProduct[], persistence?: ProductPersistence): PosProduct[] {
    const added: PosProduct[] = [];
    for (const product of products) {
      const duplicate = this.products.some(p =>
        p.id === product.id ||
        (product.reference && p.reference === product.reference) ||
        (product.barcode && p.barcode === product.barcode)
      );
      if (duplicate) continue;
      this.products = [...this.products, product];
      added.push(product);
      if (persistence?.create) {
        void persistence.create(product);
      }
    }
    return added;
  }

  upsert(product: PosProduct, persistence?: ProductPersistence): 'created' | 'updated' {
    const index = this.products.findIndex(p => p.id === product.id);
    if (index === -1) {
      this.products = [...this.products, product];
      if (persistence?.create) void persistence.create(product);
      return 'created';
    }
    this.products[index] = { ...this.products[index], ...product };
    if (persistence?.update) void persistence.update(product.id, product);
    return 'updated';
  }
}

export const productRepository = new ProductRepository();