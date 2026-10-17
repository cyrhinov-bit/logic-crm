import * as XLSX from 'xlsx';
import type { PosProduct } from '../../../context/AppContext';

export class ExcelExportService {
  exportProducts(products: PosProduct[]): Blob {
    const headers = [
      'REFERENCE',
      'CODE-BARRES / ISBN',
      'PRIX D\'ACHAT UNITAIRE',
      'QUANTITE',
      'PRIX DE VENTE UNITAIRE',
      'PRIX D\'ACHAT TOTAL',
      'PRIX DE VENTE QUANTITAIRE',
      'MARGE',
      'QUANTITE_RESTANTE',
      'PRIX',
      'FAMILLE',
      'CATEGORIE',
      'MARQUE',
      'FOURNISSEUR',
      'STOCK MINIMUM',
      'STATUT'
    ];

    const rows = products.map(product => {
      const purchasePrice = product.purchasePrice;
      const quantity = product.quantity;
      const sellingPrice = product.sellingPrice;
      const totalPurchase = purchasePrice * quantity;
      const totalSelling = sellingPrice * quantity;
      const margin = totalSelling - totalPurchase;
      const remainingPrice = sellingPrice - purchasePrice;

      return [
        product.reference,
        product.barcode || '',
        purchasePrice,
        quantity,
        sellingPrice,
        totalPurchase,
        totalSelling,
        margin,
        quantity,
        remainingPrice,
        product.family || 'Divers',
        product.categoryId || '',
        product.brandId || '',
        product.supplierId || '',
        product.minStock,
        'Actif'
      ];
    });

    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Produits');
    return new Blob([XLSX.write(wb, { bookType: 'xlsx', type: 'array' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  async exportToExcel(products: PosProduct[]): Promise<void> {
    const blob = this.exportProducts(products);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `catalogue-produits-${new Date().toISOString().split('T')[0]}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  generateTemplate(): Blob {
    const headers = [
      'REFERENCE',
      'CODE-BARRES / ISBN',
      'PRIX D\'ACHAT UNITAIRE',
      'QUANTITE',
      'PRIX DE VENTE UNITAIRE'
    ];

    const exampleData = [
      ['Exemple Produit A', '1234567890123', 1000, 10, 1500],
      ['Exemple Produit B', '9782070368223', 5000, 5, 7500]
    ];

    const ws = XLSX.utils.aoa_to_sheet([headers, ...exampleData]);
    ws['!cols'] = [{ wch: 28 }, { wch: 18 }, { wch: 18 }, { wch: 10 }, { wch: 18 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Modèle');
    return new Blob([XLSX.write(wb, { bookType: 'xlsx', type: 'array' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  downloadTemplate(): void {
    const blob = this.generateTemplate();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'modele-catalogue-produits.xlsx';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

export const excelExportService = new ExcelExportService();
