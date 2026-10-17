import * as XLSX from 'xlsx';
import type {
  PosProduct,
  ImportSession,
  ImportError,
  ImportReport,
} from '../../../context/AppContext';
import { productService } from './ProductService';

interface ExcelRow {
  [key: string]: any;
}

export interface ExcelSheetInfo {
  name: string;
  rowCount: number;
}

export interface FilePreview {
  filename: string;
  fileSize: string;
  rowCount: number;
  headers: string[];
  sheets: ExcelSheetInfo[];
}

export interface MappedExcelProduct {
  index: number;
  rowNumber: number;
  mapped: ReturnType<typeof productService.mapExcelRow>;
  validation: {
    valid: boolean;
    errors: string[];
    warnings: string[];
  };
  conflict?: {
    kind: 'barcode' | 'reference' | 'isbn' | 'within-file';
    existing?: PosProduct;
  };
  action: 'create' | 'update' | 'ignore';
}

export interface ImportAnalysis {
  filename: string;
  sheet: string;
  totalRows: number;
  validCount: number;
  invalidCount: number;
  newCount: number;
  updateCount: number;
  duplicateCount: number;
  missingBarcodeCount: number;
  missingPurchasePriceCount: number;
  missingSellingPriceCount: number;
  missingStockCount: number;
  items: MappedExcelProduct[];
}

/**
 * Colonnes réellement prises en charge par l'import.
 *
 * IMPORTANT :
 * - Pas de famille
 * - Pas de catégorie
 * - Pas de nom
 * - Pas de marque
 * - Pas de fournisseur
 * - Pas d'image
 */
const RECOGNIZED_KEYS = [
  'REFERENCE',
  'CODE-BARRES / ISBN',
  'CODE-BARRES',
  'ISBN',
  'PRIX D\'ACHAT UNITAIRE',
  'QUANTITE',
  'PRIX DE VENTE UNITAIRE',
];

export class ExcelImportService {
  private isSpreadsheet(file: File): boolean {
    return /\.(xlsx|xls|xlsm)$/i.test(file.name);
  }

  async listSheets(file: File): Promise<ExcelSheetInfo[]> {
    if (!this.isSpreadsheet(file)) {
      return [];
    }

    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data, { type: 'array' });

