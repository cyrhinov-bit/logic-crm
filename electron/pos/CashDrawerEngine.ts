import { posEmitter } from './PosEvents.js';
/**
 * STUB de démonstration (page de diagnostic uniquement) : aucun pilote
 * tiroir réel (HID/ESC-POS) n'est branché — retourne toujours `true`.
 * Ne pas exposer comme un succès matériel tant que le driver n'est pas câblé.
 */
export class CashDrawerEngine {
  static async openDrawer() {
    // Ici, le code d'envoi du signal ESC/POS d'ouverture au port configuré
    posEmitter.emit('cashDrawerOpened', { timestamp: new Date().toISOString() });
    return true;
  }
}
