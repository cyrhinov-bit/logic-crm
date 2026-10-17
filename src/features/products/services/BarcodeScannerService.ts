import type { PosProduct } from '../../../context/AppContext';
import { Barcode, Isbn } from '../domain/value-objects/ValueObjects';

export interface ScanResult {
  products: PosProduct[];
  barcode?: string;
  isbn?: string;
  scanned: boolean;
  error?: string;
}

export class BarcodeScannerService {
  private scanBuffer: string[] = [];
  private keyTimestamps: number[] = [];
  private lastInputTime: number = 0;
  private isScanning: boolean = false;
  private listeners: Array<(barcode: string) => void> = [];
  private keydownListener: ((e: KeyboardEvent) => void) | null = null;
  private scannerDetected: boolean = false;
  private scannerStateListeners: Array<(detected: boolean) => void> = [];

  private static isNumericBarcode(code: string): boolean {
    return /^\d+$/.test(code.replace(/[^0-9]/g, ''));
  }

  public static cleanBarcodeData(raw: string): string {
    let cleaned = raw.trim();

    // Mappage des touches de la rangée supérieure AZERTY sans Shift (comportement fréquent des douchettes USB)
    const azertyMap: Record<string, string> = {
      '&': '1', 'é': '2', '"': '3', "'": '4', '(': '5',
      '-': '6', 'è': '7', '_': '8', 'ç': '9', 'à': '0',
      '°': ')', '+': '='
    };

    cleaned = cleaned.split('').map(char => azertyMap[char] || char).join('');

    // Suppression des caractères non-imprimables / de contrôle (STX, ETX, NUL, etc.)
    return cleaned.replace(/[^\x20-\x7E]/g, '').trim();
  }

  private static normalizeCode(code?: string): string {
    if (!code) return '';
    return code.replace(/[-\s]/g, '').toLowerCase();
  }

  startKeyboardListener(): void {
    if (this.keydownListener) return;

    this.keydownListener = (e: KeyboardEvent) => {
      const now = Date.now();
      const timeSinceLast = now - this.lastInputTime;

      // Une douchette envoie une rafale rapide (< 40ms par touche).
      // Si plus de 100ms se sont écoulées, on repart sur un nouveau buffer.
      if (timeSinceLast > 100) {
        this.scanBuffer = [];
        this.keyTimestamps = [];
        this.isScanning = true;
      }
      this.lastInputTime = now;

      if (e.key === 'Enter') {
        if (this.scanBuffer.length >= 4) {
          const totalDuration = this.keyTimestamps.length > 1
            ? this.keyTimestamps[this.keyTimestamps.length - 1] - this.keyTimestamps[0]
            : 0;
          const avgCharTime = this.keyTimestamps.length > 1
            ? totalDuration / (this.keyTimestamps.length - 1)
            : 0;

          const rawBarcode = this.scanBuffer.join('');
          const cleaned = BarcodeScannerService.cleanBarcodeData(rawBarcode);
          const isNumeric = BarcodeScannerService.isNumericBarcode(cleaned);

          // Détection stricte d'un vrai scanner physique :
          // 1. Cadence ultra-rapide (< 40ms par caractère)
          // 2. Longueur minimale (au moins 4 caractères)
          // 3. Contenu de type code-barres / numérique
          const isTrueScannerBurst = avgCharTime <= 40 && totalDuration < 300 && (isNumeric || cleaned.length >= 8);

          const isUserTypingInInput = 
            document.activeElement instanceof HTMLInputElement || 
            document.activeElement instanceof HTMLTextAreaElement;

          // Si l'utilisateur tape dans un champ de formulaire normal, ne PAS détourner la saisie humaine
          if (isTrueScannerBurst && (!isUserTypingInInput || (document.activeElement as HTMLElement)?.dataset?.barcodeTarget)) {
            e.preventDefault();
            e.stopPropagation();

            this.scanBuffer = [];
            this.keyTimestamps = [];
            this.isScanning = false;
            this.scannerDetected = false;
            this.notifyScannerState(false);

            if (cleaned) {
              this.notifyListeners(cleaned);
            }
            return;
          }
        }

        // Réinitialiser le buffer sur tout autre Enter
        this.scanBuffer = [];
        this.keyTimestamps = [];
        this.isScanning = false;
        this.scannerDetected = false;
        this.notifyScannerState(false);
      } else if (e.key.length === 1 && this.isScanning) {
        if (!e.ctrlKey && !e.altKey && !e.metaKey) {
          this.scanBuffer.push(e.key);
          this.keyTimestamps.push(now);
          if (!this.scannerDetected && this.scanBuffer.length >= 6) {
            this.scannerDetected = true;
            this.notifyScannerState(true);
          }
        }
      }
    };

    document.addEventListener('keydown', this.keydownListener, true);
  }

