import { clipboard } from 'electron';

export class ClipboardService {
  static readText(): string { return clipboard.readText(); }
  static writeText(text: string): void { clipboard.writeText(text); }
  static clear(): void { clipboard.clear(); }
}
