import { useState } from 'react';
import { useAppContext } from '../../context/AppContext';
import { AlertTriangle, Package, TrendingDown, Search } from 'lucide-react';
import ProductImage from '../../features/products/images/ProductImage';
import { matchesProductSearch } from '../../lib/searchUtils';

export default function PosStock() {
  const { posProducts } = useAppContext();
  const [searchTerm, setSearchTerm] = useState('');

  // F16 : seuil par défaut 10 quand minStock n'est pas renseigné (cohérent avec
  // la fiche produit) ; rupture sur quantité ≤ 0 (jamais de négatif silencieux).
  const DEFAULT_MIN_STOCK = 10;
  const physicalProducts = posProducts.filter(p => p.family !== 'Service');
  const lowStock = physicalProducts.filter(p => p.quantity <= (p.minStock > 0 ? p.minStock : DEFAULT_MIN_STOCK));
  const outOfStock = physicalProducts.filter(p => p.quantity <= 0);
  
  // Rendre les calculs robustes si un produit n'a pas de prix défini
  const totalStockValue = physicalProducts.reduce((sum, p) => sum + (p.purchasePrice || 0) * (p.quantity || 0), 0);
  const totalSellingValue = physicalProducts.reduce((sum, p) => sum + (p.sellingPrice || 0) * (p.quantity || 0), 0);

  const filteredProducts = posProducts.filter(p => {
    if (!searchTerm || !searchTerm.trim()) return true;
    return matchesProductSearch(p, searchTerm);
  });

  const cardStyle: React.CSSProperties = { background: 'white', borderRadius: 'var(--radius-lg)', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' };
  const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 14px', paddingLeft: '36px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', fontSize: '14px', outline: 'none' };

  return (
    <div className="pos-page">
      <h1 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '20px' }}>Gestion du Stock</h1>
      <div className="pos-kpi-grid">
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ background: 'var(--color-success-tint)', borderRadius: 'var(--radius-md)', padding: '10px' }}><Package size={24} color="var(--color-success)" /></div>
            <div><div style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>Total produits</div><div style={{ fontSize: '24px', fontWeight: 700 }}>{posProducts.length}</div></div>
          </div>
        </div>
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ background: 'var(--color-warning-tint)', borderRadius: 'var(--radius-md)', padding: '10px' }}><TrendingDown size={24} color="var(--color-warning)" /></div>
            <div><div style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>Valeur stock (achat)</div><div style={{ fontSize: '24px', fontWeight: 700 }}>{totalStockValue.toLocaleString()} FCFA</div></div>
          </div>
        </div>
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ background: 'var(--color-primary-tint)', borderRadius: 'var(--radius-md)', padding: '10px' }}><Package size={24} color="var(--color-primary)" /></div>
            <div><div style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>Valeur stock (vente)</div><div style={{ fontSize: '24px', fontWeight: 700 }}>{totalSellingValue.toLocaleString()} FCFA</div></div>
          </div>
        </div>
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ background: 'var(--color-error-tint)', borderRadius: 'var(--radius-md)', padding: '10px' }}><AlertTriangle size={24} color="var(--color-error)" /></div>
            <div><div style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>Ruptures de stock</div><div style={{ fontSize: '24px', fontWeight: 700 }}>{outOfStock.length}</div></div>
          </div>
        </div>
      </div>
      
      {lowStock.length > 0 && (
        <div style={{ ...cardStyle, marginBottom: '24px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '12px', color: 'var(--color-error)' }}>Alertes Stock ({lowStock.length})</h3>
          <div className="table-responsive">
<table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr style={{ borderBottom: '1px solid var(--color-border)', textAlign: 'left' }}><th style={{ padding: '10px 12px', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-muted)' }}>Produit</th><th style={{ padding: '10px 12px', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-muted)', textAlign: 'right' }}>Stock actuel</th><th style={{ padding: '10px 12px', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-muted)', textAlign: 'right' }}>Stock minimum</th></tr></thead>
            <tbody>
              {lowStock.map(p => (
                <tr key={p.id} style={{ borderBottom: '1px solid var(--color-surface-alt)', background: 'var(--color-error-tint)' }}>
                  <td style={{ padding: '10px 12px', fontSize: '14px' }}>{p.name}</td>
                  <td style={{ padding: '10px 12px', fontSize: '14px', textAlign: 'right', fontWeight: 700, color: 'var(--color-error)' }}>{p.quantity}</td>
                  <td style={{ padding: '10px 12px', fontSize: '14px', textAlign: 'right' }}>{p.minStock}</td>
                </tr>
              ))}
            </tbody>
          </table>
</div>
        </div>
      )}

      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 600 }}>Consultation du Stock</h3>
          <div style={{ position: 'relative', width: '300px' }}>
            <Search size={16} color="var(--color-text-muted)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
            <input type="text" placeholder="Rechercher un produit..." style={inputStyle} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <div className="table-responsive">
