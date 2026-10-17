export class Barcode {
  private readonly value: string;

  constructor(value: string) {
    if (!Barcode.isValid(value)) {
      throw new Error(`Code-barres invalide: ${value}`);
    }
    this.value = value.trim();
  }

  static isValid(value: string): boolean {
    const clean = value.trim();
    if (!clean) return false;
    
    // EAN-8
    if (/^\d{8}$/.test(clean)) return true;
    // EAN-13
    if (/^\d{13}$/.test(clean)) return true;
    // UPC-A
    if (/^\d{12}$/.test(clean)) return true;
    // UPC-E
    if (/^\d{8}$/.test(clean)) return true;
    // Code 39
    if (/^[0-9A-Z\-.$/+% ]+$/.test(clean)) return true;
    // Code 128
    // eslint-disable-next-line no-control-regex
    if (/^[\x00-\x7F]+$/.test(clean)) return true;
    // QR Code (future)
    return false;
  }

  static generateEAN13(): string {
    let code = '';
    for (let i = 0; i < 12; i++) {
      code += Math.floor(Math.random() * 10).toString();
    }
    return code + Barcode.calculateCheckDigit(code);
  }

  private static calculateCheckDigit(code: string): string {
    let sum = 0;
    for (let i = 0; i < code.length; i++) {
      const digit = parseInt(code[i], 10);
      sum += i % 2 === 0 ? digit : digit * 3;
    }
    return ((10 - (sum % 10)) % 10).toString();
  }

  toString(): string {
    return this.value;
  }

  equals(other: Barcode): boolean {
    return this.value === other.value;
  }

  getType(): 'EAN-8' | 'EAN-13' | 'UPC-A' | 'UPC-E' | 'Code-39' | 'Code-128' | 'Unknown' {
    const clean = this.value;
    if (/^\d{8}$/.test(clean)) return 'EAN-8';
    if (/^\d{13}$/.test(clean)) return 'EAN-13';
    if (/^\d{12}$/.test(clean)) return 'UPC-A';
    if (/^\d{8}$/.test(clean)) return 'UPC-E';
    if (/^[0-9A-Z\-.$/+% ]+$/.test(clean)) return 'Code-39';
    // eslint-disable-next-line no-control-regex
    if (/^[\x00-\x7F]+$/.test(clean)) return 'Code-128';
    return 'Unknown';
  }
}

export class Isbn {
  private readonly value: string;

  constructor(value: string) {
    if (!Isbn.isValid(value)) {
      throw new Error(`ISBN invalide: ${value}`);
    }
    this.value = value.replace(/[-\s]/g, '').toUpperCase();
  }

  static isValid(value: string): boolean {
    const clean = value.replace(/[-\s]/g, '').toUpperCase();
    if (!clean) return false;
    
    // ISBN-10
    if (/^\d{9}[\dX]$/.test(clean)) {
      return Isbn.validateIsbn10(clean);
    }
    // ISBN-13
    if (/^\d{13}$/.test(clean)) {
      return Isbn.validateIsbn13(clean);
    }
    return false;
  }

  private static validateIsbn10(isbn: string): boolean {
    let sum = 0;
    for (let i = 0; i < 9; i++) {
      sum += parseInt(isbn[i], 10) * (10 - i);
    }
    const checkChar = isbn[9];
    const checkValue = checkChar === 'X' ? 10 : parseInt(checkChar, 10);
    sum += checkValue;
    return sum % 11 === 0;
  }

  private static validateIsbn13(isbn: string): boolean {
    let sum = 0;
    for (let i = 0; i < 12; i++) {
      const digit = parseInt(isbn[i], 10);
      sum += i % 2 === 0 ? digit : digit * 3;
    }
    const checkDigit = parseInt(isbn[12], 10);
    return (sum + checkDigit) % 10 === 0;
  }

  toString(): string {
    return this.value;
  }

  toFormatted(): string {
    if (this.value.length === 10) {
      return this.value.replace(/(\d)(\d{3})(\d{5})(\d)/, '$1-$2-$3-$4');
    }
    if (this.value.length === 13) {
      return this.value.replace(/(\d{3})(\d)(\d{5})(\d{3})(\d)/, '$1-$2-$3-$4-$5');
    }
    return this.value;
  }

  getType(): 'ISBN-10' | 'ISBN-13' | 'Unknown' {
    if (this.value.length === 10) return 'ISBN-10';
    if (this.value.length === 13) return 'ISBN-13';
    return 'Unknown';
  }

  equals(other: Isbn): boolean {
    return this.value === other.value;
  }
}

export class ProductReference {
  private readonly value: string;

  constructor(value: string) {
    if (!value || !value.trim()) {
      throw new Error('La référence ne peut pas être vide');
    }
    this.value = value.trim();
  }

  static generateFromName(name: string): ProductReference {
    const ref = name
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    return new ProductReference(ref);
  }

  toString(): string {
    return this.value;
  }

  equals(other: ProductReference): boolean {
    return this.value === other.value;
  }
}