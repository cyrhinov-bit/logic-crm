import { Device } from './Device.js';

export class DeviceRegistry {
  private static devices: Map<string, Device> = new Map();

  static register(device: Device): void {
    this.devices.set(device.id, device);
  }

  static unregister(id: string): void {
    this.devices.delete(id);
  }

  static getDevice(id: string): Device | undefined {
    return this.devices.get(id);
  }

  static getAllDevices(): Device[] {
    return Array.from(this.devices.values());
  }
}
