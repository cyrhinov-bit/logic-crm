import { useState } from 'react';
import { useAppContext } from '../../context/AppContext';
import { Plus, Edit2, Trash2, ToggleLeft, ToggleRight } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { useCanManagePosReferentials } from '../../hooks/useCanManagePosReferentials';

export default function PosDiscounts() {
  const { posDiscounts, addPosDiscount, updatePosDiscount, deletePosDiscount } = useAppContext();
  const canEdit = useCanManagePosReferentials();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ name: '', type: 'Pourcentage' as 'Pourcentage' | 'Montant', value: 0, maxPercent: 10, maxAmount: 5000, active: true });

  const handleSave = async () => {
    // F22 : bornes validées (pas de % > 100 ni montant négatif), nom requis.
    const name = form.name.trim();
    if (!name) { alert('Nom de remise requis.'); return; }
    if (form.type === 'Pourcentage' && !(form.maxPercent >= 0 && form.maxPercent <= 100)) {
      alert('Le pourcentage maximum doit être compris entre 0 et 100.');
      return;
    }
    if (form.type === 'Montant' && !(form.maxAmount >= 0)) {
      alert('Le montant maximum doit être positif ou zéro.');
      return;
    }
    if (editing) {
      await updatePosDiscount(editing.id, { ...form, name });
    } else {
      await addPosDiscount({ ...form, name, id: uuidv4() });
    }
    setShowForm(false);
    setEditing(null);
    setForm({ name: '', type: 'Pourcentage', value: 0, maxPercent: 10, maxAmount: 5000, active: true });
  };

  const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', fontSize: '14px', outline: 'none' };

  return (
    <div className="pos-page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 700 }}>Remises</h1>
        {canEdit && (
        <button onClick={() => { setShowForm(true); setEditing(null); setForm({ name: '', type: 'Pourcentage', value: 0, maxPercent: 10, maxAmount: 5000, active: true }); }} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', backgroundColor: 'var(--color-primary)', color: 'white', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontWeight: 500 }}>
          <Plus size={16} /> Ajouter
        </button>
        )}
      </div>
      {showForm && (
        <div style={{ background: 'white', borderRadius: 'var(--radius-lg)', padding: '24px', marginBottom: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>{editing ? 'Modifier' : 'Ajouter'} une remise</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '12px', alignItems: 'end' }}>
            <div><div style={{ fontSize: '13px', marginBottom: '4px', fontWeight: 500 }}>Nom</div><input style={inputStyle} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
            <div><div style={{ fontSize: '13px', marginBottom: '4px', fontWeight: 500 }}>Type</div><select style={inputStyle} value={form.type} onChange={e => setForm({ ...form, type: e.target.value as any })}><option value="Pourcentage">Pourcentage (%)</option><option value="Montant">Montant fixe</option></select></div>
            <div><div style={{ fontSize: '13px', marginBottom: '4px', fontWeight: 500 }}>{form.type === 'Pourcentage' ? 'Max % autorisée' : 'Max montant fixe'}</div><input style={inputStyle} type="number" value={form.type === 'Pourcentage' ? form.maxPercent : form.maxAmount} onChange={e => form.type === 'Pourcentage' ? setForm({ ...form, maxPercent: Number(e.target.value) }) : setForm({ ...form, maxAmount: Number(e.target.value) })} /></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button onClick={handleSave} style={{ padding: '8px 16px', backgroundColor: 'var(--color-primary)', color: 'white', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}>Enregistrer</button>
              <button onClick={() => { setShowForm(false); setEditing(null); }} style={{ padding: '8px 16px', backgroundColor: 'var(--color-surface-alt)', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}>Annuler</button>
            </div>
          </div>
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
        {posDiscounts.map(d => (
          <div key={d.id} style={{ background: 'white', borderRadius: 'var(--radius-lg)', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '12px' }}>
              <div>
                <div style={{ fontSize: '16px', fontWeight: 600 }}>{d.name}</div>
                <div style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>{d.type === 'Pourcentage' ? `${d.maxPercent ?? 0}% max` : `${(d.maxAmount ?? 0).toLocaleString()} max`}</div>
              </div>
              <div style={{ display: 'flex', gap: '4px' }}>
                {canEdit && (
                <>
                <button onClick={() => { setEditing(d); setForm({ name: d.name, type: d.type, value: d.value, maxPercent: d.maxPercent || 10, maxAmount: d.maxAmount || 5000, active: d.active }); setShowForm(true); }} style={{ padding: '4px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)' }}><Edit2 size={14} /></button>
                <button onClick={() => { if (window.confirm(`Supprimer la remise « ${d.name} » ?`)) deletePosDiscount(d.id); }} style={{ padding: '4px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-error)' }}><Trash2 size={14} /></button>
                </>
                )}
              </div>
            </div>
            {canEdit && (
            <button onClick={() => updatePosDiscount(d.id, { active: !d.active })} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', color: d.active ? 'var(--color-success)' : 'var(--color-text-muted)' }}>
              {d.active ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
              {d.active ? 'Active' : 'Inactive'}
            </button>
            )}
          </div>
        ))}
        {posDiscounts.length === 0 && <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '40px', color: 'var(--color-text-muted)' }}>Aucune remise configurée</div>}
      </div>
    </div>
  );
}
