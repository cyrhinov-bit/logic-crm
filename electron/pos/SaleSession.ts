import { posEmitter } from './PosEvents.js';
/**
 * Session mémoire de DÉMONSTRATION (page de diagnostic uniquement).
 * La source de vérité des caisses est `pos_cash_sessions` (Supabase), gérée
 * côté web — ne jamais considérer cette session comme une caisse réelle
 * (double source de vérité sinon).
 */
export class SaleSession {
  private static currentSession: any = null;

  static startSession(userId: string) {
    if (this.currentSession) throw new Error('Une session est déjà en cours.');
    this.currentSession = { id: Date.now().toString(), userId, startTime: new Date().toISOString(), status: 'OPEN' };
    posEmitter.emit('sessionOpened', this.currentSession);
    return this.currentSession;
  }

  static closeSession() {
    if (!this.currentSession) throw new Error('Aucune session en cours.');
    const closedSession = { ...this.currentSession, endTime: new Date().toISOString(), status: 'CLOSED' };
    this.currentSession = null;
    posEmitter.emit('sessionClosed', closedSession);
    return closedSession;
  }

  static getSession() { return this.currentSession; }
}
