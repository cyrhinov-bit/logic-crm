import { DeviceDiscovery } from './DeviceDiscovery.js';
import { DeviceRegistry } from './DeviceRegistry.js';

export class HardwareManager {
  static async initialize() {
    await DeviceDiscovery.discover();
  }
  static getDevices() {
    return DeviceRegistry.getAllDevices();
  }
  static async discover() {
    await DeviceDiscovery.discover();
    return this.getDevices();
  }
}
