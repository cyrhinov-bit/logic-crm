// Bus d'impression web : relie browserBridge.pos.printReceipt (hors React)
// au composant WebReceiptPrinter (monté dans le Layout) qui rend le ticket
// dans la zone d'impression puis appelle window.print().
// I1 : vraie file FIFO (plus de rejet au double-clic), timeout annulé au settle.

export interface WebPrintRequest {
  data: any;
  resolve: (result: string) => void;
  reject: (err: Error) => void;
  timer?: ReturnType<typeof setTimeout>;
  timeoutMs: number;
}

export const WEB_PRINT_EVENT = 'hinov:web-print-receipt';

declare global {
  interface Window {
    __hinovWebPrinterReady?: boolean;
  }
}

const MAX_QUEUE = 5;
let active: WebPrintRequest | null = null;
const waiting: WebPrintRequest[] = [];

function fail(req: WebPrintRequest, message: string) {
  if (req.timer) clearTimeout(req.timer);
  try {
    req.reject(new Error(message));
  } catch { /* ignore */ }
}

function activate(req: WebPrintRequest, timeoutMs: number) {
  active = req;
  req.timer = setTimeout(() => {
    if (active === req) {
      active = null;
      fail(req, "Délai d'impression dépassé");
      pump();
    }
  }, timeoutMs);
  window.dispatchEvent(new CustomEvent(WEB_PRINT_EVENT));
}

function pump() {
  if (active || waiting.length === 0) return;
  const next = waiting.shift()!;
  activate(next, next.timeoutMs);
}

export function requestWebPrint(data: any, timeoutMs = 20000): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    if (!window.__hinovWebPrinterReady) {
      reject(new Error("Service d'impression web non prêt (hors session)"));
      return;
    }
    if (waiting.length >= MAX_QUEUE) {
      reject(new Error("File d'impression pleine, réessayez dans un instant"));
      return;
    }
    const req: WebPrintRequest = { data, resolve, reject, timeoutMs };
    if (active) {
      waiting.push(req);
    } else {
      activate(req, timeoutMs);
    }
  });
}

/** Appelé par WebReceiptPrinter à la réception de l'événement. */
export function takeWebPrint(): WebPrintRequest | null {
  return active;
}

/** Appelé par WebReceiptPrinter une fois le dialogue fermé (afterprint ou filet). */
export function settleWebPrint(result: string) {
  const req = active;
  active = null;
  if (req) {
    if (req.timer) clearTimeout(req.timer);
    try {
      req.resolve(result);
    } catch { /* ignore */ }
  }
  pump();
}