<table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-border)', textAlign: 'left' }}>
                <th style={{ padding: '10px 12px', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-muted)' }}>Produit</th>
                <th style={{ padding: '10px 12px', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-muted)' }}>Référence</th>
                <th style={{ padding: '10px 12px', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-muted)', textAlign: 'right' }}>Stock</th>
                <th style={{ padding: '10px 12px', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-muted)', textAlign: 'right' }}>Prix d'achat</th>
                <th style={{ padding: '10px 12px', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-muted)', textAlign: 'right' }}>Valeur achat</th>
                <th style={{ padding: '10px 12px', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-muted)', textAlign: 'right' }}>Prix de vente</th>
                <th style={{ padding: '10px 12px', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-muted)', textAlign: 'right' }}>Valeur vente</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.map(p => {
                const rowValue = (p.purchasePrice || 0) * (p.quantity || 0);
                const sellingRowValue = (p.sellingPrice || 0) * (p.quantity || 0);
                return (
                  <tr key={p.id} style={{ borderBottom: '1px solid var(--color-surface-alt)' }}>
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <ProductImage product={p} size={36} />
                        <div>
                          <div style={{ fontSize: '14px', fontWeight: 500 }}>{p.name}</div>
                          <span style={{ fontSize: '12px', color: p.family === 'Livre' ? 'var(--color-primary)' : p.family === 'Service' ? '#8b5cf6' : 'var(--color-success)' }}>
                            {p.family}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: '14px', fontFamily: 'monospace', color: 'var(--color-text-muted)' }}>{p.reference}</td>
                    <td style={{ padding: '10px 12px', fontSize: '14px', textAlign: 'right', fontWeight: 500, color: p.family === 'Service' ? '#8b5cf6' : p.quantity <= p.minStock ? 'var(--color-error)' : 'inherit' }}>
                      {p.family === 'Service' ? 'Non stocké' : p.quantity}
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: '14px', textAlign: 'right' }}>{p.purchasePrice ? p.purchasePrice.toLocaleString() + ' FCFA' : '-'}</td>
                    <td style={{ padding: '10px 12px', fontSize: '14px', textAlign: 'right', fontWeight: 600 }}>{p.family === 'Service' ? '-' : `${rowValue.toLocaleString()} FCFA`}</td>
                    <td style={{ padding: '10px 12px', fontSize: '14px', textAlign: 'right' }}>{p.sellingPrice ? p.sellingPrice.toLocaleString() + ' FCFA' : '-'}</td>
                    <td style={{ padding: '10px 12px', fontSize: '14px', textAlign: 'right', fontWeight: 600 }}>{p.family === 'Service' ? '-' : `${sellingRowValue.toLocaleString()} FCFA`}</td>
                  </tr>
                );
              })}
              {filteredProducts.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ padding: '24px', textAlign: 'center', color: 'var(--color-text-muted)' }}>Aucun produit trouvé</td>
                </tr>
              )}
            </tbody>
          </table>
</div>
        </div>
      </div>
    </div>
  );
}
