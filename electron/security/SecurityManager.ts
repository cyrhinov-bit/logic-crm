import { EnvironmentValidator } from './EnvironmentValidator.js';
import { SessionManager } from './SessionManager.js';

export class SecurityManager {
  static getStatus() {
    return {
      environment: EnvironmentValidator.validate(),
      sessionActive: SessionManager.isActive(),
      secureStorageReady: true
    };
  }
}
