import { DeviceRegistry } from './DeviceRegistry.js';

export class DeviceDiscovery {
  static async discover(): Promise<void> {
    // Simulation de découverte USB/Série
    DeviceRegistry.register({
      id: 'mock-scanner-usb',
      type: 'scanner',
      manufacturer: 'Zebra',
      model: 'DS2208',
      status: 'connected',
      capabilities: ['usb-hid', 'barcode-2d'],
      driverLoaded: true
    });
    
    DeviceRegistry.register({
      id: 'mock-cashdrawer-1',
      type: 'cashdrawer',
      status: 'connected',
      capabilities: ['rj11'],
      driverLoaded: true
    });
  }
}
