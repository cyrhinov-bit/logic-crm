import { FileText, Users, CheckCircle, Clock, Plus, ShoppingBag, Award, Receipt } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import './DashboardDirecteur.css';

export function DashboardCommercial() {
  const { currentUser: authUser } = useAuth();
  const { quotes, clients, crmPrestations, crmCommissions, invoices, users } = useAppContext();
  const currentUser = users.find(u => u.id === authUser?.id) || authUser;
  const navigate = useNavigate();

  const myQuotes = quotes.filter(q => q.commercialId === currentUser?.id);
  const myClients = clients.filter(c => c.commercialId === currentUser?.id);
  const myPrestations = crmPrestations.filter(p => p.cree_par === currentUser?.id || p.commercial_id === currentUser?.id || p.apporteur_id === currentUser?.id);
  // Rattachement strict : id, créateur, ou nom exact (jamais de sous-chaîne : « Jean » ne doit pas matcher « Jean Kouassi »)
  const myCommissions = crmCommissions.filter(c => c.beneficiaire_id === currentUser?.id || c.cree_par === currentUser?.id || (c.beneficiaire_nom && (currentUser?.name || '') !== '' && c.beneficiaire_nom.trim().toLowerCase() === (currentUser?.name || '').trim().toLowerCase()));
  const myInvoices = invoices.filter(i => i.commercialId === currentUser?.id || (i as any).commercial_id === currentUser?.id || (i as any).createdBy === currentUser?.id || (i as any).created_by === currentUser?.id);

  const totalQuotes = myQuotes.length;
  const acceptedQuotes = myQuotes.filter(q => q.status === 'Accepté');
  const acceptedCount = acceptedQuotes.length;
  const acceptedValue = acceptedQuotes.reduce((sum, q) => sum + q.total, 0);

  const pendingQuotes = myQuotes.filter(q => q.status === 'Envoyé' || q.status === 'Brouillon' || q.status === 'Révision');
  const pendingCount = pendingQuotes.length;
  const pendingValue = pendingQuotes.reduce((sum, q) => sum + q.total, 0);

  const totalValue = myQuotes.filter(q => q.status !== 'Refusé').reduce((sum, q) => sum + q.total, 0);
  const conversionRate = totalQuotes > 0 ? Math.round((acceptedCount / totalQuotes) * 100) : 0;

  const countedPrestations = myPrestations.filter(p => p.statut !== 'ANNULEE' && p.statut !== 'BROUILLON');
  const totalVentePrestations = countedPrestations.reduce((sum, p) => sum + (p.prix_client_final || p.montant_total_vente || 0), 0);
  const totalCommissionsVal = myCommissions.filter(c => c.statut !== 'ANNULEE').reduce((sum, c) => sum + (c.montant || c.montant_commission || 0), 0);
  const totalFactureVal = myInvoices.filter(i => (i.status as string) !== 'ANNULEE' && (i.status as string) !== 'Annulée').reduce((sum, i) => sum + (i.totalAmount || 0), 0);

  const getClientName = (id: string) => clients.find(c => c.id === id)?.name || 'Inconnu';

  const getBadgeColor = (status: string) => {
    switch (status) {
      case 'Accepté': return 'bg-success';
      case 'Refusé': return 'bg-error';
      case 'Envoyé': return 'bg-primary';
      case 'Brouillon': return 'bg-secondary';
      case 'Révision': return 'bg-warning';
      default: return '';
    }
  };

  const recentQuotes = [...myQuotes].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 6);

  return (
    <div className="dashboard">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ margin: 0 }}>Espace Commercial - Mon Tableau de Bord</h2>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem', margin: '4px 0 0' }}>
            Bienvenue {currentUser?.name}. Retrouvez l'état de vos devis, commandes et portefeuille.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-primary" onClick={() => navigate('/devis/nouveau')} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Plus size={16} /> Créer un devis
          </button>
        </div>
      </div>
      
      <div className="widgets-grid">
        {/* Devis Créés */}
        <div className="widget-card" style={{ cursor: 'pointer' }} onClick={() => navigate('/devis')}>
          <div className="widget-icon bg-info">
            <FileText size={28} color="white" />
          </div>
          <div className="widget-content">
            <div className="widget-label">MES DEVIS CRÉÉS</div>
            <div className="widget-value">{totalQuotes}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '2px' }}>
              {totalValue.toLocaleString('fr-FR')} FCFA émis
            </div>
          </div>
        </div>
        
        {/* Devis Acceptés */}
        <div className="widget-card" style={{ cursor: 'pointer' }} onClick={() => navigate('/devis')}>
          <div className="widget-icon bg-success">
            <CheckCircle size={28} color="white" />
          </div>
          <div className="widget-content">
            <div className="widget-label">DEVIS ACCEPTÉS</div>
            <div className="widget-value" style={{ color: 'var(--color-success)' }}>{acceptedCount}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-success)', marginTop: '2px', fontWeight: 600 }}>
              {acceptedValue.toLocaleString('fr-FR')} FCFA ({conversionRate}%)
            </div>
          </div>
        </div>

        {/* Commandes / Prestations (si activé pour le commercial) */}
        {currentUser?.crmPrestationsEnabled && (
          <div className="widget-card" style={{ cursor: 'pointer', borderLeft: '4px solid #10B981' }} onClick={() => navigate('/crm/prestations')}>
            <div className="widget-icon" style={{ background: '#10B981', color: 'white' }}>
              <ShoppingBag size={28} />
            </div>
            <div className="widget-content">
              <div className="widget-label">MES COMMANDES</div>
              <div className="widget-value">{countedPrestations.length}</div>
              <div style={{ fontSize: '0.75rem', color: '#059669', marginTop: '2px', fontWeight: 600 }}>
                {totalVentePrestations.toLocaleString('fr-FR')} FCFA générés
              </div>
            </div>
          </div>
        )}

        {/* Commissions (si activé pour le commercial) */}
        {currentUser?.crmCommissionsEnabled && (
          <div className="widget-card" style={{ cursor: 'pointer', borderLeft: '4px solid #D97706' }} onClick={() => navigate('/crm/commissions')}>
            <div className="widget-icon" style={{ background: '#D97706', color: 'white' }}>
              <Award size={28} />
            </div>
            <div className="widget-content">
              <div className="widget-label">MES COMMISSIONS</div>
              <div className="widget-value">{totalCommissionsVal.toLocaleString('fr-FR')} F</div>
              <div style={{ fontSize: '0.75rem', color: '#D97706', marginTop: '2px', fontWeight: 600 }}>
                {myCommissions.length} commission(s)
              </div>
            </div>
          </div>
        )}

        {/* Facturation (si activé pour le commercial) */}
        {currentUser?.crmFacturationEnabled && (
          <div className="widget-card" style={{ cursor: 'pointer', borderLeft: '4px solid #0284C7' }} onClick={() => navigate('/factures')}>
            <div className="widget-icon" style={{ background: '#0284C7', color: 'white' }}>
              <Receipt size={28} />
            </div>
            <div className="widget-content">
              <div className="widget-label">FACTURES CLIENTS</div>
              <div className="widget-value">{myInvoices.length}</div>
              <div style={{ fontSize: '0.75rem', color: '#0284C7', marginTop: '2px', fontWeight: 600 }}>
                {totalFactureVal.toLocaleString('fr-FR')} FCFA facturés
              </div>
            </div>
          </div>
        )}

        {/* Portefeuille Clients */}
        <div className="widget-card" style={{ cursor: 'pointer' }} onClick={() => navigate('/clients')}>
          <div className="widget-icon bg-primary">
            <Users size={28} color="white" />
          </div>
          <div className="widget-content">
            <div className="widget-label">CLIENTS DU PORTEFEUILLE</div>
            <div className="widget-value">{myClients.length}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '2px' }}>
              Clients assignés
            </div>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ margin: 0 }}>Mes derniers devis</h3>
          <button className="btn btn-outline" style={{ fontSize: '0.8rem', padding: '4px 12px' }} onClick={() => navigate('/devis')}>
            Consulter la liste complète →
          </button>
        </div>
        <div className="table-responsive">
          <table className="data-table responsive-table">
            <thead>
              <tr>
                <th>N° Devis</th>
                <th>Client</th>
                <th>Sujet</th>
                <th style={{ textAlign: 'right' }}>Montant Total</th>
                <th>Statut</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {recentQuotes.map(q => (
                <tr key={q.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/devis/nouveau?editId=${q.id}`)}>
                  <td data-label="N° Devis"><strong>{q.quoteNumber}</strong></td>
                  <td data-label="Client">{getClientName(q.clientId)}</td>
                  <td data-label="Sujet">{q.subject}</td>
                  <td data-label="Montant Total" style={{ textAlign: 'right', fontWeight: 700 }}>{q.total.toLocaleString('fr-FR')} FCFA</td>
                  <td data-label="Statut"><span className={`badge-status ${getBadgeColor(q.status)}`}>{q.status}</span></td>
                  <td data-label="Date">{q.date}</td>
                </tr>
              ))}
              {recentQuotes.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '24px', color: 'var(--color-text-muted)' }}>
                    Aucun devis créé pour l'instant.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
