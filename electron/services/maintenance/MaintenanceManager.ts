import { maintenanceEmitter } from './MaintenanceEvents.js';

export class MaintenanceManager {
  private static isMaintenance = false;

  static getState() { return this.isMaintenance; }
  static setMode(active: boolean) {
    this.isMaintenance = active;
    maintenanceEmitter.emit('modeChanged', active);
  }
}
