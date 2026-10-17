import React, { useState, useMemo } from 'react';
import { Package, Search, Filter, ArrowUpRight, ArrowDownRight, Calendar, User, RefreshCw } from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import { matchesSearchQuery } from '../../lib/searchUtils';


export default function PosStockMovements() {
  const { 
    posStockMovements, posProducts, posTransactions, posStockEntries, posInventories,
    addPosStockMovement 
  } = useAppContext();
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState('');
  const [isRebuilding, setIsRebuilding] = useState(false);

  const rebuildHistory = async () => {
    if (isRebuilding) return;
    setIsRebuilding(true);
    try {
      // F15 : déduplication par triplet (référence, produit, type) relu à chaque
      // ligne — une relance après interruption ne complète que les lignes manquantes
      // au lieu d'ignorer le document entier ou de dupliquer.
      const seen = new Set(posStockMovements.map(m => `${m.reference || ''}::${m.productId || ''}::${m.type}`));
      const claim = (reference: string | undefined, productId: string | undefined, type: string) => {
        const key = `${reference || ''}::${productId || ''}::${type}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      };
      let added = 0;
      // 1. Transactions (Ventes)
      for (const tx of posTransactions) {
        if (tx.status !== 'Validée' && tx.status !== 'Retournée') continue;

        for (const line of tx.lines) {
          if (!line.productId) continue;
          if (!claim(tx.transactionNumber, line.productId, 'Vente')) continue;
          await addPosStockMovement({
            productId: line.productId,
            type: 'Vente',
            quantity: -line.quantity,
            reference: tx.transactionNumber,
            date: tx.date,
            createdBy: 'Système (Migration)',
            notes: 'Généré automatiquement'
          } as any); // using 'any' to force the past date
          added++;
        }
      }

      // 2. Approvisionnements
      for (const entry of posStockEntries) {
        if (entry.status !== 'Validé') continue;

        for (const line of entry.lines) {
          if (!line.productId) continue;
          if (!claim(entry.reference, line.productId, 'Approvisionnement')) continue;
          await addPosStockMovement({
            productId: line.productId,
            type: 'Approvisionnement',
            quantity: line.quantity,
            reference: entry.reference,
            date: entry.date,
            createdBy: entry.createdBy || 'Système',
            notes: 'Généré automatiquement'
          } as any);
          added++;
        }
      }

      // 3. Inventaires
      for (const inv of posInventories) {
        if (inv.status !== 'Terminé') continue;

        for (const line of inv.lines) {
          if (!line.productId) continue;
          if (!claim(inv.reference, line.productId, 'Inventaire')) continue;
          await addPosStockMovement({
            productId: line.productId,
            type: 'Inventaire',
            quantity: line.difference,
            reference: inv.reference,
            date: inv.date,
            createdBy: inv.createdBy || 'Système',
            notes: 'Généré automatiquement'
          } as any);
          added++;
        }
      }

      alert(added > 0 ? `Historique reconstruit : ${added} mouvement(s) ajouté(s).` : 'Historique déjà complet : rien à ajouter.');
    } catch (e) {
      console.error(e);
      alert("Erreur lors de la reconstruction.");
    } finally {
      setIsRebuilding(false);
    }
  };

  const filteredMovements = useMemo(() => {
    return (posStockMovements || [])
      .filter(movement => {
        if (!movement) return false;
        const product = posProducts?.find(p => p.id === movement.productId);
        const matchesSearch = !searchTerm || matchesSearchQuery(
          [product?.name, product?.reference, movement.reference, movement.notes, movement.type, movement.createdBy],
          searchTerm
        );
        const matchesType = typeFilter === 'all' || movement.type === typeFilter;
        
        let movementDateStr = '';
        if (movement.date) {
          const rawDate = movement.date as any;
          if (rawDate instanceof Date) {
            movementDateStr = rawDate.toISOString();
          } else {
            movementDateStr = String(movement.date);
          }
        }
        const matchesDate = !dateFilter || movementDateStr.startsWith(dateFilter);

        return matchesSearch && matchesType && matchesDate;
      })
      .sort((a, b) => {
        const dateA = a?.date ? new Date(a.date).getTime() : 0;
        const dateB = b?.date ? new Date(b.date).getTime() : 0;
        return dateB - dateA;
      });
  }, [posStockMovements, posProducts, searchTerm, typeFilter, dateFilter]);

  const getTypeStyle = (type: string, quantity: number) => {
    if (quantity > 0) return { color: 'var(--color-success)', bg: 'var(--color-success-tint)' };
    if (quantity < 0) return { color: 'var(--color-error)', bg: 'var(--color-error-tint)' };
    return { color: 'var(--color-text-muted)', bg: 'var(--color-border)' };
  };

  return (
    <div className="page-wrapper">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--spacing-4)' }}>
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-2)', marginBottom: 'var(--spacing-1)' }}>
            <Package size={28} color="var(--color-primary)" />
            Mouvements de Stock
          </h1>
          <p style={{ color: 'var(--color-text-muted)' }}>Grand livre et traçabilité des articles</p>
        </div>
        <button 
          className="btn btn-secondary" 
          onClick={rebuildHistory} 
          disabled={isRebuilding}
          style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
        >
          <RefreshCw size={18} className={isRebuilding ? 'spin' : ''} />
          {isRebuilding ? 'Génération...' : 'Reconstruire le passé'}
        </button>
      </div>

      <div className="card" style={{ marginBottom: 'var(--spacing-4)' }}>
        <div style={{ display: 'flex', gap: 'var(--spacing-3)', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 300px', position: 'relative' }}>
            <Search size={20} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
            <input
              type="text"
              placeholder="Rechercher par produit, référence..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 12px 10px 40px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border)',
                outline: 'none'
              }}
            />
          </div>
          <div style={{ display: 'flex', gap: 'var(--spacing-2)', flex: '1 1 auto' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <Filter size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px 10px 36px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-border)',
                  outline: 'none',
                  backgroundColor: 'var(--color-surface)'
                }}
              >
                <option value="all">Tous les types</option>
                <option value="Vente">Vente</option>
                <option value="Retour">Retour</option>
                <option value="Approvisionnement">Approvisionnement</option>
                <option value="Inventaire">Inventaire</option>
                <option value="Ajustement Manuel">Ajustement Manuel</option>
              </select>
            </div>
            <div style={{ position: 'relative', flex: 1 }}>
              <Calendar size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
              <input
                type="date"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px 10px 36px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-border)',
                  outline: 'none',
                  backgroundColor: 'var(--color-surface)'
                }}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <div className="table-responsive">
<table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead style={{ backgroundColor: 'var(--color-surface-alt)', borderBottom: '1px solid var(--color-border)' }}>
              <tr>
                <th style={{ padding: 'var(--spacing-3)', fontWeight: 500 }}>Date</th>
                <th style={{ padding: 'var(--spacing-3)', fontWeight: 500 }}>Produit</th>
                <th style={{ padding: 'var(--spacing-3)', fontWeight: 500 }}>Type</th>
                <th style={{ padding: 'var(--spacing-3)', fontWeight: 500 }}>Qté</th>
                <th style={{ padding: 'var(--spacing-3)', fontWeight: 500 }}>Référence</th>
                <th style={{ padding: 'var(--spacing-3)', fontWeight: 500 }}>Auteur</th>
              </tr>
            </thead>
            <tbody>
              {filteredMovements.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: 'var(--spacing-5)', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                    Aucun mouvement trouvé.
                  </td>
                </tr>
              ) : (
                filteredMovements.map(movement => {
                  const product = posProducts.find(p => p.id === movement.productId);
                  const style = getTypeStyle(movement.type, movement.quantity);
                  
                  return (
                    <tr key={movement?.id || Math.random()} style={{ borderBottom: '1px solid var(--color-border)' }}>
                      <td style={{ padding: 'var(--spacing-3)' }}>
                        <div style={{ fontWeight: 500 }}>{movement?.date ? new Date(movement.date).toLocaleDateString() : '-'}</div>
                        <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>{movement?.date ? new Date(movement.date).toLocaleTimeString() : '-'}</div>
                      </td>
                      <td style={{ padding: 'var(--spacing-3)' }}>
                        <div style={{ fontWeight: 500 }}>{product?.name || 'Produit inconnu'}</div>
                        <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>{product?.reference}</div>
                      </td>
                      <td style={{ padding: 'var(--spacing-3)' }}>
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '4px 8px',
                          borderRadius: '12px',
                          fontSize: '12px',
                          fontWeight: 500,
                          backgroundColor: style.bg,
                          color: style.color
                        }}>
                          {movement?.quantity > 0 ? <ArrowDownRight size={14} /> : <ArrowUpRight size={14} />}
                          {movement?.type}
                        </span>
                      </td>
                      <td style={{ padding: 'var(--spacing-3)', fontWeight: 600, color: style.color }}>
                        {movement?.quantity > 0 ? '+' : ''}{movement?.quantity}
                      </td>
                      <td style={{ padding: 'var(--spacing-3)' }}>
                        <div style={{ fontFamily: 'monospace' }}>{movement?.reference || '-'}</div>
                        {movement?.notes && (
                          <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>{movement.notes}</div>
                        )}
                      </td>
                      <td style={{ padding: 'var(--spacing-3)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <User size={14} color="var(--color-text-muted)" />
                          <span style={{ fontSize: '13px' }}>{movement?.createdBy || 'Système'}</span>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
</div>
        </div>
      </div>
    </div>
  );
}
