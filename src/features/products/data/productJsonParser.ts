import type { PosProduct } from '../../../context/AppContext';
import type { ImportAnalysis, MappedExcelProduct } from '../services/ExcelImportService';

export interface ProductImportRow {
  name: string | null;
  barcode: string | null;
  reference: string | null;
  purchasePrice: number | null;
  quantity: number;
  sellingPrice: number | null;
}

export function parseString(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  const str = String(value).trim();
  return str === '' ? null : str;
}

export function parsePrice(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  const str = String(value).trim().replace(/\s/g, '');
  if (!str) {
    return null;
  }
  const num = Number(str.replace(/,/g, '.'));
  return Number.isFinite(num) ? num : null;
}

export function parseQuantity(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === '') {
    return 0;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? Math.floor(value) : 0;
  }
  const str = String(value).trim().replace(/\s/g, '');
  if (!str) {
    return 0;
  }
  const num = Number(str.replace(/,/g, '.'));
  return Number.isFinite(num) ? Math.floor(num) : 0;
}

export function normalizeBarcode(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const str = String(value).trim();
  return str === '' ? null : str;
}

export function normalizeReference(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const str = String(value).trim();
  return str === '' ? null : str;
}

function parseCSVLine(line: string, delimiter: string = ';'): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === delimiter) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
  }
  result.push(current);
  return result;
}

export function parseProductsJson(jsonData: unknown[]): ProductImportRow[] {
  const rows: ProductImportRow[] = [];

  for (const item of jsonData) {
    if (!item || typeof item !== 'object') {
      continue;
    }

    const record = item as Record<string, unknown>;
    const keys = Object.keys(record);
    if (keys.length === 0) {
      continue;
    }

    let name: string | null = null;
    let barcode: string | null = null;
    let reference: string | null = null;
    let purchasePrice: number | null = null;
    let quantity: number = 0;
    let sellingPrice: number | null = null;

    // Format 1: Native JSON
    if (
      'name' in record ||
      'nom' in record ||
      'reference' in record ||
      'barcode' in record ||
      'quantity' in record ||
      'purchasePrice' in record ||
      'sellingPrice' in record
    ) {
      name = parseString(record.name) || parseString(record.nom) || 'Produit sans nom';
      barcode = normalizeBarcode(record.barcode as string);
      reference = normalizeReference(record.reference as string);
      purchasePrice = parsePrice(record.purchasePrice as any);
      quantity = parseQuantity(record.quantity as any);
      sellingPrice = parsePrice(record.sellingPrice as any);
    } 
    // Format 2: CSV wrapped in a single key JSON object
    else {
      const key = keys[0];
      const valueStr = record[key];

      if (typeof valueStr !== 'string') {
        continue;
      }

      const headers = parseCSVLine(key);
      const parts = parseCSVLine(valueStr);
      
      const getIndex = (possibleNames: string[]) => {
        return headers.findIndex(h => possibleNames.some(p => h.toUpperCase().includes(p)));
      };

      const nameIdx = getIndex(['NOM', 'DESIGNATION', 'ARTICLE', 'REFERENCE']);
      const barcodeIdx = getIndex(['CODE BARRE', 'CODE-BARRES', 'EAN', 'ISBN']);
      const refIdx = getIndex(['REF ', 'SKU']); // Try to find a distinct ref column
      const purchaseIdx = getIndex(['ACHAT', 'REVIENT', 'P.A']);
      const qtyIdx = getIndex(['QUANTITE', 'STOCK', 'QTE']);
      const sellingIdx = getIndex(['VENTE', 'P.V']);

      name = nameIdx >= 0 ? parseString(parts[nameIdx]) || 'Produit sans nom' : 'Produit sans nom';
      barcode = barcodeIdx >= 0 ? normalizeBarcode(parts[barcodeIdx]) : null;
      // If the 'REFERENCE' column was used for the name, we shouldn't use it for the reference as well, unless we want to
      reference = refIdx >= 0 && refIdx !== nameIdx ? normalizeReference(parts[refIdx]) : null;
      
      purchasePrice = purchaseIdx >= 0 ? parsePrice(parts[purchaseIdx]) : null;
      quantity = qtyIdx >= 0 ? parseQuantity(parts[qtyIdx]) : 0;
      sellingPrice = sellingIdx >= 0 ? parsePrice(parts[sellingIdx]) : null;
    }

    if (!reference && !barcode && !name) {
      continue;
    }

    rows.push({
      name,
      barcode,
      reference,
      purchasePrice,
      quantity,
      sellingPrice,
    });
  }

  return rows;
}

