import { SystemDiagnostics } from './SystemDiagnostics.js';
import { ReportGenerator } from './ReportGenerator.js';

export class DiagnosticManager {
  static getSystemMetrics() { return SystemDiagnostics.getMetrics(); }
  static async runDiagnostics() { return await ReportGenerator.generateReport(); }
}
