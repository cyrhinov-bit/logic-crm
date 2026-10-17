import { useState, useEffect, useMemo } from 'react';
import {
  Plus,
  Download,
  MessageCircle,
  Edit2,
  Trash2,
  Check,
  X,
  Eye,
  Filter,
  RotateCcw,
  Search,
  CheckCircle,
  Calendar,
  Receipt,
  Mail,
  Settings
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { useConfirm } from '../components/ConfirmModal';
import { generateQuotePdf, downloadBlob, ensureDevisPdfAssets } from '../lib/pdfUtils';
import { sendQuoteByMail } from '../lib/mailUtils';
import { ReportPdfPreview, type ReportPdfPreviewData } from '../components/ReportPdfPreview';
import { MailSmtpSettings } from '../components/MailSmtpSettings';
import type { Quote } from '../context/AppContext';
import { canViewAll, visibleTo, canManageOwned } from '../lib/scope';

type PeriodFilter = 'ALL' | 'TODAY' | '7_DAYS' | 'THIS_MONTH' | 'THIS_QUARTER' | 'THIS_YEAR';

function isQuoteExpired(q: Quote): boolean {
  if (!q.validUntil) return false;
  const today = new Date().toISOString().split('T')[0];
  return q.validUntil < today;
}

export function Devis() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { currentUser: authUser } = useAuth();
  const { quotes, clients, settings, deleteQuote, services, users, prestations } = useAppContext();
  const currentUser = users.find(u => u.id === authUser?.id) || authUser;
  const { confirm } = useConfirm();

  const [filter, setFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [serviceFilter, setServiceFilter] = useState('');
  const [authorFilter, setAuthorFilter] = useState<string>(searchParams.get('authorId') || '');
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('ALL');
  const [preview, setPreview] = useState<ReportPdfPreviewData | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [activeTab, setActiveTab] = useState<'list' | 'mail'>('list');
  const PAGE_SIZE = 20;

  useEffect(() => {
    const authorParam = searchParams.get('authorId');
    if (authorParam) {
      setAuthorFilter(authorParam);
    }
  }, [searchParams]);

  const isDirector = canViewAll(currentUser?.role);

  const getClientName = (id: string) => clients.find(c => c.id === id)?.name || 'Inconnu';
  const getServiceName = (id?: string) => services.find(s => s.id === id)?.name || '-';
  const getUserName = (id?: string) => users.find(u => u.id === id)?.name || 'Non assigné';

  // Helper date filtering — une date absente/invalide n'est incluse que pour "ALL"
  const isDateInPeriod = (dateStr?: string, period: PeriodFilter = periodFilter): boolean => {
    if (period === 'ALL') return true;
    if (!dateStr) return false;
    
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return false;
    const now = new Date();
    
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    switch (period) {
      case 'TODAY':
        return d >= startOfToday;
      case '7_DAYS': {
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        return d >= weekAgo;
      }
      case 'THIS_MONTH':
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      case 'THIS_QUARTER': {
        const currentQuarter = Math.floor(now.getMonth() / 3);
        const itemQuarter = Math.floor(d.getMonth() / 3);
        return itemQuarter === currentQuarter && d.getFullYear() === now.getFullYear();
      }
      case 'THIS_YEAR':
        return d.getFullYear() === now.getFullYear();
      default:
        return true;
    }
  };

  // Scopage : direction = tout, autres rôles (Responsable inclus) = propres devis uniquement
  const allowedQuotes = useMemo(() => {
    return visibleTo(quotes, currentUser?.role, currentUser?.id, q => [q.commercialId]);
  }, [quotes, currentUser]);

  const filteredQuotes = useMemo(() => {
    return allowedQuotes.filter(q => {
      // 1. Période
      if (!isDateInPeriod(q.date)) return false;

      // 2. Recherche
      if (filter.trim()) {
        const qText = filter.toLowerCase();
        const clientName = getClientName(q.clientId).toLowerCase();
        const authorName = getUserName(q.commercialId).toLowerCase();
        const subject = (q.subject || '').toLowerCase();
        const num = (q.quoteNumber || '').toLowerCase();
        if (!clientName.includes(qText) && !authorName.includes(qText) && !subject.includes(qText) && !num.includes(qText)) {
          return false;
        }
      }

      // 3. Statut
      if (statusFilter && q.status.toLowerCase() !== statusFilter.toLowerCase()) {
        return false;
      }

      // 4. Service
      if (serviceFilter && q.serviceId !== serviceFilter) {
        return false;
      }

      // 5. Utilisateur / Auteur
      if (authorFilter) {
        const matchAuthor = q.commercialId === authorFilter || 
          (!q.commercialId && users.find(u => u.id === authorFilter)?.serviceId === q.serviceId);
        if (!matchAuthor) return false;
      }

      return true;
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [allowedQuotes, filter, statusFilter, serviceFilter, authorFilter, periodFilter, clients, users]);

  // KPIs pour la sélection filtrée
  const totalFilteredCount = filteredQuotes.length;
  const totalFilteredAmount = filteredQuotes.filter(q => q.status !== 'Refusé').reduce((sum, q) => sum + (Number(q.total) || 0), 0);
  const acceptedFiltered = filteredQuotes.filter(q => q.status === 'Accepté');
  const acceptedFilteredAmount = acceptedFiltered.reduce((sum, q) => sum + (Number(q.total) || 0), 0);
  const conversionRate = totalFilteredCount > 0 ? Math.round((acceptedFiltered.length / totalFilteredCount) * 100) : 0;

  // Pagination (20 / page) — évite le rendu de milliers de lignes
  const totalPages = Math.max(1, Math.ceil(filteredQuotes.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedQuotes = filteredQuotes.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  // Reset page à chaque changement de filtre
  useEffect(() => { setCurrentPage(1); }, [filter, statusFilter, serviceFilter, authorFilter, periodFilter]);

  // Liste des utilisateurs éligibles pour le filtre + compteur pré-calculé (O(N))
  const quoteCountByAuthor = useMemo(() => {
    const m = new Map<string, number>();
    for (const q of quotes) m.set(q.commercialId, (m.get(q.commercialId) || 0) + 1);
    return m;
  }, [quotes]);
  // Filtre par auteur : direction uniquement (les autres ne voient que leurs devis)
  const filterableUsers = useMemo(() => {
    if (isDirector) return users;
    return [];
  }, [users, isDirector]);

  const hasActiveFilters = filter !== '' || statusFilter !== '' || serviceFilter !== '' || authorFilter !== '' || periodFilter !== 'ALL';

  const resetFilters = () => {
    setFilter('');
    setStatusFilter('');
    setServiceFilter('');
    setAuthorFilter('');
    setPeriodFilter('ALL');
    setCurrentPage(1);
    setSearchParams({});
  };

  const getBadgeColor = (status: string) => {
    switch (status) {
      case 'Accepté': return 'bg-success';
      case 'Refusé': return 'bg-error';
      case 'Révision': return 'bg-warning';
      case 'Envoyé': return 'bg-primary';
      case 'Brouillon': return 'bg-secondary';
      default: return '';
    }
  };

  const handlePreview = async (q: Quote) => {
    const client = clients.find(c => c.id === q.clientId);
    await ensureDevisPdfAssets();
    const blob = generateQuotePdf(q, client, settings, prestations);
    const blobUrl = URL.createObjectURL(blob);
    setPreview({
      blobUrl,
      filename: `Devis_${q.quoteNumber}.pdf`,
      title: `Aperçu du Devis N° ${q.quoteNumber}`,
      onDownload: () => downloadBlob(blob, `Devis_${q.quoteNumber}.pdf`),
      onSendByMail: () => sendQuoteByMail(q, client, settings, prestations)
    });
  };

  const handleSendByMail = (q: Quote) => {
    const client = clients.find(c => c.id === q.clientId);
    return sendQuoteByMail(q, client, settings, prestations);
  };

  // Qui peut gérer le devis ? Direction ou propriétaire (Responsable inclus).
  const canManageQuote = (q: Quote): boolean => {
    return canManageOwned(q, currentUser?.role, currentUser?.id, x => [x.commercialId]);
  };

  const handleDelete = (q: Quote) => {
    confirm({
      title: 'Supprimer le devis',
      message: `Voulez-vous vraiment supprimer le devis "${q.quoteNumber}" ? Cette action est irréversible.`,
      confirmLabel: 'Supprimer',
      variant: 'danger',
      onConfirm: () => {
        try {
          const res: any = deleteQuote(q.id);
          if (res && typeof res.catch === 'function') {
            res.catch((e: any) => alert(e?.message || 'Suppression impossible.'));
          }
        } catch (e: any) {
          alert(e?.message || 'Suppression impossible.');
        }
      }
    });
  };

  return (
    <div className="dashboard">
      {/* Entête */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>Gestion & Suivi des Devis</h2>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem', margin: '4px 0 0' }}>
            Consultez, filtrez par collaborateur et suivez l'avancement des devis commerciaux.
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => navigate('/devis/nouveau')} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Plus size={16} /> Créer un devis
        </button>
      </div>

      {/* Navigation par onglets (accessible à tous les utilisateurs) */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: '2px solid var(--color-border)', marginBottom: '20px', flexWrap: 'wrap' }}>
        <button
          className={`tab-button ${activeTab === 'list' ? 'active' : ''}`}
          onClick={() => setActiveTab('list')}
          style={{
            padding: '10px 18px', border: 'none', background: 'none', cursor: 'pointer',
            borderBottom: activeTab === 'list' ? '3px solid var(--color-primary)' : '3px solid transparent',
            color: activeTab === 'list' ? 'var(--color-primary)' : 'var(--color-text-muted)',
            fontWeight: activeTab === 'list' ? 700 : 500, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '8px'
          }}
        >
          <Receipt size={16} /> Liste des devis
        </button>
        <button
          className={`tab-button ${activeTab === 'mail' ? 'active' : ''}`}
          onClick={() => setActiveTab('mail')}
          style={{
            padding: '10px 18px', border: 'none', background: 'none', cursor: 'pointer',
            borderBottom: activeTab === 'mail' ? '3px solid var(--color-primary)' : '3px solid transparent',
            color: activeTab === 'mail' ? 'var(--color-primary)' : 'var(--color-text-muted)',
            fontWeight: activeTab === 'mail' ? 700 : 500, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '8px'
          }}
        >
          <Settings size={16} /> Paramètres envoi devis par e-mail
        </button>
      </div>

      {activeTab === 'mail' ? (
        <div className="card" style={{ maxWidth: '900px', padding: 'var(--spacing-5)' }}>
          <MailSmtpSettings />
        </div>
      ) : (
        <>

      {/* ─── BANDEAU DE FILTRES AVANCÉS ───────────────────────── */}
      <div className="card" style={{ marginBottom: '20px', padding: '16px 20px', border: hasActiveFilters ? '1.5px solid rgba(37, 99, 235, 0.4)' : '1px solid var(--color-border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem', fontWeight: 700 }}>
            <Filter size={16} color="var(--color-primary)" />
            <span>Filtres de recherche</span>
            {authorFilter && (
              <span className="badge-status" style={{ background: 'rgba(37, 99, 235, 0.12)', color: '#2563EB', fontSize: '11px', fontWeight: 600 }}>
                👤 {getUserName(authorFilter)}
              </span>
            )}
            {hasActiveFilters && (
              <span className="badge-status" style={{ background: 'var(--color-surface-alt)', color: 'var(--color-text-muted)', fontSize: '11px' }}>
                {totalFilteredCount} devis trouvé(s)
              </span>
            )}
          </div>

          {hasActiveFilters && (
            <button 
              className="btn btn-secondary" 
              onClick={resetFilters}
              style={{ fontSize: '0.8rem', padding: '4px 10px', display: 'flex', alignItems: 'center', gap: '4px' }}
            >
              <RotateCcw size={12} />
              <span>Réinitialiser les filtres</span>
            </button>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', alignItems: 'center' }}>
          {/* Recherche */}
          <div style={{ position: 'relative' }}>
            <Search size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
            <input 
              type="text" 
              className="table-input" 
              placeholder="Client, N° devis, sujet..." 
              style={{ paddingLeft: '32px', width: '100%', fontSize: '0.85rem' }} 
              value={filter}
              onChange={e => setFilter(e.target.value)}
            />
          </div>

          {/* Filtre par Utilisateur / Auteur (Pour Admin et Responsables) */}
          {isDirector && (
            <div>
              <select 
                className="table-input" 
                style={{ width: '100%', fontSize: '0.85rem', fontWeight: authorFilter ? 700 : 400, borderColor: authorFilter ? '#2563EB' : undefined }}
                value={authorFilter}
                onChange={e => {
                  setAuthorFilter(e.target.value);
                  if (e.target.value) {
                    setSearchParams({ authorId: e.target.value });
                  } else {
                    setSearchParams({});
                  }
                }}
              >
                <option value="">👤 Tous les utilisateurs / auteurs</option>
                {filterableUsers.map(u => {
                  const userQuoteCount = quoteCountByAuthor.get(u.id) || 0;
                  return (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.role}) — {userQuoteCount} devis
                    </option>
                  );
                })}
              </select>
            </div>
          )}

          {/* Période */}
          <div>
            <select
              className="table-input"
              style={{ width: '100%', fontSize: '0.85rem' }}
              value={periodFilter}
              onChange={e => setPeriodFilter(e.target.value as PeriodFilter)}
            >
              <option value="ALL">📅 Toute la période</option>
              <option value="TODAY">Aujourd'hui</option>
              <option value="7_DAYS">7 derniers jours</option>
              <option value="THIS_MONTH">Ce mois-ci</option>
              <option value="THIS_QUARTER">Ce trimestre</option>
              <option value="THIS_YEAR">Cette année</option>
            </select>
          </div>

          {/* Statut */}
          <div>
            <select 
              className="table-input" 
              style={{ width: '100%', fontSize: '0.85rem' }}
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
            >
              <option value="">🏷️ Tous les statuts</option>
              <option value="Brouillon">Brouillon</option>
              <option value="Envoyé">Envoyé</option>
              <option value="Accepté">Accepté</option>
              <option value="Révision">Révision</option>
              <option value="Refusé">Refusé</option>
            </select>
          </div>

          {/* Service (Direction) */}
          {isDirector && (
            <div>
              <select 
                className="table-input" 
                style={{ width: '100%', fontSize: '0.85rem' }}
                value={serviceFilter}
                onChange={e => setServiceFilter(e.target.value)}
              >
                <option value="">🏢 Tous les services</option>
                {services.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* ─── MINI KPIS DE LA SÉLECTION FILTRÉE ─────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '20px' }}>
        <div className="card" style={{ padding: '14px 18px', borderLeft: '4px solid #3B82F6' }}>
          <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Devis Sélectionnés</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--color-text)', marginTop: '2px' }}>
            {totalFilteredCount}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#2563EB', fontWeight: 600, marginTop: '2px' }}>
            {totalFilteredAmount.toLocaleString('fr-FR')} FCFA émis
          </div>
        </div>

        <div className="card" style={{ padding: '14px 18px', borderLeft: '4px solid #10B981' }}>
          <div style={{ fontSize: '0.72rem', color: '#059669', fontWeight: 600, textTransform: 'uppercase' }}>Devis Acceptés</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#059669', marginTop: '2px' }}>
            {acceptedFiltered.length}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#059669', fontWeight: 600, marginTop: '2px' }}>
            {acceptedFilteredAmount.toLocaleString('fr-FR')} FCFA ({conversionRate}%)
          </div>
        </div>

        <div className="card" style={{ padding: '14px 18px', borderLeft: '4px solid #F59E0B' }}>
          <div style={{ fontSize: '0.72rem', color: '#D97706', fontWeight: 600, textTransform: 'uppercase' }}>En Négociation / Attente</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#D97706', marginTop: '2px' }}>
            {filteredQuotes.filter(q => q.status === 'Envoyé' || q.status === 'Brouillon' || q.status === 'Révision').length}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '2px' }}>
            Pipeline commercial actif
          </div>
        </div>
      </div>

      {/* ─── TABLEAU DES DEVIS ────────────────────────────────── */}
      <div className="card">
        <div className="table-responsive">
          <table className="data-table responsive-table">
            <thead>
              <tr>
                <th>N° Devis</th>
                <th>Client</th>
                {isDirector && <th>Auteur / Utilisateur</th>}
                <th>Service</th>
                <th>Sujet</th>
                <th style={{ textAlign: 'right' }}>Montant Total</th>
                <th>Statut</th>
                <th>Date d'émission</th>
                <th style={{ textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedQuotes.map(q => {
                const expired = isQuoteExpired(q);
                return (
                <tr key={q.id}>
                  <td data-label="N° Devis">
                    <div style={{ fontWeight: 700, color: 'var(--color-primary)' }}>{q.quoteNumber}</div>
                  </td>
                  <td data-label="Client">
                    <strong>{getClientName(q.clientId)}</strong>
                  </td>
                  {isDirector && (
                    <td data-label="Auteur">
                      <div 
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}
                        title="Filtrer uniquement sur ce collaborateur"
                        onClick={() => {
                          if (q.commercialId) {
                            setAuthorFilter(q.commercialId);
                            setSearchParams({ authorId: q.commercialId });
                          }
                        }}
                      >
                        <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: 'var(--color-primary-tint)', color: 'var(--color-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 700 }}>
                          {getUserName(q.commercialId).substring(0, 2).toUpperCase()}
                        </div>
                        <span style={{ fontWeight: 600, color: authorFilter === q.commercialId ? '#2563EB' : 'var(--color-text)' }}>
                          {getUserName(q.commercialId)}
                        </span>
                      </div>
                    </td>
                  )}
                  <td data-label="Service" style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                    {getServiceName(q.serviceId)}
                  </td>
                  <td data-label="Sujet">{q.subject}</td>
                  <td data-label="Montant Total" style={{ textAlign: 'right', fontWeight: 700 }}>
                    {(Number(q.total) || 0).toLocaleString('fr-FR')} FCFA
                  </td>
                  <td data-label="Statut">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        <span className={`badge-status ${getBadgeColor(q.status)}`}>{q.status}</span>
                        {expired && (
                          <span className="badge-status" style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA', fontSize: '11px' }} title={`Validité dépassée depuis le ${q.validUntil}`}>
                            <Calendar size={11} style={{ verticalAlign: '-1px', marginRight: '3px' }} />Expiré
                          </span>
                        )}
                        {q.clientComment && (
                          <span title={`Commentaire client : ${q.clientComment}`}>
                            <MessageCircle size={14} style={{ color: 'var(--color-primary)' }} />
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td data-label="Date d'émission">{q.date}</td>
                  <td data-label="Actions">
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', justifyContent: 'center' }}>
                      {canManageQuote(q) && (
                        <button className="icon-button" style={{ color: 'var(--color-primary)' }} onClick={() => navigate(`/devis/nouveau?editId=${q.id}`)} title="Modifier le devis">
                          <Edit2 size={16} />
                        </button>
                      )}
                      <button className="icon-button" style={{ color: '#1879C8' }} onClick={() => handlePreview(q)} title="Aperçu PDF direct">
                        <Eye size={16} />
                      </button>
                      <button className="icon-button" style={{ color: 'var(--color-primary)' }} onClick={async () => {
                        const client = clients.find(c => c.id === q.clientId);
                        await ensureDevisPdfAssets();
                        const blob = generateQuotePdf(q, client, settings, prestations);
                        downloadBlob(blob, `Devis_${q.quoteNumber}.pdf`);
                      }} title="Télécharger PDF">
                        <Download size={16} />
                      </button>
                      <button className="icon-button" style={{ color: '#1879C8' }} onClick={() => handleSendByMail(q)} title="Envoyer par e-mail (ouvre votre messagerie, PDF copié)">
                        <Mail size={16} />
                      </button>
                      <button className="icon-button" style={{ color: 'var(--color-error)' }} onClick={() => handleDelete(q)} title="Supprimer le devis">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
                );
              })}
              {filteredQuotes.length === 0 && (
                <tr>
                  <td colSpan={isDirector ? 9 : 8} style={{ textAlign: 'center', padding: '32px', color: 'var(--color-text-muted)' }}>
                    Aucun devis trouvé pour les critères de filtre sélectionnés.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {filteredQuotes.length > PAGE_SIZE && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '12px', marginTop: '16px' }}>
          <button className="btn btn-secondary" disabled={safePage <= 1} onClick={() => setCurrentPage(p => Math.max(1, p - 1))}>
            ← Précédent
          </button>
          <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
            Page {safePage} / {totalPages} — {paginatedQuotes.length} / {filteredQuotes.length} devis
          </span>
          <button className="btn btn-secondary" disabled={safePage >= totalPages} onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}>
            Suivant →
          </button>
        </div>
      )}

      <ReportPdfPreview 
        preview={preview} 
        onClose={() => {
          if (preview?.blobUrl) URL.revokeObjectURL(preview.blobUrl);
          setPreview(null);
        }} 
      />
        </>
      )}
    </div>
  );
}
