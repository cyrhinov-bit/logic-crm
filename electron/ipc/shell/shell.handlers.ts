import { ipcMain } from 'electron';
import { SHELL_CHANNELS } from './shell.channels.js';
import { ShellService } from '../../services/shell/shell.service.js';

export function registerShellHandlers(): void {
  ipcMain.handle(SHELL_CHANNELS.OPEN_EXTERNAL, (_, url) => ShellService.openExternal(url));
  ipcMain.handle(SHELL_CHANNELS.SHOW_ITEM_IN_FOLDER, (_, path) => { ShellService.showItemInFolder(path); });
}
