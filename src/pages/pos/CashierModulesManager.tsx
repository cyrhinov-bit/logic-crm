import { useState } from 'react';
import { toast } from 'react-hot-toast';
import { useAppContext } from '../../context/AppContext';
import { Shield, ToggleRight, ToggleLeft, Package, Truck, ClipboardList, Warehouse, RotateCcw } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const FIELD_COLUMN: Record<string, string> = {
  posReturnsEnabled: 'pos_returns_enabled',
  posCatalogueEnabled: 'pos_catalogue_enabled',
  posSupplyEnabled: 'pos_supply_enabled',
  posInventoryEnabled: 'pos_inventory_enabled',
  posStockEnabled: 'pos_stock_enabled',
};

export default function CashierModulesManager() {
  const { users, updateUser } = useAppContext();
  const { currentUser } = useAuth();
  const [search, setSearch] = useState('');

  const cashiers = users.filter(u => (u.role === 'Caissier' || u.posRole === 'Caissier') && u.active !== false);
  const filteredCashiers = cashiers.filter(c => c.name.toLowerCase().includes(search.toLowerCase()));

  // H1 : feedback + rollback optimiste vérifié serveur (l'écriture locale seule
  // ne suffit pas — la synchro UPDATE_PROFILE peut échouer silencieusement).
  const togglePermission = async (
    id: string,
    field: 'posReturnsEnabled' | 'posCatalogueEnabled' | 'posSupplyEnabled' | 'posInventoryEnabled' | 'posStockEnabled',
    currentValue: boolean,
    label: string
  ) => {
    const user = users.find(u => u.id === id);
    if (!user) return;
    const nextValue = !currentValue;

    await updateUser(id, {
      name: user.name,
      role: user.role,
      serviceId: user.serviceId,
      posReturnsEnabled: field === 'posReturnsEnabled' ? nextValue : !!user.posReturnsEnabled,
      posCatalogueEnabled: field === 'posCatalogueEnabled' ? nextValue : !!user.posCatalogueEnabled,
      posSupplyEnabled: field === 'posSupplyEnabled' ? nextValue : !!user.posSupplyEnabled,
      posInventoryEnabled: field === 'posInventoryEnabled' ? nextValue : !!user.posInventoryEnabled,
      posStockEnabled: field === 'posStockEnabled' ? nextValue : !!user.posStockEnabled,
    });
    toast.success(`Module « ${label} » ${nextValue ? 'activé' : 'désactivé'} pour ${user.name} (synchronisation en cours).`);

    try {
      if (navigator.onLine) {
        const { supabase } = await import('../../lib/supabase');
        const col = FIELD_COLUMN[field];
        // Laisse la file traiter, puis vérifie la valeur serveur effective.
        await new Promise(r => setTimeout(r, 2500));
        const { data } = await supabase.from('profiles').select(col).eq('id', id).maybeSingle();
        if (data && (data as any)[col] !== nextValue) {
          await updateUser(id, { [field]: currentValue } as any);
          toast.error(`Échec serveur : « ${label} » rétabli à sa valeur précédente pour ${user.name}. Réessayez en ligne.`, { duration: 6000 });
        }
      }
    } catch { /* vérification best-effort : le local + la file font foi */ }
  };

  if (currentUser?.role !== 'Directeur' && currentUser?.role !== 'Gerant' && currentUser?.role !== 'Responsable') {
    return (
      <div style={{ padding: '24px', textAlign: 'center', color: 'var(--color-error)' }}>
        Accès refusé. Seul un Gérant, un Directeur ou un Responsable peut gérer les modules des caissiers.
      </div>
    );
  }

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Shield size={24} color="var(--color-primary)" />
          Modules Caissier
        </h1>
        <p style={{ color: 'var(--color-text-muted)', marginTop: '4px', fontSize: '14px' }}>
          Gérez l'accès des caissiers aux différents modules du point de vente.
        </p>
      </div>

      <div style={{ marginBottom: '24px' }}>
        <input 
          type="text" 
          placeholder="Rechercher un caissier..." 
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: '100%', maxWidth: '400px', padding: '10px 16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', fontSize: '14px' }}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '20px' }}>
        {filteredCashiers.map(cashier => (
          <div key={cashier.id} style={{ background: 'white', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px', paddingBottom: '16px', borderBottom: '1px solid var(--color-surface-alt)' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'var(--color-primary-tint)', color: 'var(--color-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '18px' }}>
                {cashier.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 600 }}>{cashier.name}</h3>
                <p style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>{cashier.email}</p>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <ModuleToggle 
                label="Catalogue" 
                icon={<Package size={16} />} 
                isActive={!!cashier.posCatalogueEnabled} 
                onToggle={() => togglePermission(cashier.id, 'posCatalogueEnabled', !!cashier.posCatalogueEnabled, 'Catalogue')} 
              />
              <ModuleToggle 
                label="Approvisionnement" 
                icon={<Truck size={16} />} 
                isActive={!!cashier.posSupplyEnabled} 
                onToggle={() => togglePermission(cashier.id, 'posSupplyEnabled', !!cashier.posSupplyEnabled, 'Approvisionnement')} 
              />
              <ModuleToggle 
                label="Inventaire" 
                icon={<ClipboardList size={16} />} 
                isActive={!!cashier.posInventoryEnabled} 
                onToggle={() => togglePermission(cashier.id, 'posInventoryEnabled', !!cashier.posInventoryEnabled, 'Inventaire')} 
              />
              <ModuleToggle 
                label="Stock & Mouvements" 
                icon={<Warehouse size={16} />} 
                isActive={!!cashier.posStockEnabled} 
                onToggle={() => togglePermission(cashier.id, 'posStockEnabled', !!cashier.posStockEnabled, 'Stock et Mouvements')} 
              />
              <ModuleToggle 
                label="Retours" 
                icon={<RotateCcw size={16} />} 
                isActive={!!cashier.posReturnsEnabled} 
                onToggle={() => togglePermission(cashier.id, 'posReturnsEnabled', !!cashier.posReturnsEnabled, 'Retours')} 
              />
            </div>
          </div>
        ))}

        {filteredCashiers.length === 0 && (
          <div style={{ gridColumn: '1 / -1', padding: '40px', textAlign: 'center', background: 'white', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', color: 'var(--color-text-muted)' }}>
            Aucun caissier actif trouvé.
          </div>
        )}
      </div>
    </div>
  );
}

function ModuleToggle({ label, icon, isActive, onToggle }: { label: string, icon: React.ReactNode, isActive: boolean, onToggle: () => void }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'var(--color-surface-alt)', borderRadius: 'var(--radius-md)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '14px', fontWeight: 500, color: 'var(--color-text)' }}>
        <span style={{ color: 'var(--color-text-muted)', display: 'flex' }}>{icon}</span>
        {label}
      </div>
      <button 
        onClick={onToggle}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: isActive ? 'var(--color-success)' : 'var(--color-text-muted)', display: 'flex', alignItems: 'center' }}
        title={isActive ? 'Désactiver le module' : 'Activer le module'}
      >
        {isActive ? <ToggleRight size={28} /> : <ToggleLeft size={28} />}
      </button>
    </div>
  );
}
