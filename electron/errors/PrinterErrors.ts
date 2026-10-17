export class PrinterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}
export class PrinterOfflineError extends PrinterError {}
export class PaperOutError extends PrinterError {}
export class PrinterBusyError extends PrinterError {}
export class PrintCancelledError extends PrinterError {}
export class PrinterNotFoundError extends PrinterError {}
