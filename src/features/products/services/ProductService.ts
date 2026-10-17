import { v4 as uuidv4 } from 'uuid';
import type { PosCategory, PosBrand, PosSupplier, PosProduct } from '../../../context/AppContext';
import { Barcode, Isbn, ProductReference } from '../domain/value-objects/ValueObjects';
import { productRepository, type ProductPersistence } from '../data/repositories/ProductRepository';

export const DEFAULT_FAMILIES: PosCategory[] = [
  { id: 'fam-001', name: 'Livres', family: 'Livre' },
  { id: 'fam-002', name: 'Fournitures scolaires', family: 'Fourniture' },
  { id: 'fam-003', name: 'Papeterie', family: 'Fourniture' },
  { id: 'fam-004', name: 'Accessoires', family: 'Fourniture' },
  { id: 'fam-005', name: 'Jeux éducatifs', family: 'Fourniture' },
  { id: 'fam-006', name: 'Divers', family: 'Fourniture' },
];

export const DEFAULT_CATEGORIES: PosCategory[] = [
  { id: 'cat-001', name: 'Romans', family: 'Livre' },
  { id: 'cat-002', name: 'Manuels scolaires', family: 'Livre' },
  { id: 'cat-003', name: 'Parascolaire', family: 'Livre' },
  { id: 'cat-004', name: 'Universitaire', family: 'Livre' },
  { id: 'cat-005', name: 'BD', family: 'Livre' },
  { id: 'cat-006', name: 'Mangas', family: 'Livre' },
  { id: 'cat-007', name: 'Cahiers', family: 'Fourniture' },
  { id: 'cat-008', name: 'Blocs-notes', family: 'Fourniture' },
  { id: 'cat-009', name: 'Ramettes', family: 'Fourniture' },
  { id: 'cat-010', name: 'Registres', family: 'Fourniture' },
  { id: 'cat-011', name: 'Agendas', family: 'Fourniture' },
  { id: 'cat-012', name: 'Stylos', family: 'Fourniture' },
  { id: 'cat-013', name: 'Crayons', family: 'Fourniture' },
  { id: 'cat-014', name: 'Gommes', family: 'Fourniture' },
  { id: 'cat-015', name: 'Colles', family: 'Fourniture' },
  { id: 'cat-016', name: 'Ciseaux', family: 'Fourniture' },
  { id: 'cat-017', name: 'Règles', family: 'Fourniture' },
  { id: 'cat-018', name: 'Trousses', family: 'Fourniture' },
  { id: 'cat-019', name: 'Sacs', family: 'Fourniture' },
  { id: 'cat-020', name: 'Calculatrices', family: 'Fourniture' },
  { id: 'cat-021', name: 'Clés USB', family: 'Fourniture' },
  { id: 'cat-022', name: 'Piles', family: 'Fourniture' },
  { id: 'cat-023', name: 'À classer', family: 'Fourniture' },
];

export const DEFAULT_BRANDS: PosBrand[] = [
  { id: 'brand-001', name: 'Bic' },
  { id: 'brand-002', name: 'Pilot' },
  { id: 'brand-003', name: 'Staedtler' },
  { id: 'brand-004', name: 'Hervier' },
  { id: 'brand-005', name: 'Oxford' },
  { id: 'brand-006', name: 'Moleskine' },
];

export const DEFAULT_SUPPLIERS: PosSupplier[] = [
  { id: 'sup-001', name: 'Distributeur Lib' },
  { id: 'sup-002', name: 'ScolaJeux' },
  { id: 'sup-003', name: 'Papeterie Centrale' },
  { id: 'sup-004', name: 'Fournitures du Sud' },
];

export interface StockMovement {
  id: string;
  productId: string;
  type: 'AJOUT_MANUEL' | 'VENTE' | 'RETOUR' | 'INVENTAIRE' | 'APPROVISIONNEMENT';
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  reference: string;
  notes?: string;
  createdAt: string;
}

