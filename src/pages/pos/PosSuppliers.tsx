import { useState } from 'react';
import { useAppContext } from '../../context/AppContext';
import { Plus, Edit2, Trash2 } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { useCanManagePosReferentials } from '../../hooks/useCanManagePosReferentials';

export default function PosSuppliers() {
  const { posSuppliers, addPosSupplier, updatePosSupplier, deletePosSupplier } = useAppContext();
  const canEdit = useCanManagePosReferentials();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ name: '', contact: '', phone: '', email: '', address: '' });

  const handleSave = async () => {
    // F21 : nom obligatoire (le « * » était décoratif), normalisé, doublon refusé.
    const name = form.name.trim();
    if (!name) { alert('Nom de fournisseur requis.'); return; }
    const dupe = posSuppliers.find(s => s.name.trim().toLowerCase() === name.toLowerCase() && (!editing || s.id !== editing.id));
    if (dupe) { alert(`Fournisseur déjà existant : « ${dupe.name} ».`); return; }
    if (editing) {
      await updatePosSupplier(editing.id, { ...form, name });
    } else {
      await addPosSupplier({ ...form, name, id: uuidv4() });
    }
    setShowForm(false);
    setEditing(null);
    setForm({ name: '', contact: '', phone: '', email: '', address: '' });
  };

  const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', fontSize: '14px', outline: 'none' };

  return (
    <div className="pos-page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 700 }}>Fournisseurs</h1>
        {canEdit && (
        <button onClick={() => { setShowForm(true); setEditing(null); setForm({ name: '', contact: '', phone: '', email: '', address: '' }); }} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', backgroundColor: 'var(--color-primary)', color: 'white', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontWeight: 500 }}>
          <Plus size={16} /> Ajouter
        </button>
        )}
      </div>
      {showForm && (
        <div style={{ background: 'white', borderRadius: 'var(--radius-lg)', padding: '24px', marginBottom: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>{editing ? 'Modifier' : 'Ajouter'} un fournisseur</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
            <div><div style={{ fontSize: '13px', marginBottom: '4px', fontWeight: 500 }}>Nom *</div><input style={inputStyle} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
            <div><div style={{ fontSize: '13px', marginBottom: '4px', fontWeight: 500 }}>Contact</div><input style={inputStyle} value={form.contact} onChange={e => setForm({ ...form, contact: e.target.value })} /></div>
            <div><div style={{ fontSize: '13px', marginBottom: '4px', fontWeight: 500 }}>Téléphone</div><input style={inputStyle} value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
            <div><div style={{ fontSize: '13px', marginBottom: '4px', fontWeight: 500 }}>Email</div><input style={inputStyle} type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
            <div style={{ gridColumn: '1 / -1' }}><div style={{ fontSize: '13px', marginBottom: '4px', fontWeight: 500 }}>Adresse</div><input style={inputStyle} value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} /></div>
          </div>
          <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
            <button onClick={handleSave} style={{ padding: '8px 16px', backgroundColor: 'var(--color-primary)', color: 'white', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}>Enregistrer</button>
            <button onClick={() => { setShowForm(false); setEditing(null); }} style={{ padding: '8px 16px', backgroundColor: 'var(--color-surface-alt)', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}>Annuler</button>
          </div>
        </div>
      )}
      <div style={{ background: 'white', borderRadius: 'var(--radius-lg)', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        <div className="table-responsive">
<table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr style={{ borderBottom: '1px solid var(--color-border)', textAlign: 'left' }}><th style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-muted)' }}>Nom</th><th style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-muted)' }}>Contact</th><th style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-muted)' }}>Téléphone</th><th style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-muted)' }}>Email</th><th style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-muted)' }}>Actions</th></tr></thead>
          <tbody>
            {posSuppliers.map(s => (
              <tr key={s.id} style={{ borderBottom: '1px solid var(--color-surface-alt)' }}>
                <td style={{ padding: '12px 16px', fontSize: '14px', fontWeight: 500 }}>{s.name}</td>
                <td style={{ padding: '12px 16px', fontSize: '14px', color: 'var(--color-text-muted)' }}>{s.contact}</td>
                <td style={{ padding: '12px 16px', fontSize: '14px' }}>{s.phone}</td>
                <td style={{ padding: '12px 16px', fontSize: '14px', color: 'var(--color-text-muted)' }}>{s.email}</td>
                <td style={{ padding: '12px 16px' }}>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {canEdit && (
                    <>
                    <button onClick={() => { setEditing(s); setForm({ name: s.name, contact: s.contact || '', phone: s.phone || '', email: s.email || '', address: s.address || '' }); setShowForm(true); }} style={{ padding: '6px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)' }}><Edit2 size={16} /></button>
                    <button onClick={async () => { if (window.confirm('Supprimer ce fournisseur ?')) { const ok = await deletePosSupplier(s.id); if (!ok) alert('Suppression impossible : des produits ou entrées utilisent ce fournisseur.'); } }} style={{ padding: '6px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-error)' }}><Trash2 size={16} /></button>
                    </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {posSuppliers.length === 0 && <tr><td colSpan={5} style={{ padding: '24px', textAlign: 'center', color: 'var(--color-text-muted)' }}>Aucun fournisseur</td></tr>}
          </tbody>
        </table>
</div>
      </div>
    </div>
  );
}
