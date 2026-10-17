import { supabase } from '../lib/supabase';

// ============================================================================
// TYPES POUR LE MODULE DE VERSEMENTS
// ============================================================================

export type StatutDossier = 
  | 'en_attente'
  | 'declare_caissier'
  | 'declare_encaisseur'
  | 'confirme'
  | 'a_recompter'
  | 'en_arbitrage'
  | 'confirme_apres_arbitrage'
  | 'annule';

export type TypeDeclaration = 
  | 'caissier_initial'
  | 'encaisseur_initial'
  | 'caissier_recompte'
  | 'encaisseur_recompte';

export type DecisionArbitrage = 
  | 'montant_caissier'
  | 'montant_encaisseur'
  | 'montant_retenu'
  | 'annulation';

export type TypeFrequence = 'quotidienne' | 'n_jours' | 'hebdomadaire' | 'bihebdomadaire' | 'mensuelle' | 'personnalisee';

export interface DossierVersement {
  id: string;
  reference: string;
  caissier_id: string;
  encaisseur_id: string;
  session_id?: string;
  date_versement: string;
  montant_attendu: number;
  montant_declare_caissier?: number;
  montant_declare_encaisseur?: number;
  montant_confirme?: number;
  statut: StatutDossier;
  nombre_recomptages: number;
  max_recomptages: number;
  date_creation: string;
  date_validation?: string;
  date_annulation?: string;
  motif_annulation?: string;
}

export interface DeclarationVersement {
  id: string;
  dossier_id: string;
  type_declaration: TypeDeclaration;
  montant: number;
  utilisateur_id: string;
  date_declaration: string;
  commentaire?: string;
}

export interface RecomptageVersement {
  id: string;
  dossier_id: string;
  caissier_montant: number;
  encaisseur_montant: number;
  ecart: number;
  statut: 'en_cours' | 'accorde' | 'desaccord';
  date_recomptage: string;
  commentaire_caissier?: string;
  commentaire_encaisseur?: string;
}

export interface LitigeVersement {
  id: string;
  dossier_id: string;
  arbitre_id?: string;
  statut: 'ouvert' | 'en_cours' | 'resolu' | 'cloture';
  montant_retenu?: number;
  ecart_restant?: number;
  motif: string;
  date_arbitrage?: string;
  date_resolution?: string;
  decision?: DecisionArbitrage;
  commentaire?: string;
}

export interface FrequenceVersement {
  id: string;
  caissier_id: string | null;
  frequence_type: TypeFrequence;
  frequence_n: number | null;
  jour_semaine: number | null;
  jour_mois: number | null;
  heure_limite: string;
  jours_ouvres_seulement: boolean;
  versement_partiel_autorise: boolean;
  date_debut: string;
  date_fin: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface EcheanceVersement {
  id: string;
  caissier_id: string;
  date_echeance: string;
  montant_attendu: number;
  statut: 'en_attente' | 'en_retard' | 'partiellement_remis' | 'complete' | 'annulee';
  date_calcul: string;
  created_at: string;
}

export interface MontantTheorique {
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
// SERVICE CLIENT — Edge Functions
// ============================================================================

const EDGE_FUNCTION_URL = import.meta.env.VITE_SUPABASE_URL + '/functions/v1/encaissement';
const PLANIFICATION_URL = import.meta.env.VITE_SUPABASE_URL + '/functions/v1/encaissement-planification';
const CALCUL_URL = import.meta.env.VITE_SUPABASE_URL + '/functions/v1/encaissement-calcul';

/**
 * Appel générique à une Edge Function avec gestion d'erreur
 */
async function callEdgeFunction(baseUrl: string, action: string, payload: any) {
  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session) {
    throw new Error('Non authentifié');
  }

