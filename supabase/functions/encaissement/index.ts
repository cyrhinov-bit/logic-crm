// @ts-ignore
import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

declare var Deno: any;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Types pour les requêtes
interface CreerDossierPayload {
  caissier_id: string;
  encaisseur_id: string;
  session_id?: string;
  montant_attendu: number;
  date_versement?: string;
}

interface DeclarerMontantPayload {
  dossier_id: string;
  type_declaration: 'caissier_initial' | 'encaisseur_initial' | 'caissier_recompte' | 'encaisseur_recompte';
  montant: number;
  commentaire?: string;
}

interface RecompterPayload {
  dossier_id: string;
  caissier_montant: number;
  encaisseur_montant: number;
  commentaire_caissier?: string;
  commentaire_encaisseur?: string;
}

interface ArbitrerPayload {
  dossier_id: string;
  montant_retenu: number;
  motif: string;
  decision: 'montant_caissier' | 'montant_encaisseur' | 'montant_retenu' | 'annulation';
  commentaire?: string;
}

interface AnnulerDossierPayload {
  dossier_id: string;
  motif: string;
}

// Fonction utilitaire : générer une référence unique
function genererReference(): string {
  const prefix = 'VRS';
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}-${timestamp}-${random}`;
}

// Fonction utilitaire : vérifier si l'utilisateur est direction
async function isDirection(supabaseAdmin: any, userId: string): Promise<boolean> {
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single();
  
  return ['Directeur', 'Directeur adjoint', 'SuperAdmin'].includes(profile?.role);
}

// Fonction utilitaire : enregistrer dans le journal d'audit
async function auditLog(
  supabaseAdmin: any,
  tableName: string,
  recordId: string,
  action: string,
  oldValue: any,
  newValue: any,
  userId: string
) {
  await supabaseAdmin.from('encaissement_audit_log').insert({
    table_name: tableName,
    record_id: recordId,
    action: action,
    ancienne_valeur: oldValue,
    nouvelle_valeur: newValue,
    utilisateur_id: userId,
  });
}

// ============================================================================
// ACTION : Créer un dossier de versement
// ============================================================================
async function creerDossier(supabaseAdmin: any, payload: CreerDossierPayload, userId: string) {
  // Vérifier que le demandeur est le caissier ou la direction
  const isDir = await isDirection(supabaseAdmin, userId);
  if (!isDir && payload.caissier_id !== userId) {
    throw new Error('Seul le caissier ou la direction peut créer un dossier');
  }

  // Vérifier que le caissier et l'encaisseur sont différents
  if (payload.caissier_id === payload.encaisseur_id) {
    throw new Error('Le caissier et l\'encaisseur doivent être différents');
  }

  // Vérifier que l'encaisseur est bien un encaisseur
  const { data: encaisseur } = await supabaseAdmin
    .from('profiles')
    .select('role, active')
    .eq('id', payload.encaisseur_id)
    .single();
  
  if (!encaisseur || encaisseur.role !== 'Encaisseur' || !encaisseur.active) {
    throw new Error('L\'encaisseur spécifié n\'existe pas ou n\'est pas actif');
  }

  // Vérifier que le caissier est bien un caissier
  const { data: caissier } = await supabaseAdmin
    .from('profiles')
    .select('role, active')
    .eq('id', payload.caissier_id)
    .single();
  
  if (!caissier || !['Caissier', 'Gerant'].includes(caissier.role) || !caissier.active) {
    throw new Error('Le caissier spécifié n\'existe pas ou n\'est pas actif');
  }

  // Vérifier l'affectation
  const { data: affectation } = await supabaseAdmin
    .from('encaissement_affectations')
    .select('id')
    .eq('caissier_id', payload.caissier_id)
    .eq('encaisseur_id', payload.encaisseur_id)
    .eq('actif', true)
    .single();
  
  if (!affectation) {
    throw new Error('Le caissier n\'est pas affecté à cet encaisseur');
  }

  // Générer la référence
  const reference = genererReference();

  // Créer le dossier
  const { data: dossier, error } = await supabaseAdmin
    .from('encaissement_dossiers')
    .insert({
      reference,
      caissier_id: payload.caissier_id,
      encaisseur_id: payload.encaisseur_id,
      session_id: payload.session_id || null,
      montant_attendu: payload.montant_attendu,
      date_versement: payload.date_versement || new Date().toISOString().split('T')[0],
      statut: 'en_attente',
    })
    .select()
    .single();

  if (error) throw error;

  // Audit
  await auditLog(supabaseAdmin, 'encaissement_dossiers', dossier.id, 'INSERT', null, dossier, userId);

  return dossier;
}

// ============================================================================
// ACTION : Déclarer un montant (caissier ou encaisseur)
// ============================================================================
async function declarerMontant(supabaseAdmin: any, payload: DeclarerMontantPayload, userId: string) {
  // Récupérer le dossier
  const { data: dossier, error: dossierError } = await supabaseAdmin
    .from('encaissement_dossiers')
    .select('*')
    .eq('id', payload.dossier_id)
    .single();

  if (dossierError || !dossier) {
    throw new Error('Dossier introuvable');
  }

  // Vérifier que le dossier est dans un statut permettant la declaration
  if (!['en_attente', 'declare_caissier', 'declare_encaisseur', 'a_recompter'].includes(dossier.statut)) {
    throw new Error('Le dossier n\'accepte plus de déclarations');
  }

  // Vérifier que l'utilisateur est autorisé
  const isDir = await isDirection(supabaseAdmin, userId);
  const isCaissier = dossier.caissier_id === userId;
  const isEncaisseur = dossier.encaisseur_id === userId;

  if (!isDir && !isCaissier && !isEncaisseur) {
    throw new Error('Vous n\'êtes pas autorisé à déclarer sur ce dossier');
  }

  // Vérifier le type de declaration selon le rôle
  if (payload.type_declaration.startsWith('caissier') && !isCaissier && !isDir) {
    throw new Error('Seul le caissier peut faire une déclaration de caissier');
  }
  if (payload.type_declaration.startsWith('encaisseur') && !isEncaisseur && !isDir) {
    throw new Error('Seul l\'encaisseur peut faire une déclaration d\'encaisseur');
  }

  // Enregistrer la declaration
  const { data: declaration, error: declError } = await supabaseAdmin
    .from('encaissement_declarations')
    .insert({
      dossier_id: payload.dossier_id,
      type_declaration: payload.type_declaration,
      montant: payload.montant,
      utilisateur_id: userId,
      commentaire: payload.commentaire || null,
    })
    .select()
    .single();

  if (declError) throw declError;

  // Statut courant + montants déclarés après cette déclaration
  const isCaissierType = payload.type_declaration.startsWith('caissier');
  const isRecompte = payload.type_declaration.endsWith('recompte');

  const declaredCaissier = isCaissierType ? payload.montant : dossier.montant_declare_caissier;
  const declaredEncaisseur = isCaissierType ? dossier.montant_declare_encaisseur : payload.montant;

  const updateData: any = {};

  if (isCaissierType) {
    updateData.montant_declare_caissier = payload.montant;
  } else {
    updateData.montant_declare_encaisseur = payload.montant;
  }

  // Chaque recomptage consomme un crédit de recomptage
  if (isRecompte) {
    updateData.nombre_recomptages = (dossier.nombre_recomptages || 0) + 1;
  }

  const nombreRecomptages = updateData.nombre_recomptages ?? dossier.nombre_recomptages ?? 0;
  const maxRecomptages = dossier.max_recomptages || 3;

  let newStatut: string;

  if (declaredCaissier != null && declaredEncaisseur != null) {
    // Les deux parties ont déclaré : comparer
    if (Number(declaredCaissier) === Number(declaredEncaisseur)) {
      // Montants identiques -> confirmation automatique
      newStatut = 'confirme';
      updateData.montant_confirme = Number(declaredCaissier);
      updateData.date_validation = new Date().toISOString();
    } else if (nombreRecomptages >= maxRecomptages) {
      // Trop de mécanismes de recomptage -> arbitrage
      newStatut = 'en_arbitrage';
    } else {
      // Montants différents -> à recompter
      newStatut = 'a_recompter';
    }
  } else if (declaredEncaisseur != null) {
    newStatut = 'declare_encaisseur';
  } else {
    newStatut = 'declare_caissier';
  }

  updateData.statut = newStatut;

  const { data: updatedDossier, error: updateError } = await supabaseAdmin
    .from('encaissement_dossiers')
    .update(updateData)
    .eq('id', payload.dossier_id)
    .select()
    .single();

  if (updateError) throw updateError;

  // Audit
  await auditLog(supabaseAdmin, 'encaissement_dossiers', payload.dossier_id, 'UPDATE', dossier, updatedDossier, userId);

  return { declaration, dossier: updatedDossier };
}

// ============================================================================
// ACTION : Recompter (tentative de recomptage)
// ============================================================================
async function recompter(supabaseAdmin: any, payload: RecompterPayload, userId: string) {
  // Récupérer le dossier
  const { data: dossier, error: dossierError } = await supabaseAdmin
    .from('encaissement_dossiers')
    .select('*')
    .eq('id', payload.dossier_id)
    .single();

  if (dossierError || !dossier) {
    throw new Error('Dossier introuvable');
  }

  // Vérifier que le dossier est à recompter
  if (dossier.statut !== 'a_recompter') {
    throw new Error('Le dossier n\'est pas en statut "à recompter"');
  }

  // Vérifier que l'utilisateur est autorisé
  const isDir = await isDirection(supabaseAdmin, userId);
  const isCaissier = dossier.caissier_id === userId;
  const isEncaisseur = dossier.encaisseur_id === userId;

  if (!isDir && !isCaissier && !isEncaisseur) {
    throw new Error('Vous n\'êtes pas autorisé à recompter sur ce dossier');
  }

  // Vérifier le nombre max de recomptages
  const maxRecomptages = dossier.max_recomptages || 3;
  if ((dossier.nombre_recomptages || 0) >= maxRecomptages) {
    // Passer en arbitrage : transition métier normale, pas une erreur
    const { data: arbitreDossier, error: arbError } = await supabaseAdmin
      .from('encaissement_dossiers')
      .update({ statut: 'en_arbitrage' })
      .eq('id', payload.dossier_id)
      .select()
      .single();

    if (arbError) throw arbError;

    await auditLog(supabaseAdmin, 'encaissement_dossiers', payload.dossier_id, 'UPDATE', dossier, arbitreDossier, userId);

    return {
      recomptage: null,
      dossier: arbitreDossier,
      message: 'Nombre maximum de recomptages atteint : le dossier passe en arbitrage.',
    };
  }

  // Calculer l'écart
  const ecart = Math.abs(payload.caissier_montant - payload.encaisseur_montant);
  const statut = ecart === 0 ? 'accorde' : 'desaccord';

  // Enregistrer le recomptage
  const { data: recomptage, error: recError } = await supabaseAdmin
    .from('encaissement_recomptages')
    .insert({
      dossier_id: payload.dossier_id,
      caissier_montant: payload.caissier_montant,
      encaisseur_montant: payload.encaisseur_montant,
      ecart,
      statut,
      commentaire_caissier: payload.commentaire_caissier || null,
      commentaire_encaisseur: payload.commentaire_encaisseur || null,
    })
    .select()
    .single();

  if (recError) throw recError;

  // Mettre à jour le dossier
  let newStatut = dossier.statut;
  let updateData: any = {
    nombre_recomptages: dossier.nombre_recomptages + 1,
  };

  if (statut === 'accorde') {
    // Montants identiques après recomptage -> confirmation
    newStatut = 'confirme';
    updateData.montant_confirme = payload.caissier_montant;
    updateData.date_validation = new Date().toISOString();
  } else if (updateData.nombre_recomptages >= maxRecomptages) {
    // Max recomptages atteint -> arbitrage
    newStatut = 'en_arbitrage';
  }

  updateData.statut = newStatut;

  const { data: updatedDossier, error: updateError } = await supabaseAdmin
    .from('encaissement_dossiers')
    .update(updateData)
    .eq('id', payload.dossier_id)
    .select()
    .single();

  if (updateError) throw updateError;

  // Audit
  await auditLog(supabaseAdmin, 'encaissement_dossiers', payload.dossier_id, 'UPDATE', dossier, updatedDossier, userId);

  return { recomptage, dossier: updatedDossier };
}

// ============================================================================
// ACTION : Arbitrer un litige
// ============================================================================
async function arbitrer(supabaseAdmin: any, payload: ArbitrerPayload, userId: string) {
  // Vérifier que l'utilisateur est direction
  const isDir = await isDirection(supabaseAdmin, userId);
  if (!isDir) {
    throw new Error('Seule la direction peut arbitrer un litige');
  }

  // Récupérer le dossier
  const { data: dossier, error: dossierError } = await supabaseAdmin
    .from('encaissement_dossiers')
    .select('*')
    .eq('id', payload.dossier_id)
    .single();

  if (dossierError || !dossier) {
    throw new Error('Dossier introuvable');
  }

  // Vérifier que le dossier est en arbitrage
  if (dossier.statut !== 'en_arbitrage') {
    throw new Error('Le dossier n\'est pas en arbitrage');
  }

  // Calculer l'écart restant
  const ecartRestant = Math.abs(dossier.montant_attendu - payload.montant_retenu);

  // Créer ou mettre à jour le litige
  const { data: litige, error: litigeError } = await supabaseAdmin
    .from('encaissement_litiges')
    .upsert({
      dossier_id: payload.dossier_id,
      arbitre_id: userId,
      statut: 'resolu',
      montant_retenu: payload.montant_retenu,
      ecart_restant: ecartRestant,
      motif: payload.motif,
      date_arbitrage: new Date().toISOString(),
      date_resolution: new Date().toISOString(),
      decision: payload.decision,
      commentaire: payload.commentaire || null,
    }, {
      onConflict: 'dossier_id',
    })
    .select()
    .single();

  if (litigeError) throw litigeError;

  // Mettre à jour le dossier
  const newStatut = payload.decision === 'annulation' ? 'annule' : 'confirme_apres_arbitrage';
  
  const { data: updatedDossier, error: updateError } = await supabaseAdmin
    .from('encaissement_dossiers')
    .update({
      statut: newStatut,
      montant_confirme: payload.decision === 'annulation' ? null : payload.montant_retenu,
      date_validation: payload.decision === 'annulation' ? null : new Date().toISOString(),
    })
    .eq('id', payload.dossier_id)
    .select()
    .single();

  if (updateError) throw updateError;

  // Audit
  await auditLog(supabaseAdmin, 'encaissement_dossiers', payload.dossier_id, 'UPDATE', dossier, updatedDossier, userId);

  return { litige, dossier: updatedDossier };
}

// ============================================================================
// ACTION : Annuler un dossier
// ============================================================================
async function annulerDossier(supabaseAdmin: any, payload: AnnulerDossierPayload, userId: string) {
  // Vérifier que l'utilisateur est direction
  const isDir = await isDirection(supabaseAdmin, userId);
  if (!isDir) {
    throw new Error('Seule la direction peut annuler un dossier');
  }

  // Récupérer le dossier
  const { data: dossier, error: dossierError } = await supabaseAdmin
    .from('encaissement_dossiers')
    .select('*')
    .eq('id', payload.dossier_id)
    .single();

  if (dossierError || !dossier) {
    throw new Error('Dossier introuvable');
  }

  // Vérifier que le dossier peut être annulé
  if (['confirme', 'confirme_apres_arbitrage', 'annule'].includes(dossier.statut)) {
    throw new Error('Ce dossier ne peut plus être annulé');
  }

  // Mettre à jour le dossier
  const { data: updatedDossier, error: updateError } = await supabaseAdmin
    .from('encaissement_dossiers')
    .update({
      statut: 'annule',
      motif_annulation: payload.motif,
      date_annulation: new Date().toISOString(),
    })
    .eq('id', payload.dossier_id)
    .select()
    .single();

  if (updateError) throw updateError;

  // Audit
  await auditLog(supabaseAdmin, 'encaissement_dossiers', payload.dossier_id, 'UPDATE', dossier, updatedDossier, userId);

  return updatedDossier;
}

// ============================================================================
// HANDLER PRINCIPAL
// ============================================================================
serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Authentification
    const supabaseAuth = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )

    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser()
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Non authentifié' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401
      })
    }

    // Client admin pour les opérations
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Lire le corps de la requête
    const { action, ...payload } = await req.json()

    let result;
    switch (action) {
      case 'creer_dossier':
        result = await creerDossier(supabaseAdmin, payload, user.id);
        break;
      case 'declarer_montant':
        result = await declarerMontant(supabaseAdmin, payload, user.id);
        break;
      case 'recompter':
        result = await recompter(supabaseAdmin, payload, user.id);
        break;
      case 'arbitrer':
        result = await arbitrer(supabaseAdmin, payload, user.id);
        break;
      case 'annuler_dossier':
        result = await annulerDossier(supabaseAdmin, payload, user.id);
        break;
      default:
        return new Response(JSON.stringify({ error: 'Action inconnue' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400
        })
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400
    })
  }
})
