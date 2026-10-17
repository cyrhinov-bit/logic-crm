export class BarcodeValidator {
  static cleanBarcode(code: string): string {
    return code.trim().replace(/[^0-9]/g, '');
  }

  static determineFormat(code: string): string {
    const cleaned = this.cleanBarcode(code);
    if (cleaned.length === 13 && /^\d{13}$/.test(cleaned)) return 'EAN-13';
    if (cleaned.length === 8 && /^\d{8}$/.test(cleaned)) return 'EAN-8';
    if (cleaned.length === 12 && /^\d{12}$/.test(cleaned)) return 'UPC-A';
    if (cleaned.length > 0 && /^[A-Z0-9-. $/+%]+$/i.test(cleaned) && !/^\d+$/.test(cleaned)) return 'CODE-39/128';
    return 'UNKNOWN';
  }

  static isValidChecksum(code: string, format: string): boolean {
    const cleaned = this.cleanBarcode(code);
    if (format === 'EAN-13') {
      let sum = 0;
      for (let i = 0; i < 12; i++) {
        sum += parseInt(cleaned[i], 10) * (i % 2 === 0 ? 1 : 3);
      }
      const check = (10 - (sum % 10)) % 10;
      return check === parseInt(cleaned[12], 10);
    }
    return true;
  }
}
