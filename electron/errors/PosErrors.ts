export class PosError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}
export class ReceiptPrintFailedError extends PosError {}
export class CashDrawerOpenError extends PosError {}
export class PaymentFailedError extends PosError {}
export class ReceiptFormatError extends PosError {}
export class PosSessionError extends PosError {}
export class CustomerDisplayError extends PosError {}
