import { ipcMain } from 'electron';
import { CLIPBOARD_CHANNELS } from './clipboard.channels.js';
import { ClipboardService } from '../../services/clipboard/clipboard.service.js';

export function registerClipboardHandlers(): void {
  ipcMain.handle(CLIPBOARD_CHANNELS.READ_TEXT, () => ClipboardService.readText());
  ipcMain.handle(CLIPBOARD_CHANNELS.WRITE_TEXT, (_, text) => { ClipboardService.writeText(text); });
  ipcMain.handle(CLIPBOARD_CHANNELS.CLEAR, () => { ClipboardService.clear(); });
}
