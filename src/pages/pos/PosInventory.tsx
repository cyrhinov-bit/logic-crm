import { useEffect, useRef, useState } from 'react';
import { useAppContext } from '../../context/AppContext';
import type { PosInventory as IPosInventory } from '../../context/AppContext';
import { Plus, Eye, X, Search, Trash2, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { todayLocalKey } from '../../lib/dates';
import { matchesProductSearch } from '../../lib/searchUtils';
import { barcodeScannerService } from '../../features/products/services/BarcodeScannerService';

export default function PosInventory() {
  const navigate = useNavigate();
  const { posProducts, posInventories, addPosInventory, deletePosInventory } = useAppContext();
  const [showForm, setShowForm] = useState(false);
  const [viewingInventory, setViewingInventory] = useState<IPosInventory | null>(null);
  const [productSearch, setProductSearch] = useState('');
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  // Douchette : intercepte les rafales scanner même si le focus est dans un
  // champ "Compté", puis filtre la liste sur le code scanné (code-barres /
  // ISBN / référence). Si le focus est déjà dans le champ recherche, la
  // douchette tape directement dedans (comportement clavier HID classique).
  useEffect(() => {
    if (!showForm) return;
    barcodeScannerService.startKeyboardListener();
    const unsubscribe = barcodeScannerService.subscribe((barcode: string) => {
      const cleaned = (barcode || '').trim();
      if (cleaned) setProductSearch(cleaned);
    });
    return () => {
      unsubscribe();
      barcodeScannerService.stopKeyboardListener();
    };
  }, [showForm]);
  const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; inventoryId: string | null }>({ isOpen: false, inventoryId: null });
  const [form, setForm] = useState({ 
    notes: '', 
    lines: posProducts
      .filter(p => p.family !== 'Service')
      .map(p => ({ id: uuidv4(), productId: p.id, expectedQty: p.quantity, countedQty: p.quantity, difference: 0 })) 
  });

  const updateLine = (id: string, field: string, value: any) => {
    const lines = form.lines.map(l => {
      if (l.id !== id) return l;
      const updated = { ...l, [field]: value };
      updated.difference = updated.countedQty - updated.expectedQty;
      return updated;
    });
    setForm({ ...form, lines });
  };

  const totalDifference = form.lines.reduce((sum, l) => sum + l.difference, 0);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const handleValidate = async () => {
    if (isSubmitting) return;
    // F13 : comptages validés ligne par ligne (entier ≥ 0, pas de NaN).
    for (const l of form.lines) {
      const q = Number(l.countedQty);
      if (!Number.isFinite(q) || q < 0 || !Number.isInteger(q)) {
        const p = posProducts.find(x => x.id === l.productId);
        alert(`Comptage invalide pour ${p?.name || 'un article'} : saisissez un nombre entier positif ou zéro.`);
        return;
      }
    }
    // F12 : relecture du stock au moment de valider — si le stock a bougé depuis
    // l'ouverture du formulaire (vente/entrée entre-temps), l'attendu est recalculé
    // et l'utilisateur confirme avant application.
    const moved: string[] = [];
    const freshLines = form.lines.map(l => {
      const p = posProducts.find(x => x.id === l.productId);
      const freshExpected = p ? Number(p.quantity || 0) : l.expectedQty;
      if (freshExpected !== l.expectedQty) {
        moved.push(`${p?.name || 'Article'} (était ${l.expectedQty}, maintenant ${freshExpected})`);
      }
      const counted = Number(l.countedQty);
      return { ...l, expectedQty: freshExpected, countedQty: counted, difference: counted - freshExpected };
    });
    if (moved.length > 0) {
      if (!window.confirm(`Attention, le stock a bougé depuis l'ouverture de l'inventaire :\n• ${moved.slice(0, 10).join('\n• ')}${moved.length > 10 ? `\n(+${moved.length - 10} autres)` : ''}\n\nLes écarts seront recalculés sur le stock actuel. Continuer ?`)) {
        return;
      }
    }
    const activeLines = freshLines.filter(l => l.difference !== 0);
    if (activeLines.length === 0) { alert('Aucun écart : rien à valider.'); return; }
    const ref = `INV-${Date.now().toString(36).toUpperCase()}${Math.floor(100 + Math.random() * 900)}`;
    const inventory = {
      id: uuidv4(), reference: ref, date: todayLocalKey(),
      status: 'Terminé' as const, notes: form.notes, createdBy: undefined,
      lines: activeLines
    };
    setIsSubmitting(true);
    try {
      await addPosInventory(inventory);
      setShowForm(false);
      setForm({
        notes: '',
        lines: posProducts
          .filter(p => p.family !== 'Service')
          .map(p => ({ id: uuidv4(), productId: p.id, expectedQty: p.quantity, countedQty: p.quantity, difference: 0 }))
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    if (deleteModal.inventoryId) {
      await deletePosInventory(deleteModal.inventoryId);
      setDeleteModal({ isOpen: false, inventoryId: null });
      if (viewingInventory?.id === deleteModal.inventoryId) {
        setViewingInventory(null);
      }
    }
  };

  const inputStyle: React.CSSProperties = { width: '100%', padding: '8px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', fontSize: '13px', outline: 'none' };

  return (
    <div className="pos-page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button onClick={() => navigate('/pos')} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', background: 'white', cursor: 'pointer', color: 'var(--color-text)' }} title="Retour au tableau de bord">
            <ArrowLeft size={20} />
          </button>
          <h1 style={{ fontSize: '24px', fontWeight: 700, margin: 0 }}>Inventaire</h1>
        </div>
        <button onClick={() => { 
          setViewingInventory(null); 
          setForm({ 
            notes: '', 
            lines: posProducts
              .filter(p => p.family !== 'Service')
              .map(p => ({ id: uuidv4(), productId: p.id, expectedQty: p.quantity, countedQty: p.quantity, difference: 0 })) 
          });
          setShowForm(true); 
        }} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', backgroundColor: 'var(--color-primary)', color: 'white', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontWeight: 500 }}>
          <Plus size={16} /> Nouvel inventaire
        </button>
      </div>

      {viewingInventory && (
        <div style={{ background: 'white', borderRadius: 'var(--radius-lg)', padding: '24px', marginBottom: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 600 }}>Détails de l'inventaire : {viewingInventory.reference}</h3>
            <button onClick={() => setViewingInventory(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)' }}>
              <X size={20} />
            </button>
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px', padding: '16px', background: 'var(--color-surface-alt)', borderRadius: 'var(--radius-md)' }}>
            <div>
              <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '4px' }}>Date</div>
              <div style={{ fontSize: '14px', fontWeight: 500 }}>{viewingInventory.date}</div>
            </div>
            <div>
              <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '4px' }}>Statut</div>
              <div>
                <span style={{ padding: '2px 8px', borderRadius: 'var(--radius-sm)', fontSize: '12px', fontWeight: 500, background: 'var(--color-success-tint)', color: 'var(--color-success)' }}>
                  {viewingInventory.status}
                </span>
              </div>
            </div>
            {viewingInventory.notes && (
              <div style={{ gridColumn: '1 / -1' }}>
                <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '4px' }}>Notes</div>
                <div style={{ fontSize: '14px' }}>{viewingInventory.notes}</div>
              </div>
            )}
          </div>

          <h4 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px' }}>Lignes ajustées ({viewingInventory.lines.length})</h4>
          {viewingInventory.lines.length > 0 ? (
            <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
              <div className="table-responsive">
<table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ position: 'sticky', top: 0, background: 'white' }}>
                  <tr style={{ borderBottom: '1px solid var(--color-border)', textAlign: 'left' }}>
                    <th style={{ padding: '8px', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-muted)' }}>Produit</th>
                    <th style={{ padding: '8px', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-muted)', textAlign: 'right' }}>Stock attendu</th>
                    <th style={{ padding: '8px', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-muted)', textAlign: 'right' }}>Compté</th>
                    <th style={{ padding: '8px', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-muted)', textAlign: 'right' }}>Écart</th>
                  </tr>
                </thead>
                <tbody>
                  {viewingInventory.lines.map(line => {
                    const product = posProducts.find(p => p.id === line.productId);
                    return (
                      <tr key={line.id} style={{ borderBottom: '1px solid var(--color-surface-alt)', background: line.difference !== 0 ? 'var(--color-error-tint)' : 'transparent' }}>
                        <td style={{ padding: '8px', fontSize: '13px' }}>{product?.name || 'Inconnu'}</td>
                        <td style={{ padding: '8px', fontSize: '13px', textAlign: 'right' }}>{line.expectedQty}</td>
                        <td style={{ padding: '8px', fontSize: '13px', textAlign: 'right', fontWeight: 500 }}>{line.countedQty}</td>
                        <td style={{ padding: '8px', fontSize: '13px', textAlign: 'right', fontWeight: 600, color: line.difference !== 0 ? 'var(--color-error)' : 'var(--color-success)' }}>
                          {line.difference > 0 ? '+' : ''}{line.difference}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
</div>
            </div>
          ) : (
            <div style={{ padding: '16px', textAlign: 'center', color: 'var(--color-text-muted)', background: 'var(--color-surface-alt)', borderRadius: 'var(--radius-md)' }}>
              Aucun écart constaté (inventaire conforme)
            </div>
          )}
        </div>
      )}

      {showForm && (
        <div style={{ background: 'white', borderRadius: 'var(--radius-lg)', padding: '24px', marginBottom: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>Nouvel inventaire</h3>
          <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
            <div style={{ flex: 1, maxWidth: '400px' }}>
              <div style={{ fontSize: '13px', marginBottom: '4px', fontWeight: 500 }}>Notes</div>
              <input style={inputStyle} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
            </div>
            <div style={{ flex: 1, maxWidth: '300px' }}>
              <div style={{ fontSize: '13px', marginBottom: '4px', fontWeight: 500 }}>Rechercher un produit</div>
              <div style={{ position: 'relative' }}>
                <Search size={16} color="var(--color-text-muted)" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
                <input 
                  ref={searchInputRef}
                  data-barcode-target="true"
                  style={{ ...inputStyle, paddingLeft: '34px' }} 
                  placeholder="Nom, référence ou code-barres (douchette)..." 
                  value={productSearch} 
                  onChange={e => setProductSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      // Douchette : après scan, focus direct sur le 1er champ Compté filtré
                      const firstInput = document.getElementById('counted-input-0');
                      if (firstInput) firstInput.focus();
                    }
                  }}
                />
              </div>
            </div>
          </div>
          <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
            <div className="table-responsive">
<table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ position: 'sticky', top: 0, background: 'white' }}><tr style={{ borderBottom: '1px solid var(--color-border)', textAlign: 'left' }}><th style={{ padding: '8px', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-muted)' }}>Produit</th><th style={{ padding: '8px', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-muted)', textAlign: 'right' }}>Stock attendu</th><th style={{ padding: '8px', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-muted)', textAlign: 'right', width: '100px' }}>Compté</th><th style={{ padding: '8px', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-muted)', textAlign: 'right' }}>Écart</th></tr></thead>
              <tbody>
                {form.lines
                  .map(line => ({ line, product: posProducts.find(p => p.id === line.productId) }))
                  .filter(({ product }) => {
                    if (!productSearch) return true;
                    if (!product) return false;
                    // Nom, référence, code-barres, ISBN (compatible douchette)
                    return matchesProductSearch(product, productSearch);
                  })
                  .map(({ line, product }, index) => {
                  return (
                    <tr key={line.id} style={{ borderBottom: '1px solid var(--color-surface-alt)', background: line.difference !== 0 ? 'var(--color-error-tint)' : 'transparent' }}>
                      <td style={{ padding: '8px', fontSize: '13px' }}>
                        <div>{product?.name || 'Inconnu'}</div>
                        {(product?.barcode || product?.isbn || product?.reference) && (
                          <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontFamily: 'monospace' }}>
                            {[product?.reference, product?.barcode, product?.isbn].filter(Boolean).join(' • ')}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '8px', fontSize: '13px', textAlign: 'right' }}>{line.expectedQty}</td>
                      <td style={{ padding: '8px' }}>
                        <input 
                          id={`counted-input-${index}`}
                          style={{ ...inputStyle, width: '80px', textAlign: 'right' }} 
                          type="number" 
                          min="0" 
                          value={line.countedQty} 
                          onChange={e => updateLine(line.id, 'countedQty', Number(e.target.value))} 
                          onFocus={e => e.target.select()}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              const nextInput = document.getElementById(`counted-input-${index + 1}`);
                              if (nextInput) {
                                nextInput.focus();
                              } else {
                                e.currentTarget.blur();
                              }
                            }
                          }}
                        />
                      </td>
                      <td style={{ padding: '8px', fontSize: '13px', textAlign: 'right', fontWeight: 600, color: line.difference !== 0 ? 'var(--color-error)' : 'var(--color-success)' }}>{line.difference > 0 ? '+' : ''}{line.difference}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
</div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--color-border)', paddingTop: '16px', marginTop: '16px' }}>
            <div style={{ fontSize: '16px', fontWeight: 600, color: totalDifference !== 0 ? 'var(--color-error)' : 'var(--color-success)' }}>Écart total: {totalDifference > 0 ? '+' : ''}{totalDifference}</div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={handleValidate} disabled={isSubmitting} style={{ padding: '8px 16px', backgroundColor: 'var(--color-success)', color: 'white', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontWeight: 500 }}>{isSubmitting ? 'Validation...' : 'Valider & Corriger'}</button>
              <button onClick={() => setShowForm(false)} style={{ padding: '8px 16px', backgroundColor: 'var(--color-surface-alt)', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}>Annuler</button>
            </div>
          </div>
        </div>
      )}
      {!showForm && (
        <div style={{ background: 'white', borderRadius: 'var(--radius-lg)', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <div className="table-responsive">
<table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--color-border)', textAlign: 'left' }}>
              <th style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-muted)' }}>Référence</th>
              <th style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-muted)' }}>Date</th>
              <th style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-muted)' }}>Statut</th>
              <th style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-muted)' }}>Notes</th>
              <th style={{ padding: '12px 16px', width: '60px' }}></th>
            </tr>
          </thead>
          <tbody>
            {posInventories.sort((a, b) => b.date.localeCompare(a.date)).map(inv => (
              <tr key={inv.id} style={{ borderBottom: '1px solid var(--color-surface-alt)' }}>
                <td style={{ padding: '12px 16px', fontSize: '14px', fontFamily: 'monospace' }}>{inv.reference}</td>
                <td style={{ padding: '12px 16px', fontSize: '14px' }}>{inv.date}</td>
                <td style={{ padding: '12px 16px' }}><span style={{ padding: '4px 10px', borderRadius: 'var(--radius-lg)', fontSize: '12px', fontWeight: 500, background: inv.status === 'Terminé' ? 'var(--color-success-tint)' : 'var(--color-warning-tint)', color: inv.status === 'Terminé' ? 'var(--color-success)' : 'var(--color-warning)' }}>{inv.status}</span></td>
                <td style={{ padding: '12px 16px', fontSize: '14px', color: 'var(--color-text-muted)' }}>{inv.notes}</td>
                <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                    <button 
                      onClick={() => { setShowForm(false); setViewingInventory(inv); }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)' }}
                      title="Voir les détails"
                    >
                      <Eye size={18} />
                    </button>
                    <button 
                      onClick={() => setDeleteModal({ isOpen: true, inventoryId: inv.id })}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-error)' }}
                      title="Supprimer"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {posInventories.length === 0 && <tr><td colSpan={5} style={{ padding: '24px', textAlign: 'center', color: 'var(--color-text-muted)' }}>Aucun inventaire</td></tr>}
          </tbody>
        </table>
</div>
      </div>
      )}

      {deleteModal.isOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', padding: '24px', borderRadius: 'var(--radius-lg)', maxWidth: '400px', width: '100%' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px' }}>Confirmer la suppression</h3>
            <p style={{ fontSize: '14px', marginBottom: '24px', color: 'var(--color-text-muted)' }}>
              Êtes-vous sûr de vouloir supprimer cet inventaire ? Le stock appliqué sera contre-passé (réimputé en sens inverse). Cette action est irréversible.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button onClick={() => setDeleteModal({ isOpen: false, inventoryId: null })} style={{ padding: '8px 16px', background: 'var(--color-surface-alt)', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontWeight: 500 }}>Annuler</button>
              <button onClick={confirmDelete} style={{ padding: '8px 16px', background: 'var(--color-error)', color: 'white', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontWeight: 500 }}>Supprimer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
