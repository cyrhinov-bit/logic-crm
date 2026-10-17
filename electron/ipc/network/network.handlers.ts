import { ipcMain } from 'electron';
import { NETWORK_CHANNELS } from './network.channels.js';
import { NetworkService } from '../../services/network/network.service.js';

export function registerNetworkHandlers(): void {
  ipcMain.handle(NETWORK_CHANNELS.IS_ONLINE, () => NetworkService.isOnline());
}
