export class SessionManager {
  private static active = false;
  static startSession() { this.active = true; }
  static endSession() { this.active = false; }
  static isActive() { return this.active; }
}
