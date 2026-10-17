import { SaleSession } from './SaleSession.js';
import { PaymentEngine } from './PaymentEngine.js';
import { CashDrawerEngine } from './CashDrawerEngine.js';
import { ReceiptEngine } from './ReceiptEngine.js';
import { CustomerDisplayEngine } from './CustomerDisplayEngine.js';

export class PosEngine {
  static openSale(userId: string) { return SaleSession.startSession(userId); }
  static closeSale() { return SaleSession.closeSession(); }
  static getSession() { return SaleSession.getSession(); }
  static async pay(amount: number, method: string) { return await PaymentEngine.processPayment(amount, method); }
  static async openDrawer() { return await CashDrawerEngine.openDrawer(); }
  static async printReceipt(data: any) { return await ReceiptEngine.printReceipt(data); }
  static async displayMessage(line1: string, line2: string) { return await CustomerDisplayEngine.showMessage(line1, line2); }
}
