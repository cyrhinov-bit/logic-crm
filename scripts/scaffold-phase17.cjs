const fs = require('fs');
const path = require('path');

function write(filePath, content) {
  const fullPath = path.join(__dirname, filePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content.trim() + '\n');
}

// 1. Errors
write('electron/errors/PosErrors.ts',
  "export class PosError extends Error {\n" +
  "  constructor(message: string) {\n" +
  "    super(message);\n" +
  "    this.name = this.constructor.name;\n" +
  "  }\n" +
  "}\n" +
  "export class ReceiptPrintFailedError extends PosError {}\n" +
  "export class CashDrawerOpenError extends PosError {}\n" +
  "export class PaymentFailedError extends PosError {}\n" +
  "export class ReceiptFormatError extends PosError {}\n" +
  "export class PosSessionError extends PosError {}\n" +
  "export class CustomerDisplayError extends PosError {}\n"
);

// 2. POS Modules
write('electron/pos/PosEvents.ts',
  "import { EventEmitter } from 'events';\n" +
  "export const posEmitter = new EventEmitter();\n"
);

write('electron/pos/SaleSession.ts',
  "import { posEmitter } from './PosEvents.js';\n" +
  "export class SaleSession {\n" +
  "  private static currentSession: any = null;\n\n" +
  "  static startSession(userId: string) {\n" +
  "    if (this.currentSession) throw new Error('Une session est déjà en cours.');\n" +
  "    this.currentSession = { id: Date.now().toString(), userId, startTime: new Date().toISOString(), status: 'OPEN' };\n" +
  "    posEmitter.emit('sessionOpened', this.currentSession);\n" +
  "    return this.currentSession;\n" +
  "  }\n\n" +
  "  static closeSession() {\n" +
  "    if (!this.currentSession) throw new Error('Aucune session en cours.');\n" +
  "    const closedSession = { ...this.currentSession, endTime: new Date().toISOString(), status: 'CLOSED' };\n" +
  "    this.currentSession = null;\n" +
  "    posEmitter.emit('sessionClosed', closedSession);\n" +
  "    return closedSession;\n" +
  "  }\n\n" +
  "  static getSession() { return this.currentSession; }\n" +
  "}\n"
);

write('electron/pos/PaymentEngine.ts',
  "import { posEmitter } from './PosEvents.js';\n" +
  "export class PaymentEngine {\n" +
  "  static async processPayment(amount: number, method: string) {\n" +
  "    posEmitter.emit('paymentStarted', { amount, method });\n" +
  "    await new Promise(r => setTimeout(r, 500)); // Simule un traitement de paiement\n" +
  "    posEmitter.emit('paymentCompleted', { amount, method, status: 'SUCCESS' });\n" +
  "    return { success: true, amount, method, transactionId: 'TXN-' + Date.now() };\n" +
  "  }\n" +
  "}\n"
);

write('electron/pos/CashDrawerEngine.ts',
  "import { posEmitter } from './PosEvents.js';\n" +
  "export class CashDrawerEngine {\n" +
  "  static async openDrawer() {\n" +
  "    // Ici, le code d'envoi du signal ESC/POS d'ouverture au port configuré\n" +
  "    posEmitter.emit('cashDrawerOpened', { timestamp: new Date().toISOString() });\n" +
  "    return true;\n" +
  "  }\n" +
  "}\n"
);

write('electron/pos/CustomerDisplayEngine.ts',
  "export class CustomerDisplayEngine {\n" +
  "  static async showMessage(line1: string, line2: string) {\n" +
  "    // Code d'envoi VFD/LCD\n" +
  "    return true;\n" +
  "  }\n" +
  "}\n"
);

write('electron/pos/BarcodeEngine.ts', "export class BarcodeEngine {}");
write('electron/pos/ReceiptFormatter.ts', "export class ReceiptFormatter {}");
write('electron/pos/ReceiptTemplate.ts', "export class ReceiptTemplate {}");
write('electron/pos/TicketNumberGenerator.ts', "export class TicketNumberGenerator {}");
write('electron/pos/ReceiptEngine.ts',
  "export class ReceiptEngine {\n" +
  "  static async printReceipt(data: any) {\n" +
  "    // Convertir les données via ReceiptFormatter en commandes ESCPOS ou PDF,\n" +
  "    // puis l'envoyer au PrinterEngine (qui a été créé à la phase 8).\n" +
  "    return 'receipt_printed';\n" +
  "  }\n" +
  "}\n"
);

