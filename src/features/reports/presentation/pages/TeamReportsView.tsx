import React, { useState, useMemo } from 'react';
import { Download, Eye, CheckCircle, MessageSquare, Calendar, Building, User as UserIcon, X, Filter, FileText } from 'lucide-react';
import { useAppContext, type V2WeeklyReport } from '../../../../context/AppContext';
import { useAuth } from '../../../../context/AuthContext';
import { useConfirm } from '../../../../components/ConfirmModal';
import { generateV2WeeklyReportPdf, getV2WeeklyReportPdfBlobUrl } from '../../services/ReportPdfService';
import { ReportPdfPreview, type ReportPdfPreviewData } from '../../../../components/ReportPdfPreview';
import { Button } from '../../../../components/ui/Button';
import './TeamReportsView.css';

export function TeamReportsView() {
  const { currentUser } = useAuth();
  const { v2WeeklyReports, v2DailyReports, users, services, settings, reviewV2WeeklyReport } = useAppContext();
  const { confirm } = useConfirm();

  const [filterUser, setFilterUser] = useState('');
  const [filterService, setFilterService] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [selectedReport, setSelectedReport] = useState<V2WeeklyReport | null>(null);
  const [directorNote, setDirectorNote] = useState('');
  const [preview, setPreview] = useState<ReportPdfPreviewData | null>(null);

  const isDirection = ['Directeur', 'Directeur adjoint', 'SuperAdmin'].includes(currentUser?.role || '');

  // Scope : direction = tout, autres rôles (Responsable inclus) = propres rapports uniquement
  const allowedReports = useMemo(() => {
    if (isDirection) return v2WeeklyReports;
    return v2WeeklyReports.filter(r => r.authorId === currentUser?.id);
  }, [v2WeeklyReports, currentUser, isDirection]);

  const filteredReports = useMemo(() => {
    return allowedReports.filter(r => {
      const author = users.find(u => u.id === r.authorId);
      const matchUser = filterUser ? r.authorId === filterUser : true;
      const matchService = filterService ? author?.serviceId === filterService : true;
      const matchStatus = filterStatus ? r.status === filterStatus : true;
      return matchUser && matchService && matchStatus;
    }).sort((a, b) => b.weekStart.localeCompare(a.weekStart));
  }, [allowedReports, filterUser, filterService, filterStatus, users]);

  const getAuthor = (authorId: string) => users.find(u => u.id === authorId);
  const getServiceName = (serviceId?: string) => services.find(s => s.id === serviceId)?.name || 'Général';

  const handlePreviewPdf = (report: V2WeeklyReport) => {
    const author = getAuthor(report.authorId);
    const blobUrl = getV2WeeklyReportPdfBlobUrl(report, author, settings, v2DailyReports);
    const safeName = author?.name ? author.name.toLowerCase().replace(/\s+/g, '_') : 'collaborateur';
    setPreview({
      blobUrl,
      filename: `rapport_hebdo_${safeName}_${report.weekStart}.pdf`,
      title: `Rapport Hebdomadaire — ${author?.name || 'Collaborateur'} (Semaine du ${new Date(report.weekStart + 'T00:00:00').toLocaleDateString('fr-FR')})`,
      onDownload: () => generateV2WeeklyReportPdf(report, author, settings, v2DailyReports)
    });
  };

  const handleOpenReport = (report: V2WeeklyReport) => {
    setSelectedReport(report);
    setDirectorNote(report.directorComment || '');
  };

  const handleValidateReport = async () => {
    if (!selectedReport) return;
    await reviewV2WeeklyReport(selectedReport.id, directorNote, 'Validé');
    setSelectedReport(null);
  };

  return (
    <div className="dashboard">
      <div className="team-reports-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2>Rapports d'Activité de l'Équipe</h2>
          <p style={{ color: 'var(--color-text-muted)', margin: '4px 0 0' }}>
            Consultez, annotez et validez les comptes-rendus hebdomadaires des collaborateurs
          </p>
        </div>
      </div>

      {/* Filter bar */}
      <div className="team-reports-filter-bar card" style={{ padding: '16px', marginBottom: '24px' }}>
        <select
          className="table-input"
          style={{ maxWidth: '220px' }}
          value={filterUser}
          onChange={e => setFilterUser(e.target.value)}
        >
          <option value="">Tous les collaborateurs</option>
          {users.filter(u => ['Commercial', 'Responsable'].includes(u.role)).map(u => (
            <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
          ))}
        </select>

        {isDirection && (
          <select
            className="table-input"
            style={{ maxWidth: '200px' }}
            value={filterService}
            onChange={e => setFilterService(e.target.value)}
          >
            <option value="">Tous les services</option>
            {services.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        )}

        <select
          className="table-input"
          style={{ maxWidth: '180px' }}
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
        >
          <option value="">Tous les statuts</option>
          <option value="Soumis">Soumis (À valider)</option>
          <option value="Validé">Validé</option>
          <option value="Brouillon">Brouillon</option>
        </select>

        <span style={{ marginLeft: 'auto', fontSize: '0.85rem', color: '#64748B' }}>
          {filteredReports.length} rapport(s) trouvé(s)
        </span>
      </div>

      {/* Reports Grid */}
      {filteredReports.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '40px', color: 'var(--color-text-muted)' }}>
          Aucun rapport d'activité trouvé selon vos filtres.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '16px' }}>
          {filteredReports.map(report => {
            const author = getAuthor(report.authorId);
            const totalTasks = Object.values(report.tasksByDay || {}).flat().length;

            return (
              <div key={report.id} className="team-report-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div className="team-report-meta">
                    {author?.photo ? (
                      <img src={author.photo} alt={author.name} className="team-report-avatar" />
                    ) : (
                      <div className="team-report-avatar-placeholder">
                        {(author?.name || '?').slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#0F172A' }}>
                        {author?.name || 'Inconnu'}
                      </div>
                      <div style={{ fontSize: '0.78rem', color: '#64748B' }}>
                        {author?.role} • {getServiceName(author?.serviceId)}
                      </div>
                    </div>
                  </div>

                  <span className={`badge-status ${report.status === 'Validé' ? 'bg-success' : report.status === 'Soumis' ? 'bg-info' : 'bg-warning'}`}>
                    {report.status}
                  </span>
                </div>

                <div style={{ fontSize: '0.85rem', color: '#334155', display: 'flex', flexDirection: 'column', gap: '4px', background: '#F8FAFC', padding: '10px 12px', borderRadius: '6px' }}>
                  <div>
                    <Calendar size={13} style={{ display: 'inline', marginRight: '5px', verticalAlign: 'middle' }} />
                    <strong>Semaine du :</strong> {new Date(report.weekStart + 'T00:00:00').toLocaleDateString('fr-FR')}
                  </div>
                  <div>
                    <strong>Tâches enregistrées :</strong> {totalTasks} tâche(s)
                  </div>
                  {report.aiSummary && (
                    <div style={{ fontSize: '0.8rem', color: '#64748B', fontStyle: 'italic', marginTop: '4px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      "{report.aiSummary}"
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto', paddingTop: '10px', borderTop: '1px solid #F1F5F9', gap: '6px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => handlePreviewPdf(report)}
                    style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
                    title="Lire directement le rapport PDF sans télécharger"
                  >
                    <Eye size={14} /> 📄 Lire le PDF
                  </button>

                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => handleOpenReport(report)}
                    style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
                  >
                    <MessageSquare size={14} /> Consulter & Valider
                  </button>

                  <button
                    type="button"
                    className="icon-button text-teal-700"
                    onClick={() => generateV2WeeklyReportPdf(report, author, settings, v2DailyReports)}
                    title="Télécharger une copie PDF"
                  >
                    <Download size={17} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Review Modal */}
      {selectedReport && (
        <div className="commission-modal-backdrop" onClick={() => setSelectedReport(null)}>
          <div className="commission-modal-container" onClick={e => e.stopPropagation()} style={{ maxWidth: '800px' }}>
            <div className="commission-modal-header">
              <div className="commission-modal-title">
                <Calendar size={20} color="#0D9488" />
                <span>Rapport Hebdomadaire — {getAuthor(selectedReport.authorId)?.name}</span>
              </div>
              <button className="btn-icon" onClick={() => setSelectedReport(null)} style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            <div className="commission-modal-body">
              {/* Header Info */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#F1F5F9', padding: '12px 16px', borderRadius: '8px' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '1rem' }}>
                    {getAuthor(selectedReport.authorId)?.name} ({getAuthor(selectedReport.authorId)?.role})
                  </div>
                  <div style={{ fontSize: '0.85rem', color: '#64748B' }}>
                    Semaine du {new Date(selectedReport.weekStart + 'T00:00:00').toLocaleDateString('fr-FR')} • {getServiceName(getAuthor(selectedReport.authorId)?.serviceId)}
                  </div>
                </div>
                <span className={`badge-status ${selectedReport.status === 'Validé' ? 'bg-success' : selectedReport.status === 'Soumis' ? 'bg-info' : 'bg-warning'}`}>
                  {selectedReport.status}
                </span>
              </div>

              {/* Synthèse IA */}
              {selectedReport.aiSummary && (
                <div className="commission-section-card">
                  <div className="commission-section-header">
                    <span>Synthèse Globale & Faits Marquants (IA)</span>
                  </div>
                  <p style={{ margin: 0, fontSize: '0.875rem', lineHeight: 1.5, color: '#334155' }}>
                    {selectedReport.aiSummary}
                  </p>
                </div>
              )}

              {/* Tâches par jour */}
              <div className="commission-section-card">
                <div className="commission-section-header">
                  <span>Journal des Tâches Quotidiennes</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '200px', overflowY: 'auto' }}>
                  {Object.keys(selectedReport.tasksByDay || {}).map(day => {
                    const tasks = selectedReport.tasksByDay[day] || [];
                    if (tasks.length === 0) return null;
                    return (
                      <div key={day} style={{ fontSize: '0.85rem' }}>
                        <strong>{day} :</strong>
                        <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
                          {tasks.map((t, i) => (
                            <li key={i}>
                              [{t.status}] {t.description} {t.difficulty ? `(Difficulté : ${t.difficulty})` : ''}
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Réalisations & Difficultés */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="commission-section-card">
                  <div className="commission-section-header">
                    <span>Résultats & Réalisations</span>
                  </div>
                  <p style={{ margin: 0, fontSize: '0.85rem', color: '#059669', whiteSpace: 'pre-wrap' }}>
                    {selectedReport.achievements || 'Néant'}
                  </p>
                </div>

                <div className="commission-section-card">
                  <div className="commission-section-header">
                    <span>Difficultés & Bloquants</span>
                  </div>
                  <p style={{ margin: 0, fontSize: '0.85rem', color: '#DC2626', whiteSpace: 'pre-wrap' }}>
                    {selectedReport.difficulties || 'Aucun'}
                  </p>
                </div>
              </div>

              {/* Visa & Commentaire Direction */}
              {isDirection && (
                <div className="commission-section-card" style={{ background: '#F8FAFC' }}>
                  <div className="commission-section-header">
                    <span>Visa & Commentaire de la Direction</span>
                  </div>
                  <textarea
                    className="table-input"
                    rows={3}
                    placeholder="Saisissez vos observations, félicitations ou directives pour le collaborateur..."
                    value={directorNote}
                    onChange={e => setDirectorNote(e.target.value)}
                    style={{ width: '100%', resize: 'vertical' }}
                  />
                </div>
              )}
            </div>

            <div className="commission-modal-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', flexWrap: 'wrap', gap: '8px' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => handlePreviewPdf(selectedReport)}
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                title="Lire le document PDF complet dans le lecteur"
              >
                <Eye size={16} />
                👁️ Lire le Document PDF
              </button>

              <div style={{ display: 'flex', gap: '8px', marginLeft: 'auto' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => generateV2WeeklyReportPdf(selectedReport, getAuthor(selectedReport.authorId), settings, v2DailyReports)}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <Download size={16} />
                  Télécharger PDF
                </button>

                {isDirection && (
                  <button
                    type="button"
                    className="btn btn-success"
                    onClick={handleValidateReport}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <CheckCircle size={16} />
                    Valider & Enregistrer le Visa
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <ReportPdfPreview preview={preview} onClose={() => setPreview(null)} />
    </div>
  );
}

