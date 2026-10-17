import os from 'os';
export class SystemDiagnostics {
  static getMetrics() {
    return {
      platform: os.platform(),
      arch: os.arch(),
      totalMem: os.totalmem(),
      freeMem: os.freemem(),
      cpus: os.cpus().length,
      uptime: os.uptime()
    };
  }
}