write('electron/pos/PosEngine.ts',
  "import { SaleSession } from './SaleSession.js';\n" +
  "import { PaymentEngine } from './PaymentEngine.js';\n" +
  "import { CashDrawerEngine } from './CashDrawerEngine.js';\n" +
  "import { ReceiptEngine } from './ReceiptEngine.js';\n" +
  "import { CustomerDisplayEngine } from './CustomerDisplayEngine.js';\n\n" +
  "export class PosEngine {\n" +
  "  static openSale(userId: string) { return SaleSession.startSession(userId); }\n" +
  "  static closeSale() { return SaleSession.closeSession(); }\n" +
  "  static getSession() { return SaleSession.getSession(); }\n" +
  "  static async pay(amount: number, method: string) { return await PaymentEngine.processPayment(amount, method); }\n" +
  "  static async openDrawer() { return await CashDrawerEngine.openDrawer(); }\n" +
  "  static async printReceipt(data: any) { return await ReceiptEngine.printReceipt(data); }\n" +
  "  static async displayMessage(line1: string, line2: string) { return await CustomerDisplayEngine.showMessage(line1, line2); }\n" +
  "}\n"
);

write('electron/pos/index.ts',
  "export * from './PosEngine.js';\n" +
  "export * from './PosEvents.js';\n" +
  "export * from './SaleSession.js';\n"
);

// 3. IPC
write('electron/ipc/pos/pos.channels.ts',
  "export const POS_CHANNELS = {\n" +
  "  OPEN_SALE: 'pos:openSale',\n" +
  "  CLOSE_SALE: 'pos:closeSale',\n" +
  "  GET_SESSION: 'pos:getSession',\n" +
  "  PAY: 'pos:pay',\n" +
  "  OPEN_DRAWER: 'pos:openDrawer',\n" +
  "  PRINT_RECEIPT: 'pos:printReceipt',\n" +
  "  DISPLAY_MESSAGE: 'pos:displayMessage',\n" +
  "  ON_POS_EVENT: 'pos:onEvent'\n" +
  "} as const;\n"
);

write('electron/ipc/pos/pos.handlers.ts',
  "import { ipcMain, BrowserWindow } from 'electron';\n" +
  "import { POS_CHANNELS } from './pos.channels.js';\n" +
  "import { PosEngine, posEmitter } from '../../pos/index.js';\n\n" +
  "export function registerPosHandlers(): void {\n" +
  "  const eventsToForward = ['sessionOpened', 'sessionClosed', 'paymentStarted', 'paymentCompleted', 'cashDrawerOpened'];\n" +
  "  eventsToForward.forEach(eventName => {\n" +
  "    posEmitter.on(eventName, (data) => {\n" +
  "      const windows = BrowserWindow.getAllWindows();\n" +
  "      windows.forEach(win => win.webContents.send(POS_CHANNELS.ON_POS_EVENT, { event: eventName, data }));\n" +
  "    });\n" +
  "  });\n\n" +
  "  ipcMain.handle(POS_CHANNELS.OPEN_SALE, (_, userId) => PosEngine.openSale(userId));\n" +
  "  ipcMain.handle(POS_CHANNELS.CLOSE_SALE, () => PosEngine.closeSale());\n" +
  "  ipcMain.handle(POS_CHANNELS.GET_SESSION, () => PosEngine.getSession());\n" +
  "  ipcMain.handle(POS_CHANNELS.PAY, (_, amount, method) => PosEngine.pay(amount, method));\n" +
  "  ipcMain.handle(POS_CHANNELS.OPEN_DRAWER, () => PosEngine.openDrawer());\n" +
  "  ipcMain.handle(POS_CHANNELS.PRINT_RECEIPT, (_, data) => PosEngine.printReceipt(data));\n" +
  "  ipcMain.handle(POS_CHANNELS.DISPLAY_MESSAGE, (_, line1, line2) => PosEngine.displayMessage(line1, line2));\n" +
  "}\n"
);

console.log('Fichiers Phase 17 générés.');
