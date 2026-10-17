import { ipcMain, BrowserWindow } from 'electron';
import { SCANNER_CHANNELS } from './scanner.channels.js';
import { ScannerManager, scannerEmitter } from '../../services/scanner/index.js';
import { ScannerError } from '../../errors/ScannerErrors.js';

export function registerScannerHandlers(): void {
  // Push event vers React
  scannerEmitter.on('scan', (record) => {
    const windows = BrowserWindow.getAllWindows();
    windows.forEach(win => win.webContents.send(SCANNER_CHANNELS.ON_SCAN, record));
  });

  const handle = (channel: string, handler: (...args: any[]) => Promise<any> | any) => {
    ipcMain.handle(channel, async (_, ...args) => {
      try {
        return await handler(...args);
      } catch (err: any) {
        if (err instanceof ScannerError) {
          throw new Error(JSON.stringify({ name: err.name, message: err.message }));
        }
        throw err;
      }
    });
  };

  handle(SCANNER_CHANNELS.START, () => ScannerManager.start());
  handle(SCANNER_CHANNELS.STOP, () => ScannerManager.stop());
  handle(SCANNER_CHANNELS.GET_CONFIG, () => ScannerManager.getConfig());
  handle(SCANNER_CHANNELS.SET_CONFIG, (c) => ScannerManager.setConfig(c));
  handle(SCANNER_CHANNELS.GET_HISTORY, () => ScannerManager.getHistory());
}
