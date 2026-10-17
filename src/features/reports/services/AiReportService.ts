import { supabase } from '../../../lib/supabase';
import { getUserGeminiKey } from '../../../lib/geminiKey';
import type { V2Task } from '../../../context/AppContext';

export interface AiWeeklySynthesisResult {
  introduction: string;
  activitiesSummary: string;
  achievements: string;
  difficulties: string;
  nextWeekObjectives: string;
  conclusion: string;
}

export async function generateAiWeeklySynthesis(params: {
  tasksByDay: Record<string, V2Task[]>;
  userName: string;
  userId?: string;
  userRole?: string;
  serviceName?: string;
  period: string;
  initialObjectives?: string;
}): Promise<AiWeeklySynthesisResult> {
  const { tasksByDay, userName, userId, userRole, serviceName, period, initialObjectives } = params;

  // Format tasks into structured prompt description
  let tasksFormatted = '';
  const days = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
  
  for (const day of days) {
    const tasks = tasksByDay[day] || [];
    if (tasks.length > 0) {
      tasksFormatted += `\n📅 ${day.toUpperCase()} :\n`;
      tasks.forEach((t, i) => {
        tasksFormatted += `  ${i + 1}. [${t.status}] ${t.description}`;
        if (t.difficulty) tasksFormatted += ` (Difficulté : ${t.difficulty})`;
        if (t.timeSpent) tasksFormatted += ` - Durée : ${t.timeSpent}`;
        tasksFormatted += '\n';
      });
    }
  }

  if (!tasksFormatted.trim()) {
    tasksFormatted = 'Aucune tâche renseignée précisément pour cette semaine.';
  }

  const prompt = `
Tu es un assistant expert en rédaction de comptes-rendus et rapports d'activité professionnels de haut niveau pour l'entreprise HINOV GROUP.
Le collaborateur "${userName}" (Poste : ${userRole || 'Collaborateur'}, Département : ${serviceName || 'Général'}) a enregistré ses tâches quotidiennes pour la période : "${period}".

OBJECTIFS INITIAUX DE LA SEMAINE :
${initialObjectives || 'Non spécifiés'}

JOURNAL DES TÂCHES RÉALISÉES PAR JOUR :
${tasksFormatted}

INSTRUCTIONS DE RÉDACTION STRICTES :
1. Rédige un rapport hebdomadaire valorisant, structuré, précis et direct.
2. Synthétise fidèlement les activités du Lundi au Vendredi sans rien inventer d'extravagant.
3. Extrais les réalisations et résultats clés (ex: contrats signés, livrables finalisés, prospects qualifiés).
4. Mentionne honnêtement les points de blocage ou difficultés rencontrées pour que la Direction puisse apporter son support.
5. Propose 3 à 5 objectifs clairs et réalistes pour la semaine prochaine (semaine N+1).

Génère la réponse au format JSON brut valide (sans bloc markdown) avec exactement ces 6 clés :
{
  "introduction": "Synthèse globale de la semaine en 2-3 phrases valorisantes.",
  "activitiesSummary": "Synthèse détaillée des activités menées par pôle et par jour.",
  "achievements": "Liste à puces des principaux résultats concrets et livrables accomplis.",
  "difficulties": "Difficultés ou points d'arbitrage nécessitant l'appui de la Direction (ou 'Aucun point bloquant majeur à signaler').",
  "nextWeekObjectives": "Plan d'action et objectifs prioritaires pour la semaine prochaine.",
  "conclusion": "Bilan général et état d'avancement des projets."
}
`;

  // 1. Get User's Personal Gemini API Key
  const userApiKey = getUserGeminiKey(userId);

  // If user has provided their own Gemini API key, call Gemini directly
  if (userApiKey) {
    try {
      const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${encodeURIComponent(userApiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              responseMimeType: 'application/json'
            }
          })
        }
      );

      if (geminiRes.ok) {
        const geminiData = await geminiRes.json();
        const textResponse = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (textResponse) {
          const cleanedText = textResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
          const parsed = JSON.parse(cleanedText);
          return {
            introduction: parsed.introduction || parsed.summary || '',
            activitiesSummary: parsed.activitiesSummary || parsed.activities || '',
            achievements: parsed.achievements || '',
            difficulties: parsed.difficulties || 'Aucune difficulté majeure.',
            nextWeekObjectives: parsed.nextWeekObjectives || parsed.perspectives || '',
            conclusion: parsed.conclusion || 'Semaine productive.'
          };
        }
      } else {
        const errorData = await geminiRes.json().catch(() => ({}));
        console.warn('[AiReportService] Gemini Direct API error:', errorData);
      }
    } catch (directErr) {
      console.warn('[AiReportService] Gemini direct call failed, attempting Edge Function fallback :', directErr);
    }
  }

  // 2. Try Supabase Edge Function
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;

    const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-weekly-report`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token || import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        chatHistory: prompt,
        userName,
        period,
        userApiKey
      }),
    });

    if (response.ok) {
      const data = await response.json();
      if (data && (data.introduction || data.activities || data.summary)) {
        return {
          introduction: data.introduction || data.summary || '',
          activitiesSummary: data.activitiesSummary || data.activities || '',
          achievements: data.achievements || '',
          difficulties: data.difficulties || 'Aucune difficulté majeure.',
          nextWeekObjectives: data.nextWeekObjectives || data.perspectives || '',
          conclusion: data.conclusion || 'Semaine productive.'
        };
      }
    }
  } catch (err) {
    console.warn('[AiReportService] Edge function inaccessible, fallback local :', err);
  }

  // 3. Fallback heuristic generator
  const totalTasks = Object.values(tasksByDay).flat();
  const completedTasks = totalTasks.filter(t => t.status === 'Effectuée');
  const blockedTasks = totalTasks.filter(t => t.status === 'Bloquée' || t.difficulty);

  return {
    introduction: `Au cours de la semaine du ${period}, un total de ${totalTasks.length} tâche(s) a été planifié, avec un taux de réalisation de ${totalTasks.length > 0 ? Math.round((completedTasks.length / totalTasks.length) * 100) : 0}%.`,
    activitiesSummary: `Les efforts ont été concentrés sur l'exécution des livrables opérationnels et les échanges clients du Lundi au Vendredi.`,
    achievements: completedTasks.length > 0 
      ? completedTasks.map(t => `• ${t.description}`).join('\n') 
      : '• Traitement des opérations courantes.',
    difficulties: blockedTasks.length > 0 
      ? blockedTasks.map(t => `• ${t.description} ${t.difficulty ? `(${t.difficulty})` : ''}`).join('\n')
      : 'Aucun point de blocage majeur à signaler.',
    nextWeekObjectives: `• Poursuivre le traitement des affaires en cours\n• Assurer le suivi des relances clients\n• Clôturer les livrables restants`,
    conclusion: `Bilan globalement positif avec ${completedTasks.length} action(s) finalisée(s).`
  };
}
