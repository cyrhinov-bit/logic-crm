import type { PosProduct, PosStockEntry, PosStockEntryLine } from '../../../context/AppContext';
import { v4 as uuidv4 } from 'uuid';
import { todayLocalKey } from '../../../lib/dates';
import type { StockMovement } from './ProductService';

export class StockService {
  createStockEntryForImport(product: PosProduct): PosStockEntry {
    const line: PosStockEntryLine = {
      id: uuidv4(),
      productId: product.id,
      quantity: product.quantity,
      purchasePrice: product.purchasePrice,
      total: product.purchasePrice * product.quantity
    };

    const entry: PosStockEntry = {
      id: uuidv4(),
      reference: `APV-${Date.now()}`,
      date: todayLocalKey(),
      totalAmount: line.total,
      status: 'Validé',
      notes: 'Création automatique via import Excel',
      createdBy: undefined,
      lines: [line]
    };

    return entry;
  }

  createStockEntryForManualAdd(product: PosProduct): PosStockEntry {
    const line: PosStockEntryLine = {
      id: uuidv4(),
      productId: product.id,
      quantity: product.quantity,
      purchasePrice: product.purchasePrice,
      total: product.purchasePrice * product.quantity
    };

    const entry: PosStockEntry = {
      id: uuidv4(),
      reference: `APV-${Date.now()}`,
      date: todayLocalKey(),
      totalAmount: line.total,
      status: 'Validé',
      notes: 'Ajout manuel',
      createdBy: undefined,
      lines: [line]
    };

    return entry;
  }

  createStockMovement(product: PosProduct, type: StockMovement['type'], quantity: number): StockMovement {
    return {
      id: uuidv4(),
      productId: product.id,
      type,
      quantity,
      unitPrice: product.purchasePrice,
      totalAmount: product.purchasePrice * quantity,
      reference: `MVT-${Date.now()}`,
      createdAt: new Date().toISOString()
    };
  }

  calculateStockValue(products: PosProduct[]): number {
    return products
      .filter(p => p.family !== 'Service')
      .reduce((sum, p) => sum + ((p.purchasePrice || 0) * (p.quantity || 0)), 0);
  }

  getLowStockProducts(products: PosProduct[]): PosProduct[] {
    return products.filter(p => p.family !== 'Service' && p.quantity <= p.minStock && p.minStock > 0);
  }
}

export const stockService = new StockService();
