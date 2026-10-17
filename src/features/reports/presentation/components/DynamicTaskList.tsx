import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { V2Task } from '../../../../context/AppContext';

interface DynamicTaskListProps {
  tasks: V2Task[];
  onChange: (tasks: V2Task[]) => void;
  readonly?: boolean;
}

export const DynamicTaskList: React.FC<DynamicTaskListProps> = ({ tasks, onChange, readonly }) => {
  const addTask = () => {
    if (readonly) return;
    onChange([...tasks, { id: crypto.randomUUID(), description: '', status: 'En cours' }]);
  };

  const updateTask = (id: string, field: keyof V2Task, value: string) => {
    if (readonly) return;
    onChange(tasks.map(t => t.id === id ? { ...t, [field]: value } : t));
  };

  const removeTask = (id: string) => {
    if (readonly) return;
    onChange(tasks.filter(t => t.id !== id));
  };

  return (
    <div className="card" style={{ padding: '16px', marginBottom: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h4 style={{ margin: 0 }}>Tâches</h4>
        {!readonly && (
          <button type="button" className="btn btn-outline btn-sm" onClick={addTask} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Plus size={14} /> Ajouter une tâche
          </button>
        )}
      </div>

      {tasks.length === 0 ? (
        <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', fontStyle: 'italic' }}>Aucune tâche ajoutée.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {tasks.map(task => (
            <div key={task.id} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input
                className="form-control"
                style={{ flex: 1 }}
                placeholder="Description de la tâche..."
                value={task.description}
                onChange={e => updateTask(task.id, 'description', e.target.value)}
                disabled={readonly}
              />
              <select
                className="form-control"
                style={{ width: '150px' }}
                value={task.status}
                onChange={e => updateTask(task.id, 'status', e.target.value as any)}
                disabled={readonly}
              >
                <option value="Effectuée">Effectuée</option>
                <option value="En cours">En cours</option>
                <option value="Restante">Restante</option>
              </select>
              {!readonly && (
                <button
                  type="button"
                  className="btn btn-outline text-error btn-sm"
                  onClick={() => removeTask(task.id)}
                  title="Supprimer la tâche"
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
