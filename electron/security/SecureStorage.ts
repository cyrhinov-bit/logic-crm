import { EncryptionService } from './EncryptionService.js';

export class SecureStorage {
  private static store = new Map<string, string>();

  static set(key: string, value: string) {
    this.store.set(key, EncryptionService.encrypt(value));
  }

  static get(key: string): string | null {
    const val = this.store.get(key);
    if (!val) return null;
    try { return EncryptionService.decrypt(val); } catch { return null; }
  }
}
