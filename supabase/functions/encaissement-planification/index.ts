// @ts-ignore
import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

declare var Deno: any;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Types
interface FrequencePayload {
  caissier_id?: string;
  frequence_type: 'quotidienne' | 'n_jours' | 'hebdomadaire' | 'bihebdomadaire' | 'mensuelle' | 'personnalisee';
  frequence_n?: number;
  jour_semaine?: number;
  jour_mois?: number;
  heure_limite?: string;
  jours_ouvres_seulement?: boolean;
  versement_partiel_autorise?: boolean;
  date_debut?: string;
  date_fin?: string;
}

interface CalculerEcheancesPayload {
  caissier_id: string;
  date_debut: string;
  date_fin: string;
}

interface VerifierEcheancesPayload {
  date_reference?: string;
}

// Jours fériés francophones courants par défaut (format MM-JJ, sans année)
// L'administrateur pourra adapter cette liste selon le pays via une table dédiée
const JOURS_FERIES_PAR_DEFAUT = [
  '01-01', // Jour de l'An
  '05-01', // Fête du Travail
  '12-25', // Noël
];

// ============================================================================
// UTILITAIRES
// ============================================================================

async function isDirection(supabaseAdmin: any, userId: string): Promise<boolean> {
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .eq('active', true)
    .single();
  
  return ['Directeur', 'Directeur adjoint', 'SuperAdmin'].includes(profile?.role);
}

function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

function isJourFerie(date: Date): boolean {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const key = `${month}-${day}`;
  return JOURS_FERIES_PAR_DEFAUT.includes(key);
}

function isJourOuvre(date: Date, joursOuvresSeulement: boolean): boolean {
  if (!joursOuvresSeulement) return true;
  return !isWeekend(date) && !isJourFerie(date);
}

