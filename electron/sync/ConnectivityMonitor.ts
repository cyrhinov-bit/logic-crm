import { syncEmitter } from './SyncEvents.js';
export class ConnectivityMonitor {
  static isOnline: boolean = true;
  static setStatus(online: boolean) {
    this.isOnline = online;
    syncEmitter.emit('networkStatusChanged', { isOnline: online });
  }
}
