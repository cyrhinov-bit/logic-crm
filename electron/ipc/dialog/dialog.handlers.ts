import { ipcMain } from 'electron';
import { DIALOG_CHANNELS } from './dialog.channels.js';
import { DialogService } from '../../services/dialog/dialog.service.js';

export function registerDialogHandlers(): void {
  ipcMain.handle(DIALOG_CHANNELS.SHOW_MESSAGE_BOX, (_, opts) => DialogService.showMessageBox(opts));
  ipcMain.handle(DIALOG_CHANNELS.SHOW_OPEN_DIALOG, (_, opts) => DialogService.showOpenDialog(opts));
}
