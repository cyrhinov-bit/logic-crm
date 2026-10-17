export interface ScannerConfig {
  prefix: string;
  suffix: string;
  maxKeyDelay: number;
  autoReconnect: boolean;
  activeDeviceId?: string;
  symbology: string;
}

export class ScannerConfiguration {
  private static config: ScannerConfig = {
    prefix: '',
    suffix: '\n',
    maxKeyDelay: 50,
    autoReconnect: true,
    symbology: 'auto'
  };

  static getConfig(): ScannerConfig { return { ...this.config }; }
  static setConfig(c: Partial<ScannerConfig>): void { this.config = { ...this.config, ...c }; }
}
