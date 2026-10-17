import { SystemDiagnostics } from './SystemDiagnostics.js';
import { LoggerManager } from '../logger/index.js';

export class ReportGenerator {
  static async generateReport() {
    return {
      timestamp: new Date().toISOString(),
      system: SystemDiagnostics.getMetrics(),
      logs: LoggerManager.getLogs().slice(0, 50)
    };
  }
}