    return workbook.SheetNames.map(name => {
      const sheet = workbook.Sheets[name];
      const range = sheet['!ref'];

      const rowCount = range
        ? XLSX.utils.decode_range(range).e.r
        : 0;

      return {
        name,
        rowCount: Math.max(0, rowCount),
      };
    });
  }

  private async parseSpreadsheet(
    file: File,
    sheetName?: string
  ): Promise<{
    headers: string[];
    rows: ExcelRow[];
    sheet: string;
  }> {
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data, {
      type: 'array',
    });

    const name =
      sheetName && workbook.SheetNames.includes(sheetName)
        ? sheetName
        : workbook.SheetNames[0];

    if (!name) {
      throw new Error('Le fichier ne contient aucune feuille');
    }

    const sheet = workbook.Sheets[name];

    const json = XLSX.utils.sheet_to_json<Record<string, any>>(
      sheet,
      {
        defval: '',
        raw: false,
      }
    );

    if (json.length === 0) {
      return {
        headers: [],
        rows: [],
        sheet: name,
      };
    }

    const headers = Object.keys(json[0]).map(header =>
      header.trim()
    );

    const rows: ExcelRow[] = json.map(row => {
      const clean: ExcelRow = {};

      headers.forEach(header => {
        const value = row[header];

        clean[header] =
          value === null ||
          value === undefined ||
          String(value).trim() === ''
            ? ''
            : value;
      });

      return clean;
    });

    return {
      headers,
      rows,
      sheet: name,
    };
  }

  private detectDelimiter(lines: string[]): string {
    const candidates = [';', ',', '\t'];

    const counts = candidates.map(delimiter => ({
      delimiter,
      count: lines
        .slice(0, 5)
        .reduce(
          (acc, line) =>
            acc + (line.split(delimiter).length - 1),
          0
        ),
    }));

    counts.sort((a, b) => b.count - a.count);

    return counts[0].count > 0
      ? counts[0].delimiter
      : ',';
  }

  private parseCSVLines(text: string): string[][] {
    const cleaned = text.replace(/^\uFEFF/, '');

    const lines = cleaned
      .split(/\r?\n/)
      .filter(line => line.trim() !== '');

    if (lines.length === 0) {
      return [];
    }

    const delimiter = this.detectDelimiter(lines);

    const parseLine = (line: string): string[] => {
      const cells: string[] = [];
      let current = '';
      let inQuotes = false;

      for (let i = 0; i < line.length; i++) {
        const ch = line[i];

        if (inQuotes) {
          if (ch === '"') {
            if (line[i + 1] === '"') {
              current += '"';
              i++;
            } else {
              inQuotes = false;
            }
          } else {
            current += ch;
          }
        } else if (ch === '"') {
          inQuotes = true;
        } else if (ch === delimiter) {
          cells.push(current.trim());
          current = '';
        } else {
          current += ch;
        }
      }

      cells.push(current.trim());

      return cells;
    };

    return lines.map(parseLine);
  }

  private async parseCSV(
    file: File
  ): Promise<{
    headers: string[];
    rows: ExcelRow[];
    sheet: string;
  }> {
    const text = await file.text();

    const cells = this.parseCSVLines(text);

    if (cells.length === 0) {
      return {
        headers: [],
        rows: [],
        sheet: '',
      };
    }

    const headers = cells[0].map(header =>
      header.replace(/"/g, '').trim()
    );

    const rows: ExcelRow[] = [];

    for (let i = 1; i < cells.length; i++) {
      const row: ExcelRow = {};

      headers.forEach((header, index) => {
        row[header] = cells[i][index] ?? '';
      });

      rows.push(row);
    }

    return {
      headers,
      rows,
      sheet: '',
    };
  }

  /**
   * Une ligne est considérée comme vide uniquement
   * si aucune donnée n'est présente dans les colonnes
   * réellement utilisées par l'import.
   */
  private isBlankRow(row: ExcelRow): boolean {
    return RECOGNIZED_KEYS.every(key => {
      const value = row[key];

      return (
        value === undefined ||
        value === null ||
        String(value).trim() === ''
      );
    });
  }

  async parseFile(
    file: File,
    sheetName?: string
  ): Promise<{
    headers: string[];
    rows: ExcelRow[];
    sheet: string;
  }> {
    const parsed = this.isSpreadsheet(file)
      ? await this.parseSpreadsheet(file, sheetName)
      : await this.parseCSV(file);

    parsed.rows = parsed.rows.filter(
      row => !this.isBlankRow(row)
    );

    return parsed;
  }

  async previewFile(
    file: File,
    sheetName?: string
  ): Promise<FilePreview> {
    const sheets = await this.listSheets(file);

    const {
      headers,
      rows,
    } = await this.parseFile(file, sheetName);

    return {
      filename: file.name,
      fileSize: `${(file.size / 1024).toFixed(2)} Ko`,
      rowCount: rows.length,
      headers,
      sheets,
    };
  }

  /**
   * Analyse le fichier avant import.
   *
   * Règles :
   * - référence absente = warning uniquement
   * - prix/stock absents = warning uniquement
   * - code-barres/ISBN absent = warning uniquement
   * - valeur 0 = valide
   * - valeur négative = erreur bloquante
   * - cellule vide = undefined
   * - cellule vide ne provoque jamais de doublon
   */
  async analyzeFile(
    file: File,
    existingProducts: PosProduct[],
    sheetName?: string
  ): Promise<ImportAnalysis> {
    const {
      rows,
      sheet,
    } = await this.parseFile(file, sheetName);

    productService.setProducts(existingProducts);

    const items: MappedExcelProduct[] = [];

    const seenBarcodes = new Set<string>();
    const seenReferences = new Set<string>();
    const seenIsbn = new Set<string>();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];

      // Ligne Excel réelle : +2 car ligne 1 = en-têtes.
      const rowNumber = i + 2;

      const mapped = productService.mapExcelRow(row);

      const errors: string[] = [];
      const warnings: string[] = [];

      /*
       * ============================================================
       * VALIDATION
       * ============================================================
       */

      if (!mapped.reference) {
        warnings.push(
          'Référence manquante — pourra être complétée ultérieurement'
        );
      }

      if (
        mapped.purchasePrice !== undefined &&
        mapped.purchasePrice < 0
      ) {
        errors.push(
          'Prix d\'achat invalide (négatif)'
        );
      }

      if (
        mapped.sellingPrice !== undefined &&
        mapped.sellingPrice < 0
      ) {
        errors.push(
          'Prix de vente invalide (négatif)'
        );
      }

      if (
        mapped.quantity !== undefined &&
        (
          isNaN(mapped.quantity) ||
          mapped.quantity < 0
        )
      ) {
        errors.push(
          'Quantité invalide (négative)'
        );
      }

      /*
       * ============================================================
       * DOUBLONS INTRA-FICHIER
       * ============================================================
       */

      let withinFileDuplicate = false;

      if (mapped.barcode) {
        if (seenBarcodes.has(mapped.barcode)) {
          errors.push(
            'Code-barres en double dans le fichier'
          );
          withinFileDuplicate = true;
        } else {
          seenBarcodes.add(mapped.barcode);
        }
      }

      if (mapped.isbn) {
        if (seenIsbn.has(mapped.isbn)) {
          errors.push(
            'ISBN en double dans le fichier'
          );
          withinFileDuplicate = true;
        } else {
          seenIsbn.add(mapped.isbn);
        }
      }

      if (mapped.reference) {
        if (seenReferences.has(mapped.reference)) {
          errors.push(
            'Référence en double dans le fichier'
          );
          withinFileDuplicate = true;
        } else {
          seenReferences.add(mapped.reference);
        }
      }

      /*
       * ============================================================
       * CONFLIT AVEC LE CATALOGUE EXISTANT
       * ============================================================
       */

      let conflict:
        | {
            kind:
              | 'barcode'
              | 'reference'
              | 'isbn';
            existing: PosProduct;
          }
        | undefined;

      if (mapped.barcode) {
        const existing = existingProducts.find(
          product =>
            product.barcode &&
            product.barcode === mapped.barcode
        );

        if (existing) {
          conflict = {
            kind: 'barcode',
            existing,
          };
        }
      }

      if (!conflict && mapped.reference) {
        const existing = existingProducts.find(
          product =>
            product.reference === mapped.reference
        );

        if (existing) {
          conflict = {
            kind: 'reference',
            existing,
          };
        }
      }

      if (!conflict && mapped.isbn) {
        const existing = existingProducts.find(
          product =>
            product.isbn &&
            product.isbn === mapped.isbn
        );

        if (existing) {
          conflict = {
            kind: 'isbn',
            existing,
          };
        }
      }

      /*
       * ============================================================
       * WARNINGS POUR DONNÉES MANQUANTES
       * ============================================================
       */

      if (!mapped.barcode && !mapped.isbn) {
        warnings.push(
          'Code-barres / ISBN manquant'
        );
      }

      if (mapped.purchasePrice === undefined) {
        warnings.push(
          'Prix d\'achat manquant'
        );
      }

      if (mapped.sellingPrice === undefined) {
        warnings.push(
          'Prix de vente manquant'
        );
      }

      if (mapped.quantity === undefined) {
        warnings.push(
          'Quantité manquante'
        );
      }

      const valid = errors.length === 0;

      /*
       * Une ligne avec un doublon intra-fichier est ignorée.
       *
       * Un produit déjà présent dans le catalogue est
       * considéré comme une mise à jour.
       */
      const action: 'create' | 'update' | 'ignore' =
        !valid || withinFileDuplicate
          ? 'ignore'
          : conflict
            ? 'update'
            : 'create';

      items.push({
        index: i,
        rowNumber,
        mapped,
        validation: {
          valid,
          errors,
          warnings,
        },
        conflict,
        action,
      });
    }

    const validItems = items.filter(
      item => item.validation.valid
    );

    const missingPurchasePriceCount =
      validItems.filter(
        item =>
          item.mapped.purchasePrice === undefined
      ).length;

    const missingSellingPriceCount =
      validItems.filter(
        item =>
          item.mapped.sellingPrice === undefined
      ).length;

    const missingStockCount =
      validItems.filter(
        item =>
          item.mapped.quantity === undefined
      ).length;

    const missingBarcodeCount =
      validItems.filter(
        item =>
          !item.mapped.barcode &&
          !item.mapped.isbn
      ).length;

    const duplicateCount =
      items.filter(item =>
        item.validation.errors.some(error =>
          error.includes('double')
        )
      ).length;

    const newCount =
      validItems.filter(
        item => item.action === 'create'
      ).length;

    const updateCount =
      validItems.filter(
        item => item.action === 'update'
      ).length;

    return {
      filename: file.name,
      sheet,

      totalRows: items.length,

      validCount: validItems.length,

      invalidCount:
        items.length - validItems.length,

      newCount,

      updateCount,

      duplicateCount,

      missingBarcodeCount,

      missingPurchasePriceCount,

      missingSellingPriceCount,

      missingStockCount,

      items,
    };
  }

  async importExcel(
    file: File,
    existingProducts: PosProduct[],
    analyzedItems: MappedExcelProduct[],
    addProduct: (
      product: PosProduct,
      mode: 'create' | 'update'
    ) => Promise<void>,
    createSession: (
      session: ImportSession
    ) => Promise<void>,
    updateSession: (
      session: ImportSession
    ) => Promise<void>,
    addImportError: (
      error: ImportError
    ) => Promise<void>
  ): Promise<ImportReport> {
    productService.setProducts(existingProducts);

    const startTime = Date.now();

    const sessionId = crypto.randomUUID();

    const filename = file.name;

    let session: ImportSession = {
      id: sessionId,
      filename,
      status: 'in_progress',

      totalRows: analyzedItems.length,

      processedRows: 0,

      successfulCreations: 0,

      successfulUpdates: 0,

      ignoredRows: 0,

      errors: [],

      createdAt: new Date().toISOString(),
    };

    await createSession(session);

    let productsCreated = 0;
    let productsUpdated = 0;
    let ignoredRows = 0;

    const errors: ImportError[] = [];

    const pushError = async (
      row: number,
      field: string,
      value: string,
      error: string,
      severity: 'error' | 'warning' = 'error'
    ) => {
      const importError: ImportError = {
        row,
        field,
        value,
        error,
        severity,
      };

      errors.push(importError);

      await addImportError(importError);
    };

    /*
     * ============================================================
     * TRAITEMENT DES LIGNES
     * ============================================================
     */

    for (const item of analyzedItems) {
      const { mapped } = item;

      /*
       * ------------------------------------------------------------
       * WARNINGS
       * ------------------------------------------------------------
       */

      for (const warning of item.validation.warnings) {
        await pushError(
          item.rowNumber,
          'Ligne',
          mapped.reference || 'Inconnu',
          warning,
          'warning'
        );
      }

      /*
       * ------------------------------------------------------------
       * ERREURS BLOQUANTES
       * ------------------------------------------------------------
       */

      if (!item.validation.valid) {
        ignoredRows++;

        for (const errorMessage of item.validation.errors) {
          await pushError(
            item.rowNumber,
            'Ligne',
            mapped.reference || 'Inconnu',
            errorMessage,
            'error'
          );
        }

        session = {
          ...session,

          processedRows:
            session.processedRows + 1,

          ignoredRows,
        };

        await updateSession(session);

        continue;
      }

      /*
       * ------------------------------------------------------------
       * DOUBLON INTRA-FICHIER
       * ------------------------------------------------------------
       */

      if (item.action === 'ignore') {
        ignoredRows++;

        session = {
          ...session,

          processedRows:
            session.processedRows + 1,

          ignoredRows,
        };

        await updateSession(session);

        continue;
      }

      /*
       * ============================================================
       * UPDATE D'UN PRODUIT EXISTANT
       * ============================================================
       */

      if (item.conflict && item.action === 'update') {
        const existing = existingProducts.find(
          product =>
            product.id ===
            item.conflict?.existing?.id
        );

        if (!existing) {
          ignoredRows++;

          await pushError(
            item.rowNumber,
            'Général',
            mapped.reference || 'Inconnu',
            'Produit existant introuvable pour la mise à jour'
          );

          session = {
            ...session,

            processedRows:
              session.processedRows + 1,

            ignoredRows,
          };

          await updateSession(session);

          continue;
        }

        /*
         * IMPORTANT :
         *
         * undefined = cellule vide → conserver l'ancien contenu
         *
         * 0 = vraie valeur → remplacer l'ancien contenu par 0
         */

        const updatedProduct: PosProduct = {
          ...existing,

          reference:
            mapped.reference !== undefined
              ? mapped.reference
              : existing.reference,

          barcode:
            mapped.barcode !== undefined
              ? mapped.barcode
              : existing.barcode,

          isbn:
            mapped.isbn !== undefined
              ? mapped.isbn
              : existing.isbn,

          purchasePrice:
            mapped.purchasePrice !== undefined
              ? mapped.purchasePrice
              : existing.purchasePrice,

          sellingPrice:
            mapped.sellingPrice !== undefined
              ? mapped.sellingPrice
              : existing.sellingPrice,

          // F4 : un import ne pilote JAMAIS le stock — la quantité du fichier est
          // ignorée en update (le stock réel vit dans ventes/entrées/inventaires).
          // Un ajustement volontaire passe par entrée ou inventaire tracé.
          quantity: existing.quantity,

          updatedAt:
            new Date().toISOString(),
        };

        try {
          await addProduct(
            updatedProduct,
            'update'
          );

          productsUpdated++;
        } catch (error) {
          ignoredRows++;

          await pushError(
            item.rowNumber,
            item.conflict.kind.toUpperCase(),
            mapped.reference || 'Inconnu',
            error instanceof Error
              ? error.message
              : 'Erreur de mise à jour'
          );
        }

        session = {
          ...session,

          processedRows:
            session.processedRows + 1,

          successfulUpdates:
            productsUpdated,

          ignoredRows,
        };

        await updateSession(session);

        continue;
      }

      /*
       * ============================================================
       * CRÉATION D'UN NOUVEAU PRODUIT
       * ============================================================
       */

      try {
        /*
         * Un produit incomplet est autorisé.
         * Les champs manquants pourront être complétés
         * ultérieurement dans le catalogue.
         */
        const newProduct =
          this.buildProductFromMapped(
            mapped,
            false
          );

        await addProduct(
          newProduct,
          'create'
        );

        productsCreated++;
      } catch (error) {
        ignoredRows++;

        await pushError(
          item.rowNumber,
          'Général',
          mapped.reference || 'Inconnu',
          error instanceof Error
            ? error.message
            : 'Erreur de création'
        );
      }

      session = {
        ...session,

        processedRows:
          session.processedRows + 1,

        successfulCreations:
          productsCreated,

        ignoredRows,
      };

      await updateSession(session);
    }

    /*
     * ============================================================
     * FIN DE SESSION
     * ============================================================
     */

    session = {
      ...session,

      status: 'completed',

      completedAt:
        new Date().toISOString(),

      successfulCreations:
        productsCreated,

      successfulUpdates:
        productsUpdated,

      ignoredRows,

      errors,
    };

    await updateSession(session);

    /*
     * ============================================================
     * RAPPORT FINAL
     * ============================================================
     */

    return {
      session,

      productsCreated,

      productsUpdated,

      productsIgnored:
        ignoredRows,

      brandsCreated: 0,

      suppliersCreated: 0,

      totalErrors:
        errors.filter(
          error =>
            error.severity === 'error'
        ).length,

      totalWarnings:
        errors.filter(
          error =>
            error.severity === 'warning'
        ).length,

      importDurationMs:
        Date.now() - startTime,
    };
  }

  /**
   * Construit un produit à partir des données Excel.
   *
   * Aucun champ famille/catégorie/nom n'est importé.
   *
   * Les champs manquants sont laissés à ProductService
   * qui doit fournir les valeurs par défaut appropriées.
   */
  private buildProductFromMapped(
    mapped: ReturnType<
      typeof productService.mapExcelRow
    >,
    allowDuplicate: boolean
  ): PosProduct {
    const result =
      productService.createProduct({
        reference:
          mapped.reference,

        barcode:
          mapped.barcode,

        isbn:
          mapped.isbn,

        purchasePrice:
          mapped.purchasePrice,

        quantity:
          mapped.quantity,

        sellingPrice:
          mapped.sellingPrice,

        allowDuplicate,
      });

    if (!result.imageUrl) {
      result.imageUrl = '';
    }

    return result;
  }
}

export const excelImportService =
  new ExcelImportService();