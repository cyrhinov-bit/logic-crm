import { useState } from 'react';
import { useAppContext } from '../../context/AppContext';
import { Plus, Edit2, Trash2 } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { useCanManagePosReferentials } from '../../hooks/useCanManagePosReferentials';

export default function PosBrands() {
  const { posBrands, addPosBrand, updatePosBrand, deletePosBrand } = useAppContext();
  const canEdit = useCanManagePosReferentials();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ name: '' });

  const handleSave = async () => {
    // F21 : nom normalisé, vide et doublon (insensible à la casse) refusés.
    const name = form.name.trim();
    if (!name) { alert('Nom de marque requis.'); return; }
    const dupe = posBrands.find(b => b.name.trim().toLowerCase() === name.toLowerCase() && (!editing || b.id !== editing.id));
    if (dupe) { alert(`Marque déjà existante : « ${dupe.name} ».`); return; }
    if (editing) {
      await updatePosBrand(editing.id, { ...form, name });
    } else {
      await addPosBrand({ ...form, name, id: uuidv4() });
    }
    setShowForm(false);
    setEditing(null);
    setForm({ name: '' });
  };

  const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', fontSize: '14px', outline: 'none' };

  return (
    <div className="pos-page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 700 }}>Marques</h1>
        {canEdit && (
        <button onClick={() => { setShowForm(true); setEditing(null); setForm({ name: '' }); }} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', backgroundColor: 'var(--color-primary)', color: 'white', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontWeight: 500 }}>
          <Plus size={16} /> Ajouter
        </button>
        )}
      </div>
      {showForm && (
        <div style={{ background: 'white', borderRadius: 'var(--radius-lg)', padding: '24px', marginBottom: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>{editing ? 'Modifier' : 'Ajouter'} une marque</h3>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'end' }}>
            <div style={{ flex: 1 }}><div style={{ fontSize: '13px', marginBottom: '4px', fontWeight: 500 }}>Nom</div><input style={inputStyle} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
            <button onClick={handleSave} style={{ padding: '10px 20px', backgroundColor: 'var(--color-primary)', color: 'white', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontWeight: 500 }}>Enregistrer</button>
            <button onClick={() => { setShowForm(false); setEditing(null); }} style={{ padding: '10px 20px', backgroundColor: 'var(--color-surface-alt)', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer' }}>Annuler</button>
          </div>
        </div>
      )}
      <div style={{ background: 'white', borderRadius: 'var(--radius-lg)', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        <div className="table-responsive">
<table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr style={{ borderBottom: '1px solid var(--color-border)', textAlign: 'left' }}><th style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-muted)' }}>Nom</th><th style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-muted)' }}>Actions</th></tr></thead>
          <tbody>
            {posBrands.map(b => (
              <tr key={b.id} style={{ borderBottom: '1px solid var(--color-surface-alt)' }}>
                <td style={{ padding: '12px 16px', fontSize: '14px' }}>{b.name}</td>
                <td style={{ padding: '12px 16px' }}>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {canEdit && (
                    <>
                    <button onClick={() => { setEditing(b); setForm({ name: b.name }); setShowForm(true); }} style={{ padding: '6px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)' }}><Edit2 size={16} /></button>
                    <button onClick={async () => { if (window.confirm('Supprimer cette marque ?')) { const ok = await deletePosBrand(b.id); if (!ok) alert('Suppression impossible : des produits utilisent cette marque.'); } }} style={{ padding: '6px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-error)' }}><Trash2 size={16} /></button>
                    </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {posBrands.length === 0 && <tr><td colSpan={2} style={{ padding: '24px', textAlign: 'center', color: 'var(--color-text-muted)' }}>Aucune marque</td></tr>}
          </tbody>
        </table>
</div>
      </div>
    </div>
  );
}
