import { webContents } from 'electron';

export interface PrinterInfo {
  name: string;
  displayName: string;
  description: string;
  status: number;
  isDefault: boolean;
  options: any;
}

export class PrinterDiscovery {
  static async getPrinters(): Promise<PrinterInfo[]> {
    // Dans Electron, on peut utiliser webContents.getAllWebContents()[0].getPrintersAsync()
    const contents = webContents.getAllWebContents()[0];
    if (contents) {
      return (await contents.getPrintersAsync()) as unknown as PrinterInfo[];
    }
    return [];
  }
}
