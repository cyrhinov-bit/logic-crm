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
