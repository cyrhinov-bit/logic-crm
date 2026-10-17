const fs = require('fs');
const path = require('path');

function write(filePath, content) {
  const fullPath = path.join(__dirname, filePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content.trim() + '\n');
}

// 1. Errors
write('electron/errors/ScannerErrors.ts', `
export class ScannerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}
export class ScannerNotFoundError extends ScannerError {}
export class InvalidBarcodeError extends ScannerError {}
export class UnsupportedBarcodeError extends ScannerError {}
export class ScannerDisconnectedError extends ScannerError {}
export class ScannerBusyError extends ScannerError {}
`);

// 2. Types & Config
write('electron/services/scanner/ScannerConfiguration.ts', `
export interface ScannerConfig {
  prefix: string;
  suffix: string;
  maxKeyDelay: number;
  autoReconnect: boolean;
  activeDeviceId?: string;
  symbology: string;
}

export class ScannerConfiguration {
  private static config: ScannerConfig = {
    prefix: '',
    suffix: '\\n',
    maxKeyDelay: 50,
    autoReconnect: true,
    symbology: 'auto'
  };

  static getConfig(): ScannerConfig { return { ...this.config }; }
  static setConfig(c: Partial<ScannerConfig>): void { this.config = { ...this.config, ...c }; }
}
`);

// 3. Validator
write('electron/services/scanner/BarcodeValidator.ts', `
export class BarcodeValidator {
  static cleanBarcode(code: string): string {
    return code.trim().replace(/[^0-9]/g, '');
  }

  static determineFormat(code: string): string {
    const cleaned = this.cleanBarcode(code);
    if (cleaned.length === 13 && /^\\d{13}$/.test(cleaned)) return 'EAN-13';
    if (cleaned.length === 8 && /^\\d{8}$/.test(cleaned)) return 'EAN-8';
    if (cleaned.length === 12 && /^\\d{12}$/.test(cleaned)) return 'UPC-A';
    if (cleaned.length > 0 && /^[A-Z0-9-\\. $\\/+%]+$/i.test(cleaned) && !/^\\d+$/.test(cleaned)) return 'CODE-39/128';
    return 'UNKNOWN';
  }

  static isValidChecksum(code: string, format: string): boolean {
    const cleaned = this.cleanBarcode(code);
    if (format === 'EAN-13') {
      let sum = 0;
      for (let i = 0; i < 12; i++) {
        sum += parseInt(cleaned[i], 10) * (i % 2 === 0 ? 1 : 3);
      }
      const check = (10 - (sum % 10)) % 10;
      return check === parseInt(cleaned[12], 10);
    }
    return true;
  }
}
`);

// 4. History
write('electron/services/scanner/ScanHistory.ts', `
export interface ScanRecord {
  id: string;
  timestamp: string;
  data: string;
  format: string;
  valid: boolean;
  deviceId?: string;
}

export class ScanHistory {
  private static history: ScanRecord[] = [];
  private static MAX = 100;

  static add(record: ScanRecord) {
    this.history.unshift(record);
    if (this.history.length > this.MAX) this.history.pop();
  }

  static getHistory() { return this.history; }
  static clear() { this.history = []; }
}
`);

// 5. Parser
write('electron/services/scanner/BarcodeParser.ts', `
import { BarcodeValidator } from './BarcodeValidator.js';
import { ScanHistory } from './ScanHistory.js';
import { randomUUID } from 'crypto';

export class BarcodeParser {
  static parse(rawData: string, deviceId?: string) {
    const cleanData = BarcodeValidator.cleanBarcode(rawData);
    const format = BarcodeValidator.determineFormat(cleanData);
    const valid = BarcodeValidator.isValidChecksum(cleanData, format);

    const record = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      data: cleanData,
      format,
      valid,
      deviceId
    };

    ScanHistory.add(record);
    return record;
  }
}
`);

// 6. Events & Manager
write('electron/services/scanner/ScannerEvents.ts', `
import { EventEmitter } from 'events';
export const scannerEmitter = new EventEmitter();
`);

write('electron/services/scanner/ScannerManager.ts', `
import { scannerEmitter } from './ScannerEvents.js';
import { BarcodeParser } from './BarcodeParser.js';
import { ScannerConfiguration } from './ScannerConfiguration.js';
import { ScanHistory } from './ScanHistory.js';
import { BarcodeValidator } from './BarcodeValidator.js';

export class ScannerManager {
  private static isRunning = false;

  static start() {
    this.isRunning = true;
    scannerEmitter.emit('status', 'started');
  }

  static stop() {
    this.isRunning = false;
    scannerEmitter.emit('status', 'stopped');
  }

  static simulateScan(data: string) {
    if (!this.isRunning) return;
    const cleaned = BarcodeValidator.cleanBarcode(data);
    const record = BarcodeParser.parse(cleaned, 'simulated-device');
    scannerEmitter.emit('scan', record);
    return record;
  }

  static getConfig() { return ScannerConfiguration.getConfig(); }
  static setConfig(c: any) { ScannerConfiguration.setConfig(c); }
  static getHistory() { return ScanHistory.getHistory(); }
}
`);

// 7. Mocks (Discovery, Session)
write('electron/services/scanner/ScannerDiscovery.ts', 'export class ScannerDiscovery {}');
write('electron/services/scanner/ScannerSession.ts', 'export class ScannerSession {}');

write('electron/services/scanner/index.ts', `
export * from './ScannerConfiguration.js';
export * from './BarcodeValidator.js';
export * from './ScanHistory.js';
export * from './BarcodeParser.js';
export * from './ScannerEvents.js';
export * from './ScannerManager.js';
`);

// 8. IPC Channels & Handlers
write('electron/ipc/scanner/scanner.channels.ts', `
export const SCANNER_CHANNELS = {
  START: 'scanner:start',
  STOP: 'scanner:stop',
  GET_CONFIG: 'scanner:getConfig',
  SET_CONFIG: 'scanner:setConfig',
  GET_HISTORY: 'scanner:getHistory',
  ON_SCAN: 'scanner:onScan'
} as const;
`);

write('electron/ipc/scanner/scanner.handlers.ts', `
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
`);

console.log('Fichiers Scanner générés.');
