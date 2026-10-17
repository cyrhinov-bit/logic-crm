import React, { useState, useMemo, useEffect } from 'react';
import { 
  Calendar, CheckCircle, Clock, AlertCircle, FileText, Send, Download, 
  Eye, Plus, Trash2, ChevronLeft, ChevronRight, ChevronDown, Bell, Shield, 
  Filter, Search, User as UserIcon, Users, Building, MessageSquare, Lock, ClipboardCheck,
  Sparkles, Tag, CheckCircle2, RotateCcw, AlignLeft, AlertTriangle, Layers, Zap
} from 'lucide-react';
import { useSearchParams, useLocation, useNavigate } from 'react-router-dom';
import { useAppContext, type V2WeeklyReport, type V2DailyReport, type V2Task, type User } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { useConfirm } from '../../components/ConfirmModal';
import { generateV2WeeklyReportPdf, getV2WeeklyReportPdfBlobUrl, getV2WeeklyReportPdfDataUrl } from '../../features/reports/services/ReportPdfService';
import { ReportPdfPreview, type ReportPdfPreviewData } from '../../components/ReportPdfPreview';
import toast from 'react-hot-toast';
import './CrmWeeklyReports.css';

const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
const TASK_CATEGORIES = ['Opérationnel', 'Commercial', 'Support & Client', 'Technique', 'Administratif', 'Réunion & Stratégie'];
const QUICK_SUGGESTIONS = [
  { label: '🎯 RDV Client', prefix: 'Rendez-vous client ' },
  { label: '📑 Devis & Offre', prefix: 'Élaboration devis / offre ' },
  { label: '📦 Livraison', prefix: 'Livraison commande ' },
  { label: '🛠️ Intervention', prefix: 'Intervention technique ' },
  { label: '📞 Relance', prefix: 'Relance commerciale ' },
  { label: '🤝 Réunion', prefix: 'Réunion d\'équipe ' }
];

