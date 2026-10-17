import React, { useState } from 'react';
import { X, Check, AlertTriangle, ShieldCheck, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { useAppContext, type Sale, type PaymentType, type PaymentMethod } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import './PaymentModal.css';

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  sale: Sale;
  clientName?: string;
}

export const PaymentModal: React.FC<PaymentModalProps> = ({
  isOpen,
  onClose,
  sale,
  clientName
}) => {
  const { facturePaiements, recordPayment } = useAppContext();
  const { currentUser } = useAuth();

  const salePayments = facturePaiements.filter(p => p.venteId === sale.id && p.status === 'VALIDE');
  const totalEncaisse = salePayments
    .filter(p => p.paymentType === 'ENCAISSEMENT')
    .reduce((sum, p) => sum + p.amount, 0);
  const totalRembourse = salePayments
    .filter(p => p.paymentType === 'REMBOURSEMENT')
    .reduce((sum, p) => sum + p.amount, 0);
  const netPaid = totalEncaisse - totalRembourse;
  const remaining = Math.max(0, sale.total - netPaid);

  const [paymentType, setPaymentType] = useState<PaymentType>('ENCAISSEMENT');
  const [amount, setAmount] = useState<number>(remaining > 0 ? remaining : 0);
  const [paymentDate, setPaymentDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Virement Bancaire');
  const [reference, setReference] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || amount <= 0) {
      setError('Le montant doit être strictement supérieur à 0.');
      return;
    }
    if (!paymentDate) {
      setError('La date du paiement est requise.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await recordPayment({
        paymentType,
        venteId: sale.id,
        clientId: sale.clientId,
        paymentDate,
        amount: Number(amount),
        paymentMethod,
        reference: reference.trim() || undefined,
        notes: notes.trim() || undefined,
        status: 'VALIDE',
        recordedBy: currentUser?.id
      });
      onClose();
    } catch (err: any) {
      console.error('Erreur enregistrement règlement :', err);
      setError(err?.message || 'Une erreur est survenue lors de l\'enregistrement.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="payment-modal-overlay">
      <div className="payment-modal-container">
        <div className="payment-modal-header">
          <div>
            <h3>Saisie d'un Règlement Reçu (Hors-Ligne)</h3>
            <p style={{ fontSize: '0.8rem', color: '#64748B', margin: '2px 0 0 0' }}>
              Facture : <strong>{sale.saleNumber}</strong> — Client : <strong>{clientName || 'Client'}</strong>
            </p>
          </div>
          <button 
            type="button" 
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B' }}
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="payment-modal-body">
            {error && (
              <div style={{
                background: '#FEF2F2', border: '1px solid #FEE2E2', color: '#991B1B',
                padding: '0.75rem', borderRadius: '8px', fontSize: '0.85rem', display: 'flex', gap: '8px', alignItems: 'center'
              }}>
                <AlertTriangle size={16} />
                <span>{error}</span>
              </div>
            )}

            {/* Synthèse Facture */}
            <div className="payment-summary-card">
              <div className="payment-summary-item">
                <div className="label">Total Facturé TTC</div>
                <div className="value">{sale.total.toLocaleString('fr-FR')} F</div>
              </div>
              <div className="payment-summary-item paid">
                <div className="label">Net Encaissé</div>
                <div className="value">{netPaid.toLocaleString('fr-FR')} F</div>
              </div>
              <div className="payment-summary-item remaining">
                <div className="label">Reste à Payer</div>
                <div className="value">{remaining.toLocaleString('fr-FR')} F</div>
              </div>
            </div>

            {/* Type d'opération */}
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                Type d'écriture financière
              </label>
              <div className="payment-type-toggle">
                <button
                  type="button"
                  className={`payment-type-btn ${paymentType === 'ENCAISSEMENT' ? 'active-encaissement' : ''}`}
                  onClick={() => {
                    setPaymentType('ENCAISSEMENT');
                    if (remaining > 0) setAmount(remaining);
                  }}
                >
                  <ArrowDownLeft size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />
                  Encaissement (+ Entrée)
                </button>
                <button
                  type="button"
                  className={`payment-type-btn ${paymentType === 'REMBOURSEMENT' ? 'active-remboursement' : ''}`}
                  onClick={() => {
                    setPaymentType('REMBOURSEMENT');
                    setAmount(0);
                  }}
                >
                  <ArrowUpRight size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />
                  Remboursement (- Sortie)
                </button>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="form-group">
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                  Montant (FCFA) *
                </label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  className="table-input"
                  style={{ width: '100%', fontSize: '1rem', fontWeight: 700 }}
                  value={amount || ''}
                  onChange={e => setAmount(Number(e.target.value))}
                  placeholder="0"
                  required
                />
              </div>

              <div className="form-group">
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                  Date d'effet *
                </label>
                <input
                  type="date"
                  className="table-input"
                  style={{ width: '100%' }}
                  value={paymentDate}
                  onChange={e => setPaymentDate(e.target.value)}
                  required
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="form-group">
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                  Mode de règlement *
                </label>
                <select
                  className="table-input"
                  style={{ width: '100%' }}
                  value={paymentMethod}
                  onChange={e => setPaymentMethod(e.target.value as PaymentMethod)}
                >
                  <option value="Virement Bancaire">Virement Bancaire</option>
                  <option value="Chèque">Chèque</option>
                  <option value="Espèces">Espèces</option>
                  <option value="Mobile Money">Mobile Money (Wave / OM / Moov)</option>
                  <option value="Traite">Traite</option>
                </select>
              </div>

              <div className="form-group">
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                  Référence / N° Chèque / Trans. ID
                </label>
                <input
                  type="text"
                  className="table-input"
                  style={{ width: '100%' }}
                  placeholder="Ex: CHQ-990144 / VIR-2026"
                  value={reference}
                  onChange={e => setReference(e.target.value)}
                />
              </div>
            </div>

            <div className="form-group">
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                Notes & Justificatif
              </label>
              <textarea
                className="table-input"
                style={{ width: '100%', minHeight: '60px' }}
                placeholder="Précisions sur l'échéance ou le motif de l'écriture..."
                value={notes}
                onChange={e => setNotes(e.target.value)}
              />
            </div>

            {/* Avertissement Immuabilité */}
            <div style={{
              background: '#F0FDFA', border: '1px solid #CCFBF1', borderRadius: '8px',
              padding: '0.65rem 0.85rem', display: 'flex', gap: '8px', alignItems: 'center'
            }}>
              <ShieldCheck size={18} color="#0D9488" style={{ flexShrink: 0 }} />
              <p style={{ fontSize: '0.75rem', color: '#0F766E', margin: 0, lineHeight: 1.4 }}>
                <strong>Registre comptable immuable :</strong> Cet enregistrement sera définitivement verrouillé pour la traçabilité financière et auditable.
              </p>
            </div>

            {/* Historique des paiements de la facture */}
            {salePayments.length > 0 && (
              <div className="payment-history-mini">
                <h4>Historique des règlements ({salePayments.length})</h4>
                <table className="payment-history-table">
                  <thead>
                    <tr>
                      <th>Réf</th>
                      <th>Date</th>
                      <th>Type</th>
                      <th>Mode</th>
                      <th style={{ textAlign: 'right' }}>Montant</th>
                    </tr>
                  </thead>
                  <tbody>
                    {salePayments.map(p => (
                      <tr key={p.id}>
                        <td>{p.paymentNumber}</td>
                        <td>{p.paymentDate}</td>
                        <td>
                          <span style={{ 
                            fontSize: '0.7rem', 
                            padding: '1px 5px', 
                            borderRadius: '4px',
                            background: p.paymentType === 'ENCAISSEMENT' ? '#DCFCE7' : '#FEE2E2',
                            color: p.paymentType === 'ENCAISSEMENT' ? '#166534' : '#991B1B'
                          }}>
                            {p.paymentType}
                          </span>
                        </td>
                        <td>{p.paymentMethod}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>
                          {p.paymentType === 'ENCAISSEMENT' ? '+' : '-'}{p.amount.toLocaleString('fr-FR')} F
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="payment-modal-footer">
            <button
              type="button"
              className="btn btn-outline"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Annuler
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isSubmitting}
            >
              <Check size={16} style={{ marginRight: '6px' }} />
              {isSubmitting ? 'Enregistrement...' : "Enregistrer l'écriture de règlement"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};