export interface ProductInput {
  reference?: string;
  name?: string;
  barcode?: string | null;
  isbn?: string | null;
  family?: 'Livre' | 'Fourniture' | 'Service';
  purchasePrice?: number;
  quantity?: number;
  sellingPrice?: number;
  categoryId?: string | null;
  brandId?: string | null;
  supplierId?: string | null;
  imageUrl?: string | null;
  minStock?: number;
  allowDuplicate?: boolean;
}

export interface ImportProductsResult {
  created: number;
  updated: number;
  duplicates: number;
}

export interface ProductImportConflict {
  kind: 'barcode' | 'reference' | 'isbn';
  rowIndex: number;
  existing?: PosProduct;
  incoming: ProductInput;
}

/** Renvoie si un produit est considéré comme « complet » (critères d'état). */
export function isProductComplete(product: PosProduct): boolean {
  return (
    !!product.barcode &&
    !!product.imageUrl &&
    product.sellingPrice > 0 &&
    product.purchasePrice > 0 &&
    product.quantity >= 0
  );
}

/** Renvoie les champs manquants d'un produit (état de complétude). */
export function getMissingProductFields(product: PosProduct): string[] {
  const missing: string[] = [];
  if (!product.reference) missing.push('Référence');
  if (!product.name) missing.push('Nom');
  if (product.purchasePrice <= 0) missing.push('Prix achat');
  if (product.sellingPrice <= 0) missing.push('Prix vente');
  if (product.quantity <= 0) missing.push('Stock');
  if (!product.barcode) missing.push('Code-barres');
  if (!product.imageUrl) missing.push('Image');
  return missing;
}

/** Normalise un en-tête Excel pour une correspondance de colonnes tolérante. */
export function normalizeHeader(value: string): string {
  return (value || '')
    .toString()
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const HEADER_ALIASES: Record<string, string[]> = {
  reference: ['reference', 'ref', 'code', 'code produit', 'code article'],
  barcode: ['code barre', 'code barres', 'code a barre', 'code a barres', 'ean', 'ean 13', 'ean13', 'upc', 'barcode', 'code barre isbn', 'code barres isbn', 'code barres / isbn', 'code barre / isbn'],
  isbn: ['isbn'],
  purchasePrice: ['prix achat unitaire', "prix d achat unitaire", 'prix d achat', 'prix achat', "cout d achat", 'prix achat u', 'achat'],
  sellingPrice: ['prix vente unitaire', 'prix de vente unitaire', 'prix de vente', 'prix vente', 'prix de vente u', 'vente', 'prix'],
  quantity: ['quantite', 'stock', 'qte', 'qt', 'quantite en stock', 'qty'],
};

export type ExcelField = keyof typeof HEADER_ALIASES;

/** Détecte le champ produit correspondant à un en-tête Excel, ou null. */
export function detectExcelField(header: string): ExcelField | null {
  const normalized = normalizeHeader(header);
  if (!normalized) return null;
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    if (aliases.includes(normalized)) return field as ExcelField;
  }
  // Correspondance partielle : une colonne contenant « prix achat » mais sans « unitaire »
  if (/prix.*achat/.test(normalized) && /total/.test(normalized)) return 'totalPurchase';
  if (/prix.*achat/.test(normalized)) return 'purchasePrice';
  if (/prix.*vente/.test(normalized)) return 'sellingPrice';
  return null;
}

function toNumberOptional(value: any): number | undefined {
  if (value === null || value === undefined || String(value).trim() === '') return undefined;
  if (typeof value === 'number') return isNaN(value) ? undefined : value;
  const cleaned = String(value).trim().replace(/\s/g, '');
  const parsed = parseFloat(cleaned.replace(/,/g, '.'));
  return isNaN(parsed) ? undefined : parsed;
}

function toCleanString(value: any): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function toCleanStringOptional(value: any): string | undefined {
  if (value === null || value === undefined) return undefined;
  const trimmed = String(value).trim();
  return trimmed === '' ? undefined : trimmed;
}

export class ProductService {
  private repository = productRepository;
  private callbacks: Array<() => void> = [];

