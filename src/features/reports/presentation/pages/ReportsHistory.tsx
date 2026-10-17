import React, { useMemo, useState } from 'react';
import { 
  Download, Calendar, FileText, Sparkles, Eye, CheckCircle2, Clock, 
  AlertCircle, Edit3, MessageSquare, Search, Filter, ArrowRight, UserCheck, ShieldCheck
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useAppContext, type V2WeeklyReport } from '../../../../context/AppContext';
import { useAuth } from '../../../../context/AuthContext';
import { generateV2WeeklyReportPdf, getV2WeeklyReportPdfBlobUrl } from '../../services/ReportPdfService';
import { ReportPdfPreview, type ReportPdfPreviewData } from '../../../../components/ReportPdfPreview';

export const ReportsHistory: React.FC = () => {
  const { v2WeeklyReports, v2DailyReports, users, settings } = useAppContext();
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [preview, setPreview] = useState<ReportPdfPreviewData | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');

  const isDirector = ['Directeur', 'Directeur adjoint', 'SuperAdmin'].includes(currentUser?.role || '');

  // Isolation stricte : Les collaborateurs (Commercial, Responsable) n'ont accès qu'à leurs propres rapports
  const myWeeklyReports = useMemo(() => {
    return v2WeeklyReports.filter(r => r.authorId === currentUser?.id);
  }, [v2WeeklyReports, currentUser]);

  // Calcul des statistiques personnelles
  const stats = useMemo(() => {
    const total = myWeeklyReports.length;
    const validated = myWeeklyReports.filter(r => r.status === 'Validé').length;
    const submitted = myWeeklyReports.filter(r => r.status === 'Soumis').length;
    const draft = myWeeklyReports.filter(r => r.status === 'Brouillon' || !r.status).length;
    return { total, validated, submitted, draft };
  }, [myWeeklyReports]);

  // Filtrage des rapports selon les critères de recherche et de statut
  const filteredReports = useMemo(() => {
    return myWeeklyReports
      .filter(r => {
        if (statusFilter !== 'ALL' && (r.status || 'Brouillon') !== statusFilter) {
          return false;
        }
        if (searchTerm.trim()) {
          const term = searchTerm.toLowerCase();
          const matchProject = (r.project || '').toLowerCase().includes(term);
          const matchObjectives = (r.weeklyObjectives || '').toLowerCase().includes(term);
          const matchAchievements = (r.achievements || '').toLowerCase().includes(term);
          const matchSummary = (r.summary || r.aiSummary || '').toLowerCase().includes(term);
          const matchDate = r.weekStart.includes(term);
          return matchProject || matchObjectives || matchAchievements || matchSummary || matchDate;
        }
        return true;
      })
      .sort((a, b) => b.weekStart.localeCompare(a.weekStart));
  }, [myWeeklyReports, statusFilter, searchTerm]);

  const handlePreviewPdf = (report: V2WeeklyReport) => {
    const author = users?.find((u: any) => u.id === report.authorId) || currentUser;
    const blobUrl = getV2WeeklyReportPdfBlobUrl(report, author, settings, v2DailyReports);
    const safeName = author?.name ? author.name.toLowerCase().replace(/\s+/g, '_') : 'collaborateur';
    setPreview({
      blobUrl,
      filename: `rapport_hebdo_${safeName}_${report.weekStart}.pdf`,
      title: `Rapport Hebdomadaire — ${author?.name || 'Moi'} (Semaine du ${formatWeekRange(report.weekStart)})`,
      onDownload: () => generateV2WeeklyReportPdf(report, author, settings, v2DailyReports)
    });
  };

  const formatWeekRange = (weekStart: string) => {
    try {
      const dStart = new Date(weekStart + 'T00:00:00');
      const dEnd = new Date(dStart);
      dEnd.setDate(dEnd.getDate() + 6); // Dimanche
      return `du ${dStart.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })} au ${dEnd.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}`;
    } catch {
      return weekStart;
    }
  };

  const getStatusBadge = (status: V2WeeklyReport['status']) => {
    switch (status) {
      case 'Validé':
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '4px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: 600, backgroundColor: '#DCFCE7', color: '#166534' }}>
            <CheckCircle2 size={14} /> Validé
          </span>
        );
      case 'Soumis':
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '4px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: 600, backgroundColor: '#DBEAFE', color: '#1E40AF' }}>
            <Clock size={14} /> Soumis (En attente)
          </span>
        );
      case 'Relu':
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '4px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: 600, backgroundColor: '#FEF3C7', color: '#92400E' }}>
            <AlertCircle size={14} /> Relu (En révision)
          </span>
        );
      default:
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '4px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: 600, backgroundColor: '#F1F5F9', color: '#475569' }}>
            <Edit3 size={14} /> Brouillon
          </span>
        );
    }
  };

  // Compter le nombre de tâches enregistrées dans un rapport
  const countTasks = (report: V2WeeklyReport) => {
    if (!report.tasksByDay) return 0;
    return Object.values(report.tasksByDay).reduce((sum, tasks) => sum + (Array.isArray(tasks) ? tasks.length : 0), 0);
  };

  return (
    <div className="dashboard" style={{ maxWidth: '1200px', margin: '0 auto', paddingBottom: '40px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ padding: '10px', borderRadius: '12px', backgroundColor: '#E0F2FE', color: '#0284C7' }}>
              <Calendar size={24} />
            </div>
            <div>
              <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 700, color: 'var(--color-text)' }}>
                Historique de mes Rapports Hebdomadaires
              </h1>
              <p style={{ color: 'var(--color-text-muted)', margin: '2px 0 0', fontSize: '14px' }}>
                Consultez l'historique, les statuts de validation et les retours de la direction sur vos comptes-rendus.
              </p>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          {isDirector && (
            <Link
              to="/crm/rapports-equipe"
              className="btn btn-outline"
              style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 16px', fontSize: '13px' }}
            >
              <ShieldCheck size={16} /> Vue Direction (Tous les rapports)
            </Link>
          )}

          <Link
            to="/crm/rapports?tab=daily"
            className="btn btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 18px', fontSize: '13px', fontWeight: 600 }}
          >
            <Sparkles size={16} /> Rédiger mon Rapport Hebdo (IA)
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        <div className="card" style={{ padding: '16px 20px', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '14px', border: '1px solid var(--color-border)' }}>
          <div style={{ padding: '10px', borderRadius: '10px', backgroundColor: '#F0F9FF', color: '#0284C7' }}>
            <FileText size={20} />
          </div>
          <div>
            <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', fontWeight: 500 }}>Total Rapports</div>
            <div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--color-text)' }}>{stats.total}</div>
          </div>
        </div>

        <div className="card" style={{ padding: '16px 20px', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '14px', border: '1px solid var(--color-border)' }}>
          <div style={{ padding: '10px', borderRadius: '10px', backgroundColor: '#DCFCE7', color: '#16A34A' }}>
            <CheckCircle2 size={20} />
          </div>
          <div>
            <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', fontWeight: 500 }}>Validés par Direction</div>
            <div style={{ fontSize: '22px', fontWeight: 700, color: '#16A34A' }}>{stats.validated}</div>
          </div>
        </div>

        <div className="card" style={{ padding: '16px 20px', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '14px', border: '1px solid var(--color-border)' }}>
          <div style={{ padding: '10px', borderRadius: '10px', backgroundColor: '#DBEAFE', color: '#2563EB' }}>
            <Clock size={20} />
          </div>
          <div>
            <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', fontWeight: 500 }}>En Attente de Validation</div>
            <div style={{ fontSize: '22px', fontWeight: 700, color: '#2563EB' }}>{stats.submitted}</div>
          </div>
        </div>

        <div className="card" style={{ padding: '16px 20px', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '14px', border: '1px solid var(--color-border)' }}>
          <div style={{ padding: '10px', borderRadius: '10px', backgroundColor: '#F1F5F9', color: '#64748B' }}>
            <Edit3 size={20} />
          </div>
          <div>
            <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', fontWeight: 500 }}>Brouillons</div>
            <div style={{ fontSize: '22px', fontWeight: 700, color: '#64748B' }}>{stats.draft}</div>
          </div>
        </div>
      </div>

      {/* Barre de Recherche & Filtres */}
      <div className="card" style={{ padding: '14px 20px', marginBottom: '20px', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', border: '1px solid var(--color-border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: '1 1 280px', maxWidth: '400px', backgroundColor: 'var(--color-surface-alt)', padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
          <Search size={16} color="var(--color-text-muted)" />
          <input
            type="text"
            placeholder="Rechercher par projet, mot-clé, date..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            style={{ border: 'none', background: 'transparent', outline: 'none', width: '100%', fontSize: '13px', color: 'var(--color-text)' }}
          />
          {searchTerm && (
            <button onClick={() => setSearchTerm('')} style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', fontSize: '12px' }}>
              ✕
            </button>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '13px', color: 'var(--color-text-muted)', fontWeight: 500 }}>Statut :</span>
          {(['ALL', 'Validé', 'Soumis', 'Brouillon'] as const).map(st => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              style={{
                padding: '5px 12px',
                borderRadius: '8px',
                border: '1px solid',
                borderColor: statusFilter === st ? 'var(--color-primary)' : 'var(--color-border)',
                backgroundColor: statusFilter === st ? 'var(--color-primary)' : 'white',
                color: statusFilter === st ? 'white' : 'var(--color-text)',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              {st === 'ALL' ? 'Tous' : st}
            </button>
          ))}
        </div>
      </div>

      {/* Liste des Rapports Hebdomadaires */}
      {filteredReports.length === 0 ? (
        <div className="card" style={{ padding: '48px 24px', textAlign: 'center', borderRadius: '12px', border: '1px solid var(--color-border)' }}>
          <div style={{ width: '56px', height: '56px', borderRadius: '28px', backgroundColor: '#F0F9FF', color: '#0284C7', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <Calendar size={28} />
          </div>
          <h3 style={{ margin: '0 0 8px', fontSize: '17px', fontWeight: 600 }}>Aucun rapport hebdomadaire trouvé</h3>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '14px', maxWidth: '440px', margin: '0 auto 20px' }}>
            {searchTerm || statusFilter !== 'ALL'
              ? 'Aucun compte-rendu ne correspond à vos filtres actuels.'
              : "Vous n'avez pas encore rédigé de rapport hebdomadaire. Utilisez l'assistant IA pour créer votre premier compte-rendu."}
          </p>
          <Link
            to="/crm/rapports?tab=daily"
            className="btn btn-primary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '9px 18px', fontSize: '13px' }}
          >
            <Sparkles size={16} /> Rédiger un rapport maintenant
          </Link>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {filteredReports.map(report => {
            const author = users?.find((u: any) => u.id === report.authorId) || currentUser;
            const taskCount = countTasks(report);
            const hasDirectorNote = !!report.directorComment;

            return (
              <div
                key={report.id}
                className="card"
                style={{
                  padding: '20px 24px',
                  borderRadius: '12px',
                  border: '1px solid var(--color-border)',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                  transition: 'transform 0.15s ease, box-shadow 0.15s ease'
                }}
              >
                {/* Ligne 1 : Entête du rapport (Semaine + Statut + Actions) */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px', marginBottom: '14px' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                      <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--color-text)' }}>
                        Semaine {formatWeekRange(report.weekStart)}
                      </h3>
                      {getStatusBadge(report.status)}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '4px', fontSize: '13px', color: 'var(--color-text-muted)' }}>
                      <span>Projet : <strong>{report.project || 'Général / Commercial'}</strong></span>
                      <span>•</span>
                      <span><strong>{taskCount}</strong> tâche{taskCount > 1 ? 's' : ''} documentée{taskCount > 1 ? 's' : ''}</span>
                      {report.submittedAt && (
                        <>
                          <span>•</span>
                          <span>Soumis le {new Date(report.submittedAt).toLocaleDateString('fr-FR')}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Boutons d'Action Rapides */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button
                      className="btn btn-outline btn-sm"
                      onClick={() => handlePreviewPdf(report)}
                      title="Lire le document PDF officiel"
                      style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', fontSize: '12px', fontWeight: 600 }}
                    >
                      <Eye size={15} /> Aperçu PDF
                    </button>

                    <button
                      className="btn btn-outline btn-sm"
                      onClick={() => generateV2WeeklyReportPdf(report, author, settings, v2DailyReports)}
                      title="Télécharger le fichier PDF"
                      style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', fontSize: '12px', fontWeight: 600 }}
                    >
                      <Download size={15} /> Télécharger
                    </button>

                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => navigate(`/crm/rapports?week=${report.weekStart}&tab=report`)}
                      title="Ouvrir dans l'éditeur"
                      style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 14px', fontSize: '12px', fontWeight: 600 }}
                    >
                      <Edit3 size={15} /> {report.status === 'Validé' ? 'Consulter' : 'Modifier'}
                    </button>
                  </div>
                </div>

                {/* Synthèse ou Objectifs Clés */}
                {(report.aiSummary || report.summary || report.weeklyObjectives || report.achievements) && (
                  <div style={{ backgroundColor: 'var(--color-surface-alt)', padding: '12px 16px', borderRadius: '8px', fontSize: '13px', color: 'var(--color-text)', marginBottom: hasDirectorNote ? '12px' : '0', border: '1px solid var(--color-border)' }}>
                    <div style={{ fontWeight: 600, marginBottom: '4px', color: 'var(--color-text-muted)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      {report.aiSummary ? 'Synthèse de la Semaine (IA)' : 'Objectifs & Réalisations'}
                    </div>
                    <p style={{ margin: 0, lineHeight: '1.5', whiteSpace: 'pre-line' }}>
                      {report.aiSummary || report.summary || report.achievements || report.weeklyObjectives}
                    </p>
                  </div>
                )}

                {/* Zone Retour / Note de la Direction */}
                {hasDirectorNote && (
                  <div style={{ backgroundColor: '#F0FDF4', border: '1px solid #BBF7D0', padding: '12px 16px', borderRadius: '8px', marginTop: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#166534', fontWeight: 700, fontSize: '12px', marginBottom: '4px' }}>
                      <MessageSquare size={15} />
                      <span>Note / Retour de la Direction :</span>
                      {report.reviewedAt && (
                        <span style={{ fontSize: '11px', fontWeight: 'normal', color: '#15803D' }}>
                          (le {new Date(report.reviewedAt).toLocaleDateString('fr-FR')})
                        </span>
                      )}
                    </div>
                    <p style={{ margin: 0, fontSize: '13px', color: '#14532D', fontStyle: 'italic', lineHeight: '1.5' }}>
                      « {report.directorComment} »
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modale d'Aperçu PDF Direct */}
      <ReportPdfPreview preview={preview} onClose={() => setPreview(null)} />
    </div>
  );
};
