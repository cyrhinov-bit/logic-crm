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
