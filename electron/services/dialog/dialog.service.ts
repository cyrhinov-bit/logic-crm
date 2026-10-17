import { dialog } from 'electron';
import { WindowManager } from '../../windows/WindowManager.js';

export class DialogService {
  static async showMessageBox(options: any): Promise<any> {
    const win = WindowManager.getMainWindow();
    return win ? dialog.showMessageBox(win, options) : dialog.showMessageBox(options);
  }
  static async showOpenDialog(options: any): Promise<any> {
    const win = WindowManager.getMainWindow();
    return win ? dialog.showOpenDialog(win, options) : dialog.showOpenDialog(options);
  }
}
