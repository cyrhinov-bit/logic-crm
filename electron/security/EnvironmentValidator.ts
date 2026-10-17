export class EnvironmentValidator {
  static validate() {
    return {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    };
  }
}