  /** Injecte le jeu de données courant (posProducts d'AppContext). */
  setProducts(products: PosProduct[]): void {
    this.repository.setProducts(products);
  }

  subscribe(callback: () => void): () => void {
    this.callbacks.push(callback);
    return () => {
      this.callbacks = this.callbacks.filter(cb => cb !== callback);
    };
  }

  private notify(): void {
    this.callbacks.forEach(cb => cb());
  }

  // === REQUÊTES ===
  getProducts(): PosProduct[] {
    return this.repository.findAll();
  }

  getProductById(id: string): PosProduct | undefined {
    return this.repository.findById(id);
  }

  findProductByBarcode(barcode: string): PosProduct | undefined {
    return this.repository.findByBarcode(toCleanString(barcode));
  }

  findProductByReference(reference: string): PosProduct | undefined {
    return this.repository.findByReference(toCleanString(reference));
  }

  searchProducts(query: string): PosProduct[] {
    return this.repository.search(query);
  }

  getIncompleteProducts(): PosProduct[] {
    return this.repository.findAll().filter(p => !isProductComplete(p));
  }

  // === ÉCRITURE ===
  createProduct(data: ProductInput): PosProduct {
    let ref = toCleanString(data.reference || '') || ProductReference.generateFromName(data.name || 'Inconnu').toString();
    let barcode = toCleanStringOptional(data.barcode);
    let isbn = toCleanStringOptional(data.isbn);

    const existingByReference = this.repository.findByReference(ref);
    if (existingByReference) {
      if (data.allowDuplicate) {
        let suffix = 2;
        while (this.repository.findByReference(`${ref}-${suffix}`)) suffix++;
        ref = `${ref}-${suffix}`;
      } else {
        throw new Error('REFERENCE_DUPLICATE');
      }
    }

    const existingByBarcode = barcode ? this.repository.findByBarcode(barcode) : undefined;
    if (existingByBarcode) {
      if (data.allowDuplicate) {
        barcode = '';
      } else {
        throw new Error('BARCODE_DUPLICATE');
      }
    }

    const existingByIsbn = isbn ? this.repository.findByIsbn(isbn) : undefined;
    if (existingByIsbn) {
      if (data.allowDuplicate) {
        isbn = '';
      } else {
        throw new Error('ISBN_DUPLICATE');
      }
    }

    if (barcode && !Barcode.isValid(barcode)) throw new Error('INVALID_BARCODE');
    if (isbn && !Isbn.isValid(isbn)) throw new Error('INVALID_ISBN');

    const newProduct: PosProduct = {
      id: uuidv4(),
      reference: ref,
      name: toCleanString(data.name) || ref,
      barcode: barcode || undefined,
      isbn: isbn || undefined,
      family: data.family,
      categoryId: toCleanString(data.categoryId || '') || undefined,
      brandId: toCleanString(data.brandId || '') || undefined,
      supplierId: toCleanString(data.supplierId || '') || undefined,
      purchasePrice: data.purchasePrice || 0,
      sellingPrice: data.sellingPrice || 0,
      quantity: data.quantity || 0,
      minStock: (data.minStock !== undefined && data.minStock !== null && data.minStock > 0) ? data.minStock : 10,
      imageUrl: toCleanString(data.imageUrl || '') || undefined,
      status: 'Active',
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.repository.setProducts([...this.repository.findAll(), newProduct]);
    this.notify();
    return newProduct;
  }

  updateProduct(id: string, data: Partial<PosProduct>): PosProduct {
    const product = this.repository.findById(id);
    if (!product) throw new Error('PRODUCT_NOT_FOUND');

    if (data.barcode !== undefined && data.barcode !== product.barcode) {
      const clean = toCleanString(data.barcode);
      if (clean) {
        const conflict = this.repository.findAll().find(p => p.id !== id && p.barcode === clean);
        if (conflict) throw new Error('BARCODE_DUPLICATE');
      }
    }
    if (data.isbn !== undefined && data.isbn !== product.isbn) {
      const clean = toCleanString(data.isbn);
      if (clean) {
        const conflict = this.repository.findAll().find(p => p.id !== id && p.isbn === clean);
        if (conflict) throw new Error('ISBN_DUPLICATE');
      }
    }

    const updated: PosProduct = {
      ...product,
      ...data,
      barcode: data.barcode === undefined ? product.barcode : (toCleanString(data.barcode) || undefined),
      isbn: data.isbn === undefined ? product.isbn : (toCleanString(data.isbn) || undefined),
      updatedAt: new Date().toISOString(),
    };
    this.repository.setProducts(this.repository.findAll().map(p => (p.id === id ? updated : p)));
    this.notify();
    return updated;
  }

  deleteProduct(id: string): void {
    this.repository.setProducts(this.repository.findAll().filter(p => p.id !== id));
    this.notify();
  }

  updateProductBarcode(id: string, barcode: string | null): PosProduct {
    return this.updateProduct(id, { barcode: barcode || undefined });
  }

  updateProductImage(id: string, imageUrl: string | null): PosProduct {
    return this.updateProduct(id, { imageUrl: imageUrl || undefined });
  }

  /**
   * Import en masse avec détection de doublons.
   * Retourne un résumé (créés / mis à jour / doublons).
   */
  async importProducts(
    entries: ProductInput[],
    persistence: ProductPersistence,
    resolve: (conflict: ProductImportConflict) => 'ignore' | 'update' | 'create' = () => 'create'
  ): Promise<ImportProductsResult> {
    let created = 0;
    let updated = 0;
    let duplicates = 0;

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const barcode = toCleanString(entry.barcode || '');
      const reference = toCleanString(entry.reference || '');
      const isbn = toCleanString(entry.isbn || '');

      const existing = this.repository.findByBarcode(barcode) ||
        this.repository.findByReference(reference) ||
        (isbn ? this.repository.findByIsbn(isbn) : undefined);

      if (existing) {
        const decision = resolve({ kind: barcode ? 'barcode' : reference ? 'reference' : 'isbn', rowIndex: i, existing, incoming: entry });
        if (decision === 'ignore') {
          duplicates++;
          continue;
        }
        if (decision === 'update') {
          const updatedProduct = await this.updateProductAsync(existing.id, entry, persistence);
          if (updatedProduct) updated++;
          continue;
        }
        duplicates++;
        void persistence.create(this.buildProduct(entry));
        created++;
        continue;
      }

      const product = this.buildProduct(entry);
      await persistence.create(product);
      this.repository.setProducts([...this.repository.findAll(), product]);
      created++;
    }
    return { created, updated, duplicates };
  }

