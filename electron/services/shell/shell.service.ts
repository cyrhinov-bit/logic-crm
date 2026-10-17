import { shell } from 'electron';

export class ShellService {
  static async openExternal(url: string): Promise<void> { await shell.openExternal(url); }
  static showItemInFolder(fullPath: string): void { shell.showItemInFolder(fullPath); }
}