  stopKeyboardListener(): void {
    if (this.keydownListener) {
      document.removeEventListener('keydown', this.keydownListener, true);
      this.keydownListener = null;
    }
    this.scanBuffer = [];
    this.keyTimestamps = [];
    this.scannerDetected = false;
    this.notifyScannerState(false);
  }

  isScannerActive(): boolean {
    return this.scannerDetected;
  }

  onScannerStateChange(callback: (detected: boolean) => void): () => void {
    this.scannerStateListeners.push(callback);
    return () => {
      this.scannerStateListeners = this.scannerStateListeners.filter(cb => cb !== callback);
    };
  }

  private notifyScannerState(detected: boolean): void {
    this.scannerStateListeners.forEach(callback => callback(detected));
  }

  subscribe(callback: (barcode: string) => void): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(cb => cb !== callback);
    };
  }

  private notifyListeners(barcode: string): void {
    this.listeners.forEach(callback => callback(barcode));
  }

  searchProduct(scanInput: string, products: PosProduct[]): ScanResult {
    const cleanCode = BarcodeScannerService.cleanBarcodeData(scanInput);
    if (!cleanCode) {
      return { products: [], scanned: false, error: 'Code-barres vide ou invalide' };
    }

    const normalizedScan = BarcodeScannerService.normalizeCode(cleanCode);

    // 1. Correspondance exacte par Code-barres (normalisé sans espaces/tirets)
    const productByBarcode = products.find(p => p.barcode && BarcodeScannerService.normalizeCode(p.barcode) === normalizedScan);
    if (productByBarcode) {
      return {
        products: [productByBarcode],
        barcode: cleanCode,
        scanned: true
      };
    }

    // 2. Correspondance exacte par ISBN (normalisé sans espaces/tirets)
    const productByIsbn = products.find(p => p.isbn && BarcodeScannerService.normalizeCode(p.isbn) === normalizedScan);
    if (productByIsbn) {
      return {
        products: [productByIsbn],
        isbn: cleanCode,
        scanned: true
      };
    }

    // 3. Correspondance exacte par Référence
    const productByRef = products.find(p => p.reference && p.reference.trim().toLowerCase() === cleanCode.toLowerCase());
    if (productByRef) {
      return {
        products: [productByRef],
        barcode: cleanCode,
        scanned: true
      };
    }

    // 4. Conversion ISBN-10 vers ISBN-13 ou format objet
    if (cleanCode.length === 10 && Isbn.isValid(cleanCode)) {
      const isbn = new Isbn(cleanCode);
      const product = products.find(p => p.isbn && BarcodeScannerService.normalizeCode(p.isbn) === BarcodeScannerService.normalizeCode(isbn.toString()));
      if (product) {
        return {
          products: [product],
          isbn: cleanCode,
          scanned: true
        };
      }
    }

    // 5. Recherche partielle (si aucune correspondance exacte)
    const partialMatches = products.filter(p =>
      (p.reference && p.reference.toLowerCase().includes(cleanCode.toLowerCase())) ||
      (p.name && p.name.toLowerCase().includes(cleanCode.toLowerCase())) ||
      (p.barcode && BarcodeScannerService.normalizeCode(p.barcode).includes(normalizedScan)) ||
      (p.isbn && BarcodeScannerService.normalizeCode(p.isbn).includes(normalizedScan))
    );

    return {
      products: partialMatches,
      barcode: partialMatches.length > 0 ? cleanCode : undefined,
      scanned: partialMatches.length > 0
    };
  }

  async lookupBarcodeOnline(barcode: string): Promise<any> {
    try {
      const response = await fetch(`https://api.upcitemdb.com/prod/trial/lookup?upc=${barcode}`);
      if (response.ok) {
        return await response.json();
      }
    } catch (error) {
      console.warn('Online lookup failed:', error);
    }
    return null;
  }

  validateBarcode(barcode: string): boolean {
    return Barcode.isValid(barcode);
  }

  validateIsbn(isbn: string): boolean {
    return Isbn.isValid(isbn);
  }
}

export const barcodeScannerService = new BarcodeScannerService();
