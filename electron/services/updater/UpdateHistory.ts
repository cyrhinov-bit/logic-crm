export class UpdateHistory {
  private static history: any[] = [];
  static add(entry: any) { this.history.unshift(entry); }
  static getHistory() { return this.history; }
}
