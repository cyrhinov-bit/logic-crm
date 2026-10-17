// @ts-ignore
import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

declare var Deno: any;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Les colonnes pos_transactions.date / pos_returns.date sont des TIMESTAMPTZ.
// Comparer avec une date seule ('YYYY-MM-DD') exclut toute la journée de fin,
// on étend donc la borne haute à la fin de journée.
function endOfDay(dateStr: string): string {
  return `${dateStr}T23:59:59.999Z`
}

interface CalculerMontantTheoriquePayload {
  caissier_id: string;
  session_id?: string;
  date_debut?: string;
  date_fin?: string;
}

interface MontantTheorique {
  caissier_id: string;
  session_id: string | null;
  periode: {
    date_debut: string;
    date_fin: string;
  };
  initial_fund: number;
  ventes_especes: number;
  ventes_mobile_money: number;
  ventes_carte: number;
  remboursements_especes: number;
  versements_deja_confirmees: number;
  montant_theorique: number;
  montant_disponible: number;
  details: {
    nombre_transactions: number;
    nombre_remboursements: number;
    nombre_versements_anterieurs: number;
  };
}

// ============================================================================
// ACTION : Calculer le montant théorique à reverser
// ============================================================================
async function calculerMontantTheorique(
  supabaseAdmin: any,
  payload: CalculerMontantTheoriquePayload
): Promise<MontantTheorique> {
  // Déterminer la période
  let dateDebut: string;
  let dateFin: string;
  let sessionId: string | null = payload.session_id || null;

  if (sessionId) {
    // Récupérer la session pour obtenir les dates et le fond initial
    const { data: session } = await supabaseAdmin
      .from('pos_cash_sessions')
      .select('*')
      .eq('id', sessionId)
      .single();

    if (!session) {
      throw new Error('Session de caisse introuvable');
    }

    dateDebut = session.opened_at.split('T')[0];
    dateFin = session.closed_at ? session.closed_at.split('T')[0] : new Date().toISOString().split('T')[0];
  } else if (payload.date_debut && payload.date_fin) {
    dateDebut = payload.date_debut;
    dateFin = payload.date_fin;
  } else {
    // Par défaut : aujourd'hui
    const today = new Date().toISOString().split('T')[0];
    dateDebut = today;
    dateFin = today;
  }

  // Récupérer le fond initial de la session si disponible
  let initialFund = 0;
  if (sessionId) {
    const { data: session } = await supabaseAdmin
      .from('pos_cash_sessions')
      .select('initial_fund')
      .eq('id', sessionId)
      .single();
    initialFund = session?.initial_fund || 0;
  }

  // Récupérer les transactions de la période
  let transactionsQuery = supabaseAdmin
    .from('pos_transactions')
    .select('*, pos_payments(*)')
    .eq('cashier_id', payload.caissier_id)
    .eq('status', 'Validée')
    .gte('date', dateDebut)
    .lte('date', endOfDay(dateFin));

  if (sessionId) {
    transactionsQuery = transactionsQuery.eq('session_id', sessionId);
  }

  const { data: transactions, error: txError } = await transactionsQuery;
  if (txError) throw txError;

  // Calculer les ventes par méthode de paiement
  let ventesEspeces = 0;
  let ventesMobileMoney = 0;
  let ventesCarte = 0;

  for (const tx of transactions || []) {
    for (const payment of tx.pos_payments || []) {
      switch (payment.method) {
        case 'Espèces':
          ventesEspeces += Number(payment.amount);
          break;
        case 'Mixte':
          // Pour les paiements mixtes, on prend le montant total comme espèces
          // (simplification - en production, il faudrait un champ montant_especes)
          ventesEspeces += Number(payment.amount);
          break;
        case 'Mobile Money':
          ventesMobileMoney += Number(payment.amount);
          break;
        case 'Carte':
          ventesCarte += Number(payment.amount);
          break;
      }
    }
  }

  // Récupérer les remboursements en espèces
  const { data: remboursements, error: remError } = await supabaseAdmin
    .from('pos_returns')
    .select('*')
    .eq('status', 'Traité')
    .gte('date', dateDebut)
    .lte('date', endOfDay(dateFin));

  if (remError) throw remError;

  let remboursementsEspeces = 0;
  for (const rem of remboursements || []) {
    if (rem.refund_method !== 'Mobile Money') {
      remboursementsEspeces += Number(rem.total_refund || 0);
    }
  }

  // Calculer les versements déjà confirmés pour ce caissier sur cette période
  // (pour éviter le double comptage)
  const { data: versementsExistants, error: verError } = await supabaseAdmin
    .from('encaissement_dossiers')
    .select('montant_confirme, encaissement_transactions(transaction_id)')
    .eq('caissier_id', payload.caissier_id)
    .in('statut', ['confirme', 'confirme_apres_arbitrage'])
    .gte('date_versement', dateDebut)
    .lte('date_versement', dateFin);

  if (verError) throw verError;

  let versementsDejaConfirmees = 0;
  for (const ver of versementsExistants || []) {
    versementsDejaConfirmees += Number(ver.montant_confirme || 0);
  }

  // Calcul du montant théorique
  const montantTheorique = initialFund + ventesEspeces - remboursementsEspeces;
  const montantDisponible = montantTheorique - versementsDejaConfirmees;

  return {
    caissier_id: payload.caissier_id,
    session_id: sessionId,
    periode: {
      date_debut: dateDebut,
      date_fin: dateFin,
    },
    initial_fund: initialFund,
    ventes_especes: ventesEspeces,
    ventes_mobile_money: ventesMobileMoney,
    ventes_carte: ventesCarte,
    remboursements_especes: remboursementsEspeces,
    versements_deja_confirmees: versementsDejaConfirmees,
    montant_theorique: montantTheorique,
    montant_disponible: montantDisponible,
    details: {
      nombre_transactions: transactions?.length || 0,
      nombre_remboursements: remboursements?.length || 0,
      nombre_versements_anterieurs: versementsExistants?.length || 0,
    },
  };
}

// ============================================================================
// ACTION : Récupérer les transactions disponibles pour un nouveau versement
// ============================================================================
async function getTransactionsDisponibles(
  supabaseAdmin: any,
  payload: { caissier_id: string; date_debut?: string; date_fin?: string }
) {
  let dateDebut = payload.date_debut || new Date().toISOString().split('T')[0];
  let dateFin = payload.date_fin || dateDebut;

  // Récupérer les transactions non encore incluses dans un versement
  const { data: transactions, error } = await supabaseAdmin
    .from('pos_transactions')
    .select('*, pos_payments(*)')
    .eq('cashier_id', payload.caissier_id)
    .eq('status', 'Validée')
    .gte('date', dateDebut)
    .lte('date', endOfDay(dateFin))
    .order('date', { ascending: true });

  if (error) throw error;

  // Filtrer les transactions déjà incluses dans un versement
  const { data: transactionsUtilisees } = await supabaseAdmin
    .from('encaissement_transactions')
    .select('transaction_id');

  const idsUtilises = new Set((transactionsUtilisees || []).map((t: any) => t.transaction_id));
  const transactionsDisponibles = (transactions || []).filter((t: any) => !idsUtilisees.has(t.id));

  return transactionsDisponibles;
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
      case 'calculer_montant_theorique':
        result = await calculerMontantTheorique(supabaseAdmin, payload);
        break;
      case 'get_transactions_disponibles':
        result = await getTransactionsDisponibles(supabaseAdmin, payload);
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
