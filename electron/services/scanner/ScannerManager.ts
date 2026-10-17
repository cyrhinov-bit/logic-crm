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
