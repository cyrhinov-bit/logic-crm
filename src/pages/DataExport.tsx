import { useMemo, useState } from 'react';
import { Download, FileSpreadsheet, CheckSquare, Square } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useAppContext } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { canViewAll, visibleTo } from '../lib/scope';
import {
  ALL_EXPORT_KEYS, EXPORT_LABELS,
  exportCrmExcel,
  type ExportKey,
} from '../features/reports/services/CrmExportService';
import { Button } from '../components/ui/Button';

export default function DataExport() {
  const ctx = useAppContext();
  const { currentUser: authUser } = useAuth();
  const currentUser = ctx.users.find(u => u.id === authUser?.id) || authUser;
  const [selected, setSelected] = useState<ExportKey[]>([...ALL_EXPORT_KEYS]);
  const [isExporting, setIsExporting] = useState(false);

  // Scopage export : direction = tout, autres = uniquement ses propres lignes
  const scoped = useMemo(() => {
    const id = currentUser?.id;
    const role = currentUser?.role;
    const own = <T,>(items: T[], f: (t: T) => Array<string | undefined | null>): T[] =>
      canViewAll(role) ? items : visibleTo(items, role, id, f);
    return {
      crmTiers: own(ctx.crmTiers, t => [t.cree_par]),
      crmPrestations: own(ctx.crmPrestations, p => [p.cree_par, p.commercial_id, p.apporteur_id]),
      crmCaisse: own(ctx.crmCaisse, m => [m.cree_par]),
      crmCommissions: own(ctx.crmCommissions, c => [(c as any).beneficiaire_id, (c as any).cree_par]),
      crmMaintenance: own(ctx.crmMaintenance, m => [m.cree_par]),
      invoices: own(ctx.invoices, i => [i.commercialId, (i as any).commercial_id]),
      clients: own(ctx.clients, c => [c.commercialId]),
      quotes: own(ctx.quotes, q => [q.commercialId]),
      sales: own(ctx.sales, s => [s.commercialId]),
    };
  }, [ctx, currentUser]);

  const counts: Record<ExportKey, number> = useMemo(() => ({
    crm_tiers: scoped.crmTiers.length,
    crm_commerciaux: ctx.crmCommerciaux.length,
    crm_prestations: scoped.crmPrestations.length,
    crm_caisse: scoped.crmCaisse.length,
    crm_commissions: scoped.crmCommissions.length,
    crm_catalogue: ctx.crmArticles.length,
    crm_maintenance: scoped.crmMaintenance.length,
    crm_techniciens: ctx.crmTechniciens.length,
    crm_factures: scoped.invoices.length,
    crm_clients: scoped.clients.length,
    crm_devis: scoped.quotes.length,
    crm_ventes: scoped.sales.length,
  }), [ctx, scoped]);

  const toggle = (key: ExportKey) =>
    setSelected(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);

  const handleExport = async (keys: ExportKey[]) => {
    if (keys.length === 0) {
      toast.error('Sélectionnez au moins un module à exporter');
      return;
    }
    setIsExporting(true);
    try {
      const fileName = exportCrmExcel({
        crmTiers: scoped.crmTiers,
        crmCommerciaux: ctx.crmCommerciaux,
        crmPrestations: scoped.crmPrestations,
        crmCaisse: scoped.crmCaisse,
        crmCommissions: scoped.crmCommissions,
        crmArticles: ctx.crmArticles,
        crmMaintenance: scoped.crmMaintenance,
        crmTechniciens: ctx.crmTechniciens,
        invoices: scoped.invoices,
        clients: scoped.clients,
        quotes: scoped.quotes,
        sales: scoped.sales,
      }, keys);
      toast.success(`Export généré : ${fileName}`);
    } catch (e) {
      console.error(e);
      toast.error("Erreur lors de l'export Excel");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
            <FileSpreadsheet size={26} /> Centre d'export CRM
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', margin: '4px 0 0' }}>
            Un seul fichier Excel multi-onglets (une feuille par module). Les données exportées sont celles chargées localement (pensez à synchroniser avant).
            {!canViewAll(currentUser?.role) && ' Périmètre restreint à vos propres données.'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <Button variant="secondary" onClick={() => setSelected([...ALL_EXPORT_KEYS])}>Tout sélectionner</Button>
          <Button variant="secondary" onClick={() => setSelected([])}>Tout désélectionner</Button>
          <Button variant="primary" icon={<Download size={16} />} onClick={() => handleExport(selected)} disabled={isExporting || selected.length === 0}>
            {isExporting ? 'Export...' : `Exporter (${selected.length})`}
          </Button>
        </div>
      </div>

      <div className="card" style={{ padding: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0 }}>💼 Données CRM</h3>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-secondary" style={{ fontSize: '12px', padding: '4px 10px' }} onClick={() => setSelected([...ALL_EXPORT_KEYS])}>Tout</button>
            <button className="btn btn-secondary" style={{ fontSize: '12px', padding: '4px 10px' }} onClick={() => setSelected([])}>Aucun</button>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '8px' }}>
          {ALL_EXPORT_KEYS.map(key => {
            const active = selected.includes(key);
            return (
              <button
                key={key}
                onClick={() => toggle(key)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '10px', textAlign: 'left',
                  padding: '10px 12px', borderRadius: '8px', cursor: 'pointer',
                  border: active ? '1.5px solid var(--color-primary)' : '1px solid var(--color-border)',
                  background: active ? 'var(--color-primary-tint)' : 'white',
                }}
              >
                {active ? <CheckSquare size={18} color="var(--color-primary)" /> : <Square size={18} color="var(--color-text-muted)" />}
                <span>
                  <span style={{ display: 'block', fontSize: '13px', fontWeight: 600 }}>{EXPORT_LABELS[key].label}</span>
                  <span style={{ display: 'block', fontSize: '12px', color: 'var(--color-text-muted)' }}>
                    {counts[key].toLocaleString('fr-FR')} ligne(s) → feuille {EXPORT_LABELS[key].sheet}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="card" style={{ padding: '16px', fontSize: '13px', color: 'var(--color-text-muted)' }}>
        <strong>Exports rapides déjà existants :</strong>
        <ul style={{ margin: '8px 0 0', paddingLeft: '20px' }}>
          <li>Factures → « Exporter Excel » : registre mensuel 13 colonnes (<em>SUIVI_FACTURES_CLIENTS_MOIS_ANNEE.xlsx</em>).</li>
          <li>CRM → Rapports hebdo : export PDF du rapport.</li>
        </ul>
      </div>
    </div>
  );
}
