import { ipcMain, BrowserWindow } from 'electron';
import { POS_CHANNELS } from './pos.channels.js';
import { PosEngine, posEmitter } from '../../pos/index.js';

const MAX_RECEIPT_BYTES = 2_000_000;
const ALLOWED_PAY_METHODS = ['Espèces', 'Mobile Money', 'Mixte', 'Carte'];

function assertUserId(userId: unknown): asserts userId is string {
  if (typeof userId !== 'string' || userId.length === 0 || userId.length > 128) {
    throw new Error('userId invalide');
  }
}

function assertPayment(amount: unknown, method: unknown): asserts method is string {
  if (!(Number(amount) > 0) || Number(amount) > 100_000_000) {
    throw new Error('Montant de paiement invalide');
  }
  if (typeof method !== 'string' || !ALLOWED_PAY_METHODS.includes(method)) {
    throw new Error('Moyen de paiement invalide');
  }
}

function assertReceipt(data: unknown): void {
  if (!data || typeof data !== 'object') throw new Error('Ticket invalide : payload vide');
  let size = 0;
  try {
    size = JSON.stringify(data).length;
  } catch {
    throw new Error('Ticket invalide : payload non sérialisable');
  }
  if (size > MAX_RECEIPT_BYTES) throw new Error('Ticket invalide : payload trop volumineux');
}

function assertDisplayLines(line1: unknown, line2: unknown): void {
  for (const [name, v] of [['line1', line1], ['line2', line2]] as const) {
    if (typeof v !== 'string' || v.length > 64) throw new Error(`Afficheur client : ${name} invalide (max 64 caractères)`);
  }
}

export function registerPosHandlers(): void {
  // Forward unique (pas de doublon au rechargement) et ciblé sur l'émetteur.
  posEmitter.setMaxListeners(20);
  const forwarded = new Set<string>();
  const eventsToForward = ['sessionOpened', 'sessionClosed', 'paymentStarted', 'paymentCompleted', 'cashDrawerOpened'];
  eventsToForward.forEach(eventName => {
    if (forwarded.has(eventName)) return;
    forwarded.add(eventName);
    posEmitter.on(eventName, (data) => {
      const windows = BrowserWindow.getAllWindows();
      windows.forEach(win => {
        if (!win.isDestroyed()) win.webContents.send(POS_CHANNELS.ON_POS_EVENT, { event: eventName, data });
      });
    });
  });

  ipcMain.handle(POS_CHANNELS.OPEN_SALE, (_, userId) => {
    assertUserId(userId);
    return PosEngine.openSale(userId);
  });
  ipcMain.handle(POS_CHANNELS.CLOSE_SALE, () => PosEngine.closeSale());
  ipcMain.handle(POS_CHANNELS.GET_SESSION, () => PosEngine.getSession());
  ipcMain.handle(POS_CHANNELS.PAY, (_, amount, method) => {
    assertPayment(amount, method);
    return PosEngine.pay(Number(amount), method);
  });
  ipcMain.handle(POS_CHANNELS.OPEN_DRAWER, () => PosEngine.openDrawer());
  ipcMain.handle(POS_CHANNELS.PRINT_RECEIPT, (_, data) => {
    assertReceipt(data);
    return PosEngine.printReceipt(data);
  });
  ipcMain.handle(POS_CHANNELS.DISPLAY_MESSAGE, (_, line1, line2) => {
    assertDisplayLines(line1, line2);
    return PosEngine.displayMessage(line1, line2);
  });
}
