import { registerSystemHandlers } from './system/system.handlers.js';
import { registerDialogHandlers } from './dialog/dialog.handlers.js';
import { registerFileSystemHandlers } from './filesystem/filesystem.handlers.js';
import { registerShellHandlers } from './shell/shell.handlers.js';
import { registerClipboardHandlers } from './clipboard/clipboard.handlers.js';
import { registerNotificationHandlers } from './notification/notification.handlers.js';
import { registerNetworkHandlers } from './network/network.handlers.js';
import { registerLoggerHandlers } from './logger/logger.handlers.js';
import { registerSettingsHandlers } from './settings/settings.handlers.js';
import { registerBackupHandlers } from './backup/backup.handlers.js';
import { registerUpdaterHandlers } from './updater/updater.handlers.js';
import { registerDiagnosticsHandlers } from './diagnostics/diagnostics.handlers.js';
import { registerMaintenanceHandlers } from './maintenance/maintenance.handlers.js';
import { registerSecurityHandlers } from './security/security.handlers.js';
import { registerPerformanceHandlers } from './performance/performance.handlers.js';
import { registerSyncHandlers } from './sync/sync.handlers.js';
import { registerMailHandlers } from './mail/mail.handlers.js';

export function registerIpcHandlers(): void {
  registerSystemHandlers();
  registerDialogHandlers();
  registerFileSystemHandlers();
  registerShellHandlers();
  registerClipboardHandlers();
  registerNotificationHandlers();
  registerNetworkHandlers();
  registerLoggerHandlers();
  registerSettingsHandlers();
  registerBackupHandlers();
  registerUpdaterHandlers();
  registerDiagnosticsHandlers();
  registerMaintenanceHandlers();
  registerSecurityHandlers();
  registerPerformanceHandlers();
  registerSyncHandlers();
  registerMailHandlers();
}