function getProchainJourOuvre(date: Date, joursOuvresSeulement: boolean): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + 1);
  while (!isJourOuvre(d, joursOuvresSeulement)) {
    d.setDate(d.getDate() + 1);
  }
  return d;
}

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function addWeeks(date: Date, weeks: number): Date {
  return addDays(date, weeks * 7);
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

// ============================================================================
// ACTION : Créer ou mettre à jour une fréquence
// ============================================================================
async function upsertFrequence(supabaseAdmin: any, payload: FrequencePayload, userId: string) {
  const isDir = await isDirection(supabaseAdmin, userId);
  if (!isDir) {
    throw new Error('Seule la direction peut configurer les fréquences');
  }

  const data: any = {
    caissier_id: payload.caissier_id || null,
    frequence_type: payload.frequence_type,
    frequence_n: payload.frequence_n ?? null,
    jour_semaine: payload.jour_semaine !== undefined ? payload.jour_semaine : null,
    jour_mois: payload.jour_mois !== undefined ? payload.jour_mois : null,
    heure_limite: payload.heure_limite || '18:00:00',
    jours_ouvres_seulement: payload.jours_ouvres_seulement ?? true,
    versement_partiel_autorise: payload.versement_partiel_autorise ?? false,
    date_debut: payload.date_debut || formatDate(new Date()),
    date_fin: payload.date_fin || null,
    created_by: userId,
  };

  // Upsert réel : mettre à jour la fréquence existante pour le même périmètre
  // (un caissier donné, ou la fréquence générale quand caissier_id est null)
  let existingQuery = supabaseAdmin
    .from('encaissement_frequences')
    .select('id')
    .order('created_at', { ascending: false })
    .limit(1);

  existingQuery = payload.caissier_id
    ? existingQuery.eq('caissier_id', payload.caissier_id)
    : existingQuery.is('caissier_id', null);

  const { data: existing } = await existingQuery.maybeSingle();

  if (existing?.id) {
    const { data: updated, error } = await supabaseAdmin
      .from('encaissement_frequences')
      .update(data)
      .eq('id', existing.id)
      .select()
      .single();

    if (error) throw error;
    return updated;
  }

  const { data: inserted, error } = await supabaseAdmin
    .from('encaissement_frequences')
    .insert(data)
    .select()
    .single();

  if (error) throw error;
  return inserted;
}

// ============================================================================
// ACTION : Lister les fréquences
// ============================================================================
async function getFrequences(supabaseAdmin: any, userId: string) {
  const isDir = await isDirection(supabaseAdmin, userId);

  let query = supabaseAdmin
    .from('encaissement_frequences')
    .select('*')
    .order('created_at', { ascending: false });

  if (!isDir) {
    // Un caissier ne voit que sa fréquence et la fréquence générale
    query = query.or(`caissier_id.eq.${userId},caissier_id.is.null`);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

// ============================================================================
// ACTION : Supprimer une fréquence
// ============================================================================
async function deleteFrequence(supabaseAdmin: any, payload: { frequence_id: string }, userId: string) {
  const isDir = await isDirection(supabaseAdmin, userId);
  if (!isDir) {
    throw new Error('Seule la direction peut supprimer une fréquence');
  }
  if (!payload.frequence_id) {
    throw new Error('frequence_id manquant');
  }

  const { error } = await supabaseAdmin
    .from('encaissement_frequences')
    .delete()
    .eq('id', payload.frequence_id);

  if (error) throw error;
  return { success: true };
}

// ============================================================================
// ACTION : Lister les échéances d'un caissier sur une période
// ============================================================================
async function getEcheancesCaissier(
  supabaseAdmin: any,
  payload: { caissier_id: string; date_debut: string; date_fin: string },
  userId: string
) {
  const isDir = await isDirection(supabaseAdmin, userId);
  if (!isDir && payload.caissier_id !== userId) {
    throw new Error('Vous ne pouvez consulter que vos propres échéances');
  }
  if (!payload.caissier_id) {
    throw new Error('caissier_id manquant');
  }

  const { data, error } = await supabaseAdmin
    .from('encaissement_echeances')
    .select('*')
    .eq('caissier_id', payload.caissier_id)
    .gte('date_echeance', payload.date_debut)
    .lte('date_echeance', payload.date_fin)
    .order('date_echeance', { ascending: true });

  if (error) throw error;
  return data || [];
}

// ============================================================================
// ACTION : Calculer les échéances pour un caissier
// ============================================================================
async function calculerEcheances(supabaseAdmin: any, payload: CalculerEcheancesPayload, userId: string) {
  const isDir = await isDirection(supabaseAdmin, userId);
  if (!isDir && payload.caissier_id !== userId) {
    throw new Error('Vous ne pouvez calculer les échéances que pour vous-même');
  }

  // Récupérer la fréquence applicable : règle individuelle active > règle générale
  const { data: freqCaissier } = await supabaseAdmin
    .from('encaissement_frequences')
    .select('*')
    .eq('caissier_id', payload.caissier_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  const { data: freqGenerale } = await supabaseAdmin
    .from('encaissement_frequences')
    .select('*')
    .is('caissier_id', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  const frequence = freqCaissier || freqGenerale || {
    frequence_type: 'quotidienne',
    jours_ouvres_seulement: true,
  };

  const joursOuvres = frequence.jours_ouvres_seulement ?? true;
  let currentDate = new Date(payload.date_debut + 'T00:00:00');
  const endDate = new Date(payload.date_fin + 'T23:59:59');
  let count = 0;

  while (currentDate <= endDate) {
    if (isJourOuvre(currentDate, joursOuvres)) {
      await supabaseAdmin
        .from('encaissement_echeances')
        .upsert({
          caissier_id: payload.caissier_id,
          date_echeance: formatDate(currentDate),
          montant_attendu: 0,
          statut: 'en_attente',
          date_calcul: new Date().toISOString(),
        }, {
          onConflict: 'caissier_id,date_echeance',
        });

      count++;
    }

    switch (frequence.frequence_type) {
      case 'quotidienne':
        currentDate = addDays(currentDate, 1);
        break;
      case 'n_jours':
        currentDate = addDays(currentDate, frequence.frequence_n || 1);
        break;
      case 'hebdomadaire':
        currentDate = addWeeks(currentDate, 1);
        break;
      case 'bihebdomadaire':
        currentDate = addWeeks(currentDate, 2);
        break;
      case 'mensuelle':
        currentDate = addMonths(currentDate, 1);
        break;
      default:
        currentDate = addDays(currentDate, 1);
    }
  }

  return { count, frequence };
}

// ============================================================================
// ACTION : Vérifier les échéances en retard et mettre à jour les statuts
// ============================================================================
async function verifierEcheances(supabaseAdmin: any, payload: VerifierEcheancesPayload, userId: string) {
  const isDir = await isDirection(supabaseAdmin, userId);
  if (!isDir) {
    throw new Error('Seule la direction peut vérifier les échéances');
  }

  const dateRef = payload.date_reference || formatDate(new Date());

  const { count, error } = await supabaseAdmin
    .from('encaissement_echeances')
    .update({ statut: 'en_retard' })
    .lt('date_echeance', dateRef)
    .eq('statut', 'en_attente')
    .select();

  if (error) throw error;

  return { mises_a_jour: count || 0, date_reference: dateRef };
}

// ============================================================================
// HANDLER PRINCIPAL
// ============================================================================
serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseAuth = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Non authentifié' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { action, ...payload } = await req.json();

    let result;
    switch (action) {
      case 'upsert_frequence':
        result = await upsertFrequence(supabaseAdmin, payload, user.id);
        break;
      case 'get_frequences':
        result = await getFrequences(supabaseAdmin, user.id);
        break;
      case 'delete_frequence':
        result = await deleteFrequence(supabaseAdmin, payload, user.id);
        break;
      case 'calculer_echeances':
        result = await calculerEcheances(supabaseAdmin, payload, user.id);
        break;
      case 'get_echeances_caissier':
        result = await getEcheancesCaissier(supabaseAdmin, payload, user.id);
        break;
      case 'verifier_echeances':
        result = await verifierEcheances(supabaseAdmin, payload, user.id);
        break;
      default:
        return new Response(JSON.stringify({ error: 'Action inconnue' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        });
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