export function analyzeJsonImport(
  parsedRows: ProductImportRow[],
  posProducts: PosProduct[],
  filename: string
): ImportAnalysis {
  let validCount = 0;
  let invalidCount = 0;
  let newCount = 0;
  let updateCount = 0;
  let duplicateCount = 0;
  let missingBarcodeCount = 0;
  let missingPurchasePriceCount = 0;
  let missingSellingPriceCount = 0;
  let missingStockCount = 0;

  const items: MappedExcelProduct[] = [];
  const seenRefs = new Set<string>();
  const seenBarcodes = new Set<string>();

  parsedRows.forEach((row, index) => {
    const mapped = {
      name: row.name ?? 'Produit sans nom',
      barcode: row.barcode ?? '',
      isbn: '',
      reference: row.reference ?? '',
      purchasePrice: row.purchasePrice ?? 0,
      quantity: row.quantity,
      sellingPrice: row.sellingPrice ?? 0,
      columnMapping: {}
    } as any;

    const validation = { valid: true, errors: [] as string[], warnings: [] as string[] };
    let action: 'create' | 'update' | 'ignore' = 'create';
    let conflict: MappedExcelProduct['conflict'] = undefined;

    if (!mapped.reference && mapped.name) {
      mapped.reference = mapped.name;
    }

    if (!mapped.reference && mapped.barcode) {
      mapped.reference = mapped.barcode;
    }

    if (mapped.barcode && seenBarcodes.has(mapped.barcode)) {
      validation.valid = false;
      validation.errors.push("Doublon de code-barres dans le fichier");
      conflict = { kind: 'within-file' };
    }
    
    if (mapped.reference && seenRefs.has(mapped.reference.toLowerCase())) {
      validation.valid = false;
      validation.errors.push("Doublon de référence dans le fichier");
      conflict = { kind: 'within-file' };
    }

    if (!mapped.barcode) {
      validation.warnings.push("Code-barres manquant");
      missingBarcodeCount++;
    }
    if (mapped.purchasePrice === undefined) {
      validation.warnings.push("Prix d'achat manquant");
      missingPurchasePriceCount++;
    }
    if (mapped.sellingPrice === undefined) {
      validation.warnings.push("Prix de vente manquant");
      missingSellingPriceCount++;
    }
    if (!mapped.quantity) {
      validation.warnings.push("Stock à 0");
      missingStockCount++;
    }

    if (validation.valid) {
      let existing: PosProduct | undefined;
      
      if (mapped.barcode) {
        existing = posProducts.find(p => p.barcode === mapped.barcode);
        if (existing) conflict = { kind: 'barcode', existing };
      }
      
      if (!existing && mapped.reference) {
        existing = posProducts.find(p => p.reference.toLowerCase() === mapped.reference!.toLowerCase());
        if (existing) conflict = { kind: 'reference', existing };
      }

      if (existing) {
        action = 'update';
        updateCount++;
      } else {
        action = 'create';
        newCount++;
      }
      
      if (mapped.barcode) seenBarcodes.add(mapped.barcode);
      if (mapped.reference) seenRefs.add(mapped.reference.toLowerCase());
      
      validCount++;
    } else {
      action = 'ignore';
      invalidCount++;
      if (conflict?.kind === 'within-file') {
        duplicateCount++;
      }
    }

    items.push({
      index,
      rowNumber: index + 1,
      mapped,
      validation,
      conflict,
      action
    });
  });

  return {
    filename,
    sheet: 'JSON',
    totalRows: parsedRows.length,
    validCount,
    invalidCount,
    newCount,
    updateCount,
    duplicateCount,
    missingBarcodeCount,
    missingPurchasePriceCount,
    missingSellingPriceCount,
    missingStockCount,
    items
  };
}
