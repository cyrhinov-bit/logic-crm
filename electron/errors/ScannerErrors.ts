export class ScannerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}
export class ScannerNotFoundError extends ScannerError {}
export class InvalidBarcodeError extends ScannerError {}
export class UnsupportedBarcodeError extends ScannerError {}
export class ScannerDisconnectedError extends ScannerError {}
export class ScannerBusyError extends ScannerError {}
