import React, { useState, useMemo, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Sparkles, Download, Save, Send, Plus, Trash2, CheckCircle2, Clock, AlertCircle, ChevronLeft, ChevronRight, Calendar, Building, User as UserIcon, Key, Eye, RefreshCw } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAppContext, type V2WeeklyReport, type V2Task } from '../../../../context/AppContext';
import { useAuth } from '../../../../context/AuthContext';
import { useConfirm } from '../../../../components/ConfirmModal';
import { generateAiWeeklySynthesis } from '../../services/AiReportService';
import { generateV2WeeklyReportPdf, getV2WeeklyReportPdfBlobUrl } from '../../services/ReportPdfService';
import { ReportPdfPreview, type ReportPdfPreviewData } from '../../../../components/ReportPdfPreview';
import { getUserGeminiKey } from '../../../../lib/geminiKey';
import './WeeklyReportEditor.css';

const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

export function WeeklyReportEditor() {
  const { currentUser } = useAuth();
  const { v2WeeklyReports, v2DailyReports, activityReports, services, settings, saveV2WeeklyReport, submitV2WeeklyReport } = useAppContext();
  const { confirm } = useConfirm();
  const [searchParams] = useSearchParams();

  // Week calculation helper
  const getMondayOf = (d: Date) => {
    const date = new Date(d);
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    const mon = new Date(date.setDate(diff));
    return mon.toISOString().slice(0, 10);
  };

  const initialWeek = searchParams.get('week') || getMondayOf(new Date());
  const [currentWeekStart, setCurrentWeekStart] = useState<string>(initialWeek);

  useEffect(() => {
    const paramWeek = searchParams.get('week');
    if (paramWeek && paramWeek !== currentWeekStart) {
      setCurrentWeekStart(paramWeek);
    }
  }, [searchParams]);

  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [activeDay, setActiveDay] = useState<string>('Lundi');

  // New task input state
  const [newTaskDesc, setNewTaskDesc] = useState('');
  const [newTaskStatus, setNewTaskStatus] = useState<V2Task['status']>('Effectuée');
  const [newTaskDifficulty, setNewTaskDifficulty] = useState('');

  // Find or initialize weekly report for current user & week
  // Comparaison normalisée (10 premiers caractères) : la base peut renvoyer
  // week_start en DATE ou en ISO datetime selon les versions.
  const existingReport = useMemo(() => {
    const w = (currentWeekStart || '').slice(0, 10);
    return v2WeeklyReports.find(r => r.authorId === currentUser?.id && (r.weekStart || '').slice(0, 10) === w);
  }, [v2WeeklyReports, currentUser, currentWeekStart]);

  // Form state
  const [weeklyObjectives, setWeeklyObjectives] = useState('');
  const [tasksByDay, setTasksByDay] = useState<Record<string, V2Task[]>>({});
  const [aiSummary, setAiSummary] = useState('');
  const [achievements, setAchievements] = useState('');
  const [difficulties, setDifficulties] = useState('');
  const [nextWeekObjectives, setNextWeekObjectives] = useState('');
  const [status, setStatus] = useState<V2WeeklyReport['status']>('Brouillon');
  const [reportId, setReportId] = useState<string>('');
  const [preview, setPreview] = useState<ReportPdfPreviewData | null>(null);

  const importWeekDailyTasks = (force = false) => {
    const dayMap: Record<string, V2Task[]> = {
      Lundi: [],
      Mardi: [],
      Mercredi: [],
      Jeudi: [],
      Vendredi: [],
      Samedi: [],
      Dimanche: []
    };

    const daysList = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
    let collectedObjectives: string[] = [];
    let collectedResults: string[] = [];
    let collectedDifficulties: string[] = [];
    let count = 0;

    const startDate = new Date(currentWeekStart + 'T00:00:00');
    for (let i = 0; i < 7; i++) {
      const d = new Date(startDate);
      d.setDate(d.getDate() + i);
      const dStr = d.toISOString().slice(0, 10);
      const dayName = daysList[i];

      const daily = v2DailyReports?.find(r => r.authorId === currentUser?.id && (r.date || '').slice(0, 10) === dStr);
      if (daily) {
        if (daily.objectives) collectedObjectives.push(daily.objectives);
        if (daily.results) collectedResults.push(daily.results);
        if (daily.difficulties) collectedDifficulties.push(daily.difficulties);
        if (Array.isArray(daily.tasks) && daily.tasks.length > 0) {
          dayMap[dayName] = [...(dayMap[dayName] || []), ...daily.tasks];
          count += daily.tasks.length;
        }
      }

      const act = activityReports?.find(r => r.authorId === currentUser?.id && r.date === dStr);
      if (act) {
        if (act.realisations) {
          dayMap[dayName].push({
            id: `act-${act.id || Date.now()}-${i}`,
            description: act.realisations,
            status: 'Effectuée'
          });
          collectedResults.push(act.realisations);
          count++;
        }
        if (act.difficultes) {
          collectedDifficulties.push(act.difficultes);
        }
      }
    }

    setTasksByDay(prev => {
      const merged: Record<string, V2Task[]> = { ...prev };
      for (const day of daysList) {
        const existingDescs = new Set((merged[day] || []).map(t => t.description?.toLowerCase().trim()));
        const toAdd = dayMap[day].filter(t => t.description && !existingDescs.has(t.description.toLowerCase().trim()));
        merged[day] = [...(merged[day] || []), ...toAdd];
      }
      return merged;
    });

    if (collectedObjectives.length > 0 && (!weeklyObjectives || force)) {
      setWeeklyObjectives(collectedObjectives.filter((v, i, a) => a.indexOf(v) === i).join(' ; '));
    }
    if (collectedResults.length > 0 && (!achievements || force)) {
      setAchievements(collectedResults.filter((v, i, a) => a.indexOf(v) === i).join('\n• '));
    }
    if (collectedDifficulties.length > 0 && (!difficulties || force)) {
      setDifficulties(collectedDifficulties.filter((v, i, a) => a.indexOf(v) === i).join('\n• '));
    }

    return count;
  };

  useEffect(() => {
    if (existingReport) {
      setReportId(existingReport.id);
      setWeeklyObjectives(existingReport.weeklyObjectives || '');
      setTasksByDay(existingReport.tasksByDay || {});
      setAiSummary(existingReport.aiSummary || existingReport.summary || '');
      setAchievements(existingReport.achievements || '');
      setDifficulties(existingReport.difficulties || '');
      setNextWeekObjectives(existingReport.nextWeekObjectives || '');
      setStatus(existingReport.status || 'Brouillon');
    } else {
      // UUID stable dès la création : un id Date.now() serait re-minté en UUID
      // neuf à chaque save (doublons locaux + violation UNIQUE serveur).
      setReportId(crypto.randomUUID ? crypto.randomUUID() : uuidv4());
      setWeeklyObjectives('');
      setTasksByDay({ Lundi: [], Mardi: [], Mercredi: [], Jeudi: [], Vendredi: [], Samedi: [], Dimanche: [] });
      setAiSummary('');
      setAchievements('');
      setDifficulties('');
      setNextWeekObjectives('');
      setStatus('Brouillon');
      // Pre-fill from existing daily reports if any
      importWeekDailyTasks(false);
    }
  }, [existingReport, currentWeekStart]);

  // Week navigation
  const shiftWeek = (deltaWeeks: number) => {
    const cur = new Date(currentWeekStart + 'T00:00:00');
    cur.setDate(cur.getDate() + deltaWeeks * 7);
    setCurrentWeekStart(getMondayOf(cur));
  };

  const getWeekEnd = (monStr: string) => {
    const d = new Date(monStr + 'T00:00:00');
    d.setDate(d.getDate() + 6); // Dimanche
    return d.toISOString().slice(0, 10);
  };

  const userServiceName = services.find(s => s.id === currentUser?.serviceId)?.name || 'Général';

  // Add task to day
  const handleAddTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskDesc.trim()) return;

    const task: V2Task = {
      id: Date.now().toString(),
      description: newTaskDesc.trim(),
      status: newTaskStatus,
      difficulty: newTaskDifficulty.trim() || undefined
    };

    const currentDayTasks = tasksByDay[activeDay] || [];
    const updated = { ...tasksByDay, [activeDay]: [...currentDayTasks, task] };
    setTasksByDay(updated);
    setNewTaskDesc('');
    setNewTaskDifficulty('');
  };

  const handleDeleteTask = (day: string, taskId: string) => {
    const updated = {
      ...tasksByDay,
      [day]: (tasksByDay[day] || []).filter(t => t.id !== taskId)
    };
    setTasksByDay(updated);
  };

  // Trigger AI generation
  const handleGenerateWithAi = async () => {
    setIsGeneratingAi(true);
    try {
      const periodStr = `du ${new Date(currentWeekStart).toLocaleDateString('fr-FR')} au ${new Date(getWeekEnd(currentWeekStart)).toLocaleDateString('fr-FR')}`;
      const result = await generateAiWeeklySynthesis({
        tasksByDay,
        userName: currentUser?.name || 'Collaborateur',
        userId: currentUser?.id,
        userRole: currentUser?.role,
        serviceName: userServiceName,
        period: periodStr,
        initialObjectives: weeklyObjectives
      });

      setAiSummary(result.introduction);
      setAchievements(result.achievements);
      setDifficulties(result.difficulties);
      setNextWeekObjectives(result.nextWeekObjectives);
    } catch (error) {
      console.error('Erreur génération IA :', error);
    } finally {
      setIsGeneratingAi(false);
    }
  };

  // Build current report object
  const getCurrentReportObject = (): V2WeeklyReport => {
    // reportId est toujours un UUID stable (cf. useEffect ci-dessus) ; le
    // fallback ne sert qu'au tout premier rendu avant initialisation.
    return {
      id: reportId || uuidv4(),
      authorId: currentUser?.id || 'system',
      weekStart: currentWeekStart,
      weekEnd: getWeekEnd(currentWeekStart),
      weeklyObjectives,
      tasksByDay,
      aiSummary,
      summary: aiSummary,
      achievements,
      difficulties,
      nextWeekObjectives,
      status,
      updatedAt: new Date().toISOString()
    };
  };

  const handleSaveDraft = async () => {
    const reportObj = getCurrentReportObject();
    await saveV2WeeklyReport(reportObj);
    alert('Brouillon de rapport enregistré avec succès.');
  };

  const handleSubmitReport = () => {
    confirm({
      title: 'Soumettre le rapport à la Direction',
      message: 'Êtes-vous sûr de vouloir soumettre votre rapport d\'activité hebdomadaire au Directeur et au Directeur adjoint ?',
      confirmLabel: 'Soumettre',
      variant: 'success',
      onConfirm: async () => {
        const reportObj = getCurrentReportObject();
        reportObj.status = 'Soumis';
        reportObj.submittedAt = new Date().toISOString();
        await submitV2WeeklyReport(reportObj);
        setStatus('Soumis');
      }
    });
  };

  const handleDownloadPdf = () => {
    const reportObj = getCurrentReportObject();
    generateV2WeeklyReportPdf(reportObj, currentUser, settings, v2DailyReports);
  };

  const handlePreviewPdf = () => {
    const reportObj = getCurrentReportObject();
    const blobUrl = getV2WeeklyReportPdfBlobUrl(reportObj, currentUser, settings, v2DailyReports);
    const authorName = (currentUser?.name || 'collaborateur').toLowerCase().replace(/\s+/g, '_');
    setPreview({
      blobUrl,
      filename: `rapport_hebdo_${authorName}_${reportObj.weekStart}.pdf`,
      title: `Aperçu du Rapport Hebdomadaire — ${currentUser?.name || 'Mon Rapport'}`,
      onDownload: () => generateV2WeeklyReportPdf(reportObj, currentUser, settings, v2DailyReports)
    });
  };

  const totalWeekTasks = Object.values(tasksByDay).flat().length;

  return (
    <div className="dashboard report-editor-container">
      <div className="report-editor-header">
        <div>
          <h2>Mon Rapport d'Activité Hebdomadaire</h2>
          <p style={{ color: 'var(--color-text-muted)', margin: '4px 0 0' }}>
            Enregistrez vos tâches par jour et générez votre synthèse hebdomadaire officielle par IA
          </p>
        </div>

        {/* Week navigation */}
        <div className="report-week-nav">
          <button className="icon-button" onClick={() => shiftWeek(-1)} title="Semaine précédente">
            <ChevronLeft size={18} />
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, fontSize: '0.9rem' }}>
            <Calendar size={16} color="#0D9488" />
            <span>Semaine du {new Date(currentWeekStart + 'T00:00:00').toLocaleDateString('fr-FR')}</span>
          </div>
          <button className="icon-button" onClick={() => shiftWeek(1)} title="Semaine suivante">
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {/* Status banner */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#F8FAFC', padding: '12px 16px', borderRadius: '8px', border: '1px solid #E2E8F0', marginBottom: '20px' }}>
        <div style={{ display: 'flex', gap: '16px', fontSize: '0.85rem' }}>
          <span><UserIcon size={14} style={{ display: 'inline', marginRight: '4px' }} /><strong>Auteur :</strong> {currentUser?.name} ({currentUser?.role})</span>
          <span><Building size={14} style={{ display: 'inline', marginRight: '4px' }} /><strong>Département :</strong> {userServiceName}</span>
          <span><strong>Total Tâches :</strong> {totalWeekTasks}</span>
        </div>
        <div>
          {status === 'Validé' && <span className="badge-status bg-success">Validé par la Direction</span>}
          {status === 'Soumis' && <span className="badge-status bg-info">Soumis à la Direction</span>}
          {status === 'Brouillon' && <span className="badge-status bg-warning">Brouillon</span>}
        </div>
      </div>

      {/* 1. Objectifs de la semaine */}
      <div className="card" style={{ marginBottom: '20px', padding: '16px 20px' }}>
        <label className="report-field-label">🎯 1. Objectifs initiaux de la semaine</label>
        <input
          type="text"
          className="table-input"
          placeholder="Ex: Finalisation des devis grands comptes, relances des prospects chauds..."
          value={weeklyObjectives}
          onChange={e => setWeeklyObjectives(e.target.value)}
        />
      </div>

      {/* 2. Journal des Tâches par Jour */}
      <div className="card" style={{ marginBottom: '20px', padding: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700 }}>
              📋 2. Journal des Tâches Réalisées par Jour
            </h3>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                const count = importWeekDailyTasks(true);
                if (count > 0) {
                  alert(`${count} tâche(s) synchronisée(s) depuis vos rapports journaliers.`);
                } else {
                  alert('Aucun rapport journalier trouvé pour cette semaine.');
                }
              }}
              style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.8rem' }}
              title="Importer automatiquement les tâches enregistrées dans les rapports journaliers de cette semaine"
            >
              <RefreshCw size={13} /> 🔄 Importer mes tâches journalières
            </button>
          </div>

          {/* Day selection tabs */}
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {DAYS.map(day => (
              <button
                key={day}
                type="button"
                className={`btn btn-sm ${activeDay === day ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setActiveDay(day)}
              >
                {day} ({(tasksByDay[day] || []).length})
              </button>
            ))}
          </div>
        </div>

        {/* Task Entry Form for Active Day */}
        <form onSubmit={handleAddTask} style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '16px', background: '#F8FAFC', padding: '12px', borderRadius: '8px', border: '1px solid #E2E8F0', flexWrap: 'wrap' }}>
          <input
            type="text"
            className="table-input"
            style={{ flex: 2, minWidth: '220px' }}
            placeholder={`Ajouter une tâche pour ${activeDay}...`}
            value={newTaskDesc}
            onChange={e => setNewTaskDesc(e.target.value)}
            required
          />

          <select
            className="table-input"
            style={{ maxWidth: '140px' }}
            value={newTaskStatus}
            onChange={e => setNewTaskStatus(e.target.value as any)}
          >
            <option value="Effectuée">Effectuée</option>
            <option value="En cours">En cours</option>
            <option value="Bloquée">Bloquée</option>
          </select>

          <input
            type="text"
            className="table-input"
            style={{ flex: 1, minWidth: '160px' }}
            placeholder="Difficulté / Bloquant (optionnel)"
            value={newTaskDifficulty}
            onChange={e => setNewTaskDifficulty(e.target.value)}
          />

          <button type="submit" className="btn btn-primary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Plus size={16} /> Ajouter
          </button>
        </form>

        {/* Task list for active day */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {(tasksByDay[activeDay] || []).length === 0 ? (
            <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem', fontStyle: 'italic', margin: '8px 0' }}>
              Aucune tâche enregistrée pour {activeDay}. Renseignez vos actions ci-dessus.
            </p>
          ) : (
            (tasksByDay[activeDay] || []).map((t, idx) => (
              <div key={t.id} className="report-task-item">
                <div className="report-task-row">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {t.status === 'Effectuée' && <CheckCircle2 size={16} color="#059669" />}
                    {t.status === 'En cours' && <Clock size={16} color="#D97706" />}
                    {t.status === 'Bloquée' && <AlertCircle size={16} color="#DC2626" />}
                    <span style={{ fontWeight: 600 }}>{idx + 1}. {t.description}</span>
                  </div>

                  <div className="report-task-actions">
                    <span className={`badge-status ${t.status === 'Effectuée' ? 'bg-success' : t.status === 'Bloquée' ? 'bg-danger' : 'bg-warning'}`}>
                      {t.status}
                    </span>
                    <button
                      type="button"
                      className="icon-button text-error"
                      onClick={() => handleDeleteTask(activeDay, t.id)}
                      title="Supprimer la tâche"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {t.difficulty && (
                  <div style={{ fontSize: '0.78rem', color: '#DC2626', marginTop: '2px' }}>
                    ⚠️ Difficulté : {t.difficulty}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Gemini API Key status check */}
      {!getUserGeminiKey(currentUser?.id) && (
        <div style={{ background: '#FEF3C7', border: '1px solid #FCD34D', borderRadius: '10px', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Key size={20} color="#D97706" />
            <div style={{ fontSize: '0.85rem', color: '#92400E' }}>
              <strong>Clé API Gemini non configurée :</strong> Renseignez votre propre clé gratuite pour une génération instantanée.
            </div>
          </div>
          <Link to="/parametres-ia" className="btn btn-secondary btn-sm" style={{ borderColor: '#D97706', color: '#92400E' }}>
            Configurer ma clé API (Gratuit) →
          </Link>
        </div>
      )}

      {/* 3. AI Generator Banner */}
      <div className="report-ai-banner">
        <div>
          <h3 style={{ margin: 0, fontSize: '1.15rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Sparkles size={22} /> Rédacteur Intelligent IA (Google Gemini)
          </h3>
          <p style={{ margin: '4px 0 0', opacity: 0.9, fontSize: '0.85rem' }}>
            L'IA compile l'ensemble de vos tâches de la semaine pour formuler une synthèse valorisante, extraire les points clés et proposer vos perspectives.
          </p>
        </div>

        <button
          type="button"
          className="report-ai-btn"
          onClick={handleGenerateWithAi}
          disabled={isGeneratingAi || totalWeekTasks === 0}
        >
          <Sparkles size={18} />
          {isGeneratingAi ? 'Rédaction IA en cours...' : '🪄 Générer la Synthèse avec l\'IA'}
        </button>
      </div>

      {/* 4. Sections Rédigées & Relecture */}
      <div className="report-section-grid">
        {/* Synthèse générale */}
        <div className="card report-field-group" style={{ padding: '16px' }}>
          <label className="report-field-label">✨ 3. Synthèse globale & Faits marquants (IA)</label>
          <textarea
            className="report-textarea"
            style={{ minHeight: '120px' }}
            placeholder="La synthèse automatique de la semaine apparaîtra ici..."
            value={aiSummary}
            onChange={e => setAiSummary(e.target.value)}
          />
        </div>

        {/* Principaux résultats */}
        <div className="card report-field-group" style={{ padding: '16px' }}>
          <label className="report-field-label">🏆 4. Principaux résultats & Réalisations</label>
          <textarea
            className="report-textarea"
            style={{ minHeight: '120px' }}
            placeholder="Ex: Contrat signé avec Client X, livraison du projet Y..."
            value={achievements}
            onChange={e => setAchievements(e.target.value)}
          />
        </div>

        {/* Difficultés & Besoins */}
        <div className="card report-field-group" style={{ padding: '16px' }}>
          <label className="report-field-label">⚠️ 5. Difficultés rencontrées & Demandes d'arbitrage Direction</label>
          <textarea
            className="report-textarea"
            style={{ minHeight: '100px' }}
            placeholder="Ex: Retard de livraison fournisseur, attente validation technique..."
            value={difficulties}
            onChange={e => setDifficulties(e.target.value)}
          />
        </div>

        {/* Perspectives N+1 */}
        <div className="card report-field-group" style={{ padding: '16px' }}>
          <label className="report-field-label">🚀 6. Plan d'action & Perspectives (Semaine N+1)</label>
          <textarea
            className="report-textarea"
            style={{ minHeight: '100px' }}
            placeholder="Ex: Relance des 5 propositions transmises, finalisation du BAT..."
            value={nextWeekObjectives}
            onChange={e => setNextWeekObjectives(e.target.value)}
          />
        </div>
      </div>

      {/* Action Bar */}
      <div className="report-actions-bar">
        <button type="button" className="btn btn-secondary" onClick={handlePreviewPdf} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Eye size={16} />
          👁️ Prévisualiser le PDF
        </button>

        <button type="button" className="btn btn-secondary" onClick={handleDownloadPdf} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Download size={16} />
          Télécharger le PDF
        </button>

        <button type="button" className="btn btn-secondary" onClick={handleSaveDraft} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Save size={16} />
          Enregistrer le Brouillon
        </button>

        <button type="button" className="btn btn-primary" onClick={handleSubmitReport} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Send size={16} />
          🚀 Soumettre à la Direction
        </button>
      </div>

      <ReportPdfPreview preview={preview} onClose={() => setPreview(null)} />
    </div>
  );
}

