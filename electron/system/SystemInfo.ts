import os from 'os';
import { app } from 'electron';

export class SystemInfo {
  static getMetrics() {
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
    };
  }
}
