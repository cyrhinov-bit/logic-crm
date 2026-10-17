import { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';

export function CommercialClients() {
  const { currentUser } = useAuth();
  const { clients, quotes, sales } = useAppContext();
  const [filter, setFilter] = useState('');

  const myClients = clients.filter(c => c.commercialId === currentUser?.id);

  const filteredClients = myClients.filter(c => {
    return c.name.toLowerCase().includes(filter.toLowerCase()) || (c.company || '').toLowerCase().includes(filter.toLowerCase());
  });

  const getClientQuotes = (clientId: string) => quotes.filter(q => q.clientId === clientId);
  const getClientSales = (clientId: string) => sales.filter(s => s.clientId === clientId);

  return (
    <div className="dashboard">
      <h2>Mes Clients Apportés</h2>
      <p style={{ color: 'var(--color-text-muted)', marginBottom: '24px' }}>Clients que vous avez convertis depuis vos prospects (lecture seule)</p>

      <div className="card">
        <div style={{ marginBottom: '24px' }}>
          <input 
            type="text" 
            className="table-input" 
            placeholder="Rechercher par nom ou société..." 
            style={{ maxWidth: '300px' }} 
            value={filter}
            onChange={e => setFilter(e.target.value)}
          />
        </div>

        {filteredClients.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '24px', color: 'var(--color-text-muted)' }}>
            Aucun client apporté.
          </div>
        ) : (
          <div className="mobile-card-grid">
            {filteredClients.map(c => (
              <div key={c.id} className="mobile-card">
                <div className="mobile-card-header">
                  <div>
                    <div className="mobile-card-title">{c.name}</div>
                    <div className="mobile-card-subtitle">{c.company || 'Particulier'}</div>
                  </div>
                  <span className="badge-status bg-success">{c.status || 'Actif'}</span>
                </div>
                
                <div className="mobile-card-body">
                  <div className="mobile-card-row">
                    <span className="mobile-card-label">Contact</span>
                    <span className="mobile-card-value">{c.contact || c.name}</span>
                  </div>
                  <div className="mobile-card-row">
                    <span className="mobile-card-label">Email</span>
                    <span className="mobile-card-value">{c.email || '-'}</span>
                  </div>
                  <div className="mobile-card-row">
                    <span className="mobile-card-label">Téléphone</span>
                    <span className="mobile-card-value">{c.phone || '-'}</span>
                  </div>
                  <div className="mobile-card-row">
                    <span className="mobile-card-label">Devis</span>
                    <span className="mobile-card-value">{getClientQuotes(c.id).length}</span>
                  </div>
                  <div className="mobile-card-row">
                    <span className="mobile-card-label">Ventes</span>
                    <span className="mobile-card-value">{getClientSales(c.id).length}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
