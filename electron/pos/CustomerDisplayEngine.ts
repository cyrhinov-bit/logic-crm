/**
 * STUB de démonstration (page de diagnostic uniquement) : aucun afficheur
 * VFD/LCD n'est piloté — no-op retournant `true`.
 */
export class CustomerDisplayEngine {
  static async showMessage(_line1: string, _line2: string) {
    // Code d'envoi VFD/LCD
    return true;
  }
}
