import { FileValidator } from './FileValidator.js';
import path from 'path';
import fs from 'fs/promises';

export class TempFileService {
  static async createTempFile(prefix: string, content: string): Promise<string> {
    const fileName = `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}.tmp`;
    const safePath = FileValidator.validateSafePath('temp', fileName);
    await fs.mkdir(path.dirname(safePath), { recursive: true });
    await fs.writeFile(safePath, content, 'utf-8');
    return safePath;
  }
  
  static async cleanupOldTempFiles(_maxAgeMs: number = 86400000): Promise<void> {
    // Logique de nettoyage à implémenter plus tard
  }
}
