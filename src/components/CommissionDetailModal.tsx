import React from 'react';
import { X, CheckCircle, DollarSign, Briefcase, FileText, User, Building, TrendingUp } from 'lucide-react';
import { useAppContext, type Commission } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import './CommissionDetailModal.css';

interface CommissionDetailModalProps {
  commission: Commission;
  onClose: () => void;
}

export function CommissionDetailModal({ commission, onClose }: CommissionDetailModalProps) {
  const { clients, users, services, sales, facturePaiements, updateCommissionStatus } = useAppContext();
  const { currentUser } = useAuth();

  const isDirection = ['Directeur', 'Directeur adjoint', 'SuperAdmin'].includes(currentUser?.role || '');

  const client = clients.find(c => c.id === commission.clientId);
  const commercial = users.find(u => u.id === commission.commercialId);
  const service = services.find(s => s.id === commission.serviceId);
  const sale = sales.find(s => s.id === commission.saleId);

  // Historique : les coûts directs étaient liés via les affaires (module retiré) — conservés en base mais non affichés.
  const linkedCouts: any[] = [];
  const directCostsFromTable = linkedCouts.reduce((sum, c) => sum + (c.amountHt || 0), 0);
  const linesCost = (sale?.lines || []).reduce((sum, l) => sum + ((l.costPrice || 0) * (l.quantity || 0)), 0);
  const totalCosts = directCostsFromTable > 0 ? directCostsFromTable : (commission.costTotal || linesCost);

  // Customer payments received on invoice
  const payments = sale?.id ? facturePaiements.filter(p => p.venteId === sale.id && p.status === 'VALIDE') : [];
  const netReceived = payments.reduce((sum, p) => p.paymentType === 'ENCAISSEMENT' ? sum + p.amount : sum - p.amount, 0);
  const totalTtc = sale?.total || 1;
  const collectionRate = Math.max(0, Math.min(100, Math.round((netReceived / totalTtc) * 100)));

  // Unlockable amount
  const eligibleAmount = Math.round((commission.commissionAmount * collectionRate) / 100);
  const paidAmount = commission.paidAmount || 0;
  const remainingToPay = Math.max(0, commission.commissionAmount - paidAmount);

  const formatMoney = (val: number) => val.toLocaleString('fr-FR') + ' FCFA';

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Payée': return <span className="badge-status bg-success">Payée</span>;
      case 'Validée': return <span className="badge-status bg-primary">Validée</span>;
      case 'Annulée': return <span className="badge-status bg-danger">Annulée</span>;
      default: return <span className="badge-status bg-warning">En attente</span>;
    }
  };

  return (
    <div className="commission-modal-backdrop" onClick={onClose}>
      <div className="commission-modal-container" onClick={e => e.stopPropagation()}>
        <div className="commission-modal-header">
          <div className="commission-modal-title">
            <TrendingUp size={20} color="#1879C8" />
            <span>Détail du Calcul de la Commission</span>
          </div>
          <button className="btn-icon" onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}>
            <X size={20} />
          </button>
        </div>

        <div className="commission-modal-body">
          {/* Header Metadata */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#F1F5F9', padding: '0.85rem 1.15rem', borderRadius: '8px' }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#0F172A' }}>
                {client?.name || 'Client inconnu'}
              </div>
              <div style={{ fontSize: '0.8rem', color: '#64748B', display: 'flex', gap: '12px', marginTop: '2px' }}>
                <span><User size={12} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '3px' }} />{commercial?.name || 'Commercial non assigné'}</span>
                <span><Building size={12} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '3px' }} />{service?.name || '-'}</span>
              </div>
            </div>
            <div>
              {getStatusBadge(commission.status)}
            </div>
          </div>

          {/* KPI Summary Grid */}
          <div className="commission-grid-summary">
            <div className="commission-stat-box">
              <div className="commission-stat-label">CA Facturé HT</div>
              <div className="commission-stat-value text-blue-600">{formatMoney(commission.totalHt)}</div>
              <div className="commission-stat-sub">Vente: {sale?.saleNumber || '-'}</div>
            </div>

            <div className="commission-stat-box">
              <div className="commission-stat-label">Coûts Déduits</div>
              <div className="commission-stat-value text-red-600">{formatMoney(totalCosts)}</div>
              <div className="commission-stat-sub">{directCostsFromTable > 0 ? `${linkedCouts.length} coût(s) directs` : 'Coûts unitaires'}</div>
            </div>

            <div className="commission-stat-box">
              <div className="commission-stat-label">Marge Réelle HT</div>
              <div className="commission-stat-value text-green-600">{formatMoney(commission.marginAmount)}</div>
              <div className="commission-stat-sub">Taux: {commission.marginPercent}%</div>
            </div>

            <div className="commission-stat-box">
              <div className="commission-stat-label">Commission Totale</div>
              <div className="commission-stat-value text-teal-700">{formatMoney(commission.commissionAmount)}</div>
              <div className="commission-stat-sub">Taux: {commission.commissionPercent}%</div>
            </div>
          </div>

          {/* Encaissements & Déblocage Section */}
          <div className="commission-section-card">
            <div className="commission-section-header">
              <span>Encaissements Client & Prorata de Déblocage</span>
              <span className="badge-status bg-info">{collectionRate}% Encaissé</span>
            </div>

            <div style={{ marginBottom: '12px' }}>
              <div style={{ height: '8px', background: '#E2E8F0', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ height: '100%', background: '#1879C8', width: `${collectionRate}%`, borderRadius: '4px' }} />
              </div>
            </div>

            <div className="commission-row-item">
              <span style={{ color: '#64748B' }}>Total Facture TTC</span>
              <span style={{ fontWeight: 600 }}>{formatMoney(totalTtc)}</span>
            </div>
            <div className="commission-row-item">
              <span style={{ color: '#64748B' }}>Règlements Nets Perçus (Comptabilité)</span>
              <span style={{ fontWeight: 600, color: '#059669' }}>{formatMoney(netReceived)}</span>
            </div>
            <div className="commission-row-item">
              <span style={{ color: '#64748B' }}>Montant de Commission Éligible / Déblocable</span>
              <span style={{ fontWeight: 700, color: '#1879C8' }}>{formatMoney(eligibleAmount)}</span>
            </div>
            <div className="commission-row-item">
              <span style={{ color: '#64748B' }}>Montant Déjà Payé au Commercial</span>
              <span style={{ fontWeight: 600, color: '#4F46E5' }}>{formatMoney(paidAmount)}</span>
            </div>
            <div className="commission-row-item" style={{ paddingTop: '8px', borderTop: '2px dashed #E2E8F0' }}>
              <span style={{ fontWeight: 700, color: '#0F172A' }}>Solde Restant à Percevoir</span>
              <span style={{ fontWeight: 700, fontSize: '1rem', color: remainingToPay > 0 ? '#D97706' : '#059669' }}>
                {formatMoney(remainingToPay)}
              </span>
            </div>
          </div>
        </div>

        <div className="commission-modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Fermer
          </button>

          {isDirection && commission.status === 'En attente' && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={async () => {
                await updateCommissionStatus(commission.id, 'Validée');
                onClose();
              }}
            >
              <CheckCircle size={16} style={{ marginRight: '6px' }} />
              Valider la Commission
            </button>
          )}

          {isDirection && commission.status === 'Validée' && (
            <button
              type="button"
              className="btn btn-success"
              onClick={async () => {
                await updateCommissionStatus(commission.id, 'Payée', commission.commissionAmount);
                onClose();
              }}
            >
              <DollarSign size={16} style={{ marginRight: '6px' }} />
              Marquer Payée ({formatMoney(remainingToPay)})
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

