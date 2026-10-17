const fs = require('fs');
const path = require('path');

function write(filePath, content) {
  const fullPath = path.join(__dirname, filePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content.trim() + '\n');
}

// 1. Errors
write('electron/errors/HardwareErrors.ts', `
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
`);

// 2. Hardware Models
write('electron/services/hardware/Device.ts', `
export interface Device {
  id: string;
  type: 'scanner' | 'cashdrawer' | 'display' | 'scale' | 'payment' | 'printer' | 'unknown';
  manufacturer?: string;
  model?: string;
  status: 'connected' | 'disconnected' | 'error';
  capabilities: string[];
  driverLoaded: boolean;
}
`);

// 3. Registry
write('electron/services/hardware/DeviceRegistry.ts', `
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
`);

// 4. Discovery
write('electron/services/hardware/DeviceDiscovery.ts', `
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
`);

// 5. DriverLoader, Monitor, Health
write('electron/services/hardware/DriverLoader.ts', 'export class DriverLoader { static loadDriver(device: any) { return true; } }');
write('electron/services/hardware/DeviceMonitor.ts', 'export class DeviceMonitor { static start() {} static stop() {} }');
write('electron/services/hardware/DeviceHealth.ts', 'export class DeviceHealth { static checkHealth() { return true; } }');
write('electron/services/hardware/HardwareManager.ts', `
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
`);
write('electron/services/hardware/index.ts', `
export * from './Device.js';
export * from './DeviceRegistry.js';
export * from './DeviceDiscovery.js';
export * from './HardwareManager.js';
export * from './DriverLoader.js';
export * from './DeviceMonitor.js';
export * from './DeviceHealth.js';
`);

// 6. Drivers (Squelettes)
const drivers = ['scanner', 'cashdrawer', 'display', 'scale', 'payment', 'printer'];
drivers.forEach(name => {
  const ClassName = name.charAt(0).toUpperCase() + name.slice(1) + 'Driver';
  write("electron/services/drivers/" + name + "/" + ClassName + ".ts", "export class " + ClassName + " {}");
  write("electron/services/drivers/" + name + "/index.ts", "export * from './" + ClassName + ".js';");
});

// 7. IPC Channels & Handlers
write('electron/ipc/hardware/hardware.channels.ts', `
export const HARDWARE_CHANNELS = {
  GET_DEVICES: 'hardware:getDevices',
  DISCOVER: 'hardware:discover',
} as const;
`);

write('electron/ipc/hardware/hardware.handlers.ts', `
import { ipcMain } from 'electron';
import { HARDWARE_CHANNELS } from './hardware.channels.js';
import { HardwareManager } from '../../services/hardware/index.js';
import { HardwareError } from '../../errors/HardwareErrors.js';

export function registerHardwareHandlers(): void {
  HardwareManager.initialize();

  const handle = (channel: string, handler: (...args: any[]) => Promise<any> | any) => {
    ipcMain.handle(channel, async (_, ...args) => {
      try {
        return await handler(...args);
      } catch (err: any) {
        if (err instanceof HardwareError) {
          throw new Error(JSON.stringify({ name: err.name, message: err.message }));
        }
        throw err;
      }
    });
  };

  handle(HARDWARE_CHANNELS.GET_DEVICES, () => HardwareManager.getDevices());
  handle(HARDWARE_CHANNELS.DISCOVER, () => HardwareManager.discover());
}
`);

console.log('Fichiers Hardware générés.');
