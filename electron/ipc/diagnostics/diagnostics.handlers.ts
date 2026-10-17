import { ipcMain } from 'electron';
import { DIAGNOSTICS_CHANNELS } from './diagnostics.channels.js';
import { DiagnosticManager } from '../../services/diagnostics/index.js';

export function registerDiagnosticsHandlers(): void {
  ipcMain.handle(DIAGNOSTICS_CHANNELS.RUN, () => DiagnosticManager.runDiagnostics());
  ipcMain.handle(DIAGNOSTICS_CHANNELS.GET_METRICS, () => DiagnosticManager.getSystemMetrics());
}
