import { useState } from 'react';
import { useAppContext } from '../../context/AppContext';
import { Plus, Edit2, Trash2 } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { useCanManagePosReferentials } from '../../hooks/useCanManagePosReferentials';

export default function PosCategories() {
  const { posCategories, addPosCategory, updatePosCategory, deletePosCategory } = useAppContext();
  const canEdit = useCanManagePosReferentials();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ name: '', family: 'Fourniture' as 'Livre' | 'Fourniture' | 'Service' });

  const handleSave = async () => {
    // F21 : nom normalisé (trim), vide et doublon (insensible à la casse) refusés.
    const name = form.name.trim();
    if (!name) { alert('Nom de catégorie requis.'); return; }
    const dupe = posCategories.find(c => c.name.trim().toLowerCase() === name.toLowerCase() && (!editing || c.id !== editing.id));
    if (dupe) { alert(`Catégorie déjà existante : « ${dupe.name} ».`); return; }
    if (editing) {
      await updatePosCategory(editing.id, { ...form, name });
    } else {
      await addPosCategory({ ...form, name, id: uuidv4() });
    }
    setShowForm(false);
    setEditing(null);
    setForm({ name: '', family: 'Fourniture' });
  };

  const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', fontSize: '14px', outline: 'none' };

  return (
    <div className="pos-page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 700 }}>Familles / Catégories</h1>
        {canEdit && (
        <button onClick={() => { setShowForm(true); setEditing(null); setForm({ name: '', family: 'Fourniture' }); }} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', backgroundColor: 'var(--color-primary)', color: 'white', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontWeight: 500 }}>
          <Plus size={16} /> Ajouter
        </button>
        )}
      </div>
      {showForm && (
        <div style={{ background: 'white', borderRadius: 'var(--radius-lg)', padding: '24px', marginBottom: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>{editing ? 'Modifier' : 'Ajouter'} une catégorie</h3>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'end' }}>
            <div style={{ flex: 1 }}><div style={{ fontSize: '13px', marginBottom: '4px', fontWeight: 500 }}>Nom</div><input style={inputStyle} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '13px', marginBottom: '4px', fontWeight: 500 }}>Famille</div>
              <select style={inputStyle} value={form.family} onChange={e => setForm({ ...form, family: e.target.value as any })}>
                <option value="Fourniture">Fourniture</option>
                <option value="Livre">Livre</option>
                <option value="Service">Service / Impression</option>
              </select>
            </div>
            <button onClick={handleSave} style={{ padding: '10px 20px', backgroundColor: 'var(--color-primary)', color: 'white', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontWeight: 500 }}>Enregistrer</button>
            <button onClick={() => { setShowForm(false); setEditing(null); }} style={{ padding: '10px 20px', backgroundColor: 'var(--color-surface-alt)', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer' }}>Annuler</button>
          </div>
        </div>
      )}
      <div style={{ background: 'white', borderRadius: 'var(--radius-lg)', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        <div className="table-responsive">
<table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr style={{ borderBottom: '1px solid var(--color-border)', textAlign: 'left' }}><th style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-muted)' }}>Nom</th><th style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-muted)' }}>Famille</th><th style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-muted)' }}>Actions</th></tr></thead>
          <tbody>
            {posCategories.map(c => (
              <tr key={c.id} style={{ borderBottom: '1px solid var(--color-surface-alt)' }}>
                <td style={{ padding: '12px 16px', fontSize: '14px' }}>{c.name}</td>
                <td style={{ padding: '12px 16px' }}>
                  <span style={{ 
                    padding: '4px 10px', 
                    borderRadius: 'var(--radius-lg)', 
                    fontSize: '12px', 
                    fontWeight: 500, 
                    background: c.family === 'Livre' ? 'var(--color-primary-tint)' : c.family === 'Service' ? '#f3e8ff' : 'var(--color-success-tint)', 
                    color: c.family === 'Livre' ? 'var(--color-primary)' : c.family === 'Service' ? '#7c3aed' : 'var(--color-success)' 
                  }}>
                    {c.family === 'Service' ? '🖨️ Service' : c.family}
                  </span>
                </td>
                <td style={{ padding: '12px 16px' }}>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {canEdit && (
                    <>
                    <button onClick={() => { setEditing(c); setForm({ name: c.name, family: c.family }); setShowForm(true); }} style={{ padding: '6px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)' }}><Edit2 size={16} /></button>
                    <button onClick={async () => { if (window.confirm('Supprimer cette catégorie ?')) { const ok = await deletePosCategory(c.id); if (!ok) alert('Suppression impossible : des produits utilisent cette catégorie.'); } }} style={{ padding: '6px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-error)' }}><Trash2 size={16} /></button>
                    </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {posCategories.length === 0 && <tr><td colSpan={3} style={{ padding: '24px', textAlign: 'center', color: 'var(--color-text-muted)' }}>Aucune catégorie</td></tr>}
          </tbody>
        </table>
</div>
      </div>
    </div>
  );
}
