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
