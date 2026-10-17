const fs = require('fs');
const path = require('path');

function write(filePath, content) {
  const fullPath = path.join(__dirname, filePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content.trim() + '\n');
}

// 1. Errors
write('electron/errors/PrinterErrors.ts', `
export class PrinterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}
export class PrinterOfflineError extends PrinterError {}
export class PaperOutError extends PrinterError {}
export class PrinterBusyError extends PrinterError {}
export class PrintCancelledError extends PrinterError {}
export class PrinterNotFoundError extends PrinterError {}
`);

// 2. Models
write('electron/services/printer/PrintJob.ts', `
export interface PrintJob {
  id: string;
  date: string;
  type: 'html' | 'pdf' | 'escpos';
  printerName?: string;
  status: 'pending' | 'printing' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  error?: string;
}
`);

// 3. Queue
write('electron/services/printer/PrintQueue.ts', `
import { PrintJob } from './PrintJob.js';

export class PrintQueue {
  private static queue: PrintJob[] = [];

  static addJob(job: PrintJob): void { this.queue.push(job); }
  static getQueue(): PrintJob[] { return this.queue; }
  static updateStatus(id: string, status: PrintJob['status'], error?: string) {
    const job = this.queue.find(j => j.id === id);
    if (job) { job.status = status; if (error) job.error = error; }
  }
  static clear(): void { this.queue = []; }
}
`);

// 4. Discovery
write('electron/services/printer/PrinterDiscovery.ts', `
import { webContents } from 'electron';

export interface PrinterInfo {
  name: string;
  displayName: string;
  description: string;
  status: number;
  isDefault: boolean;
  options: any;
}

export class PrinterDiscovery {
  static async getPrinters(): Promise<PrinterInfo[]> {
    // Dans Electron, on peut utiliser webContents.getAllWebContents()[0].getPrintersAsync()
    const contents = webContents.getAllWebContents()[0];
    if (contents) {
      return (await contents.getPrintersAsync()) as unknown as PrinterInfo[];
    }
    return [];
  }
}
`);

// 5. Mocks Engines
const engines = ['EscPosEngine', 'PdfEngine', 'HtmlEngine', 'BarcodeEngine', 'QrCodeEngine', 'ReceiptRenderer', 'LabelRenderer', 'PrintTemplate'];
engines.forEach(name => {
  write("electron/services/printer/" + name + ".ts", "export class " + name + " { static test() { return 'not_implemented'; } }\n");
});

// 6. PrinterManager
write('electron/services/printer/PrinterManager.ts', `
import { PrinterDiscovery } from './PrinterDiscovery.js';
import { PrintQueue } from './PrintQueue.js';
import { PrintJob } from './PrintJob.js';
import { PrinterNotFoundError } from '../../errors/PrinterErrors.js';

export class PrinterManager {
  static async getPrinters() {
    return PrinterDiscovery.getPrinters();
  }

  static async printTestPage(printerName: string): Promise<string> {
    const printers = await this.getPrinters();
    const printer = printers.find(p => p.name === printerName);
    
    if (!printer) {
      throw new PrinterNotFoundError(\`Imprimante '\${printerName}' introuvable.\`);
    }

    const jobId = \`job_\${Date.now()}\`;
    const job: PrintJob = {
      id: jobId,
      date: new Date().toISOString(),
      type: 'html',
      printerName,
      status: 'pending',
      progress: 0
    };

    PrintQueue.addJob(job);
    
    // Simulation asynchrone d'une impression
    setTimeout(() => PrintQueue.updateStatus(jobId, 'printing', undefined), 1000);
    setTimeout(() => PrintQueue.updateStatus(jobId, 'completed', undefined), 3000);

    return jobId;
  }
  
  static getQueue() {
    return PrintQueue.getQueue();
  }
}
`);

// 7. Index
write('electron/services/printer/index.ts', `
export * from './PrintJob.js';
export * from './PrintQueue.js';
export * from './PrinterDiscovery.js';
export * from './PrinterManager.js';
export * from './EscPosEngine.js';
export * from './PdfEngine.js';
export * from './HtmlEngine.js';
export * from './BarcodeEngine.js';
export * from './QrCodeEngine.js';
export * from './ReceiptRenderer.js';
export * from './LabelRenderer.js';
export * from './PrintTemplate.js';
`);

// 8. IPC Channels & Handlers
write('electron/ipc/printer/printer.channels.ts', `
export const PRINTER_CHANNELS = {
  GET_PRINTERS: 'printer:getPrinters',
  PRINT_TEST_PAGE: 'printer:printTestPage',
  GET_QUEUE: 'printer:getQueue'
} as const;
`);

write('electron/ipc/printer/printer.handlers.ts', `
import { ipcMain } from 'electron';
import { PRINTER_CHANNELS } from './printer.channels.js';
import { PrinterManager } from '../../services/printer/index.js';
import { PrinterError } from '../../errors/PrinterErrors.js';

export function registerPrinterHandlers(): void {
  const handle = (channel: string, handler: (...args: any[]) => Promise<any> | any) => {
    ipcMain.handle(channel, async (_, ...args) => {
      try {
        return await handler(...args);
      } catch (err: any) {
        if (err instanceof PrinterError) {
          throw new Error(JSON.stringify({ name: err.name, message: err.message }));
        }
        throw err;
      }
    });
  };

  handle(PRINTER_CHANNELS.GET_PRINTERS, () => PrinterManager.getPrinters());
  handle(PRINTER_CHANNELS.PRINT_TEST_PAGE, (printerName) => PrinterManager.printTestPage(printerName));
  handle(PRINTER_CHANNELS.GET_QUEUE, () => PrinterManager.getQueue());
}
`);

console.log('Fichiers Printer générés.');
