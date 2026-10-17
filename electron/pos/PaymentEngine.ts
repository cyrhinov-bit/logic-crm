import { posEmitter } from './PosEvents.js';
// Moteur de démonstration UNIQUEMENT (page de diagnostic) : non adossé à un TPE,
// ne jamais brancher sur le terminal de vente réel (ventes gratuites sinon).
const ALLOWED_METHODS = ['Espèces', 'Mobile Money', 'Mixte', 'Carte'];
export class PaymentEngine {
  static async processPayment(amount: number, method: string) {
    if (!(Number(amount) > 0)) {
      throw new Error('Montant de paiement invalide (doit être > 0).');
    }
    if (!ALLOWED_METHODS.includes(String(method))) {
      throw new Error(`Moyen de paiement non pris en charge : ${String(method)}`);
    }
    posEmitter.emit('paymentStarted', { amount, method });
    await new Promise(r => setTimeout(r, 500)); // Simule un traitement de paiement
    posEmitter.emit('paymentCompleted', { amount, method, status: 'SUCCESS' });
    return { success: true, amount, method, transactionId: 'TXN-' + Date.now() };
  }
}
