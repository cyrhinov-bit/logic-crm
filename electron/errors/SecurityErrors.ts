export class SecurityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}
export class InvalidPermissionError extends SecurityError {}
export class InvalidTokenError extends SecurityError {}
export class EncryptionError extends SecurityError {}
export class SecurityViolationError extends SecurityError {}
export class InvalidEnvironmentError extends SecurityError {}