  const response = await fetch(baseUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ action, ...payload }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Erreur serveur: ${response.status}`);
  }

  return response.json();
}

// ============================================================================
// API VERSEMENTS — Edge Function
// ============================================================================

/**
 * Créer un nouveau dossier de versement
 */
export async function creerDossier(payload: {
  caissier_id: string;
  encaisseur_id: string;
  session_id?: string;
  montant_attendu: number;
  date_versement?: string;
}): Promise<DossierVersement> {
  return callEdgeFunction(EDGE_FUNCTION_URL, 'creer_dossier', payload);
}

/**
 * Déclarer un montant (caissier ou encaisseur)
 */
export async function declarerMontant(payload: {
  dossier_id: string;
  type_declaration: TypeDeclaration;
  montant: number;
  commentaire?: string;
}): Promise<{ declaration: DeclarationVersement; dossier: DossierVersement }> {
  return callEdgeFunction(EDGE_FUNCTION_URL, 'declarer_montant', payload);
}

/**
 * Effectuar un recomptage (caissier + encaisseur)
 */
export async function recompter(payload: {
  dossier_id: string;
  caissier_montant: number;
  encaisseur_montant: number;
  commentaire_caissier?: string;
  commentaire_encaisseur?: string;
}): Promise<{ recomptage: RecomptageVersement | null; dossier: DossierVersement; message?: string }> {
  return callEdgeFunction(EDGE_FUNCTION_URL, 'recompter', payload);
}

/**
 * Arbitrer un litige (direction uniquement)
 */
export async function arbitrer(payload: {
  dossier_id: string;
  montant_retenu: number;
  motif: string;
  decision: DecisionArbitrage;
  commentaire?: string;
}): Promise<{ litige: LitigeVersement; dossier: DossierVersement }> {
  return callEdgeFunction(EDGE_FUNCTION_URL, 'arbitrer', payload);
}

/**
 * Annuler un dossier (direction uniquement)
 */
export async function annulerDossier(payload: {
  dossier_id: string;
  motif: string;
}): Promise<DossierVersement> {
  return callEdgeFunction(EDGE_FUNCTION_URL, 'annuler_dossier', payload);
}

// ============================================================================
// API PLANIFICATION — Edge Function
// ============================================================================

/**
 * Créer ou mettre à jour une fréquence de versement
 */
export async function upsertFrequence(payload: {
  caissier_id?: string;
  frequence_type: TypeFrequence;
  frequence_n?: number;
  jour_semaine?: number;
  jour_mois?: number;
  heure_limite?: string;
  jours_ouvres_seulement?: boolean;
  versement_partiel_autorise?: boolean;
  date_debut?: string;
  date_fin?: string;
}): Promise<FrequenceVersement> {
  return callEdgeFunction(PLANIFICATION_URL, 'upsert_frequence', payload);
}

/**
 * Récupérer toutes les fréquences configurées
 */
export async function getFrequences(): Promise<FrequenceVersement[]> {
  return callEdgeFunction(PLANIFICATION_URL, 'get_frequences', {});
}

/**
 * Supprimer une fréquence
 */
export async function deleteFrequence(frequenceId: string): Promise<{ success: boolean }> {
  return callEdgeFunction(PLANIFICATION_URL, 'delete_frequence', { frequence_id: frequenceId });
}

/**
 * Calculer les échéances pour un caissier sur une période
 */
export async function calculerEcheances(payload: {
  caissier_id: string;
  date_debut: string;
  date_fin: string;
}): Promise<{ count: number; frequence: FrequenceVersement }> {
  return callEdgeFunction(PLANIFICATION_URL, 'calculer_echeances', payload);
}

/**
 * Récupérer les échéances d'un caissier sur une période
 */
export async function getEcheancesCaissier(payload: {
  caissier_id: string;
  date_debut: string;
  date_fin: string;
}): Promise<EcheanceVersement[]> {
  return callEdgeFunction(PLANIFICATION_URL, 'get_echeances_caissier', payload);
}

/**
 * Vérifier et mettre à jour les échéances en retard
 */
export async function verifierEcheances(dateReference?: string): Promise<{
  mises_a_jour: number;
  date_reference: string;
}> {
  return callEdgeFunction(PLANIFICATION_URL, 'verifier_echeances', {
    date_reference: dateReference,
  });
}

// ============================================================================
// API CALCUL — Edge Function
// ============================================================================

/**
 * Calculer le montant théorique à reverser pour un caissier
 */
export async function calculerMontantTheorique(payload: {
  caissier_id: string;
  session_id?: string;
  date_debut?: string;
  date_fin?: string;
}): Promise<MontantTheorique> {
  return callEdgeFunction(CALCUL_URL, 'calculer_montant_theorique', payload);
}

/**
 * Récupérer les transactions disponibles (non encore incluses dans un versement)
 */
export async function getTransactionsDisponibles(payload: {
  caissier_id: string;
  date_debut?: string;
  date_fin?: string;
}): Promise<any[]> {
  return callEdgeFunction(CALCUL_URL, 'get_transactions_disponibles', payload);
}

// ============================================================================
// REQUÊTES DIRECTES (lecture seule — respectent les politiques RLS)
// ============================================================================

/**
 * Récupérer un dossier par son ID
 */
export async function getDossier(id: string): Promise<DossierVersement | null> {
  const { data, error } = await supabase
    .from('encaissement_dossiers')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    console.error('Erreur récupération dossier:', error);
    return null;
  }

  return data;
}

/**
 * Récupérer les dossiers d'un caissier
 */
export async function getDossiersCaissier(caissierId: string): Promise<DossierVersement[]> {
  const { data, error } = await supabase
    .from('encaissement_dossiers')
    .select('*')
    .eq('caissier_id', caissierId)
    .order('date_creation', { ascending: false });

  if (error) {
    console.error('Erreur récupération dossiers caissier:', error);
    return [];
  }

  return data || [];
}

/**
 * Récupérer les dossiers assignés à un encaisseur
 */
export async function getDossiersEncaisseur(encaisseurId: string): Promise<DossierVersement[]> {
  const { data, error } = await supabase
    .from('encaissement_dossiers')
    .select('*')
    .eq('encaisseur_id', encaisseurId)
    .order('date_creation', { ascending: false });

  if (error) {
    console.error('Erreur récupération dossiers encaisseur:', error);
    return [];
  }

  return data || [];
}

/**
 * Récupérer les déclarations d'un dossier
 */
export async function getDeclarationsDossier(dossierId: string): Promise<DeclarationVersement[]> {
  const { data, error } = await supabase
    .from('encaissement_declarations')
    .select('*')
    .eq('dossier_id', dossierId)
    .order('date_declaration', { ascending: true });

  if (error) {
    console.error('Erreur récupération déclarations:', error);
    return [];
  }

  return data || [];
}

/**
 * Récupérer les recomptages d'un dossier
 */
export async function getRecomptagesDossier(dossierId: string): Promise<RecomptageVersement[]> {
  const { data, error } = await supabase
    .from('encaissement_recomptages')
    .select('*')
    .eq('dossier_id', dossierId)
    .order('date_recomptage', { ascending: true });

  if (error) {
    console.error('Erreur récupération recomptages:', error);
    return [];
  }

  return data || [];
}

/**
 * Récupérer les litiges d'un dossier
 */
export async function getLitigesDossier(dossierId: string): Promise<LitigeVersement[]> {
  const { data, error } = await supabase
    .from('encaissement_litiges')
    .select('*')
    .eq('dossier_id', dossierId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Erreur récupération litiges:', error);
    return [];
  }

  return data || [];
}

/**
 * Récupérer les affectations d'un encaisseur
 */
export async function getAffectationsEncaisseur(encaisseurId: string) {
  const { data, error } = await supabase
    .from('encaissement_affectations')
    .select('*')
    .eq('encaisseur_id', encaisseurId)
    .eq('actif', true);

  if (error) {
    console.error('Erreur récupération affectations:', error);
    return [];
  }

  return data || [];
}

/**
 * Récupérer les affectations d'un caissier
 */
export async function getAffectationsCaissier(caissierId: string) {
  const { data, error } = await supabase
    .from('encaissement_affectations')
    .select('*')
    .eq('caissier_id', caissierId)
    .eq('actif', true);

  if (error) {
    console.error('Erreur récupération affectations:', error);
    return [];
  }

  return data || [];
}

/**
 * Créer (ou réactiver) une affectation caissier ↔ encaisseur (direction)
 */
export async function creerAffectation(payload: { caissier_id: string; encaisseur_id: string }) {
  const { data: existing } = await supabase
    .from('encaissement_affectations')
    .select('id')
    .eq('caissier_id', payload.caissier_id)
    .eq('encaisseur_id', payload.encaisseur_id)
    .maybeSingle();

  if (existing?.id) {
    const { data, error } = await supabase
      .from('encaissement_affectations')
      .update({ actif: true, date_fin: null })
      .eq('id', existing.id)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  }

  const { data, error } = await supabase
    .from('encaissement_affectations')
    .insert({ caissier_id: payload.caissier_id, encaisseur_id: payload.encaisseur_id, actif: true })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

/**
 * Activer / désactiver une affectation (direction)
 */
export async function setAffectationActive(id: string, actif: boolean) {
  const { data, error } = await supabase
    .from('encaissement_affectations')
    .update({ actif, date_fin: actif ? null : new Date().toISOString().split('T')[0] })
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

/**
 * Récupérer toutes les affectations (direction)
 */
export async function getAllAffectations() {
  const { data, error } = await supabase
    .from('encaissement_affectations')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Erreur récupération affectations:', error);
    return [];
  }

  return data || [];
}

/**
 * Récupérer les dossiers avec filtres (direction)
 */
export async function getDossiersFiltres(filtres?: {
  statut?: StatutDossier;
  caissier_id?: string;
  encaisseur_id?: string;
  date_debut?: string;
  date_fin?: string;
}): Promise<DossierVersement[]> {
  let query = supabase
    .from('encaissement_dossiers')
    .select('*')
    .order('date_creation', { ascending: false });

  if (filtres?.statut) {
    query = query.eq('statut', filtres.statut);
  }
  if (filtres?.caissier_id) {
    query = query.eq('caissier_id', filtres.caissier_id);
  }
  if (filtres?.encaisseur_id) {
    query = query.eq('encaisseur_id', filtres.encaisseur_id);
  }
  if (filtres?.date_debut) {
    query = query.gte('date_versement', filtres.date_debut);
  }
  if (filtres?.date_fin) {
    query = query.lte('date_versement', filtres.date_fin);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Erreur récupération dossiers filtrés:', error);
    return [];
  }

  return data || [];
}
