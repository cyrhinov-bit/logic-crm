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
