import fs from 'fs/promises';
import { existsSync } from 'fs';
import { app } from 'electron';

export class FileSystemService {
  static async readFile(filePath: string): Promise<string> { return fs.readFile(filePath, 'utf-8'); }
  static async writeFile(filePath: string, content: string): Promise<boolean> {
    await fs.writeFile(filePath, content, 'utf-8');
    return true;
  }
  static async exists(filePath: string): Promise<boolean> { return existsSync(filePath); }
  static getSystemPaths(): any {
    return {
      userData: app.getPath('userData'),
      appData: app.getPath('appData'),
      documents: app.getPath('documents'),
      downloads: app.getPath('downloads')
    };
  }
}