// Bloc d'archive repliable : en-tête de semaine (avec badges) + contenu dépliable.
// Utilisé pour l'archive équipe (supervision) et l'historique personnel.
function WeekArchiveBlock({ week, isCurrent, isArchived, expanded, onToggle, badges, children }: {
  week: string;
  isCurrent: boolean;
  isArchived: boolean;
  expanded: boolean;
  onToggle: () => void;
  badges?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div style={{ border: '1px solid var(--color-border)', borderRadius: '10px', overflow: 'hidden', background: 'var(--color-background)' }}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        title={expanded ? 'Replier cette semaine' : 'Déplier cette semaine'}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: '10px',
          padding: '12px 14px', border: 'none', cursor: 'pointer', textAlign: 'left',
          background: isCurrent ? 'rgba(124,58,237,0.08)' : 'var(--color-card)'
        }}
      >
        {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        <Calendar size={16} color="#7C3AED" />
        <strong style={{ fontSize: '0.95rem' }}>
          Semaine du {new Date(week + 'T00:00:00').toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}
        </strong>
        {isArchived && (
          <span className="badge-status bg-warning" style={{ padding: '3px 9px', fontSize: '0.75rem' }}>
            📦 Archivée
          </span>
        )}
        {isCurrent && (
          <span className="badge-status bg-primary" style={{ padding: '3px 9px', fontSize: '0.75rem' }}>
            Semaine courante
          </span>
        )}
        {badges}
        <span style={{ marginLeft: 'auto', fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>
          {expanded ? 'Replier' : 'Déplier'}
        </span>
      </button>

      {expanded && (
        <div className="table-responsive">{children}</div>
      )}
    </div>
  );
}

export function CrmWeeklyReports() {
  const { currentUser } = useAuth();
  const { 
    v2WeeklyReports, v2DailyReports, users, services, settings, notifications,
    saveV2DailyReport, saveV2WeeklyReport, submitV2WeeklyReport, 
    sendWeeklyReportReminder, reviewV2WeeklyReport, markNotificationAsRead,
    deleteV2WeeklyReport, deleteV2DailyReport
  } = useAppContext();
  const { confirm } = useConfirm();
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();

  const isDirection = ['Directeur', 'Directeur adjoint', 'SuperAdmin'].includes(currentUser?.role || '');
  const isSupervisionRoute = location.pathname.includes('rapports-equipe');
  // Supervision des rapports d'équipe : direction uniquement.
  // Les autres rôles (Responsable inclus) voient uniquement leurs propres rapports.
  const showSupervision = isDirection && (isSupervisionRoute || !location.pathname.includes('/crm/rapports'));

  // Format local Date as YYYY-MM-DD
  const formatYMD = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dayNum = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dayNum}`;
  };

  // Helper date for Monday
  const getMondayOf = (d: Date) => {
    const date = new Date(d);
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    const mon = new Date(date.setDate(diff));
    return formatYMD(mon);
  };

  // Comparaison normalisée des semaines (10 premiers caractères) : la base peut
  // renvoyer week_start en DATE (YYYY-MM-DD) ou en ISO datetime selon les versions.
  const normWeek = (s?: string) => (s || '').slice(0, 10);

  // Archivage automatique : une semaine est close dès le lundi suivant son dimanche.
  // Les rapports d'une semaine close sont considérés comme archivés (dérivé des
  // dates → aucun changement de statut en base, la workflow Soumis/Validé reste intacte).
  const isWeekClosed = (weekKey?: string) => {
    const w = normWeek(weekKey);
    if (!w) return false;
    const start = new Date(w + 'T00:00:00');
    if (Number.isNaN(start.getTime())) return false;
    const sunday = new Date(start);
    sunday.setDate(sunday.getDate() + 6);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return sunday.getTime() < today.getTime();
  };

  const currentMondayStr = useMemo(() => getMondayOf(new Date()), []);
  const initialWeek = searchParams.get('week') || currentMondayStr;
  const initialTab = showSupervision ? 'supervision' : (searchParams.get('tab') || 'daily');

  const [currentWeekStart, setCurrentWeekStart] = useState<string>(initialWeek);
  const [activeTab, setActiveTab] = useState<string>(initialTab);
  const [selectedDay, setSelectedDay] = useState<string>('Lundi');

  // Preview Modal State
  const [preview, setPreview] = useState<ReportPdfPreviewData | null>(null);

  // Direction Review Modal State
  const [reviewingReport, setReviewingReport] = useState<V2WeeklyReport | null>(null);
  const [reviewComment, setReviewComment] = useState('');

  // Daily task form state
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDescription, setTaskDescription] = useState('');
  const [taskCategory, setTaskCategory] = useState('Opérationnel');
  const [taskStatus, setTaskStatus] = useState<V2Task['status']>('Effectuée');
  const [taskDifficulty, setTaskDifficulty] = useState('');
  const [taskTimeSpent, setTaskTimeSpent] = useState('');

  // Report editor state
  const [summary, setSummary] = useState('');
  const [achievements, setAchievements] = useState('');
  const [difficulties, setDifficulties] = useState('');
  const [nextWeekObjectives, setNextWeekObjectives] = useState('');
  const [weeklyObjectives, setWeeklyObjectives] = useState('');

  // Direction supervision filters
  const [searchQuery, setSearchQuery] = useState('');
  const [serviceFilter, setServiceFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  // Pagination des semaines d'archive (évite les rendus lourds à grand effectif)
  const ARCHIVE_WEEKS_PAGE_SIZE = 8;
  const [archivePage, setArchivePage] = useState(1);
  // Archive par semaine : 'ALL' = toutes les semaines, sinon weekStart normalisé (YYYY-MM-DD)
  const [weekFilter, setWeekFilter] = useState('ALL');
  // Semaines d'archive dépliées (une semaine = un bloc repliable dans la supervision)
  const [expandedWeeks, setExpandedWeeks] = useState<Record<string, boolean>>(() => ({ [currentMondayStr]: true }));

  // Synchroniser paramètres URL et routes
  useEffect(() => {
    if (showSupervision) {
      setActiveTab('supervision');
    } else {
      const pTab = searchParams.get('tab');
      if (pTab && ['daily', 'report', 'history'].includes(pTab)) {
        setActiveTab(pTab);
      } else {
        setActiveTab('daily');
      }
    }
    const pWeek = searchParams.get('week');
    if (pWeek && pWeek !== currentWeekStart) {
      setCurrentWeekStart(pWeek);
    }
  }, [searchParams, location.pathname, showSupervision]);

  // Ouvrir automatiquement dans l'archive la semaine sélectionnée (navigation précédent/suivant)
  useEffect(() => {
    const key = normWeek(currentWeekStart);
    setExpandedWeeks(prev => (prev[key] ? prev : { ...prev, [key]: true }));
  }, [currentWeekStart]);

  // Marquer automatiquement les notifications de rapports comme lues lorsque la supervision est consultée
  useEffect(() => {
    if ((showSupervision || isDirection) && currentUser) {
      const unreadReportNotifs = (notifications || []).filter(n => 
        n.user_id === currentUser.id && 
        !n.is_read && 
        (n.title?.toLowerCase().includes('rapport') || n.link?.includes('rapports') || n.link?.includes('supervision'))
      );
      for (const notif of unreadReportNotifs) {
        markNotificationAsRead(notif.id);
      }
    }
  }, [showSupervision, isDirection, currentUser, notifications, markNotificationAsRead]);

  const handleTabChange = (newTab: string) => {
    if (showSupervision) return;
    setActiveTab(newTab);
    setSearchParams({ tab: newTab, week: currentWeekStart });
  };

  // Calcul des dates de la semaine courante
  const weekDates = useMemo(() => {
    const dates: Record<string, string> = {};
    const startDate = new Date(currentWeekStart + 'T00:00:00');
    DAYS.forEach((day, idx) => {
      const d = new Date(startDate);
      d.setDate(d.getDate() + idx);
      dates[day] = formatYMD(d);
    });
    return dates;
  }, [currentWeekStart]);

  // Trouver ou charger le rapport hebdomadaire de la semaine
  // Comparaison normalisée (10 premiers caractères) : la base peut renvoyer
  // week_start en DATE ou en ISO datetime selon les versions — un === strict
  // ratait le brouillon et créait un doublon (UNIQUE serveur → erreur sync).
  const currentWeeklyReport = useMemo(() => {
    const w = (currentWeekStart || '').slice(0, 10);
    return v2WeeklyReports.find(r => r.authorId === currentUser?.id && (r.weekStart || '').slice(0, 10) === w);
  }, [v2WeeklyReports, currentUser?.id, currentWeekStart]);

  const isWeekLocked = useMemo(() => {
    return currentWeeklyReport?.isLocked === true || currentWeeklyReport?.status === 'Soumis' || currentWeeklyReport?.status === 'Validé' || currentWeeklyReport?.status === 'Relu';
  }, [currentWeeklyReport]);

  // Initialiser les champs du formulaire hebdomadaire lors du changement de semaine / rapport
  useEffect(() => {
    if (currentWeeklyReport) {
      setSummary(currentWeeklyReport.summary || '');
      setAchievements(currentWeeklyReport.achievements || '');
      setDifficulties(currentWeeklyReport.difficulties || '');
      setNextWeekObjectives(currentWeeklyReport.nextWeekObjectives || '');
      setWeeklyObjectives(currentWeeklyReport.weeklyObjectives || '');
    } else {
      setSummary('');
      setAchievements('');
      setDifficulties('');
      setNextWeekObjectives('');
      setWeeklyObjectives('');
    }
  }, [currentWeeklyReport, currentWeekStart]);

  // Récupérer les activités du jour sélectionné (date normalisée, cf. ci-dessus)
  const currentDayDate = weekDates[selectedDay];
  const currentDailyReport = useMemo(() => {
    const d = (currentDayDate || '').slice(0, 10);
    return v2DailyReports.find(dd => dd.authorId === currentUser?.id && (dd.date || '').slice(0, 10) === d);
  }, [v2DailyReports, currentUser?.id, currentDayDate]);

  const dailyTasks = currentDailyReport?.tasks || [];

  // Changer de semaine (semaine précédente / suivante)
  const shiftWeek = (offsetWeeks: number) => {
    const d = new Date(currentWeekStart + 'T00:00:00');
    d.setDate(d.getDate() + offsetWeeks * 7);
    const newMonday = getMondayOf(d);
    setCurrentWeekStart(newMonday);
    setSearchParams({ tab: activeTab, week: newMonday });
  };

  // 1. Ajouter une activité quotidienne
  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskTitle.trim()) return;
    if (isWeekLocked) {
      toast.error('Cette semaine est déjà verrouillée suite à sa soumission.');
      return;
    }

    const cleanTitle = taskTitle.trim();
    const cleanDesc = taskDescription.trim() || cleanTitle;

    const newTask: V2Task = {
      id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(),
      title: cleanTitle,
      description: cleanDesc,
      category: taskCategory,
      status: taskStatus,
      difficulty: taskDifficulty.trim() || undefined,
      timeSpent: taskTimeSpent.trim() || undefined
    };

    const updatedTasks = [...dailyTasks, newTask];
    const reportToSave: V2DailyReport = {
      id: currentDailyReport?.id || (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString()),
      authorId: currentUser?.id || '',
      date: currentDayDate,
      project: 'HINOV GROUP',
      objectives: currentDailyReport?.objectives || '',
      tasks: updatedTasks,
      results: currentDailyReport?.results || '',
      difficulties: currentDailyReport?.difficulties || '',
      observations: currentDailyReport?.observations || '',
      status: isWeekLocked ? 'Soumis' : 'Brouillon'
    };

    await saveV2DailyReport(reportToSave);
    setTaskTitle('');
    setTaskDescription('');
    setTaskDifficulty('');
    setTaskTimeSpent('');
    toast.success('Activité ajoutée avec succès.');
  };

  // 2. Basculer le statut d'une tâche
  const handleToggleTaskStatus = async (taskId: string) => {
    if (isWeekLocked) {
      toast.error('Modification impossible : la semaine est verrouillée.');
      return;
    }
    const statusCycle: Record<V2Task['status'], V2Task['status']> = {
      'En cours': 'Effectuée',
      'Effectuée': 'Restante',
      'Restante': 'Bloquée',
      'Bloquée': 'En cours'
    };

    const updatedTasks = dailyTasks.map(t => {
      if (t.id === taskId) {
        return { ...t, status: statusCycle[t.status] || 'Effectuée' };
      }
      return t;
    });

    if (currentDailyReport) {
      await saveV2DailyReport({ ...currentDailyReport, tasks: updatedTasks });
    }
  };

  // 3. Supprimer une tâche
  const handleDeleteTask = async (taskId: string) => {
    if (isWeekLocked) {
      toast.error('Suppression impossible : la semaine est verrouillée.');
      return;
    }
    const updatedTasks = dailyTasks.filter(t => t.id !== taskId);
    if (currentDailyReport) {
      await saveV2DailyReport({ ...currentDailyReport, tasks: updatedTasks });
      toast.success('Activité supprimée.');
    }
  };

  // 3b. Vider le jour sélectionné (supprime le daily report)
  const handleClearDay = () => {
    if (isWeekLocked || !currentDailyReport) return;
    confirm({
      title: `Vider les activités du ${selectedDay}`,
      message: `Supprimer les ${dailyTasks.length} activité(s) du ${selectedDay} ${new Date(currentDayDate + 'T00:00:00').toLocaleDateString('fr-FR')} ? Cette action est irréversible.`,
      confirmLabel: 'Vider le jour',
      onConfirm: async () => {
        try {
          await deleteV2DailyReport(currentDailyReport.id);
          toast.success(`Activités du ${selectedDay} supprimées.`);
        } catch (e) {
          console.error('[RapportHebdo] Suppression jour échouée :', e);
          toast.error('Échec de la suppression du jour.');
        }
      }
    });
  };

  // 3c. Supprimer le brouillon hebdomadaire (uniquement si non soumis)
  const handleDeleteDraft = () => {
    if (isWeekLocked || !currentWeeklyReport) return;
    confirm({
      title: 'Supprimer le brouillon',
      message: `Supprimer définitivement le brouillon de la semaine du ${new Date(currentWeekStart + 'T00:00:00').toLocaleDateString('fr-FR')} ? Les activités journalières sont conservées.`,
      confirmLabel: 'Supprimer le brouillon',
      onConfirm: async () => {
        try {
          await deleteV2WeeklyReport(currentWeeklyReport.id);
          setSummary('');
          setAchievements('');
          setDifficulties('');
          setNextWeekObjectives('');
          setWeeklyObjectives('');
          toast.success('Brouillon supprimé.');
        } catch (e) {
          console.error('[RapportHebdo] Suppression brouillon échouée :', e);
          toast.error('Échec de la suppression du brouillon.');
        }
      }
    });
  };

  // 4. Consolider et importer les tâches de la semaine dans le brouillon
  const handleConsolidateWeek = () => {
    const tasksByDayMap: Record<string, V2Task[]> = {};
    DAYS.forEach(day => {
      const dStr = weekDates[day];
      const rep = v2DailyReports.find(d => d.authorId === currentUser?.id && (d.date === dStr || d.date?.startsWith(dStr)));
      tasksByDayMap[day] = rep?.tasks || [];
    });

    // Auto-déduction des réalisations et difficultés
    const allTasks = Object.values(tasksByDayMap).flat();
    const formatTaskLine = (t: V2Task) => {
      if (t.title && t.description && t.title.trim() !== t.description.trim()) {
        return `• [${t.title.trim()}] : ${t.description.trim()}`;
      }
      return `• ${t.title || t.description}`;
    };

    const completedTasks = allTasks.filter(t => t.status === 'Effectuée').map(formatTaskLine);
    const blockedTasks = allTasks.filter(t => t.status === 'Bloquée' || t.difficulty).map(t => {
      const base = formatTaskLine(t);
      return `${base} ${t.difficulty ? `(Point bloquant : ${t.difficulty})` : ''}`;
    });

    if (!achievements && completedTasks.length > 0) {
      setAchievements(completedTasks.join('\n'));
    }
    if (!difficulties && blockedTasks.length > 0) {
      setDifficulties(blockedTasks.join('\n'));
    }

    toast.success('Activités journalières consolidées avec succès.');
  };

  // 5. Sauvegarder le brouillon de rapport
  const handleSaveDraft = async () => {
    if (isWeekLocked) {
      toast.error('Semaine verrouillée : le rapport déjà soumis ne peut plus être modifié.');
      return;
    }    const tasksByDayMap: Record<string, V2Task[]> = {};
    DAYS.forEach(day => {
      const dStr = weekDates[day];
      const rep = v2DailyReports.find(d => d.authorId === currentUser?.id && (d.date === dStr || d.date?.startsWith(dStr)));
      tasksByDayMap[day] = rep?.tasks || [];
    });

    const reportObj: V2WeeklyReport = {
      id: currentWeeklyReport?.id || (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString()),
      authorId: currentUser?.id || '',
      weekStart: currentWeekStart,
      weekEnd: weekDates['Dimanche'],
      project: 'HINOV GROUP',
      weeklyObjectives,
      tasksByDay: tasksByDayMap,
      summary,
      achievements,
      difficulties,
      nextWeekObjectives,
      status: currentWeeklyReport?.status || 'Brouillon'
    };

    await saveV2WeeklyReport(reportObj);
    toast.success('Brouillon de rapport sauvegardé.');
  };

  // 6. Soumettre le rapport hebdomadaire à la Direction (appel atomique unique)
  const handleSubmitReport = () => {
    if (isWeekLocked) return;
    // Validation minimale : empêche les rapports vides
    const tasksCount = DAYS.reduce((sum, day) => {
      const dStr = weekDates[day];
      const rep = v2DailyReports.find(d => d.authorId === currentUser?.id && (d.date === dStr || d.date?.startsWith(dStr)));
      return sum + (rep?.tasks?.length || 0);
    }, 0);
    if (tasksCount === 0) {
      toast.error('Ajoutez au moins une activité journalière avant de soumettre.');
      return;
    }
    if (!achievements.trim() && !summary.trim()) {
      toast.error('Renseignez la synthèse / réalisations avant de soumettre.');
      return;
    }

    confirm({
      title: 'Soumettre mon rapport à la Direction',
      message: 'Attention : La soumission verrouillera définitivement toutes les activités de cette semaine pour garantir l\'intégrité des comptes-rendus. Confirmez-vous l\'envoi officiel ?',
      confirmLabel: 'Confirmer et soumettre',
      onConfirm: async () => {
        try {
          const tasksByDayMap: Record<string, V2Task[]> = {};
          DAYS.forEach(day => {
            const dStr = weekDates[day];
            const rep = v2DailyReports.find(d => d.authorId === currentUser?.id && (d.date === dStr || d.date?.startsWith(dStr)));
            tasksByDayMap[day] = rep?.tasks || [];
          });

          const reportId = currentWeeklyReport?.id || (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString());
          const reportObj: V2WeeklyReport = {
            id: reportId,
            authorId: currentUser?.id || '',
            weekStart: currentWeekStart,
            weekEnd: weekDates['Dimanche'],
            project: 'HINOV GROUP',
            weeklyObjectives,
            tasksByDay: tasksByDayMap,
            summary,
            achievements,
            difficulties,
            nextWeekObjectives,
            status: 'Soumis'
          };

          // Appel atomique : submit persiste le rapport + verrouille les dailies + notifie la Direction
          await submitV2WeeklyReport(reportObj);
          toast.success('Rapport hebdomadaire soumis avec succès à la Direction !');
        } catch (e) {
          console.error('[RapportHebdo] Soumission échouée :', e);
          toast.error('Échec de la soumission. Vérifiez votre connexion, le brouillon est conservé.');
        }
      }
    });
  };

  // 7. Aperçu PDF Certifié
  const handlePreviewPdf = (reportToPreview?: V2WeeklyReport) => {
    const targetWeekStart = reportToPreview?.weekStart || currentWeekStart;
    const authorId = reportToPreview ? reportToPreview.authorId : (currentUser?.id || '');
    
    // Calculer les dates exactes de la semaine cible (du Lundi au Dimanche)
    const targetStartDate = new Date(targetWeekStart + 'T00:00:00');
    const targetWeekDates: Record<string, string> = {};
    DAYS.forEach((day, idx) => {
      const d = new Date(targetStartDate);
      d.setDate(d.getDate() + idx);
      targetWeekDates[day] = formatYMD(d);
    });

    const tasksByDayRecord: Record<string, V2Task[]> = {};
    DAYS.forEach(day => {
      const targetDate = targetWeekDates[day];
      const rep = v2DailyReports.find(d => 
        d.authorId === authorId && 
        (d.date === targetDate || d.date?.startsWith(targetDate))
      );
      const existingInReport = (reportToPreview?.tasksByDay && typeof reportToPreview.tasksByDay === 'object') 
        ? ((reportToPreview.tasksByDay as any)[day] || [])
        : [];
      tasksByDayRecord[day] = (rep?.tasks && rep.tasks.length > 0) ? rep.tasks : existingInReport;
    });

    const reportObj: V2WeeklyReport = reportToPreview 
      ? {
          ...reportToPreview,
          tasksByDay: (Object.values(tasksByDayRecord).some(arr => Array.isArray(arr) && arr.length > 0)) 
            ? tasksByDayRecord 
            : reportToPreview.tasksByDay
        }
      : {
          id: currentWeeklyReport?.id || 'temp-id',
          authorId: currentUser?.id || '',
          weekStart: currentWeekStart,
          weekEnd: weekDates['Dimanche'],
          weeklyObjectives,
          tasksByDay: tasksByDayRecord,
          summary,
          achievements,
          difficulties,
          nextWeekObjectives,
          status: currentWeeklyReport?.status || 'Brouillon'
        };

    const targetAuthor = users.find(u => u.id === reportObj.authorId) || currentUser;
    const blobUrl = getV2WeeklyReportPdfBlobUrl(reportObj, targetAuthor, settings, v2DailyReports);
    const dataUrl = getV2WeeklyReportPdfDataUrl(reportObj, targetAuthor, settings, v2DailyReports);
    const safeName = targetAuthor?.name ? targetAuthor.name.toLowerCase().replace(/\s+/g, '_') : 'collaborateur';

    setPreview({
      blobUrl,
      dataUrl,
      filename: `rapport_hebdo_${safeName}_${reportObj.weekStart}.pdf`,
      title: `Rapport Hebdomadaire — ${targetAuthor?.name || 'Collaborateur'} (Semaine du ${new Date(reportObj.weekStart + 'T00:00:00').toLocaleDateString('fr-FR')})`,
      onDownload: () => generateV2WeeklyReportPdf(reportObj, targetAuthor, settings, v2DailyReports)
    });
  };

  // ================= SUPERVISION DIRECTION DATA & KPIs =================
  const activeStaff = useMemo(() => {
    return users.filter(u => {
      if (u.active === false) return false;
      // La Direction est exclue de l'effectif attendu AVANT tout (un rapport de directeur ne doit pas gonfler le dénominateur)
      if (['Directeur', 'Directeur adjoint', 'SuperAdmin'].includes(u.role)) return false;
      // Tout collaborateur ayant un rapport créé ou soumis apparaît dans le cockpit
      const hasReport = v2WeeklyReports.some(r => r.authorId === u.id);
      if (hasReport) return true;
      return u.crmReportsEnabled !== false;
    });
  }, [users, v2WeeklyReports]);

  // Tous les rapports soumis (indépendamment de la semaine sélectionnée)
  // Tri archive : semaine décroissante puis date de soumission décroissante
  const allSubmittedReports = useMemo(() => {
    return v2WeeklyReports
      .filter(r => r.status === 'Soumis' || r.status === 'Validé' || r.status === 'Relu')
      .sort((a, b) => {
        const weekCmp = (b.weekStart || '').localeCompare(a.weekStart || '');
        if (weekCmp !== 0) return weekCmp;
        const dateA = a.submittedAt ? new Date(a.submittedAt).getTime() : 0;
        const dateB = b.submittedAt ? new Date(b.submittedAt).getTime() : 0;
        return dateB - dateA;
      });
  }, [v2WeeklyReports]);

  // Rapports pour la semaine active sélectionnée (normalisation via normWeek ci-dessus)
  const weeklyReportsForSelectedWeek = useMemo(() => {
    return v2WeeklyReports.filter(r => normWeek(r.weekStart) === normWeek(currentWeekStart));
  }, [v2WeeklyReports, currentWeekStart]);

  const submittedStaffIds = useMemo(() => {
    return weeklyReportsForSelectedWeek.filter(r => r.status === 'Soumis' || r.status === 'Validé' || r.status === 'Relu').map(r => r.authorId);
  }, [weeklyReportsForSelectedWeek]);

  const pendingStaff = useMemo(() => {
    return activeStaff.filter(u => !submittedStaffIds.includes(u.id));
  }, [activeStaff, submittedStaffIds]);

  const completionRate = activeStaff.length > 0 
    ? Math.round((submittedStaffIds.length / activeStaff.length) * 100) 
    : 0;

  // Filtrage des rapports soumis
  // Note : le filtre "ATTENTE" concerne le tableau de complétion ci-dessous,
  // pas cette liste (qui ne contient que des rapports déjà soumis) → on l'ignore ici.
  // "SOUMIS" = reçus à valider (statut Soumis), "Validé"/"Relu" restent visibles en ALL.
  const filteredSubmittedReports = useMemo(() => {
    return allSubmittedReports.filter(r => {
      const author = users.find(u => u.id === r.authorId);
      const matchSearch = searchQuery ? (
        (author?.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (author?.email || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (r.project || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (r.summary || '').toLowerCase().includes(searchQuery.toLowerCase())
      ) : true;
      const matchService = serviceFilter === 'ALL' ? true : author?.serviceId === serviceFilter;
      const matchStatus = statusFilter === 'ALL' || statusFilter === 'ATTENTE' ? true : (
        statusFilter === 'SOUMIS' ? (r.status === 'Soumis') : (r.status === statusFilter)
      );
      const matchWeek = weekFilter === 'ALL' ? true : normWeek(r.weekStart) === weekFilter;
      return matchSearch && matchService && matchStatus && matchWeek;
    });
  }, [allSubmittedReports, searchQuery, serviceFilter, statusFilter, weekFilter, users]);

  // Semaines d'archive disponibles (semaine normalisée + nombre de rapports), tri décroissant
  const availableWeeks = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of allSubmittedReports) {
      const w = normWeek(r.weekStart);
      if (!w) continue;
      counts.set(w, (counts.get(w) || 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([week, count]) => ({
        week,
        count,
        label: `Semaine du ${new Date(week + 'T00:00:00').toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })} (${count})`
      }));
  }, [allSubmittedReports]);

  // Filtrage du cockpit de supervision (équipe)
  // Note : "Validé"/"Relu" concernent la liste d'archive ci-dessus → ignorés ici (équivalent ALL).
  const filteredStaffList = useMemo(() => {
    return activeStaff.filter(u => {
      const matchSearch = searchQuery ? u.name.toLowerCase().includes(searchQuery.toLowerCase()) || u.email.toLowerCase().includes(searchQuery.toLowerCase()) : true;
      const matchService = serviceFilter === 'ALL' ? true : u.serviceId === serviceFilter;
      const isSubmitted = submittedStaffIds.includes(u.id);
      const matchStatus = (statusFilter === 'ALL' || statusFilter === 'Validé' || statusFilter === 'Relu') ? true : (statusFilter === 'SOUMIS' ? isSubmitted : !isSubmitted);
      return matchSearch && matchService && matchStatus;
    });
  }, [activeStaff, searchQuery, serviceFilter, statusFilter, submittedStaffIds]);

  // Regroupement des rapports soumis par semaine d'archive (lundi → dimanche),
  // semaines les plus récentes en premier — une semaine = un bloc repliable.
  const submittedByWeek = useMemo(() => {
    const map = new Map<string, V2WeeklyReport[]>();
    for (const r of filteredSubmittedReports) {
      const w = normWeek(r.weekStart);
      if (!w) continue;
      const list = map.get(w);
      if (list) list.push(r);
      else map.set(w, [r]);
    }
    const currentKey = normWeek(currentWeekStart);
    return Array.from(map.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([week, reports]) => ({
        week,
        reports,
        isCurrent: week === currentKey,
        pendingCount: reports.filter(r => r.status === 'Soumis' || r.status === 'Relu').length,
        validatedCount: reports.filter(r => r.status === 'Validé').length
      }));
  }, [filteredSubmittedReports, currentWeekStart]);

  // Historique personnel regroupé par semaine (une semaine = un bloc repliable),
  // avec archivage automatique des semaines closes.
  const myReportsByWeek = useMemo(() => {
    const map = new Map<string, V2WeeklyReport[]>();
    for (const r of v2WeeklyReports) {
      if (r.authorId !== currentUser?.id) continue;
      const w = normWeek(r.weekStart);
      if (!w) continue;
      const list = map.get(w);
      if (list) list.push(r);
      else map.set(w, [r]);
    }
    const currentKey = normWeek(currentWeekStart);
    return Array.from(map.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([week, reports]) => ({
        week,
        reports,
        isCurrent: week === currentKey,
        isArchived: isWeekClosed(week)
      }));
  }, [v2WeeklyReports, currentUser?.id, currentWeekStart]);

  const toggleWeek = (weekKey: string) => {
    setExpandedWeeks(prev => ({ ...prev, [weekKey]: !prev[weekKey] }));
  };

  const expandAllWeeks = () => {
    const next: Record<string, boolean> = {};
    submittedByWeek.forEach(w => { next[w.week] = true; });
    setExpandedWeeks(next);
  };

  const collapseAllWeeks = () => setExpandedWeeks({});

  // Pagination par semaine d'archive + reset auto quand les filtres changent
  useEffect(() => {
    setArchivePage(1);
  }, [searchQuery, serviceFilter, statusFilter, weekFilter, currentWeekStart]);

  const archiveTotalPages = Math.max(1, Math.ceil(submittedByWeek.length / ARCHIVE_WEEKS_PAGE_SIZE));
  const safeArchivePage = Math.min(archivePage, archiveTotalPages);
  const paginatedWeekGroups = useMemo(() => {
    const start = (safeArchivePage - 1) * ARCHIVE_WEEKS_PAGE_SIZE;
    return submittedByWeek.slice(start, start + ARCHIVE_WEEKS_PAGE_SIZE);
  }, [submittedByWeek, safeArchivePage]);

  // Ligne d'archive : un rapport soumis par collaborateur pour la semaine groupée
  const renderArchiveRow = (report: V2WeeklyReport) => {
    const author = users.find(u => u.id === report.authorId);
    const serviceName = services.find(s => s.id === author?.serviceId)?.name || 'Général';
    const isValide = report.status === 'Validé';
    const isRelu = report.status === 'Relu';

    return (
      <tr key={report.id}>
        <td data-label="Collaborateur">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {author?.photo ? (
              <img src={author.photo} alt={author.name} style={{ width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover' }} />
            ) : (
              <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--color-primary)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '0.85rem' }}>
                {(author?.name || '?').charAt(0).toUpperCase()}
              </div>
            )}
            <div>
              <strong>{author?.name || 'Inconnu'}</strong>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{author?.email || author?.role || ''}</div>
            </div>
          </div>
        </td>
        <td data-label="Département">{serviceName}</td>
        <td data-label="Semaine concernée">
          <strong>Semaine du {new Date(normWeek(report.weekStart) + 'T00:00:00').toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}</strong>
        </td>
        <td data-label="Date de soumission">
          {report.submittedAt ? new Date(report.submittedAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '-'}
        </td>
        <td data-label="Statut">
          <span className={`badge-status ${isValide ? 'bg-success' : isRelu ? 'bg-warning' : 'bg-info'}`}>
            {isValide ? '✅ Validé' : isRelu ? '👁️ Relu (À valider)' : '📩 Reçu (À valider)'}
          </span>
        </td>
        <td data-label="Actions">
          <div style={{ display: 'flex', gap: '6px' }}>
            <button 
              className="btn btn-secondary" 
              style={{ fontSize: '0.8rem', padding: '5px 10px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
              onClick={() => handlePreviewPdf(report)}
              title="Consulter / Télécharger le PDF officiel"
            >
              <Eye size={14} /> PDF
            </button>
            <button 
              className="btn btn-primary" 
              style={{ fontSize: '0.8rem', padding: '5px 10px', background: '#7C3AED', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
              onClick={() => { setReviewingReport(report); setReviewComment(report.directorComment || ''); }}
              title="Annoter et Valider ce rapport"
            >
              <MessageSquare size={14} /> Annoter / Valider
            </button>
          </div>
        </td>
      </tr>
    );
  };

  // Relancer tous les retardataires
  const handleRemindAllPending = () => {
    if (pendingStaff.length === 0) {
      toast.success('Tous les collaborateurs ont déjà soumis leur rapport !');
      return;
    }

    confirm({
      title: 'Relancer les retardataires',
      message: `Voulez-vous envoyer une notification de rappel à ${pendingStaff.length} collaborateur(s) n'ayant pas encore soumis leur rapport pour la semaine du ${new Date(currentWeekStart + 'T00:00:00').toLocaleDateString('fr-FR')} ?`,
      confirmLabel: 'Envoyer les relances',
      onConfirm: async () => {
        await sendWeeklyReportReminder(pendingStaff.map(u => u.id), currentWeekStart);
        toast.success(`Relance envoyée avec succès à ${pendingStaff.length} collaborateur(s).`);
      }
    });
  };

  // Validation par la Direction
  const handleValidateReport = async () => {
    if (!reviewingReport) return;
    await reviewV2WeeklyReport(reviewingReport.id, reviewComment, 'Validé');
    toast.success('Rapport validé avec succès.');
    setReviewingReport(null);
    setReviewComment('');
  };

  if (showSupervision) {
    const hasTeamAccess = isDirection ? currentUser?.crmTeamReportsEnabled !== false : currentUser?.crmTeamReportsEnabled === true;
    if (!hasTeamAccess) {
      return (
        <div className="dashboard" style={{ textAlign: 'center', padding: '60px 20px' }}>
          <Shield size={48} color="#DC2626" style={{ margin: '0 auto 16px' }} />
          <h2>Module "Rapports Équipe" désactivé</h2>
          <p style={{ color: 'var(--color-text-muted)', maxWidth: '500px', margin: '8px auto 0' }}>
            Ce module n'est pas activé pour votre profil. Rendez-vous dans <strong>Activation Modules</strong> ou contactez la Direction.
          </p>
        </div>
      );
    }
  } else {
    if (currentUser?.crmReportsEnabled === false) {
      return (
        <div className="dashboard" style={{ textAlign: 'center', padding: '60px 20px' }}>
          <Shield size={48} color="#DC2626" style={{ margin: '0 auto 16px' }} />
          <h2>Module "Rapports Hebdo" désactivé</h2>
          <p style={{ color: 'var(--color-text-muted)', maxWidth: '500px', margin: '8px auto 0' }}>
            Le module de reporting hebdomadaire n'est pas activé pour votre compte. Veuillez contacter la Direction.
          </p>
        </div>
      );
    }
  }

  return (
    <div className="dashboard">
      {/* HEADER PRINCIPAL */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
            {showSupervision ? (
              <>
                <ClipboardCheck size={24} color="#7C3AED" /> Rapports d'Activité de l'Équipe
              </>
            ) : (
              <>
                <FileText size={24} color="var(--color-primary)" /> Rapports d'Activité Hebdomadaires
              </>
            )}
          </h2>
          <p style={{ margin: '4px 0 0', color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
            {showSupervision 
              ? "Cockpit de supervision, consultation des rapports soumis et relance de l'équipe"
              : "Suivi journalier des activités, consolidation des comptes-rendus et transmission à la Direction"
            }
          </p>
        </div>

        {/* SÉLECTEUR DE SEMAINE */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--color-card)', padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
          <button className="icon-button" onClick={() => shiftWeek(-1)} title="Semaine précédente">
            <ChevronLeft size={18} />
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, fontSize: '0.95rem' }}>
            <Calendar size={16} color="var(--color-primary)" />
            <span>Semaine du {new Date(currentWeekStart + 'T00:00:00').toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
          </div>
          <button className="icon-button" onClick={() => shiftWeek(1)} title="Semaine suivante">
            <ChevronRight size={18} />
          </button>
          {currentWeekStart !== currentMondayStr && (
            <button 
              className="btn btn-secondary" 
              style={{ fontSize: '0.8rem', padding: '4px 8px', marginLeft: '4px' }}
              onClick={() => { setCurrentWeekStart(currentMondayStr); setSearchParams({ tab: activeTab, week: currentMondayStr }); }}
            >
              Semaine actuelle
            </button>
          )}
        </div>
      </div>

      {/* NAVIGATION PAR ONGLETS (Uniquement pour la saisie opérationnelle individuelle) */}
      {!showSupervision && (
        <div style={{ display: 'flex', gap: '8px', borderBottom: '2px solid var(--color-border)', marginBottom: '24px', flexWrap: 'wrap' }}>
          <button 
            className={`tab-button ${activeTab === 'daily' ? 'active' : ''}`}
            onClick={() => handleTabChange('daily')}
            style={{
              padding: '10px 18px', border: 'none', background: 'none', cursor: 'pointer',
              borderBottom: activeTab === 'daily' ? '3px solid var(--color-primary)' : '3px solid transparent',
              color: activeTab === 'daily' ? 'var(--color-primary)' : 'var(--color-text-muted)',
              fontWeight: activeTab === 'daily' ? 700 : 500, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '8px'
            }}
          >
            <Clock size={16} /> 1. Saisie Journalière (Lun - Dim)
          </button>

          <button 
            className={`tab-button ${activeTab === 'report' ? 'active' : ''}`}
            onClick={() => handleTabChange('report')}
            style={{
              padding: '10px 18px', border: 'none', background: 'none', cursor: 'pointer',
              borderBottom: activeTab === 'report' ? '3px solid var(--color-primary)' : '3px solid transparent',
              color: activeTab === 'report' ? 'var(--color-primary)' : 'var(--color-text-muted)',
              fontWeight: activeTab === 'report' ? 700 : 500, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '8px'
            }}
          >
            <FileText size={16} /> 2. Mon Rapport Hebdomadaire
            {isWeekLocked && <span title="Semaine soumise et verrouillée"><Lock size={14} color="#10B981" /></span>}
          </button>

          <button 
            className={`tab-button ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => handleTabChange('history')}
            style={{
              padding: '10px 18px', border: 'none', background: 'none', cursor: 'pointer',
              borderBottom: activeTab === 'history' ? '3px solid var(--color-primary)' : '3px solid transparent',
              color: activeTab === 'history' ? 'var(--color-primary)' : 'var(--color-text-muted)',
              fontWeight: activeTab === 'history' ? 700 : 500, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '8px'
            }}
          >
            <CheckCircle size={16} /> 3. Mes Rapports Soumis
          </button>
        </div>
      )}

      {/* ================= ONGLET 1 : SAISIE JOURNALIÈRE ================= */}
      {!showSupervision && activeTab === 'daily' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '20px' }}>
          {/* BANDEAU JOURS DE LA SEMAINE - CARTES ANIMÉES MULTI-COULEURS */}
          <div className="crm-days-grid">
            {DAYS.map(day => {
              const dStr = weekDates[day];
              const dayRep = v2DailyReports.find(d => d.authorId === currentUser?.id && d.date === dStr);
              const tasks = dayRep?.tasks || [];
              const count = tasks.length;
              const completedCount = tasks.filter(t => t.status === 'Effectuée').length;
              const progressPct = count > 0 ? Math.round((completedCount / count) * 100) : 0;
              const isSelected = selectedDay === day;
              const dayClass = `day-${day.toLowerCase()}`;

              return (
                <div
                  key={day}
                  className={`crm-day-card ${dayClass} ${isSelected ? 'selected' : ''}`}
                  onClick={() => setSelectedDay(day)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setSelectedDay(day); }}
                >
                  <div>
                    <div className="day-header">
                      <div>
                        <div className="day-name">{day}</div>
                        <div className="day-date">
                          {new Date(dStr + 'T00:00:00').toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
                        </div>
                      </div>
                      <span className="day-badge">
                        {count > 0 ? `${completedCount}/${count}` : '0 act.'}
                      </span>
                    </div>

                    <div className="day-progress-bar">
                      <div 
                        className="day-progress-fill" 
                        style={{ 
                          width: `${progressPct}%`, 
                          background: count > 0 && progressPct === 100 ? '#10B981' : 'currentColor' 
                        }} 
                      />
                    </div>
                  </div>

                  <div className="day-footer">
                    <span className="day-count-label">
                      {count} {count > 1 ? 'activités' : 'activité'}
                    </span>
                    <span className="day-status-pill">
                      {count === 0 ? 'À renseigner' : progressPct === 100 ? '✅ Clôturé' : `${progressPct}% fait`}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* STUDIO D'ÉDITION DU JOUR SÉLECTIONNÉ */}
          <div className="crm-active-day-studio">
            {/* EN-TÊTE DYNAMIQUE DU JOUR */}
            <div className={`crm-day-banner-header day-${selectedDay.toLowerCase()}`}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Calendar size={22} />
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#fff' }}>
                    Activités du {selectedDay} {new Date(currentDayDate + 'T00:00:00').toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}
                  </h3>
                  <p style={{ margin: '2px 0 0', fontSize: '0.85rem', opacity: 0.9 }}>
                    {dailyTasks.length} {dailyTasks.length > 1 ? 'activités enregistrées' : 'activité enregistrée'} • Semaine du {new Date(currentWeekStart + 'T00:00:00').toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
                  </p>
                </div>
              </div>

              {dailyTasks.length > 0 && !isWeekLocked && (
                <button 
                  className="btn btn-secondary" 
                  style={{ fontSize: '0.85rem', padding: '6px 14px', background: 'rgba(255,255,255,0.95)', color: '#1E293B', border: 'none', fontWeight: 700 }}
                  onClick={() => { setActiveTab('report'); setSearchParams({ tab: 'report', week: currentWeekStart }); }}
                >
                  ➡️ Passer au rapport hebdo
                </button>
              )}
            </div>

            {/* FORMULAIRE D'AJOUT RAPIDE ENRICHI */}
            {!isWeekLocked ? (
              <div className={`crm-task-form-card form-${selectedDay.toLowerCase()}`}>
                <div className="crm-task-form-header">
                  <div className="crm-form-badge-title">
                    <div className="crm-form-icon-pill">
                      <Sparkles size={18} />
                    </div>
                    <div>
                      <h4 className="crm-form-title-text">Ajouter une nouvelle tâche / activité</h4>
                      <p className="crm-form-subtitle-text">Enregistrez vos réalisations et points clés pour la consolidation de fin de semaine</p>
                    </div>
                  </div>

                  <span style={{ 
                    fontSize: '0.78rem', 
                    fontWeight: 700, 
                    padding: '4px 10px', 
                    borderRadius: '20px', 
                    background: 'var(--color-surface-alt)',
                    color: 'var(--color-text-muted)',
                    border: '1px solid var(--color-border)'
                  }}>
                    Jour : <strong>{selectedDay}</strong>
                  </span>
                </div>

                {/* Suggestions d'amorçage rapide */}
                <div className="crm-quick-tags-container">
                  <span className="crm-quick-tags-label">💡 Modèles rapides :</span>
                  {QUICK_SUGGESTIONS.map(s => (
                    <button
                      key={s.label}
                      type="button"
                      className="crm-quick-tag-chip"
                      onClick={() => {
                        setTaskTitle(prev => prev ? `${prev} - ${s.prefix}` : s.prefix);
                      }}
                      title={`Insérer "${s.prefix}" dans le titre`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>

                <form onSubmit={handleAddTask} className="crm-form-grid">
                  {/* Titre de l'activité */}
                  <div className="crm-form-field col-full">
                    <label className="crm-form-label">
                      <span>Titre de l'activité <span className="required">*</span></span>
                      {taskTitle.length > 0 && <span className="optional-badge">{taskTitle.length} car.</span>}
                    </label>
                    <div className="crm-input-with-icon">
                      <FileText size={16} className="crm-input-prefix-icon" />
                      <input 
                        className="crm-input-styled" 
                        placeholder="Ex: Rendez-vous client BOA, Conception maquette catalogue, Livraison commande #402..."
                        value={taskTitle}
                        onChange={e => setTaskTitle(e.target.value)}
                        required
                        autoFocus={false}
                      />
                    </div>
                  </div>

                  {/* Description détaillée */}
                  <div className="crm-form-field col-full">
                    <label className="crm-form-label">
                      <span>Description détaillée de l'activité</span>
                      <span className="optional-badge">Optionnel</span>
                    </label>
                    <div className="crm-input-with-icon crm-textarea-wrapper">
                      <AlignLeft size={16} className="crm-input-prefix-icon" />
                      <textarea 
                        className="crm-textarea-styled" 
                        rows={2}
                        placeholder="Détails de l'intervention, points abordés, actions menées, résultat obtenu..."
                        value={taskDescription}
                        onChange={e => setTaskDescription(e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Catégorie */}
                  <div className="crm-form-field">
                    <label className="crm-form-label">
                      <span>Catégorie</span>
                    </label>
                    <div className="crm-input-with-icon">
                      <Tag size={16} className="crm-input-prefix-icon" />
                      <select 
                        className="crm-select-styled" 
                        value={taskCategory} 
                        onChange={e => setTaskCategory(e.target.value)}
                      >
                        {TASK_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                  </div>

                  {/* Statut */}
                  <div className="crm-form-field">
                    <label className="crm-form-label">
                      <span>Statut</span>
                    </label>
                    <div className="crm-input-with-icon">
                      <CheckCircle2 size={16} className="crm-input-prefix-icon" />
                      <select 
                        className="crm-select-styled" 
                        value={taskStatus} 
                        onChange={e => setTaskStatus(e.target.value as V2Task['status'])}
                      >
                        <option value="Effectuée">✅ Terminée / Effectuée</option>
                        <option value="En cours">⏳ En cours</option>
                        <option value="Restante">📌 En attente / Restante</option>
                        <option value="Bloquée">⚠️ Bloquée</option>
                      </select>
                    </div>
                  </div>

                  {/* Difficulté / Point bloquant */}
                  <div className="crm-form-field">
                    <label className="crm-form-label">
                      <span>Difficulté / Point bloquant</span>
                      <span className="optional-badge">Optionnel</span>
                    </label>
                    <div className="crm-input-with-icon">
                      <AlertTriangle size={16} className="crm-input-prefix-icon" />
                      <input 
                        className="crm-input-styled" 
                        placeholder="Ex: Attente retour client, validation technique..."
                        value={taskDifficulty}
                        onChange={e => setTaskDifficulty(e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Temps passé */}
                  <div className="crm-form-field">
                    <label className="crm-form-label">
                      <span>Temps passé</span>
                      <span className="optional-badge">Optionnel</span>
                    </label>
                    <div className="crm-input-with-icon">
                      <Clock size={16} className="crm-input-prefix-icon" />
                      <input 
                        className="crm-input-styled" 
                        placeholder="Ex: 1h30, 45 min, 3h..."
                        value={taskTimeSpent}
                        onChange={e => setTaskTimeSpent(e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Footer d'action */}
                  <div className="crm-form-actions-footer">
                    {(taskTitle || taskDescription || taskDifficulty || taskTimeSpent) ? (
                      <button
                        type="button"
                        className="crm-btn-reset-form"
                        onClick={() => {
                          setTaskTitle('');
                          setTaskDescription('');
                          setTaskDifficulty('');
                          setTaskTimeSpent('');
                        }}
                      >
                        <RotateCcw size={13} style={{ marginRight: '4px', verticalAlign: 'middle' }} /> Effacer le formulaire
                      </button>
                    ) : <div />}

                    <button type="submit" className="crm-btn-submit-activity">
                      <Plus size={18} /> Enregistrer l'activité
                    </button>
                  </div>
                </form>
              </div>
            ) : (
              <div style={{ padding: '16px', background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                <Lock size={20} color="#059669" />
                <div>
                  <strong style={{ color: '#065F46' }}>Semaine officielle verrouillée</strong>
                  <p style={{ margin: '2px 0 0', color: '#047857', fontSize: '0.85rem' }}>
                    Votre rapport hebdomadaire pour cette semaine a été soumis à la Direction. Les activités quotidiennes sont verrouillées.
                  </p>
                </div>
              </div>
            )}

            {/* LISTE DES ACTIVITÉS DU JOUR */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
                <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--color-text)' }}>
                  Liste des activités enregistrées ({dailyTasks.length})
                </h4>
                {dailyTasks.length > 0 && !isWeekLocked && currentDailyReport && (
                  <button
                    className="btn btn-secondary"
                    style={{ fontSize: '0.8rem', padding: '4px 10px', color: '#DC2626' }}
                    onClick={handleClearDay}
                    title={`Supprimer toutes les activités du ${selectedDay}`}
                  >
                    <Trash2 size={14} style={{ marginRight: '4px' }} /> Vider le jour
                  </button>
                )}
              </div>

              {dailyTasks.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '36px 16px', background: 'var(--color-background)', borderRadius: '10px', border: '1px dashed var(--color-border)', color: 'var(--color-text-muted)' }}>
                  <Clock size={36} style={{ opacity: 0.4, marginBottom: '8px' }} />
                  <p style={{ margin: 0, fontWeight: 500 }}>Aucune activité enregistrée pour ce {selectedDay}.</p>
                  <p style={{ margin: '4px 0 0', fontSize: '0.82rem', opacity: 0.8 }}>Utilisez le formulaire ci-dessus pour ajouter vos réalisations.</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {dailyTasks.map((t, idx) => {
                    const hasSubtitle = t.title && t.description && t.title.trim() !== t.description.trim();
                    const displayTitle = t.title || t.description;

                    return (
                      <div 
                        key={t.id || idx}
                        style={{
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          padding: '14px 18px', borderRadius: '10px', background: 'var(--color-background)',
                          border: '1px solid var(--color-border)', flexWrap: 'wrap', gap: '12px',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', flex: 1, minWidth: '240px' }}>
                          <button 
                            onClick={() => handleToggleTaskStatus(t.id)}
                            disabled={isWeekLocked}
                            style={{ background: 'none', border: 'none', cursor: isWeekLocked ? 'default' : 'pointer', padding: 0, marginTop: '2px' }}
                            title="Cliquer pour changer de statut"
                          >
                            {t.status === 'Effectuée' && <CheckCircle size={20} color="#10B981" />}
                            {t.status === 'En cours' && <Clock size={20} color="#3B82F6" />}
                            {t.status === 'Restante' && <AlertCircle size={20} color="#F59E0B" />}
                            {t.status === 'Bloquée' && <AlertCircle size={20} color="#EF4444" />}
                          </button>

                          <div>
                            <div style={{ fontWeight: 600, fontSize: '0.95rem', textDecoration: t.status === 'Effectuée' ? 'line-through' : 'none', color: t.status === 'Effectuée' ? 'var(--color-text-muted)' : 'var(--color-text)' }}>
                              {displayTitle}
                            </div>
                            {hasSubtitle && (
                              <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginTop: '3px' }}>
                                {t.description}
                              </div>
                            )}
                            <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: '5px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                              {t.category && <span style={{ background: 'var(--color-card)', padding: '2px 8px', borderRadius: '4px', border: '1px solid var(--color-border)', fontWeight: 600 }}>🏷️ {t.category}</span>}
                              {t.difficulty && <span style={{ color: '#EF4444', fontWeight: 500 }}>⚠️ Difficulté : {t.difficulty}</span>}
                              {t.timeSpent && <span>⏱️ Durée : {t.timeSpent}</span>}
                            </div>
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span 
                            onClick={() => handleToggleTaskStatus(t.id)}
                            style={{
                              fontSize: '0.75rem', fontWeight: 700, padding: '4px 10px', borderRadius: '12px', cursor: isWeekLocked ? 'default' : 'pointer',
                              background: t.status === 'Effectuée' ? '#ECFDF5' : t.status === 'En cours' ? '#EFF6FF' : t.status === 'Bloquée' ? '#FEF2F2' : '#FFFBEB',
                              color: t.status === 'Effectuée' ? '#059669' : t.status === 'En cours' ? '#2563EB' : t.status === 'Bloquée' ? '#DC2626' : '#D97706',
                              border: '1px solid currentColor'
                            }}
                          >
                            {t.status}
                          </span>

                          {!isWeekLocked && (
                            <button className="icon-button text-error" onClick={() => handleDeleteTask(t.id)} title="Supprimer">
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ================= ONGLET 2 : MON RAPPORT HEBDOMADAIRE ================= */}
      {!showSupervision && activeTab === 'report' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* BANDEAU D'ÉTAT DU RAPPORT */}
          <div className="card" style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', borderLeft: isWeekLocked ? '4px solid #10B981' : '4px solid #F59E0B' }}>
            <div>
              <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>STATUT DU RAPPORT</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: isWeekLocked ? '#059669' : '#D97706' }}>
                {currentWeeklyReport?.status === 'Validé' ? '✅ Validé par la Direction' : currentWeeklyReport?.status === 'Soumis' ? '🔒 Soumis à la Direction' : '📝 Brouillon en préparation'}
              </div>
              {currentWeeklyReport?.submittedAt && (
                <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                  Soumis le {new Date(currentWeeklyReport.submittedAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {!isWeekLocked && (
                <button className="btn btn-secondary" onClick={handleConsolidateWeek} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  🔄 Importer les activités journalières
                </button>
              )}

              <button className="btn btn-secondary" onClick={() => handlePreviewPdf()} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Eye size={16} /> Aperçu PDF Certifié
              </button>

              {!isWeekLocked ? (
                <>
                  <button className="btn btn-secondary" onClick={handleSaveDraft}>
                    💾 Sauvegarder brouillon
                  </button>
                  <button className="btn btn-primary" onClick={handleSubmitReport} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#059669' }}>
                    <Send size={16} /> SOUMETTRE À LA DIRECTION
                  </button>
                  {currentWeeklyReport && (
                    <button className="btn btn-secondary" onClick={handleDeleteDraft} style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#DC2626' }} title="Supprimer définitivement ce brouillon">
                      <Trash2 size={16} /> Supprimer brouillon
                    </button>
                  )}
                </>
              ) : (
                <button className="btn btn-primary" onClick={() => handlePreviewPdf()} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Download size={16} /> Télécharger Attestation PDF
                </button>
              )}
            </div>
          </div>

          {/* COMMENTAIRE DIRECTION SI PRÉSENT */}
          {currentWeeklyReport?.directorComment && (
            <div className="card" style={{ padding: '16px 20px', background: '#EFF6FF', border: '1px solid #BFDBFE' }}>
              <div style={{ fontWeight: 'bold', color: '#1E40AF', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <MessageSquare size={16} /> Retour / Annotation de la Direction
              </div>
              <p style={{ margin: '6px 0 0', color: '#1E3A8A', fontSize: '0.95rem' }}>
                {currentWeeklyReport.directorComment}
              </p>
            </div>
          )}

          {/* CONTENU DU RAPPORT */}
          <div className="card" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* OBJECTIFS DE LA SEMAINE */}
              <div>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: '6px', fontSize: '0.95rem' }}>
                  1. Objectifs initiaux de la semaine
                </label>
                <textarea
                  className="table-input"
                  rows={2}
                  placeholder="Quels étaient les objectifs fixés pour cette semaine ?"
                  value={weeklyObjectives}
                  onChange={e => setWeeklyObjectives(e.target.value)}
                  disabled={isWeekLocked}
                  style={{ width: '100%', resize: 'vertical' }}
                />
              </div>

              {/* SYNTHÈSE & RÉALISATIONS CLÉS */}
              <div>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: '6px', fontSize: '0.95rem' }}>
                  2. Synthèse globale & Réalisations clés accomplies
                </label>
                <textarea
                  className="table-input"
                  rows={4}
                  placeholder="Détaillez les principaux résultats concrets obtenus (contrats signés, livrables, affaires traitées)..."
                  value={achievements}
                  onChange={e => setAchievements(e.target.value)}
                  disabled={isWeekLocked}
                  style={{ width: '100%', resize: 'vertical' }}
                />
              </div>

              {/* DIFFICULTÉS & POINTS BLOQUANTS */}
              <div>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: '6px', fontSize: '0.95rem', color: '#DC2626' }}>
                  3. Difficultés & Points d'arbitrage nécessitant l'appui de la Direction
                </label>
                <textarea
                  className="table-input"
                  rows={3}
                  placeholder="Mentionnez les blocages techniques, retards clients ou ressources manquantes..."
                  value={difficulties}
                  onChange={e => setDifficulties(e.target.value)}
                  disabled={isWeekLocked}
                  style={{ width: '100%', resize: 'vertical' }}
                />
              </div>

              {/* PERSPECTIVES & OBJECTIFS S+1 */}
              <div>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: '6px', fontSize: '0.95rem', color: '#2563EB' }}>
                  4. Perspectives & Priorités pour la semaine prochaine (S+1)
                </label>
                <textarea
                  className="table-input"
                  rows={3}
                  placeholder="Quels sont les objectifs prioritaires et dossiers clés prévus pour la semaine prochaine ?"
                  value={nextWeekObjectives}
                  onChange={e => setNextWeekObjectives(e.target.value)}
                  disabled={isWeekLocked}
                  style={{ width: '100%', resize: 'vertical' }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================= ONGLET 3 : MES RAPPORTS SOUMIS (HISTORIQUE) ================= */}
      {!showSupervision && activeTab === 'history' && (
        <div className="card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.05rem' }}>
                Historique de mes rapports hebdomadaires
              </h3>
              <p style={{ margin: '3px 0 0', fontSize: '0.82rem', color: 'var(--color-text-muted)' }}>
                Archivage automatique par semaine : les semaines closes sont marquées « 📦 Archivée » et repliées par défaut.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              <span className="badge-status bg-primary" style={{ padding: '4px 10px', fontSize: '0.8rem' }}>
                {myReportsByWeek.length} semaine(s)
              </span>
              <span className="badge-status bg-warning" style={{ padding: '4px 10px', fontSize: '0.8rem' }}>
                📦 {myReportsByWeek.filter(w => w.isArchived).length} archivée(s)
              </span>
            </div>
          </div>

          {myReportsByWeek.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '30px 16px', color: 'var(--color-text-muted)', border: '1px dashed var(--color-border)', borderRadius: '10px' }}>
              <FileText size={36} color="var(--color-text-muted)" style={{ margin: '0 auto 8px', opacity: 0.6 }} />
              <div>Aucun rapport soumis pour le moment.</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {myReportsByWeek.map(group => (
                <WeekArchiveBlock
                  key={group.week}
                  week={group.week}
                  isCurrent={group.isCurrent}
                  isArchived={group.isArchived}
                  expanded={!!expandedWeeks[group.week]}
                  onToggle={() => toggleWeek(group.week)}
                  badges={(
                    <span className="badge-status bg-info" style={{ padding: '3px 9px', fontSize: '0.75rem' }}>
                      {group.reports.length} rapport(s)
                    </span>
                  )}
                >
                  <table className="data-table responsive-table">
                    <thead>
                      <tr>
                        <th>Date de soumission</th>
                        <th>Statut</th>
                        <th>Retour Direction</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.reports.map(rep => (
                        <tr key={rep.id}>
                          <td data-label="Date de soumission">
                            {rep.submittedAt ? new Date(rep.submittedAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Non soumis'}
                          </td>
                          <td data-label="Statut">
                            <span className={`badge-status ${rep.status === 'Validé' ? 'bg-success' : rep.status === 'Soumis' ? 'bg-info' : 'bg-warning'}`}>
                              {rep.status}
                            </span>
                          </td>
                          <td data-label="Retour Direction">
                            {rep.directorComment ? (
                              <span style={{ fontSize: '0.85rem', color: '#1E40AF' }}>💬 {rep.directorComment}</span>
                            ) : (
                              <span style={{ color: 'var(--color-text-muted)' }}>-</span>
                            )}
                          </td>
                          <td data-label="Actions">
                            <div style={{ display: 'flex', gap: '6px' }}>
                              <button 
                                className="btn btn-secondary" 
                                style={{ fontSize: '0.8rem', padding: '4px 8px' }}
                                onClick={() => handlePreviewPdf(rep)}
                                title="Aperçu / Télécharger PDF"
                              >
                                <Eye size={14} style={{ marginRight: '4px' }} /> PDF
                              </button>
                              {rep.status === 'Brouillon' && (
                                <button
                                  className="btn btn-secondary"
                                  style={{ fontSize: '0.8rem', padding: '4px 8px', color: '#DC2626' }}
                                  onClick={() => {
                                    confirm({
                                      title: 'Supprimer ce brouillon',
                                      message: `Supprimer définitivement le brouillon de la semaine du ${new Date(normWeek(rep.weekStart) + 'T00:00:00').toLocaleDateString('fr-FR')} ?`,
                                      confirmLabel: 'Supprimer',
                                      onConfirm: async () => {
                                        await deleteV2WeeklyReport(rep.id);
                                        toast.success('Brouillon supprimé.');
                                      }
                                    });
                                  }}
                                  title="Supprimer ce brouillon"
                                >
                                  <Trash2 size={14} style={{ marginRight: '4px' }} /> Supprimer
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </WeekArchiveBlock>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ================= COCKPIT SUPERVISION DIRECTION : RAPPORTS ÉQUIPE ================= */}
      {showSupervision && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* COCKPIT KPIS DIRECTION */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
            <div className="card" style={{ padding: '16px' }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>EFFECTIF ATTENDU</div>
              <div style={{ fontSize: '1.6rem', fontWeight: 'bold', marginTop: '4px' }}>{activeStaff.length}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '2px' }}>Collaborateurs actifs</div>
            </div>

            <div className="card" style={{ padding: '16px' }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>RAPPORTS REÇUS</div>
              <div style={{ fontSize: '1.6rem', fontWeight: 'bold', color: '#059669', marginTop: '4px' }}>
                {submittedStaffIds.length}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#059669', marginTop: '2px' }}>Rapports officiels soumis</div>
            </div>

            <div className="card" style={{ padding: '16px' }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>EN ATTENTE / RETARDATAIRES</div>
              <div style={{ fontSize: '1.6rem', fontWeight: 'bold', color: pendingStaff.length > 0 ? '#DC2626' : '#059669', marginTop: '4px' }}>
                {pendingStaff.length}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '2px' }}>Rapports non encore soumis</div>
            </div>

            <div className="card" style={{ padding: '16px' }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>TAUX DE COMPLÉTION</div>
              <div style={{ fontSize: '1.6rem', fontWeight: 'bold', color: completionRate >= 80 ? '#059669' : '#D97706', marginTop: '4px' }}>
                {completionRate}%
              </div>
              <div style={{ width: '100%', height: '6px', background: 'var(--color-border)', borderRadius: '3px', marginTop: '6px', overflow: 'hidden' }}>
                <div style={{ width: `${completionRate}%`, height: '100%', background: completionRate >= 80 ? '#10B981' : '#F59E0B' }} />
              </div>
            </div>
          </div>

          {/* BARRE D'ACTIONS DIRECTION & FILTRES */}
          <div className="card" style={{ padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', flex: 1 }}>
              <div style={{ position: 'relative', minWidth: '220px' }}>
                <Search size={16} style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--color-text-muted)' }} />
                <input 
                  className="table-input" 
                  placeholder="Rechercher un collaborateur..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  style={{ paddingLeft: '32px' }}
                />
              </div>

              <select className="table-input" value={serviceFilter} onChange={e => setServiceFilter(e.target.value)}>
                <option value="ALL">Tous les départements / services</option>
                {services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>

              <select className="table-input" value={weekFilter} onChange={e => setWeekFilter(e.target.value)} title="Filtrer les archives par semaine">
                <option value="ALL">📅 Toutes les semaines ({allSubmittedReports.length})</option>
                {availableWeeks.map(w => <option key={w.week} value={w.week}>{w.label}</option>)}
              </select>

              <select className="table-input" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                <option value="ALL">Tous les statuts</option>
                <option value="SOUMIS">📩 Reçus à valider ({allSubmittedReports.filter(r => r.status === 'Soumis').length})</option>
                <option value="Validé">✅ Validés ({allSubmittedReports.filter(r => r.status === 'Validé').length})</option>
                <option value="Relu">👁️ Relus ({allSubmittedReports.filter(r => r.status === 'Relu').length})</option>
                <option value="ATTENTE">⏳ En Attente ({pendingStaff.length})</option>
              </select>
            </div>

            {pendingStaff.length > 0 && (
              <button 
                className="btn btn-primary" 
                onClick={handleRemindAllPending}
                style={{ background: '#DC2626', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Bell size={16} /> Relancer les retardataires ({pendingStaff.length})
              </button>
            )}
          </div>

          {/* 1. SECTION PRINCIPALE : ARCHIVES DES RAPPORTS SOUMIS PAR L'ÉQUIPE */}
          <div className="card" style={{ padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <ClipboardCheck size={20} color="#7C3AED" /> Archives — Rapports Soumis par l'Équipe ({filteredSubmittedReports.length})
                </h3>
                <p style={{ margin: '3px 0 0', fontSize: '0.82rem', color: 'var(--color-text-muted)' }}>
                  {weekFilter === 'ALL'
                    ? "Historique des comptes-rendus transmis à la Direction, archivé et regroupé par semaine — cliquez sur une semaine pour déplier son contenu"
                    : `Consultation de l'archive : semaine du ${new Date(normWeek(weekFilter) + 'T00:00:00').toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}`}
                </p>
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                {weekFilter !== 'ALL' && (
                  <button className="btn btn-secondary" style={{ fontSize: '0.8rem', padding: '4px 10px' }} onClick={() => setWeekFilter('ALL')}>
                    ✕ Toutes les semaines
                  </button>
                )}
                <button
                  className="btn btn-secondary"
                  style={{ fontSize: '0.8rem', padding: '4px 10px' }}
                  onClick={() => setWeekFilter(normWeek(currentWeekStart))}
                  title="Filtrer les archives sur la semaine sélectionnée ci-dessus"
                >
                  📅 Semaine affichée ci-dessus
                </button>
                {submittedByWeek.length > 1 && (
                  <>
                    <button className="btn btn-secondary" style={{ fontSize: '0.8rem', padding: '4px 10px' }} onClick={expandAllWeeks} title="Déplier toutes les semaines d'archive">
                      ⬇️ Tout déplier
                    </button>
                    <button className="btn btn-secondary" style={{ fontSize: '0.8rem', padding: '4px 10px' }} onClick={collapseAllWeeks} title="Replier toutes les semaines d'archive">
                      ⬆️ Tout replier
                    </button>
                  </>
                )}
                <span className="badge-status bg-primary" style={{ padding: '4px 10px', fontSize: '0.8rem' }}>
                  {allSubmittedReports.filter(r => r.status === 'Soumis' || r.status === 'Relu').length} en attente de validation
                </span>
                <span className="badge-status bg-warning" style={{ padding: '4px 10px', fontSize: '0.8rem' }}>
                  📦 {submittedByWeek.filter(g => isWeekClosed(g.week)).length} semaine(s) archivée(s)
                </span>
              </div>
            </div>

            {paginatedWeekGroups.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--color-text-muted)', border: '1px dashed var(--color-border)', borderRadius: '10px' }}>
                <FileText size={36} color="var(--color-text-muted)" style={{ margin: '0 auto 8px', opacity: 0.6 }} />
                <div>Aucun rapport soumis trouvé pour ces critères{weekFilter !== 'ALL' ? ' pour cette semaine d\'archive' : ''}.</div>
                {(searchQuery || serviceFilter !== 'ALL' || statusFilter !== 'ALL' || weekFilter !== 'ALL') && (
                  <button
                    className="btn btn-secondary"
                    style={{ fontSize: '0.8rem', padding: '4px 12px', marginTop: '10px' }}
                    onClick={() => { setSearchQuery(''); setServiceFilter('ALL'); setStatusFilter('ALL'); setWeekFilter('ALL'); }}
                  >
                    Réinitialiser les filtres
                  </button>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {paginatedWeekGroups.map(group => (
                  <WeekArchiveBlock
                    key={group.week}
                    week={group.week}
                    isCurrent={group.isCurrent}
                    isArchived={isWeekClosed(group.week)}
                    expanded={!!expandedWeeks[group.week]}
                    onToggle={() => toggleWeek(group.week)}
                    badges={(
                      <>
                        <span className="badge-status bg-primary" style={{ padding: '3px 9px', fontSize: '0.75rem' }}>
                          {group.reports.length} rapport(s)
                        </span>
                        {group.pendingCount > 0 && (
                          <span className="badge-status bg-info" style={{ padding: '3px 9px', fontSize: '0.75rem' }}>
                            📩 {group.pendingCount} à valider
                          </span>
                        )}
                        {group.validatedCount > 0 && (
                          <span className="badge-status bg-success" style={{ padding: '3px 9px', fontSize: '0.75rem' }}>
                            ✅ {group.validatedCount} validé(s)
                          </span>
                        )}
                      </>
                    )}
                  >
                    <table className="data-table responsive-table">
                      <thead>
                        <tr>
                          <th>Collaborateur</th>
                          <th>Département</th>
                          <th>Semaine concernée</th>
                          <th>Date de soumission</th>
                          <th>Statut</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.reports.map(renderArchiveRow)}
                        {group.reports.length === 0 && (
                          <tr>
                            <td colSpan={6} style={{ textAlign: 'center', padding: '20px', color: 'var(--color-text-muted)' }}>
                              Aucun rapport pour cette semaine.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </WeekArchiveBlock>
                ))}
              </div>
            )}

            {archiveTotalPages > 1 && (
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', marginTop: '14px', flexWrap: 'wrap' }}>
                <button className="btn btn-secondary" style={{ fontSize: '0.8rem', padding: '4px 10px' }} disabled={safeArchivePage <= 1} onClick={() => setArchivePage(p => Math.max(1, p - 1))}>
                  ← Précédent
                </button>
                <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                  Page {safeArchivePage} / {archiveTotalPages} — {submittedByWeek.length} semaine(s) archivée(s), {filteredSubmittedReports.length} rapport(s)
                </span>
                <button className="btn btn-secondary" style={{ fontSize: '0.8rem', padding: '4px 10px' }} disabled={safeArchivePage >= archiveTotalPages} onClick={() => setArchivePage(p => Math.min(archiveTotalPages, p + 1))}>
                  Suivant →
                </button>
              </div>
            )}
          </div>

          {/* 2. SECTION SUIVI DE COMPLÉTION & RELANCES HEBDOMADAIRES */}
          <div className="card" style={{ padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.05rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Users size={18} color="var(--color-primary)" /> Suivi de Complétion — Semaine du {new Date(normWeek(currentWeekStart) + 'T00:00:00').toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
                  {isWeekClosed(currentWeekStart) && (
                    <span className="badge-status bg-warning" style={{ padding: '4px 10px', fontSize: '0.78rem' }}>
                      📦 Semaine close (archivée)
                    </span>
                  )}
                </h3>
                <p style={{ margin: '3px 0 0', fontSize: '0.82rem', color: 'var(--color-text-muted)' }}>
                  {isWeekClosed(currentWeekStart)
                    ? 'Semaine archivée automatiquement : les rapports de cette semaine sont conservés dans l\'archive et sortent du suivi en cours.'
                    : 'État de soumission collaborateur par collaborateur pour la semaine en cours'}
                </p>
              </div>
            </div>

            <div className="table-responsive">
              <table className="data-table responsive-table">
                <thead>
                  <tr>
                    <th>Collaborateur</th>
                    <th>Département</th>
                    <th>Rôle</th>
                    <th>Statut Semaine</th>
                    <th>Date Soumission</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStaffList.map(member => {
                    const memberReport = weeklyReportsForSelectedWeek.find(r => r.authorId === member.id);
                    const isSubmitted = memberReport?.status === 'Soumis' || memberReport?.status === 'Validé' || memberReport?.status === 'Relu';
                    const serviceName = services.find(s => s.id === member.serviceId)?.name || 'Général';

                    return (
                      <tr key={member.id}>
                        <td data-label="Collaborateur">
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {member.photo ? (
                              <img src={member.photo} alt={member.name} style={{ width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover' }} />
                            ) : (
                              <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--color-primary)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '0.85rem' }}>
                                {member.name.charAt(0).toUpperCase()}
                              </div>
                            )}
                            <div>
                              <strong>{member.name}</strong>
                              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{member.email}</div>
                            </div>
                          </div>
                        </td>
                        <td data-label="Département">{serviceName}</td>
                        <td data-label="Rôle">{member.role}</td>
                        <td data-label="Statut Semaine">
                          {isSubmitted ? (
                            <span className={`badge-status ${memberReport?.status === 'Validé' ? 'bg-success' : 'bg-info'}`}>
                              {memberReport?.status === 'Validé' ? '✅ Validé' : '📩 Reçu (Soumis)'}
                            </span>
                          ) : (
                            <span className="badge-status bg-error" style={{ background: '#FEE2E2', color: '#DC2626' }}>
                              ⏳ En attente
                            </span>
                          )}
                        </td>
                        <td data-label="Date Soumission">
                          {memberReport?.submittedAt ? new Date(memberReport.submittedAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '-'}
                        </td>
                        <td data-label="Actions">
                          <div style={{ display: 'flex', gap: '6px' }}>
                            {isSubmitted && memberReport ? (
                              <>
                                <button 
                                  className="btn btn-secondary" 
                                  style={{ fontSize: '0.8rem', padding: '4px 8px' }}
                                  onClick={() => handlePreviewPdf(memberReport)}
                                  title="Consulter / Télécharger PDF"
                                >
                                  <Eye size={14} style={{ marginRight: '4px' }} /> PDF
                                </button>
                                <button 
                                  className="btn btn-primary" 
                                  style={{ fontSize: '0.8rem', padding: '4px 8px', background: '#7C3AED' }}
                                  onClick={() => { setReviewingReport(memberReport); setReviewComment(memberReport.directorComment || ''); }}
                                  title="Annoter et Valider"
                                >
                                  <MessageSquare size={14} style={{ marginRight: '4px' }} /> Annoter
                                </button>
                              </>
                            ) : (
                              <button 
                                className="btn btn-secondary" 
                                style={{ fontSize: '0.8rem', padding: '4px 8px', color: '#DC2626' }}
                                onClick={async () => {
                                  await sendWeeklyReportReminder([member.id], currentWeekStart);
                                  toast.success(`Rappel envoyé à ${member.name}.`);
                                }}
                                title="Envoyer un rappel individuel"
                              >
                                <Bell size={14} style={{ marginRight: '4px' }} /> Relancer
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE VALIDATION & ANNOTATION DIRECTION */}
      {reviewingReport && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div className="card" style={{ maxWidth: '550px', width: '100%', padding: '24px' }}>
            <h3 style={{ margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <MessageSquare size={20} color="#7C3AED" /> Retour & Validation de la Direction
            </h3>

            <p style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)' }}>
              Rapport de <strong>{users.find(u => u.id === reviewingReport.authorId)?.name}</strong> pour la semaine du {new Date(reviewingReport.weekStart + 'T00:00:00').toLocaleDateString('fr-FR')}.
            </p>

            <div style={{ margin: '16px 0' }}>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.9rem', fontWeight: 600 }}>
                Commentaire / Remarques de la Direction :
              </label>
              <textarea 
                className="table-input"
                rows={4}
                placeholder="Indiquez vos félicitations, points d'amélioration ou directives pour la semaine suivante..."
                value={reviewComment}
                onChange={e => setReviewComment(e.target.value)}
                style={{ width: '100%', resize: 'vertical' }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button className="btn btn-secondary" onClick={() => setReviewingReport(null)}>
                Annuler
              </button>
              <button className="btn btn-primary" onClick={handleValidateReport} style={{ background: '#7C3AED' }}>
                Valider et Enregistrer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* APERÇU PDF CERTIFIÉ MODAL */}
      <ReportPdfPreview preview={preview} onClose={() => setPreview(null)} />
    </div>
  );
}
