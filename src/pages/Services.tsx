import React, { useState } from 'react';
import { Plus, Edit2, Trash2 } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { useAppContext } from '../context/AppContext';
import { useConfirm } from '../components/ConfirmModal';
import type { Service } from '../context/AppContext';

export function Services() {
  const { services, users, addService, updateService, deleteService } = useAppContext();
  const { confirm } = useConfirm();
  const [showForm, setShowForm] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);

  const [newService, setNewService] = useState<Partial<Service>>({ commissionRate: 10 });
  const [editForm, setEditForm] = useState<{ name: string; members: number; description: string; commissionRate?: number }>({ name: '', members: 1, description: '', commissionRate: 10 });

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (newService.name && newService.name.trim()) {
      addService({
        id: uuidv4(),
        name: newService.name.trim(),
        members: newService.members || 1,
        description: newService.description?.trim() || '',
        commissionRate: newService.commissionRate !== undefined ? Number(newService.commissionRate) : 10
      });
      setShowForm(false);
      setNewService({ commissionRate: 10, name: '', description: '' });
    }
  };

  const startEdit = (service: Service) => {
    setEditingService(service);
    setEditForm({
      name: service.name,
      members: service.members || 1,
      description: service.description || '',
      commissionRate: service.commissionRate !== undefined ? service.commissionRate : 10
    });
    setShowForm(false);
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingService || !editForm.name.trim()) return;
    updateService(editingService.id, {
      ...editForm,
      name: editForm.name.trim(),
      description: editForm.description.trim()
    });
    setEditingService(null);
  };

  const handleDelete = (service: Service) => {
    confirm({
      title: 'Supprimer le service',
      message: `Êtes-vous sûr de vouloir supprimer le service "${service.name}" ? Cette action est définitive.`,
      confirmLabel: 'Supprimer',
      onConfirm: () => deleteService(service.id)
    });
  };

  return (
    <div className="dashboard">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h2>Départements / Services</h2>
        <button className="btn btn-primary" onClick={() => { setShowForm(!showForm); setEditingService(null); }}>
          <Plus size={16} style={{ marginRight: '8px' }} /> Ajouter un service
        </button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: '24px', padding: '24px' }}>
          <h3>Nouveau service</h3>
          <form onSubmit={handleAdd} className="responsive-form-grid">
            <input
              className="table-input"
              placeholder="Nom du service (ex: Librairie-Papeterie) *"
              value={newService.name || ''}
              required
              onChange={e => setNewService({ ...newService, name: e.target.value })}
            />
            <input
              className="table-input"
              type="number"
              placeholder="Nombre de membres (ex: 3)"
              min="1"
              value={newService.members || ''}
              onChange={e => setNewService({ ...newService, members: Number(e.target.value) })}
            />
            <input
              className="table-input"
              type="number"
              placeholder="Taux commission par défaut (%)"
              min="0"
              max="100"
              step="0.5"
              value={newService.commissionRate !== undefined ? newService.commissionRate : ''}
              onChange={e => setNewService({ ...newService, commissionRate: Number(e.target.value) })}
            />
            <input
              className="table-input"
              placeholder="Description (optionnelle)"
              value={newService.description || ''}
              onChange={e => setNewService({ ...newService, description: e.target.value })}
              style={{ gridColumn: '1 / -1' }}
            />
            <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Annuler</button>
              <button type="submit" className="btn btn-primary">Enregistrer</button>
            </div>
          </form>
        </div>
      )}

      {editingService && (
        <div className="card" style={{ marginBottom: '24px', padding: '24px', borderLeft: '4px solid var(--color-primary)' }}>
          <h3>Modifier le service : {editingService.name}</h3>
          <form onSubmit={handleSaveEdit} className="responsive-form-grid">
            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', color: 'var(--color-text-muted)' }}>Nom du service *</label>
              <input
                className="table-input"
                value={editForm.name}
                required
                onChange={e => setEditForm({ ...editForm, name: e.target.value })}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', color: 'var(--color-text-muted)' }}>Nombre de membres *</label>
              <input
                className="table-input"
                type="number"
                min="1"
                value={editForm.members}
                required
                onChange={e => setEditForm({ ...editForm, members: Number(e.target.value) })}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', color: 'var(--color-text-muted)' }}>Taux de commission (%)</label>
              <input
                className="table-input"
                type="number"
                min="0"
                max="100"
                step="0.5"
                value={editForm.commissionRate !== undefined ? editForm.commissionRate : 10}
                required
                onChange={e => setEditForm({ ...editForm, commissionRate: Number(e.target.value) })}
              />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', color: 'var(--color-text-muted)' }}>Description</label>
              <input
                className="table-input"
                placeholder="Description du service"
                value={editForm.description}
                onChange={e => setEditForm({ ...editForm, description: e.target.value })}
              />
            </div>
            <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setEditingService(null)}>Annuler</button>
              <button type="submit" className="btn btn-primary">Sauvegarder les modifications</button>
            </div>
          </form>
        </div>
      )}

      <div className="card">
        <div className="table-responsive">
<table className="data-table responsive-table">
          <thead>
            <tr>
              <th>Service</th>
              <th>Responsable</th>
              <th>Membres d'équipe</th>
              <th>Taux Commission</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {services.map(s => {
              const managerName = users.find(u => u.serviceId === s.id && u.role === 'Responsable')?.name || 'Non assigné';
              return (
                <tr key={s.id}>
                  <td data-label="Service"><strong>{s.name}</strong></td>
                  <td data-label="Responsable">{managerName}</td>
                  <td data-label="Membres">{s.members || 1}</td>
                  <td data-label="Taux Commission">
                    <span className="badge-status bg-info" style={{ fontWeight: 600 }}>
                      {s.commissionRate !== undefined && s.commissionRate !== null ? `${s.commissionRate}%` : 'Défaut (10%)'}
                    </span>
                  </td>
                  <td data-label="Actions">
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button className="icon-button" style={{ color: 'var(--color-primary)' }} title="Modifier le service" onClick={() => startEdit(s)}>
                        <Edit2 size={16} />
                      </button>
                      <button className="icon-button text-error" title="Supprimer le service" onClick={() => handleDelete(s)}>
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {services.length === 0 && (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', padding: '24px' }}>Aucun service trouvé.</td>
              </tr>
            )}
          </tbody>
        </table>
</div>
      </div>
    </div>
  );
}
