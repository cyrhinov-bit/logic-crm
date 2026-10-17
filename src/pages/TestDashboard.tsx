import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useAppContext } from '../context/AppContext';

const roles = [
  { label: 'Directeur CRM', role: 'Directeur', posActive: false, path: '/' },
  { label: 'Responsable CRM', role: 'Responsable', posActive: false, path: '/' },
  { label: 'Commercial', role: 'Commercial', posActive: false, path: '/commercial' },
  { label: 'Directeur POS', role: 'Directeur', posActive: true, path: '/pos' },
  { label: 'Gérant POS', role: 'Gerant', posActive: true, path: '/pos' },
  { label: 'Caissier POS', role: 'Caissier', posActive: true, path: '/pos/terminal' },
];

export default function TestDashboard() {
  const { currentUser, loading } = useAuth();
  const { setPosWorkspace } = useAppContext();
  const [activeRole, setActiveRole] = useState<string | null>(null);

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}>Chargement...</div>;

  const handleSwitch = (r: typeof roles[0]) => {
    // @ts-ignore - test mode, bypass role check
    localStorage.setItem('hinov_test_role', r.role);
    setPosWorkspace({ active: r.posActive });
    setActiveRole(r.label);
    window.location.href = r.path;
  };

  return (
    <div style={{ padding: '40px', maxWidth: '800px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '28px', fontWeight: 700, marginBottom: '8px' }}>Mode Test - Accès Rapide</h1>
      <p style={{ color: '#6B7280', marginBottom: '32px' }}>
        Connecté en tant que <strong>{currentUser?.name}</strong> ({currentUser?.role})
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
        {roles.map(r => (
          <button
            key={r.label}
            onClick={() => handleSwitch(r)}
            style={{
              padding: '20px', borderRadius: '12px', border: '2px solid',
              borderColor: activeRole === r.label ? 'var(--color-primary)' : '#E5E7EB',
              background: activeRole === r.label ? '#EEF2FF' : 'white',
              cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s',
            }}
          >
            <div style={{ fontSize: '16px', fontWeight: 600, marginBottom: '4px' }}>{r.label}</div>
            <div style={{ fontSize: '13px', color: '#6B7280' }}>
              {r.posActive ? 'POS' : 'CRM'} — {r.path}
            </div>
          </button>
        ))}
      </div>

      {activeRole && (
        <div style={{ marginTop: '24px', padding: '16px', background: '#ECFDF5', borderRadius: '8px', color: '#065F46', fontSize: '14px' }}>
          Redirection vers <strong>{activeRole}</strong>...
        </div>
      )}
    </div>
  );
}