  private async updateProductAsync(id: string, entry: ProductInput, persistence: ProductPersistence): Promise<PosProduct | null> {
    const current = this.repository.findById(id);
    if (!current) return null;
    const patches: Partial<PosProduct> = {
      updatedAt: new Date().toISOString(),
    };
    if (entry.reference !== undefined) patches.reference = entry.reference;
    if (entry.barcode !== undefined) patches.barcode = entry.barcode === null ? undefined : entry.barcode;
    if (entry.isbn !== undefined) patches.isbn = entry.isbn === null ? undefined : entry.isbn;
    if (entry.purchasePrice !== undefined) patches.purchasePrice = entry.purchasePrice;
    if (entry.sellingPrice !== undefined) patches.sellingPrice = entry.sellingPrice;
    // if (entry.quantity !== undefined) patches.quantity = entry.quantity; // Stock must not be overwritten on catalogue update
    
    const updated = { ...current, ...patches };
    this.repository.setProducts(this.repository.findAll().map(p => (p.id === id ? updated : p)));
    await persistence.update(id, patches);
    return updated;
  }

  private buildProduct(entry: ProductInput): PosProduct {
    const ref = toCleanString(entry.reference || '') || ProductReference.generateFromName(entry.name || 'Inconnu').toString();
    const barcode = entry.barcode || undefined;
    const isbn = entry.isbn || undefined;
    return {
      id: uuidv4(),
      reference: ref,
      name: toCleanString(entry.name || '') || ref,
      barcode,
      isbn,
      family: entry.family,
      categoryId: toCleanString(entry.categoryId || '') || undefined,
      brandId: toCleanString(entry.brandId || '') || undefined,
      supplierId: toCleanString(entry.supplierId || '') || undefined,
      purchasePrice: entry.purchasePrice !== undefined ? entry.purchasePrice : 0,
      sellingPrice: entry.sellingPrice !== undefined ? entry.sellingPrice : 0,
      quantity: entry.quantity !== undefined ? entry.quantity : 0,
      minStock: (entry.minStock !== undefined && entry.minStock !== null && entry.minStock > 0) ? entry.minStock : 10,
      imageUrl: toCleanString(entry.imageUrl || '') || undefined,
      status: 'Active',
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  // === STOCK ===
  calculateStockMovement(product: PosProduct, type: StockMovement['type'], quantity: number): StockMovement {
    return {
      id: uuidv4(),
      productId: product.id,
      type,
      quantity,
      unitPrice: product.purchasePrice,
      totalAmount: product.purchasePrice * quantity,
      reference: `MVT-${Date.now()}`,
      createdAt: new Date().toISOString(),
    };
  }

  // === EXCEL ===
  generateExcelTemplate(): Blob {
    const headers = [
      'REFERENCE',
      'CODE-BARRES / ISBN',
      'PRIX D\'ACHAT UNITAIRE',
      'QUANTITE',
      'PRIX DE VENTE UNITAIRE',
    ];

    const csvContent = [
      headers.join('\t'),
      'Exemple Produit\t1234567890123\t1000\t10\t1500',
      '\t\t\t\t\t',
      'CONSEIL :',
      '- La colonne REFERENCE correspond au nom du produit',
      '- Le Code-barres doit être unique',
      '- Le ISBN doit être unique',
      '- Les colonnes PRIX D\'ACHAT TOTAL, MARGE, etc. sont calculées automatiquement',
      '- Utilisez le bouton "Télécharger le modèle Excel" pour obtenir un modèle pré-formaté',
    ].join('\n');

    return new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
  }

  /**
   * Mappe une ligne Excel (colonnes déjà normalisées) vers les champs produit.
   * Accepte les en-têtes « STOCK LIBRAIRIE ET PRIX.xlsx » :
   * CODE BARRE / REFERENCE / PRIX D'ACHAT UNITAIRE / QUANTITE / PRIX DE VENTE UNITAIRE
   */
  mapExcelRow(row: Record<string, any>): {
    reference: string | undefined;
    barcode: string | undefined;
    isbn: string | undefined;
    purchasePrice: number | undefined;
    sellingPrice: number | undefined;
    quantity: number | undefined;
    columnMapping: Partial<Record<ExcelField, string>>;
  } {
    const columnMapping: Partial<Record<ExcelField, string>> = {};
    const byField: Partial<Record<ExcelField, string>> = {};

    for (const header of Object.keys(row)) {
      const field = detectExcelField(header);
      if (!field || byField[field] !== undefined) continue;
      byField[field] = header;
      columnMapping[field] = header;
    }

    const get = (field: ExcelField): any => {
      const header = byField[field];
      return header ? row[header] : undefined;
    };

    const reference = toCleanStringOptional(get('reference'));
    let barcode = toCleanStringOptional(get('barcode'));
    let isbn = toCleanStringOptional(get('isbn'));

    // Séparation ISBN / code-barres : un code valide ISBN va en isbn, sinon en barcode
    if (!isbn && barcode && Isbn.isValid(barcode)) {
      isbn = barcode;
      barcode = undefined;
    }

    const purchasePrice = toNumberOptional(get('purchasePrice'));
    const quantity = toNumberOptional(get('quantity'));
    const sellingPrice = toNumberOptional(get('sellingPrice'));

    return {
      reference,
      barcode,
      isbn,
      purchasePrice,
      sellingPrice,
      quantity,
      columnMapping,
    };
  }
}

export const productService = new ProductService();