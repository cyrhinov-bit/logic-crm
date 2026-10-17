export class HardwareError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}
export class DeviceNotFoundError extends HardwareError {}
export class DeviceBusyError extends HardwareError {}
export class DriverNotLoadedError extends HardwareError {}
export class ConnectionLostError extends HardwareError {}
export class UnsupportedDeviceError extends HardwareError {}
