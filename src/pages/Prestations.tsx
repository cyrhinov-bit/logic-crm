import React, { useState } from 'react';
import { Plus, Edit2, Trash2 } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { useConfirm } from '../components/ConfirmModal';
import type { Prestation } from '../context/AppContext';

export function Prestations() {
  const { prestations, services, addPrestation, updatePrestation, deletePrestation } = useAppContext();
  const { confirm } = useConfirm();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newPrestation, setNewPrestation] = useState<Partial<Prestation>>({ unit: 'Jour' });

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPrestation.name && newPrestation.code && newPrestation.price && newPrestation.serviceId) {
      if (editingId) {
        updatePrestation(editingId, {
          code: newPrestation.code,
          name: newPrestation.name,
          serviceId: newPrestation.serviceId,
          price: Number(newPrestation.price),
          costPrice: Number(newPrestation.costPrice) || 0,
          unit: newPrestation.unit || 'Jour',
          description: newPrestation.description || ''
        });
      } else {
        addPrestation({
          id: Date.now().toString(),
          code: newPrestation.code,
          name: newPrestation.name,
          serviceId: newPrestation.serviceId,
          price: Number(newPrestation.price),
          costPrice: Number(newPrestation.costPrice) || 0,
          unit: newPrestation.unit || 'Jour',
          description: newPrestation.description || ''
        });
      }
      setShowForm(false);
      setEditingId(null);
      setNewPrestation({ unit: 'Jour' });
    }
  };

  const handleEdit = (p: Prestation) => {
    setEditingId(p.id);
    setNewPrestation({
      code: p.code,
      name: p.name,
      serviceId: p.serviceId,
      price: p.price,
      costPrice: p.costPrice || 0,
      unit: p.unit,
      description: p.description
    });
    setShowForm(true);
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingId(null);
    setNewPrestation({ unit: 'Jour' });
  };

  const getServiceName = (id: string) => services.find(s => s.id === id)?.name || 'Inconnu';

  return (
    <div className="dashboard">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h2>Catalogue des Prestations</h2>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
          <Plus size={16} style={{ marginRight: '8px' }} /> Nouvelle Prestation
        </button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: '24px', padding: '24px' }}>
          <h3>{editingId ? 'Modifier la prestation' : 'Ajouter une prestation'}</h3>
          <form onSubmit={handleAdd} className="responsive-form-grid">
            <input className="table-input" placeholder="Code (ex: DEV-REACT)" required value={newPrestation.code || ''} onChange={e => setNewPrestation({...newPrestation, code: e.target.value})} />
            <input className="table-input" placeholder="Nom de la prestation" required value={newPrestation.name || ''} onChange={e => setNewPrestation({...newPrestation, name: e.target.value})} />
            <select className="table-input" required value={newPrestation.serviceId || ''} onChange={e => setNewPrestation({...newPrestation, serviceId: e.target.value})}>
              <option value="">Sélectionner un service...</option>
              {services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <input className="table-input" type="number" step="0.01" placeholder="Prix Unitaire (FCFA)" required value={newPrestation.price || ''} onChange={e => setNewPrestation({...newPrestation, price: parseFloat(e.target.value)})} />
            <input className="table-input" type="number" step="0.01" placeholder="Coût de revient (FCFA)" value={newPrestation.costPrice || ''} onChange={e => setNewPrestation({...newPrestation, costPrice: parseFloat(e.target.value) || 0})} />
            <select className="table-input" value={newPrestation.unit} onChange={e => setNewPrestation({...newPrestation, unit: e.target.value})}>
              <option value="Jour">Jour</option>
              <option value="Heure">Heure</option>
              <option value="Forfait">Forfait</option>
              <option value="Unité">Unité</option>
            </select>
            <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button type="button" className="btn btn-secondary" onClick={handleCancel}>Annuler</button>
              <button type="submit" className="btn btn-primary">{editingId ? 'Mettre à jour' : 'Enregistrer'}</button>
            </div>
          </form>
        </div>
      )}

      <div className="card">
        <div className="table-responsive">
<table className="data-table responsive-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Nom de la prestation</th>
              <th>Service associé</th>
              <th>Prix Unitaire (HT)</th>
              <th>Coût de revient</th>
              <th>Unité</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {prestations.map(p => (
              <tr key={p.id}>
                <td data-label="Code">{p.code}</td>
                <td data-label="Nom de la prestation">{p.name}</td>
                <td data-label="Service associé">{getServiceName(p.serviceId)}</td>
                <td data-label="Prix Unitaire (HT)">{p.price.toLocaleString('fr-FR')} FCFA</td>
                <td data-label="Coût de revient">{(p.costPrice || 0).toLocaleString('fr-FR')} FCFA</td>
                <td data-label="Unité">{p.unit}</td>
                <td data-label="Actions">
                  <button className="icon-button" style={{ color: 'var(--color-primary)' }} onClick={() => handleEdit(p)}><Edit2 size={16} /></button>
                  <button
                    className="icon-button text-error"
                    onClick={() => confirm({
                      title: 'Supprimer la prestation',
                      message: `Voulez-vous vraiment supprimer la prestation "${p.name}" (${p.code}) ?`,
                      confirmLabel: 'Supprimer',
                      onConfirm: () => deletePrestation(p.id)
                    })}
                  >
                    <Trash2 size={16} />
                  </button>
                </td>
              </tr>
            ))}
            {prestations.length === 0 && (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '24px' }}>Aucune prestation trouvée.</td>
              </tr>
            )}
          </tbody>
        </table>
</div>
      </div>
    </div>
  );
}
