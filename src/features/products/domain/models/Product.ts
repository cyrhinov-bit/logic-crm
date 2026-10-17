export interface ProductCompletion {
  id: string;
  productId: string;
  missingField: 'family' | 'category' | 'brand' | 'supplier' | 'image' | 'description' | 'minStock';
  currentValue: string;
  suggestedValue: string;
  createdAt: string;
}

export interface ImportSession {
  id: string;
  filename: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  totalRows: number;
  processedRows: number;
  successfulCreations: number;
  successfulUpdates: number;
  ignoredRows: number;
  errors: ImportError[];
  createdAt: string;
  completedAt?: string;
}

export interface ImportError {
  row: number;
  field: string;
  value: string;
  error: string;
  severity: 'error' | 'warning';
}

export interface ImportReport {
  session: ImportSession;
  productsCreated: number;
  productsUpdated: number;
  productsIgnored: number;
  brandsCreated: number;
  suppliersCreated: number;
  totalErrors: number;
  totalWarnings: number;
  importDurationMs: number;
}

export interface ProductCompletionFilters {
  noFamily: boolean;
  noCategory: boolean;
  noBrand: boolean;
  noSupplier: boolean;
  noImage: boolean;
  noBarcode: boolean;
  noIsbn: boolean;
  minStockExceeded: boolean;
}