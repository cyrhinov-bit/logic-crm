import { randomUUID } from 'crypto';

/**
 * Générateur de numéros de ticket côté main-process.
 * Inutilisé par l'app réelle (les tickets `hnv…` sont créés côté web dans
 * PosTerminal) — conservé pour tests/diag uniquement. Format persistant et
 * quasi-unique (timestamp base36 + aléatoire), à préférer à `Date.now()` seul.
 */
export class TicketNumberGenerator {
  static generate(prefix = 'hnv'): string {
    const time = Date.now().toString(36).toUpperCase();
    const rand = randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase();
    return `${prefix}${time}${rand}`;
  }
}
