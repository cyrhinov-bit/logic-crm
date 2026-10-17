import { app } from 'electron';
import os from 'os';

export class SystemService {
  static getVersion(): string { return app.getVersion(); }
  static getPlatform(): string { return os.platform(); }
  static ping(): string { return 'pong'; }
  static getMetrics(): any {
    return {
      appVersion: app.getVersion(),
      electronVersion: process.versions.electron,
      chromeVersion: process.versions.chrome,
      nodeVersion: process.versions.node,
      platform: os.platform(),
      architecture: os.arch(),
      totalMem: os.totalmem(),
      freeMem: os.freemem(),
      cpus: os.cpus().length,
      username: os.userInfo().username,
      language: app.getLocale(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
    };
  }
}
