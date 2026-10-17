import fs from 'fs';
import path from 'path';
import { app } from 'electron';

export class SettingsService {
  private static getPath() { return path.join(app.getPath('userData'), 'settings.json'); }
  static getSetting(key: string): any {
    try {
      const data = fs.readFileSync(this.getPath(), 'utf-8');
      return JSON.parse(data)[key];
    } catch { return null; }
  }
  static setSetting(key: string, value: any): void {
    let settings: any = {};
    try {
      settings = JSON.parse(fs.readFileSync(this.getPath(), 'utf-8'));
    } catch {}
    settings[key] = value;
    fs.writeFileSync(this.getPath(), JSON.stringify(settings));
  }
}
