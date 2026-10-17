import { useState, useEffect, useRef } from 'react';
import { useAppContext } from '../../context/AppContext';
import { Plus, Trash2 } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { todayLocalKey } from '../../lib/dates';

function SearchableSelect({ options, value, onChange, placeholder, style }: { options: {value: string, label: string}[], value: string, onChange: (v: string) => void, placeholder: string, style?: React.CSSProperties }) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedOption = options.find(o => o.value === value);
  const filteredOptions = options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()));

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      <div 
        onClick={() => setIsOpen(!isOpen)}
        style={{ ...style, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'white' }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: selectedOption ? 'inherit' : 'var(--color-text-muted)' }}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <span style={{ opacity: 0.5, fontSize: '10px' }}>▼</span>
      </div>
      
      {isOpen && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, background: 'white', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', marginTop: '4px', boxShadow: 'var(--shadow-1)' }}>
          <div style={{ padding: '8px', borderBottom: '1px solid var(--color-border)' }}>
            <input 
              autoFocus
              style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid var(--color-border)', outline: 'none', fontSize: '13px' }}
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher..."
            />

          </div>
          <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
            {filteredOptions.length > 0 ? filteredOptions.map(o => (
              <div 
                key={o.value}
                onClick={() => { onChange(o.value); setIsOpen(false); setSearch(''); }}
                style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid var(--color-surface-alt)', fontSize: '13px' }}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--color-surface-alt)'}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                {o.label}
              </div>
            )) : (
              <div style={{ padding: '8px 12px', color: 'var(--color-text-muted)', textAlign: 'center', fontSize: '13px' }}>Aucun résultat</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function PosSupply() {
  const { posSuppliers, posProducts, posStockEntries, addPosStockEntry, updatePosProduct, updatePosStockEntry, deletePosStockEntry } = useAppContext();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ supplierId: '', notes: '', lines: [{ id: uuidv4(), productId: '', quantity: 1, purchasePrice: 0, total: 0 }] });

  const addLine = () => setForm({ ...form, lines: [...form.lines, { id: uuidv4(), productId: '', quantity: 1, purchasePrice: 0, total: 0 }] });
  const removeLine = (id: string) => setForm({ ...form, lines: form.lines.filter(l => l.id !== id) });
  const updateLine = (id: string, field: string, value: any) => {
    const lines = form.lines.map(l => {
      if (l.id !== id) return l;
      const updated = { ...l, [field]: value };
      if (field === 'productId') {
        const product = posProducts.find(p => p.id === value);
        if (product) updated.purchasePrice = product.purchasePrice;
      }
      updated.total = updated.quantity * updated.purchasePrice;
      return updated;
    });
    setForm({ ...form, lines });
  };

  const totalAmount = form.lines.filter(l => l.productId).reduce((sum, l) => sum + l.total, 0);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const handleValidate = async () => {
    // F8 : anti-double-submit (double-clic = double entrée = double stock).
    if (isSubmitting) return;
    const validLines = form.lines.filter(l => l.productId);
    if (validLines.length === 0) { alert('Ajoutez au moins un produit.'); return; }
    if (validLines.some(l => !(Number(l.quantity) > 0))) { alert('Chaque ligne doit avoir une quantité supérieure à 0.'); return; }
    if (validLines.some(l => Number(l.purchasePrice) < 0)) { alert('Les prix d\u2019achat ne peuvent pas être négatifs.'); return; }
    // F9 : fusion des lignes du même produit (prix du dernier appliqué sinon).
    const merged = new Map<string, typeof validLines[number]>();
    for (const l of validLines) {
      const prev = merged.get(l.productId);
      if (prev) {
        const qty = Number(prev.quantity) + Number(l.quantity);
        merged.set(l.productId, { ...prev, quantity: qty, purchasePrice: Number(l.purchasePrice), total: qty * Number(l.purchasePrice) });
      } else {
        merged.set(l.productId, { ...l });
      }
    }
    const finalLines = [...merged.values()];
    const finalTotal = finalLines.reduce((sum, l) => sum + l.total, 0);
    // Référence unique (UUID court) : Date.now() seul collisionne à la milliseconde.
    const ref = `APV-${Date.now().toString(36).toUpperCase()}${Math.floor(100 + Math.random() * 900)}`;
    const entry = {
      id: uuidv4(), reference: ref, supplierId: form.supplierId || undefined,
      date: todayLocalKey(), totalAmount: finalTotal, status: 'Validé' as const,
      notes: form.notes, createdBy: undefined, lines: finalLines
    };
    setIsSubmitting(true);
    try {
      await addPosStockEntry(entry);
      for (const line of entry.lines) {
        const product = posProducts.find(p => p.id === line.productId);
        if (product && line.purchasePrice > 0 && line.purchasePrice !== product.purchasePrice) {
          await updatePosProduct(line.productId, { purchasePrice: line.purchasePrice });
        }
      }
      setShowForm(false);
      setForm({ supplierId: '', notes: '', lines: [{ id: uuidv4(), productId: '', quantity: 1, purchasePrice: 0, total: 0 }] });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAnnulEntry = async (id: string) => {
    if (!window.confirm("Annuler cette entrée validée ? Le stock sera décrémenté en conséquence.")) return;
    await updatePosStockEntry(id, { status: 'Annulé' });
  };

  const handleDeleteEntry = async (id: string) => {
    if (!window.confirm("Supprimer définitivement cette entrée ?")) return;
    await deletePosStockEntry(id);
  };

  const inputStyle: React.CSSProperties = { width: '100%', padding: '8px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', fontSize: '13px', outline: 'none' };

  return (
    <div className="pos-page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 700 }}>Approvisionnement</h1>
        <button onClick={() => setShowForm(true)} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', backgroundColor: 'var(--color-primary)', color: 'white', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontWeight: 500 }}>
          <Plus size={16} /> Nouvel approvisionnement
        </button>
      </div>
      {showForm && (
        <div style={{ background: 'white', borderRadius: 'var(--radius-lg)', padding: '24px', marginBottom: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>Nouvel approvisionnement</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
            <div>
              <div style={{ fontSize: '13px', marginBottom: '4px', fontWeight: 500 }}>Fournisseur</div>
              <SearchableSelect 
                style={inputStyle} 
                value={form.supplierId} 
                onChange={(v) => setForm({ ...form, supplierId: v })} 
                placeholder="Sélectionner..." 
                options={posSuppliers.map(s => ({ value: s.id, label: s.name }))} 
              />
            </div>
            <div><div style={{ fontSize: '13px', marginBottom: '4px', fontWeight: 500 }}>Notes</div><input style={inputStyle} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
          </div>
          <div className="table-responsive">
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '12px' }}>
              <thead><tr style={{ borderBottom: '1px solid var(--color-border)', textAlign: 'left' }}><th style={{ padding: '8px', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-muted)' }}>Produit</th><th style={{ padding: '8px', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-muted)', width: '100px' }}>Qté</th><th style={{ padding: '8px', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-muted)', width: '120px' }}>Prix achat</th><th style={{ padding: '8px', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-muted)', width: '120px' }}>Total</th><th style={{ padding: '8px', width: '40px' }}></th></tr></thead>
              <tbody>
                {form.lines.map(line => (
                  <tr key={line.id} style={{ borderBottom: '1px solid var(--color-surface-alt)' }}>
                  <td style={{ padding: '8px' }}>
                    <SearchableSelect 
                      style={inputStyle} 
                      value={line.productId} 
                      onChange={(v) => updateLine(line.id, 'productId', v)} 
                      placeholder="Sélectionner..." 
                      options={posProducts.map(p => ({ value: p.id, label: `${p.name} (${p.reference})` }))} 
                    />
                  </td>
                  <td style={{ padding: '8px' }}><input style={inputStyle} type="number" min="1" value={line.quantity} onChange={e => updateLine(line.id, 'quantity', Number(e.target.value))} /></td>
                  <td style={{ padding: '8px' }}><input style={inputStyle} type="number" value={line.purchasePrice} onChange={e => updateLine(line.id, 'purchasePrice', Number(e.target.value))} /></td>
                  <td style={{ padding: '8px', fontSize: '13px', fontWeight: 500 }}>{line.total.toLocaleString()} FCFA</td>
                  <td style={{ padding: '8px' }}>{form.lines.length > 1 && <button onClick={() => removeLine(line.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-error)' }}><Trash2 size={14} /></button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
</div>
          <button onClick={addLine} style={{ fontSize: '13px', color: 'var(--color-primary)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500, marginBottom: '16px' }}>+ Ajouter une ligne</button>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--color-border)', paddingTop: '16px' }}>
            <div style={{ fontSize: '18px', fontWeight: 700 }}>Total: {totalAmount.toLocaleString()} FCFA</div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={handleValidate} disabled={!form.lines.some(l => l.productId) || isSubmitting} style={{ padding: '8px 16px', backgroundColor: 'var(--color-success)', color: 'white', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontWeight: 500 }}>{isSubmitting ? 'Validation...' : "Valider l'entrée"}</button>
              <button onClick={() => setShowForm(false)} style={{ padding: '8px 16px', backgroundColor: 'var(--color-surface-alt)', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}>Annuler</button>
            </div>
          </div>
        </div>
      )}
      <div style={{ background: 'white', borderRadius: 'var(--radius-lg)', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        <div className="table-responsive">
<table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr style={{ borderBottom: '1px solid var(--color-border)', textAlign: 'left' }}><th style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-muted)' }}>Référence</th><th style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-muted)' }}>Date</th><th style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-muted)' }}>Statut</th><th style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-muted)', textAlign: 'right' }}>Montant</th><th style={{ padding: '12px 16px', width: '90px' }}></th></tr></thead>
          <tbody>
            {posStockEntries.sort((a, b) => b.date.localeCompare(a.date)).map(e => (
              <tr key={e.id} style={{ borderBottom: '1px solid var(--color-surface-alt)' }}>
                <td style={{ padding: '12px 16px', fontSize: '14px', fontFamily: 'monospace' }}>{e.reference}</td>
                <td style={{ padding: '12px 16px', fontSize: '14px' }}>{e.date}</td>
                <td style={{ padding: '12px 16px' }}><span style={{ padding: '4px 10px', borderRadius: 'var(--radius-lg)', fontSize: '12px', fontWeight: 500, background: e.status === 'Validé' ? 'var(--color-success-tint)' : 'var(--color-error-tint)', color: e.status === 'Validé' ? 'var(--color-success)' : 'var(--color-error)' }}>{e.status}</span></td>
                <td style={{ padding: '12px 16px', fontSize: '14px', textAlign: 'right', fontWeight: 500 }}>{e.totalAmount.toLocaleString()} FCFA</td>
                <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                  {e.status === 'Validé' ? (
                    <button onClick={() => handleAnnulEntry(e.id)} title="Annuler l'entrée (décrémente le stock)" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-warning)', fontSize: '12px', fontWeight: 600 }}>Annuler</button>
                  ) : (
                    <button onClick={() => handleDeleteEntry(e.id)} title="Supprimer l'entrée" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-error)' }}><Trash2 size={14} /></button>
                  )}
                </td>
              </tr>
            ))}
            {posStockEntries.length === 0 && <tr><td colSpan={5} style={{ padding: '24px', textAlign: 'center', color: 'var(--color-text-muted)' }}>Aucun approvisionnement</td></tr>}
          </tbody>
        </table>
</div>
      </div>
    </div>
  );
}
