import { v4 as uuidv4 } from 'uuid';
import { db, ensureDbHealth } from './db';
import { supabase } from './supabase';

const isUuid = (value?: string) => !!value && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);


export type SyncActionType = 'INSERT_CLIENT' | 'UPDATE_CLIENT' | 'DELETE_CLIENT' |
                              'INSERT_FACTURE_PAIEMENT' |
                             'INSERT_COUT' | 'UPDATE_COUT' | 'DELETE_COUT' |
                             'INSERT_OBJECTIF' | 'UPDATE_OBJECTIF' | 'DELETE_OBJECTIF' |
                             'INSERT_PRIME' | 'UPDATE_PRIME_STATUS' |
                             'INSERT_PRIME_AUDIT_LOG' |
                             'UPDATE_SCORING_RULE' | 'UPSERT_CLASSEMENT' |
                             'INSERT_QUOTE' | 'UPDATE_QUOTE' | 'DELETE_QUOTE' |
                             'INSERT_SALE' | 'UPDATE_SALE' | 'DELETE_SALE' |
                             'INSERT_COMMISSION' | 'UPDATE_COMMISSION' | 'DELETE_COMMISSION' |
                             'INSERT_INSTALLMENT' | 'UPDATE_INSTALLMENT' | 'DELETE_INSTALLMENT' |
                             'INSERT_PROSPECT' | 'UPDATE_PROSPECT' | 'DELETE_PROSPECT' |
                             'INSERT_PROSPECT_ACTIVITY' | 'DELETE_PROSPECT_ACTIVITY' |
                             'INSERT_PROSPECT_FOLLOW_UP' | 'UPDATE_PROSPECT_FOLLOW_UP' | 'DELETE_PROSPECT_FOLLOW_UP' |
                             'INSERT_ACTIVITY_REPORT' | 'UPDATE_ACTIVITY_REPORT' | 'DELETE_ACTIVITY_REPORT' |
                             'INSERT_WEEKLY_REPORT' | 'UPDATE_WEEKLY_REPORT' |
                             'INSERT_V2_DAILY_REPORT' | 'UPDATE_V2_DAILY_REPORT' | 'DELETE_V2_DAILY_REPORT' |
                             'INSERT_V2_WEEKLY_REPORT' | 'UPDATE_V2_WEEKLY_REPORT' | 'DELETE_V2_WEEKLY_REPORT' |
                             'INSERT_CATEGORY' | 'DELETE_CATEGORY' |
                             'UPDATE_SETTINGS' | 'UPDATE_PROFILE' | 'DELETE_PROFILE' |
                             'INSERT_PRESTATION' | 'UPDATE_PRESTATION' | 'DELETE_PRESTATION' |
                             'INSERT_SERVICE' | 'UPDATE_SERVICE' | 'DELETE_SERVICE' |
                               'UPSERT_INVOICE' | 'DELETE_INVOICE' |
                               'UPSERT_INVOICE_PAYMENT' | 'DELETE_INVOICE_PAYMENT' |
                               'INSERT_DOCUMENT' | 'UPDATE_DOCUMENT' | 'DELETE_DOCUMENT' |
                               'INSERT_CRM_FOLDER' | 'UPDATE_CRM_FOLDER' | 'DELETE_CRM_FOLDER' |
                               'INSERT_NOTIFICATION' | 'MARK_NOTIFICATION_READ' | 'MARK_ALL_NOTIFICATIONS_READ' |
                               'INSERT_CRM_TIER' | 'UPDATE_CRM_TIER' | 'DELETE_CRM_TIER' |
                               'INSERT_CRM_COMMERCIAL' | 'UPDATE_CRM_COMMERCIAL' | 'DELETE_CRM_COMMERCIAL' |
                               'INSERT_CRM_PRESTATION' | 'UPDATE_CRM_PRESTATION' | 'DELETE_CRM_PRESTATION' |
                               'INSERT_CRM_MOUVEMENT' | 'DELETE_CRM_MOUVEMENT' |
                               'UPSERT_CRM_COMMISSION' | 'UPDATE_CRM_COMMISSION' | 'DELETE_CRM_COMMISSION' |
                               'INSERT_CRM_ARTICLE' | 'UPDATE_CRM_ARTICLE' | 'DELETE_CRM_ARTICLE' |
                               'INSERT_CRM_STOCK_MOUVEMENT' |
                               'INSERT_CRM_INTERVENTION' | 'UPDATE_CRM_INTERVENTION' | 'DELETE_CRM_INTERVENTION' |
                               'INSERT_CRM_TECHNICIEN' | 'UPDATE_CRM_TECHNICIEN' | 'DELETE_CRM_TECHNICIEN';

export interface SyncAction {
  id: string;
  type: SyncActionType;
  payload: any;
  timestamp: number;
  retryCount?: number;
}

export const isAuthError = (err: any): boolean => {
  if (!err) return false;
  const msg = (typeof err === 'string' ? err : err.message || err.error_description || JSON.stringify(err)).toLowerCase();
  const code = String(err.code || err.status || '');
  return code === '401' || code === 'PGRST301' ||
    msg.includes('jwt expired') ||
    msg.includes('auth session missing') ||
    msg.includes('invalid claim: exp claim is in the past') ||
    msg.includes('invalid jwt') ||
    msg.includes('expired') && msg.includes('jwt');
};

export const isNetworkOrTransientError = (err: any): boolean => {
  if (!err) return false;
  // Les erreurs d'auth (JWT expiré) ne sont PAS réseau : elles demandent un
  // refresh de session (isAuthError), pas un skip silencieux.
  if (isAuthError(err)) return false;
  const msg = (typeof err === 'string' ? err : err.message || err.error_description || JSON.stringify(err)).toLowerCase();
  const status = err.status || err.code || err.statusCode;
  
  if (
    msg.includes('failed to fetch') ||
    msg.includes('network') ||
    msg.includes('connection') ||
    msg.includes('timeout') ||
    msg.includes('délai') ||
    msg.includes('econnrefused') ||
    msg.includes('err_') ||
    msg.includes('abort') ||
    msg.includes('offline') ||
    msg.includes('gateway') ||
    msg.includes('load failed') ||
    msg.includes('fetch error')
  ) return true;

  if (status === 502 || status === 503 || status === 504 || status === 520 || status === 521 || status === 522 || status === 524 || status === 408 || status === 429) {
    return true;
  }

  return false;
};

export const isForeignKeyError = (err: any): boolean => {
  if (!err) return false;
  const msg = (typeof err === 'string' ? err : err.message || err.details || JSON.stringify(err)).toLowerCase();
  const code = err.code || err.status;
  return code === '23503' || msg.includes('foreign key') || msg.includes('violates foreign key constraint') || msg.includes('clé étrangère');
};

export const isUniqueViolationError = (err: any): boolean => {
  if (!err) return false;
  const msg = (typeof err === 'string' ? err : err.message || err.details || JSON.stringify(err)).toLowerCase();
  const code = err.code || err.status;
  return code === '23505' || msg.includes('duplicate key') || msg.includes('already exists') || msg.includes('doublon');
};

// Tables CRM dont la reference/code est contraint UNIQUE cote serveur
// (uq_prestations_reference, uq_articles_code, uq_interventions_reference).
// Les references sont generees en local en `length+1` : apres suppression ou
// depuis un autre poste, une collision 23505 est possible. En cas de conflit,
// on regenere une reference suffixee (-bisXXXX, meme convention que
// l'anti-collision locale d'AppContext) et on rejoue une fois, puis on
// repercute la correction dans le store local pour garder l'UI coherente.
interface UniqueFieldRepair {
  table: string;
  field: string;
  storeKey: 'crmPrestations' | 'crmArticles' | 'crmMaintenance' | 'crmCommissions' | 'quotes';
}
const withUniqueRepairSuffix = (base: string): string => {
  const root = String(base || '').split('-bis')[0] || 'REF';
  return `${root}-bis${Math.floor(1000 + Math.random() * 9000)}`;
};

const backfillLocalUniqueField = async (storeKey: UniqueFieldRepair['storeKey'], id: string, field: string, value: string) => {
  try {
    const store = (db as any)[storeKey];
    if (!store || !id) return;
    const rows: any[] = (await store.getItem('data')) || [];
    const next = rows.map(r => (r.id === id ? { ...r, [field]: value } : r));
    await store.setItem('data', next);
  } catch (e) {
    console.warn('[Sync] backfill local reference impossible :', e);
  }
};

const repairUniqueAndRetry = async (
  table: string,
  row: any,
  repair: UniqueFieldRepair,
  doUpsert: (candidate: any) => Promise<{ error: any }>
): Promise<{ error: any; repairedValue?: string }> => {
  const current = row?.[repair.field];
  if (!current) return { error: { message: 'valeur vide' } };
  // Eviter de boucler sur une valeur deja suffixee qui echoue encore
  // (vrai doublon metier) : un seul rejeu.
  const candidate = { ...row, [repair.field]: withUniqueRepairSuffix(current) };
  const { error } = await doUpsert(candidate);
  if (!error) return { error: null, repairedValue: candidate[repair.field] };
  return { error };
};

// Quotes : upsert atomique via RPC (quote + lignes en une transaction).
// Si la fonction n'est pas encore déployée, repli sur le chemin historique.
const isMissingRpcError = (err: any): boolean => {
  if (!err) return false;
  const msg = (typeof err === 'string' ? err : err.message || err.details || JSON.stringify(err)).toLowerCase();
  const code = String(err.code || '');
  // 42883/PGRST202 = fonction absente ; 42501/PGRST301/permission denied =
  // GRANT manquant (fonction présente mais inexécutable) → même repli résilient.
  return code === '42883' || code === 'PGRST202' || code === '42501' || code === 'PGRST301' ||
    msg.includes('permission denied') || msg.includes('not authorized') ||
    (msg.includes('function') && (msg.includes('does not exist') || msg.includes("n'existe pas") || msg.includes('could not find') || msg.includes('introuvable')));
};

const backfillLocalQuoteNumber = async (id: string, value: string) => {
  try {
    const rows: any[] = (await db.quotes.getItem('data')) || [];
    await db.quotes.setItem('data', rows.map(r => (r.id === id ? { ...r, quoteNumber: value } : r)));
  } catch (e) {
    console.warn('[Sync] backfill quote_number impossible :', e);
  }
};

// Réparation 23505 rapports V2 : UNIQUE(author_id, week_start|date, project).
// Deux brouillons locaux (ids Date.now() re-mintés en UUID à chaque save,
// lookups désynchronisés entre écrans) désignent la même clé naturelle :
// le 2e INSERT échoue en doublon. On adopte la ligne serveur existante
// (UPDATE par son id) et on rabat le doublon local vers cet id — sinon
// erreur permanente + doublons UI + resoumissions fantômes.
// Garde : si le serveur a déjà tranché (Validé/Relu) et que l'entrant est un
// brouillon, on ne l'écrase pas — on rabat juste le local.
const backfillLocalReportId = async (store: any, dupId: string, serverId: string, patch: any, tag: string) => {
  if (!store || !dupId || !serverId || dupId === serverId) return;
  try {
    const rows: any[] = (await store.getItem('data')) || [];
    const next = rows.filter(rr => rr?.id !== dupId);
    const merged = { ...patch, id: serverId };
    const idx = next.findIndex(rr => rr?.id === serverId);
    if (idx >= 0) next[idx] = { ...next[idx], ...merged };
    else next.unshift(merged);
    await store.setItem('data', next);
  } catch (e) {
    console.warn(`[Sync] backfill id ${tag} impossible :`, e);
  }
};

const repairWeeklyUniqueAndUpdate = async (insertPayload: any, dupId: string): Promise<{ error: any }> => {
  try {
    const { data: srv } = await supabase.from('v2_weekly_reports')
      .select('id,status').eq('author_id', insertPayload.author_id)
      .eq('week_start', insertPayload.week_start).eq('project', insertPayload.project)
      .limit(1).maybeSingle();
    const serverId = (srv as any)?.id;
    if (!serverId || !isUuid(String(serverId))) return { error: { message: 'doublon sans ligne serveur retrouvée' } };
    const serverStatus = (srv as any)?.status;
    const serverLocked = serverStatus === 'Validé' || serverStatus === 'Relu';
    const incomingDraft = insertPayload.status === 'Brouillon';
    let error: any = null;
    if (!(serverLocked && incomingDraft)) {
      const { id: _drop, ...fields } = insertPayload;
      const upd = await supabase.from('v2_weekly_reports')
        .update({ ...fields, updated_at: new Date().toISOString() }).eq('id', serverId);
      error = upd.error;
    } else {
      console.warn('[Sync] INSERT_V2_WEEKLY_REPORT doublon sur rapport déjà tranché, rabattement local seul :', serverId);
    }
    if (!error) {
      await backfillLocalReportId(
        db.v2WeeklyReports, dupId, String(serverId),
        { ...insertPayload, id: String(serverId), status: (serverLocked && incomingDraft) ? serverStatus : insertPayload.status },
        'weekly'
      );
    }
    return { error };
  } catch (e: any) {
    if (isNetworkOrTransientError(e) || isAuthError(e)) throw e;
    return { error: e };
  }
};

const repairDailyUniqueAndUpdate = async (insertFields: any, dupId: string): Promise<{ error: any }> => {
  try {
    const { data: srv } = await supabase.from('v2_daily_reports')
      .select('id,status').eq('author_id', insertFields.author_id)
      .eq('date', insertFields.date).eq('project', insertFields.project)
      .limit(1).maybeSingle();
    const serverId = (srv as any)?.id;
    if (!serverId || !isUuid(String(serverId))) return { error: { message: 'doublon sans ligne serveur retrouvée' } };
    const serverLocked = (srv as any)?.status === 'Validé';
    const incomingDraft = insertFields.status === 'Brouillon';
    let error: any = null;
    if (!(serverLocked && incomingDraft)) {
      const { id: _drop, ...fields } = insertFields;
      const upd = await supabase.from('v2_daily_reports')
        .update({ ...fields, updated_at: new Date().toISOString() }).eq('id', serverId);
      error = upd.error;
    } else {
      console.warn('[Sync] INSERT_V2_DAILY_REPORT doublon sur rapport déjà tranché, rabattement local seul :', serverId);
    }
    if (!error) {
      await backfillLocalReportId(
        db.v2DailyReports, dupId, String(serverId),
        { ...insertFields, id: String(serverId), status: (serverLocked && incomingDraft) ? (srv as any).status : insertFields.status },
        'daily'
      );
    }
    return { error };
  } catch (e: any) {
    if (isNetworkOrTransientError(e) || isAuthError(e)) throw e;
    return { error: e };
  }
};

const nextQuoteNumberCandidate = (base: string): string => {
  const m = String(base || '').match(/^(DV-\d{4}-)(\d+)$/);
  if (m) {
    const n = parseInt(m[2], 10) + 1;
    return `${m[1]}${String(isNaN(n) ? 1 : n).padStart(4, '0')}`;
  }
  return `${base || 'DV'}-bis${Math.floor(1000 + Math.random() * 9000)}`;
};

const buildQuoteRpcPayload = (quoteData: any, lines: any[]) => ({
  p_quote: {
    id: quoteData.id,
    quote_number: quoteData.quoteNumber,
    client_id: isUuid(quoteData.clientId) ? quoteData.clientId : null,
    commercial_id: isUuid(quoteData.commercialId) ? quoteData.commercialId : null,
    service_id: isUuid(quoteData.serviceId) ? quoteData.serviceId : null,
    affaire_id: null,
    subject: quoteData.subject,
    subtotal: quoteData.subtotal,
    vat: quoteData.vat ?? 0,
    total: quoteData.total,
    status: quoteData.status,
    date: quoteData.date,
    valid_until: quoteData.validUntil || null,
    payment_terms: quoteData.paymentTerms || null,
    notes: quoteData.notes || null,
    signatory_name: quoteData.signatoryName || null,
    signatory_role: quoteData.signatoryRole || null,
    style: quoteData.style,
    accent_color: quoteData.accentColor,
    discount_percent: quoteData.discountPercent || 0,
    discount_amount: quoteData.discountAmount || 0,
    client_comment: quoteData.clientComment || null,
  },
  p_lines: (lines || []).map((l: any) => ({
    id: isUuid(l.id) ? l.id : uuidv4(),
    prestation_id: isUuid(l.prestationId) ? l.prestationId : null,
    description: l.description,
    quantity: l.quantity,
    unit: l.unit || null,
    unit_price: l.unitPrice,
    discount_percent: l.discountPercent || 0,
    cost_price: l.costPrice || 0,
    total: l.total,
  })),
});

const tryRpcQuoteUpsert = async (quoteData: any, lines: any[], tag: string): Promise<'ok' | 'missing' | 'error'> => {
  try {
    const { error } = await supabase.rpc('upsert_quote_with_lines', buildQuoteRpcPayload(quoteData, lines));
    if (!error) return 'ok';
    if (isMissingRpcError(error)) return 'missing';
    if (isUniqueViolationError(error)) {
      // Doublon de quote_number multi-poste : régénère et rejoue une fois via RPC
      const retryNumber = nextQuoteNumberCandidate(quoteData.quoteNumber);
      console.warn(`[Sync] ${tag} numéro en doublon, régénération ${quoteData.quoteNumber} -> ${retryNumber}`);
      const retry = await supabase.rpc('upsert_quote_with_lines', buildQuoteRpcPayload({ ...quoteData, quoteNumber: retryNumber }, lines));
      if (!retry.error) {
        await backfillLocalQuoteNumber(quoteData.id, retryNumber);
        return 'ok';
      }
      if (isMissingRpcError(retry.error)) return 'missing';
    }
    console.error(`[Sync] ${tag} RPC échouée :`, error.message);
    return 'error';
  } catch (e: any) {
    if (isNetworkOrTransientError(e)) throw e;
    return 'error';
  }
};


// Vérifie si le retour Supabase est une erreur réseau (lance exception) ou logique (renvoie false)
const checkResult = (error: any): boolean => {
  if (!error) return true;
  if (isAuthError(error)) {
    throw new Error(`[AuthError] ${error.message || JSON.stringify(error)}`);
  }
  if (isNetworkOrTransientError(error)) {
    throw new Error(`[NetworkError] ${error.message || JSON.stringify(error)}`);
  }
  return false;
};

// ─── Helpers génériques modules CRM (tiers, commerciaux, prestations, caisse,
// commissions, stocks, maintenance) ──────────────────────────────────────────
// Les colonnes FK sont en UUID côté Supabase : toute valeur non-UUID (id local,
// chaîne vide) est neutralisée à null pour éviter les 23503. En cas de violation
// FK résiduelle (parent pas encore synchronisé), on rejoue sans les relations.
const sanitizeCrmUuids = (row: any, uuidFields: string[]): any => {
  const clean: any = { ...(row || {}) };
  for (const f of uuidFields) {
    if (clean[f] !== undefined && clean[f] !== null && clean[f] !== '') {
      if (!isUuid(clean[f])) clean[f] = null;
    } else if (clean[f] === '') {
      clean[f] = null;
    }
  }
  return clean;
};

const syncCrmUpsert = async (table: string, row: any, uuidFields: string[], tag: string, repair?: UniqueFieldRepair): Promise<boolean> => {
  const clean = sanitizeCrmUuids(row, uuidFields);
  let { error } = await supabase.from(table).upsert(clean, { onConflict: 'id' });
  if (error && isForeignKeyError(error)) {
    // Parent pas encore synchronise (ordre de file) ou supprime : on NE nullifie plus
    // les relations (orphelins silencieux). L'action reste en erreur visible et sera
    // rejouee quand le parent arrivera.
    console.warn(`[Sync] ${tag} violation FK, rejeu differe (relations conservees)`);
  }
  if (error && repair && isUniqueViolationError(error)) {
    console.warn(`[Sync] ${tag} reference en doublon, regeneration et rejeu`);
    const retry = await repairUniqueAndRetry(table, clean, repair, async (candidate) => {
      const r = await supabase.from(table).upsert(candidate, { onConflict: 'id' });
      return { error: r.error };
    });
    error = retry.error;
    if (!error && retry.repairedValue && clean.id) {
      await backfillLocalUniqueField(repair.storeKey, clean.id, repair.field, retry.repairedValue);
    }
  }
  if (error) console.error(`[Sync] ${tag} échoué :`, error.message);
  return checkResult(error);
};

const syncCrmUpdate = async (table: string, id: string, updates: any, uuidFields: string[], tag: string, repair?: UniqueFieldRepair): Promise<boolean> => {
  const clean = sanitizeCrmUuids(updates, uuidFields);
  delete clean.id;
  let { error } = await supabase.from(table).update(clean).eq('id', id);
  if (error && isForeignKeyError(error)) {
    // Idem upsert : pas de nullification silencieuse, echec visible + rejeu.
    console.warn(`[Sync] ${tag} violation FK, rejeu differe (relations conservees)`);
  }
  if (error && repair && isUniqueViolationError(error) && clean[repair.field]) {
    console.warn(`[Sync] ${tag} reference en doublon, regeneration et rejeu`);
    const candidate = { ...clean, [repair.field]: withUniqueRepairSuffix(clean[repair.field]) };
    const r2 = await supabase.from(table).update(candidate).eq('id', id);
    error = r2.error;
    if (!error) {
      await backfillLocalUniqueField(repair.storeKey, id, repair.field, candidate[repair.field]);
    }
  }
  if (error) console.error(`[Sync] ${tag} échoué :`, error.message);
  return checkResult(error);
};

const syncCrmDelete = async (table: string, id: string, tag: string): Promise<boolean> => {
  const { error } = await supabase.from(table).delete().eq('id', id);
  if (error) console.error(`[Sync] ${tag} échoué :`, error.message);
  return checkResult(error);
};

// Ordre de priorité topologique pour respecter les dépendances de clés étrangères
// Toute action non listée hérite de la priorité de sa famille (défaut 5) afin de
// ne jamais passer APRÈS les suppressions (6) : un INSERT doit toujours précéder
// le DELETE de son parent.
const ACTION_PRIORITY: Record<string, number> = {
  // 1. Paramètres, Catégories, Marques, Fournisseurs, Dossiers CRM, Remises
  'UPDATE_SETTINGS': 1,
  'UPDATE_PROFILE': 1,
  'DELETE_PROFILE': 6,
  'INSERT_CATEGORY': 1,
  'DELETE_CATEGORY': 6,
  'INSERT_SERVICE': 1,
  'UPDATE_SERVICE': 1,
  'INSERT_CRM_FOLDER': 1,
  'UPDATE_CRM_FOLDER': 1,
  'DELETE_CRM_FOLDER': 6,
  'UPDATE_SCORING_RULE': 1,
  'UPSERT_CLASSEMENT': 1,
  'INSERT_NOTIFICATION': 1,
  'MARK_NOTIFICATION_READ': 5,
  'MARK_ALL_NOTIFICATIONS_READ': 5,
  // 2. Profils, Clients, Produits, Prestations
  'INSERT_CLIENT': 2,
  'UPDATE_CLIENT': 2,
  'DELETE_CLIENT': 6,
  'INSERT_PRESTATION': 2,
  'UPDATE_PRESTATION': 2,
  'DELETE_PRESTATION': 6,
  'INSERT_CRM_TIER': 2,
  'UPDATE_CRM_TIER': 2,
  'INSERT_CRM_COMMERCIAL': 2,
  'UPDATE_CRM_COMMERCIAL': 2,
  'INSERT_CRM_ARTICLE': 2,
  'UPDATE_CRM_ARTICLE': 2,
  'INSERT_CRM_TECHNICIEN': 2,
  'UPDATE_CRM_TECHNICIEN': 2,
  'INSERT_DOCUMENT': 2,
  'UPDATE_DOCUMENT': 2,
  'DELETE_DOCUMENT': 6,
  // 4. Devis, Ventes, Transactions, Documents CRM
  'INSERT_QUOTE': 4,
  'UPDATE_QUOTE': 4,
  'DELETE_QUOTE': 6,
  'INSERT_SALE': 4,
  'UPDATE_SALE': 4,
  'DELETE_SALE': 6,
  'INSERT_CRM_PRESTATION': 4,
  'UPDATE_CRM_PRESTATION': 4,
  'INSERT_CRM_INTERVENTION': 4,
  'UPDATE_CRM_INTERVENTION': 4,
  'INSERT_PROSPECT': 4,
  'UPDATE_PROSPECT': 4,
  'DELETE_PROSPECT': 6,
  'INSERT_PROSPECT_ACTIVITY': 4,
  'DELETE_PROSPECT_ACTIVITY': 6,
  'INSERT_PROSPECT_FOLLOW_UP': 4,
  'UPDATE_PROSPECT_FOLLOW_UP': 4,
  'DELETE_PROSPECT_FOLLOW_UP': 6,
  'INSERT_ACTIVITY_REPORT': 4,
  'UPDATE_ACTIVITY_REPORT': 4,
  'DELETE_ACTIVITY_REPORT': 6,
  'INSERT_WEEKLY_REPORT': 4,
  'UPDATE_WEEKLY_REPORT': 4,
  'INSERT_V2_DAILY_REPORT': 4,
  'UPDATE_V2_DAILY_REPORT': 4,
  'DELETE_V2_DAILY_REPORT': 6,
  'INSERT_V2_WEEKLY_REPORT': 4,
  'UPDATE_V2_WEEKLY_REPORT': 4,
  'DELETE_V2_WEEKLY_REPORT': 6,
  'INSERT_OBJECTIF': 4,
  'UPDATE_OBJECTIF': 4,
  'DELETE_OBJECTIF': 6,
  'INSERT_PRIME': 4,
  'UPDATE_PRIME_STATUS': 4,
  'INSERT_PRIME_AUDIT_LOG': 4,
  'INSERT_COUT': 4,
  'UPDATE_COUT': 4,
  'DELETE_COUT': 6,
  'INSERT_COMMISSION': 4,
  'UPDATE_COMMISSION': 4,
  'DELETE_COMMISSION': 6,
  'INSERT_INSTALLMENT': 4,
  'UPDATE_INSTALLMENT': 4,
  'DELETE_INSTALLMENT': 6,
  'UPSERT_INVOICE': 4,
  'DELETE_INVOICE': 6,
  'UPSERT_INVOICE_PAYMENT': 5,
  'DELETE_INVOICE_PAYMENT': 6,
  // 5. Paiements, Retours, Mouvements de stock, Entrées stock, Inventaires
  'INSERT_FACTURE_PAIEMENT': 5,
  'INSERT_CRM_MOUVEMENT': 5,
  'INSERT_CRM_STOCK_MOUVEMENT': 5,
  'UPSERT_CRM_COMMISSION': 5,
  'UPDATE_CRM_COMMISSION': 5,
  'DELETE_CRM_COMMISSION': 6,
  // 6. Suppressions et purges finales
  'DELETE_CRM_TIER': 6,
  'DELETE_CRM_COMMERCIAL': 6,
  'DELETE_CRM_PRESTATION': 6,
  'DELETE_CRM_MOUVEMENT': 6,
  'DELETE_CRM_ARTICLE': 6,
  'DELETE_CRM_INTERVENTION': 6,
  'DELETE_CRM_TECHNICIEN': 6,
};

export const isRetiredServicePayload = (type: string, payload: any): boolean => {
  if (!payload) return false;
  // Le module Point de Vente (produits, ventes, stock, encaissement) est
  // entierement retire : toute action residuelle qui le concerne est abandonnee.
  return type.includes('POS') || type.includes('PRODUCT_COMPLETION') || type.includes('IMPORT_');
};

// Ajouter une action à la file d'attente
export const queueSyncAction = async (type: SyncActionType, payload: any) => {
  // Ignorer immédiatement les actions portant sur l'ancien module services/photocopies
  if (isRetiredServicePayload(type, payload)) {
    console.log('[Sync] Action ignorée car liée au module de services retiré :', type);
    return;
  }

  // Notifications : ne jamais enfiler un payload insynchronisable (échec 22P02/23503 garanti).
  if (type === 'INSERT_NOTIFICATION' && (!isUuid(payload?.id) || !isUuid(payload?.user_id))) {
    console.warn('[Sync] INSERT_NOTIFICATION non enfilée (id/user_id non-UUID).', { id: payload?.id, user_id: payload?.user_id });
    return;
  }

  // Sérialise les read-modify-write sur la file (localforage sans transaction :
  // 2 appels concurrents = 1 action perdue).
  queueChain = queueChain.then(async () => {
    // Base locale réparée d'abord (conflit de version IndexedDB = écriture perdue sinon).
    await ensureDbHealth().catch(() => {});
    const action: SyncAction = {
      id: uuidv4(),
      type,
      payload,
      timestamp: Date.now()
    };

    const currentQueue: SyncAction[] = (await db.syncQueue.getItem('queue')) || [];
    currentQueue.push(action);
    await db.syncQueue.setItem('queue', currentQueue);
  }).catch(err => console.error('[Sync] queueSyncAction file corrompue :', err));
  await queueChain;

  // Tenter de synchroniser immédiatement si on est en ligne
  if (navigator.onLine) {
    processSyncQueue();
  }
};

// Helper de timeout adaptatif pour éviter qu'une action réseau ne bloque la file en cas de coupure
const withSyncTimeout = async <T,>(promise: Promise<T>, ms: number = 20000): Promise<T> => {
  let timer: any;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('[NetworkError] Délai réseau dépassé lors de la synchronisation')), ms);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timer);
  }
};

// Vérifie et rétablit l'authentification Supabase si le token JWT a expiré pendant une coupure
export const ensureSupabaseAuth = async (): Promise<boolean> => {
  if (typeof window === 'undefined' || !navigator.onLine) return false;
  try {
    const { data } = await supabase.auth.getSession();
    if (data?.session && data.session.expires_at && Math.floor(Date.now() / 1000) < (data.session.expires_at - 30)) {
      return true;
    }
    // Si la session est absente ou expirée, tenter de la renouveler via refresh_token
    if (data?.session?.refresh_token) {
      const { data: refData, error: refError } = await supabase.auth.refreshSession();
      if (!refError && refData?.session) {
        return true;
      }
    }
    // Repli : Réauthentification automatique avec le profil connecté en local (auth_last_user)
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem('auth_last_user');
      if (stored) {
        const user = JSON.parse(stored);
        if (user?.email && user?.pin) {
          const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
            email: user.email.toLowerCase().trim(),
            password: user.pin.trim()
          });
          if (!authError && authData?.session) {
            console.log('[SyncAuth] Reconnexion automatique Supabase Auth réussie pour :', user.email);
            return true;
          }
        }
      }
    }
  } catch (err) {
    console.warn('[SyncAuth] Échec vérification auth session :', err);
  }
  return false;
};

// Verrou anti-réentrance : empêche deux processSyncQueue simultanés
let syncLock = false;
// Chaîne de sérialisation des écritures file (read-modify-write atomique)
let queueChain: Promise<void> = Promise.resolve();

// ── Anti-boucle toasts (cause n°1 des messages en boucle) ────────────────────
// Le store syncErrors est vidé à chaque rejeu (réconciliation), ce qui remettait
// les compteurs `attempts` à zéro : backoff jamais atteint, rejeu + toast infinis.
// 1) errorToastTrack suit les échecs par entité EN MÉMOIRE (indépendant du store) :
//    au-delà de 3 échecs en 30 min, plus de toast — le badge d'erreurs reste la
//    seule surface. 2) carriedAttempts transporte le compteur à travers le
//    vide-remise-en-file pour que le backoff de réconciliation s'enclenche vraiment.
const ERROR_TOAST_BACKOFF_ATTEMPTS = 3;
const ERROR_TOAST_BACKOFF_MS = 30 * 60 * 1000;
const errorToastTrack = new Map<string, { attempts: number; lastTried: number }>();
const carriedAttempts = new Map<string, number>();
const shouldToastError = (key: string): boolean => {
  const t = errorToastTrack.get(key);
  if (!t) return true;
  return !(t.attempts >= ERROR_TOAST_BACKOFF_ATTEMPTS && Date.now() - t.lastTried < ERROR_TOAST_BACKOFF_MS);
};
const markErrorSeen = (key: string) => {
  const now = Date.now();
  if (errorToastTrack.size > 500) {
    for (const [k, v] of errorToastTrack) {
      if (now - v.lastTried > 24 * 60 * 60 * 1000) errorToastTrack.delete(k);
    }
  }
  const t = errorToastTrack.get(key);
  errorToastTrack.set(key, { attempts: (t?.attempts || 0) + 1, lastTried: now });
};

// ── Avertissements non bloquants (ex: flags UPDATE_PROFILE écartés) ──────────
// Id stable → dédupliqués au lieu de s'empiler (`warn-<ts>` unique à chaque fois
// créait une entrée neuve à chaque passage). Jamais remis en file, jamais toastés.
const upsertSyncWarning = async (warnId: string, type: SyncActionType, payload: any, warning: string) => {
  try {
    const errors = (await db.syncErrors.getItem<any[]>('errors')) || [];
    const entry = { action: { id: warnId, type, payload, timestamp: Date.now() }, failedAt: new Date().toISOString(), warning };
    const idx = errors.findIndex(e => e?.action?.id === warnId);
    if (idx >= 0) errors[idx] = entry;
    else errors.push(entry);
    await db.syncErrors.setItem('errors', errors);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('sync-errors-updated', { detail: { count: errors.length } }));
    }
  } catch { /* non bloquant */ }
};
const isSyncWarning = (e: any): boolean =>
  !!e?.warning || String(e?.action?.id || '').startsWith('warn-') || !!e?.action?.payload?.droppedFlags;

// Vider la file d'attente
export const processSyncQueue = async () => {
  if (syncLock) return;
  syncLock = true;
  try {
    // Base locale réparée d'abord (sinon file illisible = run fantôme).
    await ensureDbHealth().catch(() => {});
    if (navigator.onLine) {
      await ensureSupabaseAuth().catch(() => {});
    }

    const currentQueue: SyncAction[] = (await db.syncQueue.getItem('queue')) || [];
    if (currentQueue.length === 0) return;
    // Sonde rapide : manifestement hors-ligne, on n'entame pas le run.
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;

    // Purge automatique des anciennes erreurs liées aux services retirés
    // + purge des erreurs notifications déjà stockées (non-critiques : le toast
    // "Échec de synchronisation : INSERT_NOTIFICATION" ne doit plus réapparaître).
    try {
      const storedErrors = (await db.syncErrors.getItem<any[]>('errors')) || [];
      const cleanErrors = storedErrors.filter(e => !isRetiredServicePayload(e.action?.type, e.action?.payload)
        && e.action?.type !== 'INSERT_NOTIFICATION'
        && e.action?.type !== 'MARK_NOTIFICATION_READ'
        && e.action?.type !== 'MARK_ALL_NOTIFICATIONS_READ');
      if (cleanErrors.length !== storedErrors.length) {
        await db.syncErrors.setItem('errors', cleanErrors);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('sync-errors-updated', { detail: { count: cleanErrors.length } }));
        }
      }
    } catch {}

    // Purge file : jette les notifications invalides déjà enfilées (id/user_id
    // non-UUID → échec Postgres garanti). Évite de rejouer en boucle.
    try {
      const invalidNotifIds = new Set(
        currentQueue
          .filter(a => a.type === 'INSERT_NOTIFICATION' && (!isUuid(a.payload?.id) || !isUuid(a.payload?.user_id)))
          .map(a => a.id)
      );
      if (invalidNotifIds.size > 0) {
        console.warn(`[Sync] Purge file : ${invalidNotifIds.size} notification(s) invalide(s) jetée(s).`);
        const nextQueue = currentQueue.filter(a => !invalidNotifIds.has(a.id));
        await db.syncQueue.setItem('queue', nextQueue);
        // Recharge la file nettoyée pour la suite du run.
        currentQueue.length = 0;
        currentQueue.push(...nextQueue);
      }
    } catch {}

    // Tri ordonné selon les dépendances (ex: configurations et sessions avant transactions)
    const sortedQueue = [...currentQueue].sort((a, b) => {
      const pA = ACTION_PRIORITY[a.type] ?? 5;
      const pB = ACTION_PRIORITY[b.type] ?? 5;
      if (pA !== pB) return pA - pB;
      return (a.timestamp || 0) - (b.timestamp || 0);
    });

    const processedIds = new Set<string>();
    // Compteur d'échecs réseau consécutifs (head-of-line : on saute l'action
    // fautive au lieu de bloquer toute la file ; arrêt après 5 d'affilée).
    let consecutiveNetworkErrors = 0;

    for (const action of sortedQueue) {
      if (isRetiredServicePayload(action.type, action.payload)) {
        processedIds.add(action.id);
        continue;
      }
      try {
        let success = false;
        
        const executeAction = async (): Promise<boolean> => {
        switch (action.type) {
        case 'INSERT_CLIENT': {
          const { error } = await supabase.from('clients').upsert([{
            id: action.payload.id,
            name: action.payload.name,
            email: action.payload.email || null,
            phone: action.payload.phone || null,
            contact: action.payload.contact || null,
            company: action.payload.company || null,
            address: action.payload.address || null,
            status: action.payload.status || 'Actif',
            commercial_id: action.payload.commercialId || null,
            created_at: action.payload.createdAt || new Date().toISOString()
          }], { onConflict: 'id' });
          if (error) console.error('[Sync] INSERT_CLIENT échoué :', error.message);
          success = checkResult(error);
          break;
        }
        case 'UPDATE_CLIENT': {
          const { id, ...data } = action.payload;
          const mappedData: any = {};
          if (data.name !== undefined) mappedData.name = data.name;
          if (data.email !== undefined) mappedData.email = data.email;
          if (data.phone !== undefined) mappedData.phone = data.phone;
          if (data.contact !== undefined) mappedData.contact = data.contact;
          if (data.company !== undefined) mappedData.company = data.company;
          if (data.address !== undefined) mappedData.address = data.address;
          if (data.status !== undefined) mappedData.status = data.status;
          if (data.commercialId !== undefined) mappedData.commercial_id = data.commercialId;
          const { error } = await supabase.from('clients').update(mappedData).eq('id', id);
          if (error) console.error('[Sync] UPDATE_CLIENT échoué :', error.message);
          success = checkResult(error);
          break;
        }
        case 'DELETE_CLIENT': {
          const { error } = await supabase.from('clients').delete().eq('id', action.payload.id);
          success = checkResult(error);
          break;
        }
        case 'INSERT_FACTURE_PAIEMENT': {
          const payment = action.payload;
          const { error } = await supabase.from('facture_paiements').upsert([{
            id: payment.id,
            payment_number: payment.paymentNumber,
            payment_type: payment.paymentType,
            vente_id: isUuid(payment.venteId) ? payment.venteId : null,
            echeance_id: isUuid(payment.echeanceId) ? payment.echeanceId : null,
            client_id: isUuid(payment.clientId) ? payment.clientId : null,
            payment_date: payment.paymentDate,
            amount: payment.amount,
            payment_method: payment.paymentMethod,
            reference: payment.reference || null,
            proof_document_id: payment.proofDocumentId || null,
            notes: payment.notes || null,
            status: payment.status || 'VALIDE',
            recorded_by: isUuid(payment.recordedBy) ? payment.recordedBy : null,
            created_at: payment.createdAt || new Date().toISOString()
          }], { onConflict: 'id' });
          if (error) console.error('[Sync] INSERT_FACTURE_PAIEMENT échoué :', error.message);
          success = checkResult(error);
          break;
        }
        case 'INSERT_COUT': {
          const cout = action.payload;
          const { error } = await supabase.from('couts').upsert([{
            id: cout.id,
            reference: cout.reference,
            cost_type: cout.costType,
            category: cout.category,
            amount_ht: cout.amountHt,
            vat_rate: cout.vatRate || 0,
            vat_amount: cout.vatAmount || 0,
            amount_ttc: cout.amountTtc,
            date: cout.date,
            affaire_id: isUuid(cout.affaireId) ? cout.affaireId : null,
            service_id: isUuid(cout.serviceId) ? cout.serviceId : null,
            supplier_name: cout.supplierName || null,
            invoice_ref: cout.invoiceRef || null,
            description: cout.description,
            proof_document_id: cout.proofDocumentId || null,
            status: cout.status || 'VALIDE',
            created_by: isUuid(cout.createdBy) ? cout.createdBy : null,
            created_at: cout.createdAt || new Date().toISOString(),
            updated_at: cout.updatedAt || new Date().toISOString()
          }], { onConflict: 'id' });
          if (error) console.error('[Sync] INSERT_COUT échoué :', error.message);
          success = checkResult(error);
          break;
        }
        case 'UPDATE_COUT': {
          const { id, ...cData } = action.payload;
          const mappedCout: any = {};
          if (cData.costType !== undefined) mappedCout.cost_type = cData.costType;
          if (cData.category !== undefined) mappedCout.category = cData.category;
          if (cData.amountHt !== undefined) mappedCout.amount_ht = cData.amountHt;
          if (cData.vatRate !== undefined) mappedCout.vat_rate = cData.vatRate;
          if (cData.vatAmount !== undefined) mappedCout.vat_amount = cData.vatAmount;
          if (cData.amountTtc !== undefined) mappedCout.amount_ttc = cData.amountTtc;
          if (cData.date !== undefined) mappedCout.date = cData.date;
          if (cData.affaireId !== undefined) mappedCout.affaire_id = isUuid(cData.affaireId) ? cData.affaireId : null;
          if (cData.serviceId !== undefined) mappedCout.service_id = isUuid(cData.serviceId) ? cData.serviceId : null;
          if (cData.supplierName !== undefined) mappedCout.supplier_name = cData.supplierName;
          if (cData.invoiceRef !== undefined) mappedCout.invoice_ref = cData.invoiceRef;
          if (cData.description !== undefined) mappedCout.description = cData.description;
          if (cData.status !== undefined) mappedCout.status = cData.status;
          mappedCout.updated_at = new Date().toISOString();
          const { error } = await supabase.from('couts').update(mappedCout).eq('id', id);
          if (error) console.error('[Sync] UPDATE_COUT échoué :', error.message);
          success = checkResult(error);
          break;
        }
        case 'DELETE_COUT': {
          const { error } = await supabase.from('couts').delete().eq('id', action.payload.id);
          if (error) console.error('[Sync] DELETE_COUT échoué :', error.message);
          success = checkResult(error);
          break;
        }
        case 'INSERT_OBJECTIF': {
          const obj = action.payload;
          const { error } = await supabase.from('objectifs').upsert([{
            id: obj.id,
            profile_id: isUuid(obj.profileId) ? obj.profileId : null,
            service_id: isUuid(obj.serviceId) ? obj.serviceId : null,
            period_type: obj.periodType,
            start_date: obj.startDate,
            end_date: obj.endDate,
            target_revenue_ht: obj.targetRevenueHt,
            target_margin_ht: obj.targetMarginHt,
            target_deals_count: obj.targetDealsCount || 0,
            target_new_clients: obj.targetNewClients || 0,
            status: obj.status || 'EN_COURS',
            created_by: isUuid(obj.createdBy) ? obj.createdBy : null,
            created_at: obj.createdAt || new Date().toISOString()
          }], { onConflict: 'id' });
          if (error) console.error('[Sync] INSERT_OBJECTIF échoué :', error.message);
          success = checkResult(error);
          break;
        }
        case 'UPDATE_OBJECTIF': {
          const { id, ...data } = action.payload;
          const mapped: any = {};
          if (data.targetRevenueHt !== undefined) mapped.target_revenue_ht = data.targetRevenueHt;
          if (data.targetMarginHt !== undefined) mapped.target_margin_ht = data.targetMarginHt;
          if (data.targetDealsCount !== undefined) mapped.target_deals_count = data.targetDealsCount;
          if (data.targetNewClients !== undefined) mapped.target_new_clients = data.targetNewClients;
          if (data.status !== undefined) mapped.status = data.status;
          if (data.startDate !== undefined) mapped.start_date = data.startDate;
          if (data.endDate !== undefined) mapped.end_date = data.endDate;
          const { error } = await supabase.from('objectifs').update(mapped).eq('id', id);
          if (error) console.error('[Sync] UPDATE_OBJECTIF échoué :', error.message);
          success = checkResult(error);
          break;
        }
        case 'DELETE_OBJECTIF': {
          const { error } = await supabase.from('objectifs').delete().eq('id', action.payload.id);
          if (error) console.error('[Sync] DELETE_OBJECTIF échoué :', error.message);
          success = checkResult(error);
          break;
        }
        case 'INSERT_PRIME': {
          const prime = action.payload;
          const { error } = await supabase.from('primes').upsert([{
            id: prime.id,
            reference: prime.reference,
            profile_id: isUuid(prime.profileId) ? prime.profileId : null,
            service_id: isUuid(prime.serviceId) ? prime.serviceId : null,
            period_key: prime.periodKey,
            prime_type: prime.primeType,
            amount: prime.amount,
            status: prime.status || 'PROPOSEE',
            calculated_by: isUuid(prime.calculatedBy) ? prime.calculatedBy : null,
            validated_by: isUuid(prime.validatedBy) ? prime.validatedBy : null,
            justification: prime.justification || null,
            created_at: prime.createdAt || new Date().toISOString(),
            updated_at: prime.updatedAt || new Date().toISOString()
          }], { onConflict: 'id' });
          if (error) console.error('[Sync] INSERT_PRIME échoué :', error.message);
          success = checkResult(error);
          break;
        }
        case 'UPDATE_PRIME_STATUS': {
          const { id, status, validatedBy, justification } = action.payload;
          const mapped: any = { status, updated_at: new Date().toISOString() };
          if (validatedBy !== undefined) mapped.validated_by = isUuid(validatedBy) ? validatedBy : null;
          if (justification !== undefined) mapped.justification = justification;
          const { error } = await supabase.from('primes').update(mapped).eq('id', id);
          if (error) console.error('[Sync] UPDATE_PRIME_STATUS échoué :', error.message);
          success = checkResult(error);
          break;
        }
        case 'INSERT_PRIME_AUDIT_LOG': {
          const log = action.payload;
          const { error } = await supabase.from('prime_audit_logs').upsert([{
            id: log.id,
            prime_id: isUuid(log.primeId) ? log.primeId : null,
            action: log.action,
            actor_id: isUuid(log.actorId) ? log.actorId : null,
            actor_role: log.actorRole,
            previous_state: log.previousState || null,
            new_state: log.newState || null,
            comment: log.comment || null,
            created_at: log.createdAt || new Date().toISOString()
          }], { onConflict: 'id' });
          if (error) console.error('[Sync] INSERT_PRIME_AUDIT_LOG échoué :', error.message);
          success = checkResult(error);
          break;
        }
        case 'UPDATE_SCORING_RULE': {
          const { id, ...data } = action.payload;
          const mapped: any = {};
          if (data.weightMargin !== undefined) mapped.weight_margin = data.weightMargin;
          if (data.weightRevenue !== undefined) mapped.weight_revenue = data.weightRevenue;
          if (data.weightVolume !== undefined) mapped.weight_volume = data.weightVolume;
          if (data.weightConversion !== undefined) mapped.weight_conversion = data.weightConversion;
          if (data.isActive !== undefined) mapped.is_active = data.isActive;
          const { error } = await supabase.from('scoring_rules').update(mapped).eq('id', id);
          if (error) console.error('[Sync] UPDATE_SCORING_RULE échoué :', error.message);
          success = checkResult(error);
          break;
        }
        case 'UPSERT_CLASSEMENT': {
          const cl = action.payload;
          const { error } = await supabase.from('classements').upsert([{
            id: cl.id,
            profile_id: isUuid(cl.profileId) ? cl.profileId : null,
            service_id: isUuid(cl.serviceId) ? cl.serviceId : null,
            period_type: cl.periodType,
            period_key: cl.periodKey,
            score: cl.score,
            rank: cl.rank,
            revenue_achieved_ht: cl.revenueAchievedHt,
            margin_achieved_ht: cl.marginAchievedHt,
            deals_won_count: cl.dealsWonCount,
            conversion_rate: cl.conversionRate,
            updated_at: new Date().toISOString()
          }]);
          if (error) console.error('[Sync] UPSERT_CLASSEMENT échoué :', error.message);
          success = checkResult(error);
          break;
        }
        case 'INSERT_QUOTE': {
          const { lines, ...quoteData } = action.payload;
          // Chemin préféré : RPC atomique (évite devis sans lignes / doublons)
          const rpcResult = await tryRpcQuoteUpsert(quoteData, lines || [], 'INSERT_QUOTE');
          if (rpcResult === 'ok') { success = true; break; }
          if (rpcResult === 'error') { success = false; break; }
          // Repli historique (RPC non déployée)
          let { error } = await supabase.from('quotes').upsert([{
            id: quoteData.id,
            quote_number: quoteData.quoteNumber,
            client_id: isUuid(quoteData.clientId) ? quoteData.clientId : null,
            commercial_id: isUuid(quoteData.commercialId) ? quoteData.commercialId : null,
            service_id: isUuid(quoteData.serviceId) ? quoteData.serviceId : null,
            affaire_id: null,
            subject: quoteData.subject,
            subtotal: quoteData.subtotal,
            vat: quoteData.vat ?? 0,
            total: quoteData.total,
            status: quoteData.status,
            date: quoteData.date,
            valid_until: quoteData.validUntil || null,
            payment_terms: quoteData.paymentTerms || null,
            notes: quoteData.notes || null,
            signatory_name: quoteData.signatoryName || null,
            signatory_role: quoteData.signatoryRole || null,
            style: quoteData.style,
            accent_color: quoteData.accentColor,
            discount_percent: quoteData.discountPercent || 0,
            discount_amount: quoteData.discountAmount || 0,
            client_comment: quoteData.clientComment || null
          }], { onConflict: 'id' });

          if (error && isUniqueViolationError(error)) {
            const retryNumber = nextQuoteNumberCandidate(quoteData.quoteNumber);
            console.warn(`[Sync] INSERT_QUOTE numéro en doublon, régénération ${quoteData.quoteNumber} -> ${retryNumber}`);
            const retry = await supabase.from('quotes').upsert([{
              id: quoteData.id,
              quote_number: retryNumber,
              client_id: isUuid(quoteData.clientId) ? quoteData.clientId : null,
              commercial_id: isUuid(quoteData.commercialId) ? quoteData.commercialId : null,
              service_id: isUuid(quoteData.serviceId) ? quoteData.serviceId : null,
              affaire_id: null,
              subject: quoteData.subject,
              subtotal: quoteData.subtotal,
              vat: quoteData.vat ?? 0,
              total: quoteData.total,
              status: quoteData.status,
              date: quoteData.date,
              valid_until: quoteData.validUntil || null,
              payment_terms: quoteData.paymentTerms || null,
              notes: quoteData.notes || null,
              signatory_name: quoteData.signatoryName || null,
              signatory_role: quoteData.signatoryRole || null,
              style: quoteData.style,
              accent_color: quoteData.accentColor,
              discount_percent: quoteData.discountPercent || 0,
              discount_amount: quoteData.discountAmount || 0,
              client_comment: quoteData.clientComment || null
            }], { onConflict: 'id' });
            error = retry.error;
            if (!error) await backfillLocalQuoteNumber(quoteData.id, retryNumber);
          }

          if (!error && lines && lines.length > 0) {
            const linesData = lines.map((l: any) => ({
              id: isUuid(l.id) ? l.id : uuidv4(),
              quote_id: quoteData.id,
              prestation_id: isUuid(l.prestationId) ? l.prestationId : null,
              description: l.description,
              quantity: l.quantity,
              unit: l.unit || null,
              unit_price: l.unitPrice,
              discount_percent: l.discountPercent || 0,
              cost_price: l.costPrice || 0,
              total: l.total
            }));
            const { error: lineErr } = await supabase.from('quote_lines').upsert(linesData, { onConflict: 'id' });
            if (lineErr && isNetworkOrTransientError(lineErr)) throw new Error(`[NetworkError] ${lineErr.message}`);
            if (lineErr) {
              console.error('[Sync] INSERT_QUOTE lignes échouées :', lineErr.message);
              success = checkResult(lineErr);
              break;
            }
          }
          if (error) console.error('[Sync] INSERT_QUOTE échoué :', error.message);
          success = checkResult(error);
          break;
        }
        case 'UPDATE_QUOTE': {
          const { lines, ...quoteData } = action.payload;
          // Chemin préféré : RPC atomique (remplace le delete+insert non transactionnel)
          const rpcResult = await tryRpcQuoteUpsert(quoteData, lines || [], 'UPDATE_QUOTE');
          if (rpcResult === 'ok') { success = true; break; }
          if (rpcResult === 'error') { success = false; break; }
          // Repli historique
          const { error } = await supabase.from('quotes').update({
            quote_number: quoteData.quoteNumber,
            client_id: isUuid(quoteData.clientId) ? quoteData.clientId : null,
            commercial_id: isUuid(quoteData.commercialId) ? quoteData.commercialId : null,
            service_id: isUuid(quoteData.serviceId) ? quoteData.serviceId : null,
            affaire_id: null,
            subject: quoteData.subject,
            subtotal: quoteData.subtotal,
            vat: quoteData.vat ?? 0,
            total: quoteData.total,
            status: quoteData.status,
            date: quoteData.date,
            valid_until: quoteData.validUntil !== undefined ? quoteData.validUntil : null,
            payment_terms: quoteData.paymentTerms !== undefined ? quoteData.paymentTerms : null,
            notes: quoteData.notes !== undefined ? quoteData.notes : null,
            signatory_name: quoteData.signatoryName !== undefined ? quoteData.signatoryName : null,
            signatory_role: quoteData.signatoryRole !== undefined ? quoteData.signatoryRole : null,
            style: quoteData.style,
            accent_color: quoteData.accentColor,
            discount_percent: quoteData.discountPercent || 0,
            discount_amount: quoteData.discountAmount || 0,
            client_comment: quoteData.clientComment !== undefined ? quoteData.clientComment : null
          }).eq('id', quoteData.id);

          if (!error) {
            // Repli historique : upsert d'abord, suppression des obsolètes après
            // succès (jamais de delete-first : un échec laisserait 0 ligne).
            if (lines && lines.length > 0) {
              const linesData = lines.map((l: any) => ({
                id: isUuid(l.id) ? l.id : uuidv4(),
                quote_id: quoteData.id,
                prestation_id: isUuid(l.prestationId) ? l.prestationId : null,
                description: l.description,
                quantity: l.quantity,
                unit: l.unit || null,
                unit_price: l.unitPrice,
                discount_percent: l.discountPercent || 0,
                cost_price: l.costPrice || 0,
                total: l.total
              }));
              const { error: insLinesErr } = await supabase.from('quote_lines').upsert(linesData, { onConflict: 'id' });
              if (insLinesErr) {
                if (isNetworkOrTransientError(insLinesErr)) throw new Error(`[NetworkError] ${insLinesErr.message}`);
                console.error('[Sync] UPDATE_QUOTE lignes échouées :', insLinesErr.message);
                success = checkResult(insLinesErr);
                break;
              }
              try {
                const { data: existing } = await supabase.from('quote_lines').select('id').eq('quote_id', quoteData.id);
                const keep = new Set(linesData.map((l: any) => l.id));
                const doomed = ((existing as any[]) || []).map(r => r.id).filter((lid: string) => !keep.has(lid));
                if (doomed.length > 0) {
                  const { error: delErr } = await supabase.from('quote_lines').delete().in('id', doomed);
                  if (delErr) {
                    if (isNetworkOrTransientError(delErr)) throw new Error(`[NetworkError] ${delErr.message}`);
                    console.error('[Sync] UPDATE_QUOTE purge obsolètes échouée :', delErr.message);
                  }
                }
              } catch (e: any) {
                if (String(e?.message || '').startsWith('[NetworkError]')) throw e;
              }
            }
          }
          if (error) console.error('[Sync] UPDATE_QUOTE échoué :', error.message);
          success = checkResult(error);
          break;
        }
        case 'DELETE_QUOTE': {
          const { error } = await supabase.from('quotes').delete().eq('id', action.payload.id);
          success = checkResult(error);
          break;
        }
        case 'INSERT_SALE': {
          const { lines, ...saleData } = action.payload;
          const { error } = await supabase.from('ventes').upsert([{
            id: saleData.id,
            sale_number: saleData.saleNumber,
            quote_id: isUuid(saleData.quoteId) ? saleData.quoteId : null,
            affaire_id: null,
            client_id: isUuid(saleData.clientId) ? saleData.clientId : null,
            service_id: isUuid(saleData.serviceId) ? saleData.serviceId : null,
            commercial_id: isUuid(saleData.commercialId) ? saleData.commercialId : null,
            due_date: saleData.dueDate || null,
            subtotal: saleData.subtotal,
            vat: saleData.vat ?? 0,
            total: saleData.total,
            status: saleData.status,
            date: saleData.date,
            notes: saleData.notes || null
          }], { onConflict: 'id' });
          
          if (!error && lines && lines.length > 0) {
            const linesData = lines.map((l: any) => ({
              id: isUuid(l.id) ? l.id : uuidv4(),
              vente_id: saleData.id,
              description: l.description,
              quantity: l.quantity,
              unit_price: l.unitPrice,
              cost_price: l.costPrice || 0,
              total: l.total
            }));
            const { error: lineErr } = await supabase.from('vente_lines').upsert(linesData, { onConflict: 'id' });
            if (lineErr && isNetworkOrTransientError(lineErr)) throw new Error(`[NetworkError] ${lineErr.message}`);
            if (lineErr) {
              console.error('[Sync] INSERT_SALE lignes échouées :', lineErr.message);
              success = checkResult(lineErr);
              break;
            }
          }
          if (error) console.error('[Sync] INSERT_SALE échoué :', error.message);
          success = checkResult(error);
          break;
        }
        case 'UPDATE_SALE': {
          const { lines, ...saleData } = action.payload;
          const { error } = await supabase.from('ventes').update({
            sale_number: saleData.saleNumber,
            quote_id: isUuid(saleData.quoteId) ? saleData.quoteId : null,
            affaire_id: null,
            client_id: isUuid(saleData.clientId) ? saleData.clientId : null,
            service_id: isUuid(saleData.serviceId) ? saleData.serviceId : null,
            commercial_id: isUuid(saleData.commercialId) ? saleData.commercialId : null,
            due_date: saleData.dueDate !== undefined ? saleData.dueDate : null,
            subtotal: saleData.subtotal,
            vat: saleData.vat ?? 0,
            total: saleData.total,
            status: saleData.status,
            date: saleData.date,
            notes: saleData.notes || null
          }).eq('id', saleData.id);

          if (!error) {
            // Upsert d'abord, purge des obsolètes après succès (jamais de delete-first).
            if (lines && lines.length > 0) {
              const linesData = lines.map((l: any) => ({
                id: isUuid(l.id) ? l.id : uuidv4(),
                vente_id: saleData.id,
                description: l.description,
                quantity: l.quantity,
                unit_price: l.unitPrice,
                cost_price: l.costPrice || 0,
                total: l.total
              }));
              const { error: insLinesErr } = await supabase.from('vente_lines').upsert(linesData, { onConflict: 'id' });
              if (insLinesErr) {
                if (isNetworkOrTransientError(insLinesErr)) throw new Error(`[NetworkError] ${insLinesErr.message}`);
                console.error('[Sync] UPDATE_SALE lignes échouées :', insLinesErr.message);
                success = checkResult(insLinesErr);
                break;
              }
              try {
                const { data: existing } = await supabase.from('vente_lines').select('id').eq('vente_id', saleData.id);
                const keep = new Set(linesData.map((l: any) => l.id));
                const doomed = ((existing as any[]) || []).map(r => r.id).filter((lid: string) => !keep.has(lid));
                if (doomed.length > 0) {
                  const { error: delErr } = await supabase.from('vente_lines').delete().in('id', doomed);
                  if (delErr) {
                    if (isNetworkOrTransientError(delErr)) throw new Error(`[NetworkError] ${delErr.message}`);
                    console.error('[Sync] UPDATE_SALE purge obsolètes échouée :', delErr.message);
                  }
                }
              } catch (e: any) {
                if (String(e?.message || '').startsWith('[NetworkError]')) throw e;
              }
            }
          }
          if (error) console.error('[Sync] UPDATE_SALE échoué :', error.message);
          success = checkResult(error);
          break;
        }
        case 'DELETE_SALE': {
          const { error } = await supabase.from('ventes').delete().eq('id', action.payload.id);
          success = checkResult(error);
          break;
        }
        case 'INSERT_COMMISSION': {
          const { error } = await supabase.from('commissions').upsert([{
            id: action.payload.id,
            vente_id: isUuid(action.payload.saleId) ? action.payload.saleId : null,
            affaire_id: null,
            client_id: isUuid(action.payload.clientId) ? action.payload.clientId : null,
            commercial_id: isUuid(action.payload.commercialId) ? action.payload.commercialId : null,
            service_id: isUuid(action.payload.serviceId) ? action.payload.serviceId : null,
            total_ht: action.payload.totalHt,
            cost_total: action.payload.costTotal,
            margin_amount: action.payload.marginAmount,
            margin_percent: action.payload.marginPercent,
            commission_percent: action.payload.commissionPercent,
            commission_amount: action.payload.commissionAmount,
            paid_amount: action.payload.paidAmount || 0,
            status: action.payload.status
          }], { onConflict: 'id' });
          if (error) console.error('[Sync] INSERT_COMMISSION échoué :', error.message);
          success = checkResult(error);
          break;
        }
        case 'UPDATE_COMMISSION': {
          const { id, ...updateData } = action.payload;
          const mappedData: any = {};
          if (updateData.totalHt !== undefined) mappedData.total_ht = updateData.totalHt;
          if (updateData.costTotal !== undefined) mappedData.cost_total = updateData.costTotal;
          if (updateData.marginAmount !== undefined) mappedData.margin_amount = updateData.marginAmount;
          if (updateData.marginPercent !== undefined) mappedData.margin_percent = updateData.marginPercent;
          if (updateData.commissionPercent !== undefined) mappedData.commission_percent = updateData.commissionPercent;
          if (updateData.commissionAmount !== undefined) mappedData.commission_amount = updateData.commissionAmount;
          if (updateData.status !== undefined) mappedData.status = updateData.status;
          if (updateData.paidAmount !== undefined) mappedData.paid_amount = updateData.paidAmount;
          const { error } = await supabase.from('commissions').update(mappedData).eq('id', id);
          if (error) console.error('[Sync] UPDATE_COMMISSION échoué :', error.message);
          success = checkResult(error);
          break;
        }
        case 'DELETE_COMMISSION': {
          const { error } = await supabase.from('commissions').delete().eq('id', action.payload.id);
          success = checkResult(error);
          break;
        }
        case 'INSERT_INSTALLMENT': {
          const { error } = await supabase.from('vente_echeances').upsert([{
            id: action.payload.id,
            vente_id: isUuid(action.payload.saleId) ? action.payload.saleId : null,
            amount: action.payload.amount,
            due_date: action.payload.dueDate,
            paid_amount: action.payload.paidAmount || 0,
            status: action.payload.status,
            paid_at: action.payload.paidAt || null
          }], { onConflict: 'id' });
          if (error) console.error('[Sync] INSERT_INSTALLMENT échoué :', error.message);
          success = checkResult(error);
          break;
        }
        case 'UPDATE_INSTALLMENT': {
          const { error } = await supabase.from('vente_echeances').update({
            amount: action.payload.amount,
            due_date: action.payload.dueDate,
            paid_amount: action.payload.paidAmount,
            status: action.payload.status,
            paid_at: action.payload.paidAt || null
          }).eq('id', action.payload.id);
          if (error) console.error('[Sync] UPDATE_INSTALLMENT échoué :', error.message);
          success = checkResult(error);
          break;
        }
        case 'DELETE_INSTALLMENT': {
          const { error } = await supabase.from('vente_echeances').delete().eq('id', action.payload.id);
          success = checkResult(error);
          break;
        }
        case 'INSERT_PROSPECT': {
          const { error } = await supabase.from('prospects').upsert([{
            id: action.payload.id,
            prospect_number: action.payload.prospectNumber,
            commercial_id: isUuid(action.payload.commercialId) ? action.payload.commercialId : null,
            service_id: isUuid(action.payload.serviceId) ? action.payload.serviceId : null,
            category_id: isUuid(action.payload.categoryId) ? action.payload.categoryId : null,
            type: action.payload.type,
            name: action.payload.name,
            company: action.payload.company || null,
            phone: action.payload.phone || null,
            email: action.payload.email || null,
            address: action.payload.address || null,
            city: action.payload.city || null,
            source: action.payload.source || null,
            interest_level: action.payload.interestLevel,
            budget: action.payload.budget || 0,
            need: action.payload.need || null,
            comments: action.payload.comments || null,
            status: action.payload.status,
            responsible_id: isUuid(action.payload.responsibleId) ? action.payload.responsibleId : null
          }], { onConflict: 'id' });
          if (error) console.error('[Sync] INSERT_PROSPECT échoué :', error.message);
          success = checkResult(error);
          break;
        }
        case 'UPDATE_PROSPECT': {
          const { id, ...updateData } = action.payload;
          const mappedData: any = {};
          if (updateData.type !== undefined) mappedData.type = updateData.type;
          if (updateData.name !== undefined) mappedData.name = updateData.name;
          if (updateData.company !== undefined) mappedData.company = updateData.company;
          if (updateData.phone !== undefined) mappedData.phone = updateData.phone;
          if (updateData.email !== undefined) mappedData.email = updateData.email;
          if (updateData.address !== undefined) mappedData.address = updateData.address;
          if (updateData.city !== undefined) mappedData.city = updateData.city;
          if (updateData.source !== undefined) mappedData.source = updateData.source;
          if (updateData.interestLevel !== undefined) mappedData.interest_level = updateData.interestLevel;
          if (updateData.budget !== undefined) mappedData.budget = updateData.budget;
          if (updateData.need !== undefined) mappedData.need = updateData.need;
          if (updateData.comments !== undefined) mappedData.comments = updateData.comments;
          if (updateData.status !== undefined) mappedData.status = updateData.status;
          if (updateData.categoryId !== undefined) mappedData.category_id = isUuid(updateData.categoryId) ? updateData.categoryId : null;
          if (updateData.commercialId !== undefined) mappedData.commercial_id = isUuid(updateData.commercialId) ? updateData.commercialId : null;
          if (updateData.serviceId !== undefined) mappedData.service_id = isUuid(updateData.serviceId) ? updateData.serviceId : null;
          if (updateData.responsibleId !== undefined) mappedData.responsible_id = isUuid(updateData.responsibleId) ? updateData.responsibleId : null;
          if (updateData.updated_at !== undefined) mappedData.updated_at = updateData.updated_at;
          const { error } = await supabase.from('prospects').update(mappedData).eq('id', id);
          if (error) console.error('[Sync] UPDATE_PROSPECT échoué :', error.message);
          success = checkResult(error);
          break;
        }
        case 'DELETE_PROSPECT': {
          const { error } = await supabase.from('prospects').delete().eq('id', action.payload.id);
          success = checkResult(error);
          break;
        }
        case 'INSERT_PROSPECT_ACTIVITY': {
          const { error } = await supabase.from('prospect_activities').upsert([{
            id: action.payload.id,
            prospect_id: isUuid(action.payload.prospectId) ? action.payload.prospectId : null,
            type: action.payload.type,
            description: action.payload.description || null,
            date: action.payload.date,
            created_by: isUuid(action.payload.createdBy) ? action.payload.createdBy : null
          }], { onConflict: 'id' });
          if (error) console.error('[Sync] INSERT_PROSPECT_ACTIVITY échoué :', error.message);
          success = checkResult(error);
          break;
        }
        case 'DELETE_PROSPECT_ACTIVITY': {
          const { error } = await supabase.from('prospect_activities').delete().eq('id', action.payload.id);
          success = checkResult(error);
          break;
        }
        case 'INSERT_PROSPECT_FOLLOW_UP': {
          const { error } = await supabase.from('prospect_follow_ups').upsert([{
            id: action.payload.id,
            prospect_id: isUuid(action.payload.prospectId) ? action.payload.prospectId : null,
            date: action.payload.date,
            time: action.payload.time || null,
            priority: action.payload.priority,
            observation: action.payload.observation || null,
            status: action.payload.status
          }], { onConflict: 'id' });
          if (error) console.error('[Sync] INSERT_PROSPECT_FOLLOW_UP échoué :', error.message);
          success = checkResult(error);
          break;
        }
        case 'UPDATE_PROSPECT_FOLLOW_UP': {
          const { id, ...updateData } = action.payload;
          const { error } = await supabase.from('prospect_follow_ups').update({ status: updateData.status }).eq('id', id);
          if (error) console.error('[Sync] UPDATE_PROSPECT_FOLLOW_UP échoué :', error.message);
          success = checkResult(error);
          break;
        }
        case 'DELETE_PROSPECT_FOLLOW_UP': {
          const { error } = await supabase.from('prospect_follow_ups').delete().eq('id', action.payload.id);
          success = checkResult(error);
          break;
        }
        case 'INSERT_CATEGORY': {
          const { error } = await supabase.from('categories').upsert([{
            id: action.payload.id,
            service_id: isUuid(action.payload.serviceId) ? action.payload.serviceId : null,
            name: action.payload.name
          }], { onConflict: 'id' });
          if (error) console.error('[Sync] INSERT_CATEGORY échoué :', error.message);
          success = checkResult(error);
          break;
        }
        case 'DELETE_CATEGORY': {
          const { error } = await supabase.from('categories').delete().eq('id', action.payload.id);
          success = checkResult(error);
          break;
        }
        case 'UPDATE_SETTINGS': {
          const { error } = await supabase.from('settings').upsert({
            id: 1,
            company_name: action.payload.companyName,
            company_logo: action.payload.companyLogo,
            company_address: action.payload.companyAddress,
            company_siret: action.payload.companySiret,
            company_tva: action.payload.companyTva,
            default_terms: action.payload.defaultTerms,
            header_logo_base64: action.payload.headerLogoBase64 ?? null,
            company_stamp_base64: action.payload.companyStampBase64 ?? null,
            default_validity: action.payload.defaultValidity ?? null,
            site_url: action.payload.siteUrl ?? null,
            commission_rate: action.payload.commissionRate ?? null,
            company_capital: action.payload.companyCapital ?? null,
            company_phone: action.payload.companyPhone ?? null,
            company_email: action.payload.companyEmail ?? null,
            bank_iban: action.payload.bankIban ?? null,
          });
          if (error) console.error('[Sync] UPDATE_SETTINGS échoué :', error.message);
          success = checkResult(error);
          break;
        }

        case 'INSERT_ACTIVITY_REPORT': { // @deprecated V1
          const { error } = await supabase.from('activity_reports').upsert([{
            id: action.payload.id,
            author_id: action.payload.authorId,
            role: action.payload.role,
            type: action.payload.type,
            date: action.payload.date,
            realisations: action.payload.realisations || null,
            difficultes: action.payload.difficultes || null,
            remarques: action.payload.remarques || null
          }], { onConflict: 'id' });
          if (error) console.error('[Sync] INSERT_ACTIVITY_REPORT échoué :', error.message);
          success = checkResult(error);
          break;
        }
        case 'UPDATE_ACTIVITY_REPORT': { // @deprecated V1
          const { error } = await supabase.from('activity_reports').update({
            role: action.payload.role,
            type: action.payload.type,
            date: action.payload.date,
            realisations: action.payload.realisations || null,
            difficultes: action.payload.difficultes || null,
            remarques: action.payload.remarques || null,
            updated_at: action.payload.updatedAt || new Date().toISOString()
          }).eq('id', action.payload.id);
          if (error) console.error('[Sync] UPDATE_ACTIVITY_REPORT échoué :', error.message);
          success = checkResult(error);
          break;
        }
        case 'DELETE_ACTIVITY_REPORT': { // @deprecated V1
          const { error } = await supabase.from('activity_reports').delete().eq('id', action.payload.id);
          success = checkResult(error);
          break;
        }
        case 'INSERT_WEEKLY_REPORT': { // @deprecated V1
          const { error } = await supabase.from('weekly_reports').upsert([{
            id: action.payload.id,
            author_id: action.payload.authorId,
            role: action.payload.role,
            week_start: action.payload.weekStart,
            sections: action.payload.sections || [],
            kpis: action.payload.kpis || {},
            status: action.payload.status || 'Brouillon'
          }], { onConflict: 'id' });
          if (error) console.error('[Sync] INSERT_WEEKLY_REPORT échoué :', error.message);
          success = checkResult(error);
          break;
        }
        case 'UPDATE_WEEKLY_REPORT': { // @deprecated V1 - Always needed for markWeeklyReportRead by managers on old reports
          const { sent_at, status, ...rest } = action.payload;
          const mapped: any = {};
          if (rest.sections !== undefined) mapped.sections = rest.sections;
          if (rest.kpis !== undefined) mapped.kpis = rest.kpis;
          if (status !== undefined) mapped.status = status;
          if (sent_at !== undefined) mapped.sent_at = sent_at;
          const { error } = await supabase.from('weekly_reports').update(mapped).eq('id', action.payload.id);
          if (error) console.error('[Sync] UPDATE_WEEKLY_REPORT échoué :', error.message);
          success = checkResult(error);
          break;
        }
        case 'INSERT_V2_DAILY_REPORT': {
          const payload = action.payload;
          let { error } = await supabase.from('v2_daily_reports').upsert([{
            id: payload.id, 
            author_id: payload.authorId, 
            date: payload.date, 
            project: payload.project || 'HINOV GROUP',
            objectives: payload.objectives || '', 
            tasks: payload.tasks || [], 
            results: payload.results || '',
            difficulties: payload.difficulties || '', 
            observations: payload.observations || '',
            status: payload.status || 'Brouillon',
            is_locked: !!payload.isLocked,
            category: payload.category || 'Opérationnel'
          }], { onConflict: 'id' });

          if (error && (error.code === '42703' || error.message?.includes('column'))) {
            const fallbackRes = await supabase.from('v2_daily_reports').upsert([{
              id: payload.id, 
              author_id: payload.authorId, 
              date: payload.date, 
              project: payload.project || 'Général',
              objectives: payload.objectives || '', 
              tasks: payload.tasks || [], 
              results: payload.results || '',
              difficulties: payload.difficulties || '', 
              observations: payload.observations || ''
            }], { onConflict: 'id' });
            error = fallbackRes.error;
          }

          // Auto-réparation 23505 : doublon naturel (author_id, date, project) —
          // deux brouillons locaux pour le même jour (ids re-mintés à chaque save).
          if (error && isUniqueViolationError(error)) {
            console.warn('[Sync] INSERT_V2_DAILY_REPORT doublon naturel, rabattement sur la ligne serveur');
            const rep = await repairDailyUniqueAndUpdate({
              author_id: payload.authorId,
              date: payload.date,
              project: payload.project || 'HINOV GROUP',
              objectives: payload.objectives || '',
              tasks: payload.tasks || [],
              results: payload.results || '',
              difficulties: payload.difficulties || '',
              observations: payload.observations || '',
              status: payload.status || 'Brouillon',
              is_locked: !!payload.isLocked,
              category: payload.category || 'Opérationnel'
            }, payload.id);
            error = rep.error;
          }

          if (error) console.error('[Sync] INSERT_V2_DAILY_REPORT échoué :', error.message);
          success = checkResult(error);
          break;
        }
        case 'UPDATE_V2_DAILY_REPORT': {
          const payload = action.payload;
          const mapped: any = {
            date: payload.date, 
            project: payload.project,
            objectives: payload.objectives, 
            tasks: payload.tasks, 
            results: payload.results,
            difficulties: payload.difficulties, 
            observations: payload.observations,
            status: payload.status || undefined,
            updated_at: payload.updatedAt || new Date().toISOString()
          };
          if (payload.isLocked !== undefined) mapped.is_locked = !!payload.isLocked;
          if (payload.category !== undefined) mapped.category = payload.category;
          if (mapped.status === undefined) delete mapped.status;

          let { error } = await supabase.from('v2_daily_reports').update(mapped).eq('id', payload.id);

          if (error && (error.code === '42703' || error.message?.includes('column'))) {
            delete mapped.is_locked;
            delete mapped.category;
            delete mapped.status;
            const fallbackRes = await supabase.from('v2_daily_reports').update(mapped).eq('id', payload.id);
            error = fallbackRes.error;
          }

          if (error) console.error('[Sync] UPDATE_V2_DAILY_REPORT échoué :', error.message);
          success = checkResult(error);
          break;
        }
        case 'INSERT_V2_WEEKLY_REPORT': {
          const r = action.payload;
          const insertPayload: any = {
            id: r.id,
            author_id: r.authorId,
            week_start: r.weekStart,
            week_end: r.weekEnd || null,
            project: r.project || 'Général',
            daily_report_ids: r.dailyReportIds || [],
            weekly_objectives: r.weeklyObjectives || '',
            tasks_by_day: r.tasksByDay || {},
            pending_tasks: r.pendingTasks || [],
            summary: r.summary || r.aiSummary || '',
            ai_summary: r.aiSummary || r.summary || '',
            achievements: r.achievements || '',
            difficulties: r.difficulties || '',
            next_week_objectives: r.nextWeekObjectives || '',
            conclusion: r.conclusion || '',
            director_comment: r.directorComment || null,
            submitted_at: r.submittedAt || null,
            reviewed_at: r.reviewedAt || null,
            reviewed_by: (r.reviewedBy && isUuid(r.reviewedBy)) ? r.reviewedBy : null,
            status: r.status || 'Brouillon',
            is_locked: !!r.isLocked,
            pdf_url: r.pdfUrl || null
          };

          let { error } = await supabase.from('v2_weekly_reports').upsert([insertPayload], { onConflict: 'id' });

          // Auto-réparation 1 : Erreur contrainte CHECK de statut
          if (error && (error.code === '23514' || error.message?.includes('check constraint') || error.message?.includes('status'))) {
            console.warn('[Sync] INSERT_V2_WEEKLY_REPORT contrainte de statut, auto-réparation avec statut compatible');
            insertPayload.status = (insertPayload.status === 'Validé' || insertPayload.status === 'Relu') ? 'Validé' : 'Brouillon';
            const fallbackRes = await supabase.from('v2_weekly_reports').upsert([insertPayload], { onConflict: 'id' });
            error = fallbackRes.error;
          }

          // Auto-réparation 2 : Colonnes manquantes dans la table
          if (error && (error.code === '42703' || error.message?.includes('column') || error.message?.includes('schema'))) {
            console.warn('[Sync] INSERT_V2_WEEKLY_REPORT colonnes manquantes, repli sur le schéma de base');
            const safeBaseInsert: any = {
              id: r.id,
              author_id: r.authorId,
              week_start: r.weekStart,
              project: r.project || 'Général',
              daily_report_ids: r.dailyReportIds || [],
              weekly_objectives: r.weeklyObjectives || '',
              tasks_by_day: r.tasksByDay || {},
              pending_tasks: r.pendingTasks || [],
              summary: [
                r.summary || r.aiSummary || '',
                r.achievements ? `\n\n[Réalisations]\n${r.achievements}` : '',
                r.difficulties ? `\n\n[Difficultés]\n${r.difficulties}` : '',
                r.directorComment ? `\n\n[Commentaire Direction]\n${r.directorComment}` : ''
              ].filter(Boolean).join(''),
              next_week_objectives: r.nextWeekObjectives || '',
              conclusion: r.conclusion || '',
              status: (r.status === 'Validé' || r.status === 'Relu') ? 'Validé' : 'Brouillon'
            };
            const fallbackRes = await supabase.from('v2_weekly_reports').upsert([safeBaseInsert], { onConflict: 'id' });
            error = fallbackRes.error;
          }

          // Auto-réparation 3 : doublon naturel UNIQUE(author_id, week_start, project) —
          // deux brouillons locaux pour la même semaine (ids re-mintés, lookups
          // désynchronisés entre écrans). Rabattu sur la ligne serveur existante.
          if (error && isUniqueViolationError(error)) {
            console.warn('[Sync] INSERT_V2_WEEKLY_REPORT doublon naturel, rabattement sur la ligne serveur');
            const rep = await repairWeeklyUniqueAndUpdate(insertPayload, r.id);
            error = rep.error;
          }

          if (error) console.error('[Sync] INSERT_V2_WEEKLY_REPORT échoué après auto-réparation :', error.message);
          success = checkResult(error);
          break;
        }
        case 'UPDATE_V2_WEEKLY_REPORT': {
          const r = action.payload;
          const mapped: any = { updated_at: r.updatedAt || new Date().toISOString() };
          if (r.project !== undefined) mapped.project = r.project;
          if (r.weekEnd !== undefined) mapped.week_end = r.weekEnd;
          if (r.dailyReportIds !== undefined) mapped.daily_report_ids = r.dailyReportIds;
          if (r.weeklyObjectives !== undefined) mapped.weekly_objectives = r.weeklyObjectives;
          if (r.tasksByDay !== undefined) mapped.tasks_by_day = r.tasksByDay;
          if (r.pendingTasks !== undefined) mapped.pending_tasks = r.pendingTasks;
          if (r.summary !== undefined || r.aiSummary !== undefined) {
            mapped.summary = r.summary || r.aiSummary || '';
            mapped.ai_summary = r.aiSummary || r.summary || '';
          }
          if (r.achievements !== undefined) mapped.achievements = r.achievements;
          if (r.difficulties !== undefined) mapped.difficulties = r.difficulties;
          if (r.nextWeekObjectives !== undefined) mapped.next_week_objectives = r.nextWeekObjectives;
          if (r.conclusion !== undefined) mapped.conclusion = r.conclusion;
          if (r.directorComment !== undefined) mapped.director_comment = r.directorComment;
          if (r.submittedAt !== undefined) mapped.submitted_at = r.submittedAt;
          if (r.reviewedAt !== undefined) mapped.reviewed_at = r.reviewedAt;
          if (r.reviewedBy !== undefined && isUuid(r.reviewedBy)) mapped.reviewed_by = r.reviewedBy;
          if (r.status !== undefined) mapped.status = r.status;
          if (r.isLocked !== undefined) mapped.is_locked = !!r.isLocked;
          if (r.pdfUrl !== undefined) mapped.pdf_url = r.pdfUrl;

          let { error } = await supabase.from('v2_weekly_reports').update(mapped).eq('id', r.id);

          // Auto-réparation 1 : Si erreur de contrainte CHECK sur le statut (ex: status='Soumis' ou 'Relu' non supporté par l'ancien schéma)
          if (error && (error.code === '23514' || error.message?.includes('check constraint') || error.message?.includes('status'))) {
            console.warn('[Sync] UPDATE_V2_WEEKLY_REPORT contrainte de statut détectée, auto-réparation avec statut compatible');
            const safeStatus = (mapped.status === 'Validé' || mapped.status === 'Relu') ? 'Validé' : 'Brouillon';
            const fallbackMapped = { ...mapped, status: safeStatus };
            const fallbackRes = await supabase.from('v2_weekly_reports').update(fallbackMapped).eq('id', r.id);
            error = fallbackRes.error;
          }

          // Auto-réparation 2 : Si colonnes récentes manquantes (ex: 42703 / PGRST204 column does not exist)
          if (error && (error.code === '42703' || error.message?.includes('column') || error.message?.includes('schema'))) {
            console.warn('[Sync] UPDATE_V2_WEEKLY_REPORT colonnes manquantes détectées, repli sur le schéma de base');
            const safeBaseMapped: any = {
              updated_at: mapped.updated_at,
              weekly_objectives: mapped.weekly_objectives,
              tasks_by_day: mapped.tasks_by_day,
              pending_tasks: mapped.pending_tasks,
              summary: [
                mapped.summary || '',
                mapped.achievements ? `\n\n[Réalisations]\n${mapped.achievements}` : '',
                mapped.difficulties ? `\n\n[Difficultés]\n${mapped.difficulties}` : '',
                mapped.director_comment ? `\n\n[Commentaire Direction]\n${mapped.director_comment}` : ''
              ].filter(Boolean).join(''),
              next_week_objectives: mapped.next_week_objectives,
              conclusion: mapped.conclusion,
              status: (mapped.status === 'Validé' || mapped.status === 'Relu') ? 'Validé' : 'Brouillon'
            };
            if (mapped.project) safeBaseMapped.project = mapped.project;
            if (mapped.daily_report_ids) safeBaseMapped.daily_report_ids = mapped.daily_report_ids;
            
            const fallbackRes = await supabase.from('v2_weekly_reports').update(safeBaseMapped).eq('id', r.id);
            error = fallbackRes.error;
          }

          if (error) console.error('[Sync] UPDATE_V2_WEEKLY_REPORT échoué après auto-réparation :', error.message);
          success = checkResult(error);
          break;
        }
        case 'DELETE_V2_WEEKLY_REPORT': {
          const { error } = await supabase.from('v2_weekly_reports').delete().eq('id', action.payload.id);
          success = checkResult(error);
          break;
        }
        case 'DELETE_V2_DAILY_REPORT': {
          const { error } = await supabase.from('v2_daily_reports').delete().eq('id', action.payload.id);
          success = checkResult(error);
          break;
        }
        case 'INSERT_CRM_FOLDER': {
          const folder = action.payload;
          let { error } = await supabase.from('crm_folders').upsert([{
            id: folder.id,
            name: folder.name,
            owner_id: isUuid(folder.ownerId) ? folder.ownerId : null,
            parent_id: isUuid(folder.parentId) ? folder.parentId : null,
            color: folder.color || '#1879C8',
            is_shared: !!folder.isShared
          }], { onConflict: 'id' });
          if (error && isForeignKeyError(error)) {
            console.warn('[Sync] INSERT_CRM_FOLDER violation FK détectée, auto-réparation avec relations nulles');
            const fallback = await supabase.from('crm_folders').upsert([{
              id: folder.id,
              name: folder.name,
              owner_id: null,
              parent_id: null,
              color: folder.color || '#1879C8',
              is_shared: !!folder.isShared
            }], { onConflict: 'id' });
            error = fallback.error;
          }
          if (error) console.error('[Sync] INSERT_CRM_FOLDER échoué :', error.message);
          success = checkResult(error);
          break;
        }
        case 'UPDATE_CRM_FOLDER': {
          let { error } = await supabase.from('crm_folders').update({
            name: action.payload.name,
            parent_id: isUuid(action.payload.parentId) ? action.payload.parentId : null,
            color: action.payload.color,
            is_shared: action.payload.isShared,
            updated_at: new Date().toISOString()
          }).eq('id', action.payload.id);
          if (error && isForeignKeyError(error)) {
            console.warn('[Sync] UPDATE_CRM_FOLDER violation FK détectée, auto-réparation');
            const fallback = await supabase.from('crm_folders').update({
              name: action.payload.name,
              parent_id: null,
              color: action.payload.color,
              is_shared: action.payload.isShared,
              updated_at: new Date().toISOString()
            }).eq('id', action.payload.id);
            error = fallback.error;
          }
          if (error) console.error('[Sync] UPDATE_CRM_FOLDER échoué :', error.message);
          success = checkResult(error);
          break;
        }
        case 'DELETE_CRM_FOLDER': {
          // Détacher d'abord les documents et sous-dossiers liés pour éviter les erreurs de clé étrangère
          await supabase.from('crm_documents').update({ folder_id: null }).eq('folder_id', action.payload.id);
          await supabase.from('crm_folders').update({ parent_id: null }).eq('parent_id', action.payload.id);
          const { error } = await supabase.from('crm_folders').delete().eq('id', action.payload.id);
          if (error) console.error('[Sync] DELETE_CRM_FOLDER échoué :', error.message);
          success = checkResult(error);
          break;
        }
        // ─── Modules CRM Responsables : Tiers ───
        case 'INSERT_CRM_TIER': {
          success = await syncCrmUpsert('clients_fournisseurs', action.payload, ['cree_par'], 'INSERT_CRM_TIER');
          break;
        }
        case 'UPDATE_CRM_TIER': {
          const { id, ...updates } = action.payload;
          success = await syncCrmUpdate('clients_fournisseurs', id, updates, ['cree_par'], 'UPDATE_CRM_TIER');
          break;
        }
        case 'DELETE_CRM_TIER': {
          success = await syncCrmDelete('clients_fournisseurs', action.payload.id, 'DELETE_CRM_TIER');
          break;
        }
        // ─── Modules CRM : Commerciaux ───
        case 'INSERT_CRM_COMMERCIAL': {
          success = await syncCrmUpsert('agents_commerciaux', action.payload, ['cree_par'], 'INSERT_CRM_COMMERCIAL');
          break;
        }
        case 'UPDATE_CRM_COMMERCIAL': {
          const { id, ...updates } = action.payload;
          success = await syncCrmUpdate('agents_commerciaux', id, updates, ['cree_par'], 'UPDATE_CRM_COMMERCIAL');
          break;
        }
        case 'DELETE_CRM_COMMERCIAL': {
          success = await syncCrmDelete('agents_commerciaux', action.payload.id, 'DELETE_CRM_COMMERCIAL');
          break;
        }
        // ─── Modules CRM : Prestations & Commandes ───
        case 'INSERT_CRM_PRESTATION': {
           success = await syncCrmUpsert('prestations_commandes', action.payload, ['client_id', 'apporteur_id', 'commercial_id', 'cree_par', 'resp_service_id', 'responsable_service_id'], 'INSERT_CRM_PRESTATION', { table: 'prestations_commandes', field: 'reference', storeKey: 'crmPrestations' });
          break;
        }
        case 'UPDATE_CRM_PRESTATION': {
          const { id, ...updates } = action.payload;
           success = await syncCrmUpdate('prestations_commandes', id, updates, ['client_id', 'apporteur_id', 'commercial_id', 'cree_par', 'resp_service_id', 'responsable_service_id'], 'UPDATE_CRM_PRESTATION', { table: 'prestations_commandes', field: 'reference', storeKey: 'crmPrestations' });
          break;
        }
        case 'DELETE_CRM_PRESTATION': {
          // Les commissions liées sont conservées (traçabilité) mais détachées si la FK l'exige
          success = await syncCrmDelete('prestations_commandes', action.payload.id, 'DELETE_CRM_PRESTATION');
          break;
        }
        // ─── Modules CRM : Caisse ───
        case 'INSERT_CRM_MOUVEMENT': {
          success = await syncCrmUpsert('mouvements_caisse', action.payload, ['tier_id', 'cree_par'], 'INSERT_CRM_MOUVEMENT');
          break;
        }
        case 'DELETE_CRM_MOUVEMENT': {
          success = await syncCrmDelete('mouvements_caisse', action.payload.id, 'DELETE_CRM_MOUVEMENT');
          break;
        }
        // ─── Modules CRM : Commissions (générées auto par prestation) ───
        // Les colonnes prestation_ref / montant_prestation / montant_commission
        // sont NOT NULL sans défaut : les payloads créés avant le correctif
        // ne les contiennent pas → on les reconstitue ici pour soigner la file.
        case 'UPSERT_CRM_COMMISSION': {
          const healed = { ...(action.payload || {}) };
          if (!healed.prestation_ref || healed.montant_prestation == null || healed.montant_commission == null) {
            try {
              const locals: any[] = (await db.crmPrestations.getItem('data')) || [];
              const prest = locals.find(p => p.id === healed.prestation_id);
              if (!healed.prestation_ref) healed.prestation_ref = prest?.reference || healed.prestation_id || 'N/A';
              if (healed.montant_prestation == null) healed.montant_prestation = Number(prest?.prix_client_final ?? prest?.montant_total_vente ?? healed.montant) || 0;
              if (healed.montant_commission == null) healed.montant_commission = Number(healed.montant) || 0;
            } catch {}
            if (!healed.prestation_ref) healed.prestation_ref = healed.prestation_id || 'N/A';
            if (healed.montant_prestation == null) healed.montant_prestation = Number(healed.montant) || 0;
            if (healed.montant_commission == null) healed.montant_commission = Number(healed.montant) || 0;
          }
          success = await syncCrmUpsert('commissions_prestations', healed, ['prestation_id', 'beneficiaire_id', 'mouvement_caisse_id'], 'UPSERT_CRM_COMMISSION');
          break;
        }
        case 'UPDATE_CRM_COMMISSION': {
          const { id, updates } = action.payload;
          success = await syncCrmUpdate('commissions_prestations', id, updates || {}, ['prestation_id', 'beneficiaire_id', 'mouvement_caisse_id'], 'UPDATE_CRM_COMMISSION');
          break;
        }
        case 'DELETE_CRM_COMMISSION': {
          success = await syncCrmDelete('commissions_prestations', action.payload.id, 'DELETE_CRM_COMMISSION');
          break;
        }
        // ─── Modules CRM : Stocks / Catalogue articles ───
        case 'INSERT_CRM_ARTICLE': {
          success = await syncCrmUpsert('catalogue_articles', action.payload, ['fournisseur_id', 'cree_par'], 'INSERT_CRM_ARTICLE', { table: 'catalogue_articles', field: 'code_article', storeKey: 'crmArticles' });
          break;
        }
        case 'UPDATE_CRM_ARTICLE': {
          const { id, ...updates } = action.payload;
          success = await syncCrmUpdate('catalogue_articles', id, updates, ['fournisseur_id', 'cree_par'], 'UPDATE_CRM_ARTICLE', { table: 'catalogue_articles', field: 'code_article', storeKey: 'crmArticles' });
          break;
        }
        case 'DELETE_CRM_ARTICLE': {
          success = await syncCrmDelete('catalogue_articles', action.payload.id, 'DELETE_CRM_ARTICLE');
          break;
        }
        // ─── Modules CRM : Stocks / Journal des mouvements (traçabilité, ajout seul) ───
        case 'INSERT_CRM_STOCK_MOUVEMENT': {
          success = await syncCrmUpsert('mouvements_stock', action.payload, ['article_id', 'cree_par'], 'INSERT_CRM_STOCK_MOUVEMENT');
          break;
        }
        // ─── Modules CRM : Maintenance ───
        // La colonne legacy `prix` est NOT NULL sans défaut : les payloads
        // créés avant le correctif ne la contiennent pas → miroir du total.
        case 'INSERT_CRM_INTERVENTION': {
          const healed = { ...(action.payload || {}) };
          if (healed.prix == null) {
            healed.prix = Number(healed.prix_total ?? healed.prix_unitaire) || 0;
            if (healed.id) await backfillLocalUniqueField('crmMaintenance', healed.id, 'prix', healed.prix);
          }
          success = await syncCrmUpsert('interventions_maintenance', healed, ['client_id', 'cree_par'], 'INSERT_CRM_INTERVENTION', { table: 'interventions_maintenance', field: 'reference', storeKey: 'crmMaintenance' });
          break;
        }
        case 'UPDATE_CRM_INTERVENTION': {
          const { id, ...updates } = action.payload;
          const healed = { ...updates };
          if (healed.prix == null && (healed.prix_total != null || healed.prix_unitaire != null)) {
            healed.prix = Number(healed.prix_total ?? healed.prix_unitaire) || 0;
          }
          success = await syncCrmUpdate('interventions_maintenance', id, healed, ['client_id', 'cree_par'], 'UPDATE_CRM_INTERVENTION', { table: 'interventions_maintenance', field: 'reference', storeKey: 'crmMaintenance' });
          break;
        }
        case 'DELETE_CRM_INTERVENTION': {
          success = await syncCrmDelete('interventions_maintenance', action.payload.id, 'DELETE_CRM_INTERVENTION');
          break;
        }
        case 'INSERT_CRM_TECHNICIEN': {
          success = await syncCrmUpsert('techniciens_maintenance', action.payload, [], 'INSERT_CRM_TECHNICIEN');
          break;
        }
        case 'UPDATE_CRM_TECHNICIEN': {
          const { id, ...updates } = action.payload;
          success = await syncCrmUpdate('techniciens_maintenance', id, updates, [], 'UPDATE_CRM_TECHNICIEN');
          break;
        }
        case 'DELETE_CRM_TECHNICIEN': {
          success = await syncCrmDelete('techniciens_maintenance', action.payload.id, 'DELETE_CRM_TECHNICIEN');
          break;
        }
        case 'INSERT_DOCUMENT': {
          const { id, name, type, sizeBytes, filePath, uploaderId, folderId, clientId, category, isShared } = action.payload;
          const fileData: Blob | null = await db.documentFiles.getItem(id);
          
          if (fileData && filePath) {
            try {
              const { error: storageError } = await supabase.storage.from('crm_documents').upload(filePath, fileData, { upsert: true });
              if (storageError) {
                console.error('[Sync] INSERT_DOCUMENT Storage Error:', storageError);
                if (isNetworkOrTransientError(storageError)) {
                  throw new Error(`[NetworkError] Storage upload failed: ${storageError.message}`);
                }
              }
            } catch (err: any) {
              if (isNetworkOrTransientError(err)) throw err;
              console.warn('[Sync] INSERT_DOCUMENT Non-blocking storage warning:', err);
            }
          }

          let { error } = await supabase.from('crm_documents').upsert([{
            id,
            name,
            type,
            size_bytes: sizeBytes,
            file_path: filePath,
            uploader_id: isUuid(uploaderId) ? uploaderId : null,
            folder_id: isUuid(folderId) ? folderId : null,
            affaire_id: null,
            client_id: isUuid(clientId) ? clientId : null,
            category: category || 'Autre',
            is_shared: !!isShared
          }], { onConflict: 'id' });

          if (error && isForeignKeyError(error)) {
            console.warn('[Sync] INSERT_DOCUMENT violation FK détectée, auto-réparation avec relations nulles');
            const fallback = await supabase.from('crm_documents').upsert([{
              id,
              name,
              type,
              size_bytes: sizeBytes,
              file_path: filePath,
              uploader_id: null,
              folder_id: null,
              affaire_id: null,
              client_id: null,
              category: category || 'Autre',
              is_shared: !!isShared
            }], { onConflict: 'id' });
            error = fallback.error;
          }

          if (error) console.error('[Sync] INSERT_DOCUMENT DB Error:', error.message);
          success = checkResult(error);
          break;
        }
        case 'UPDATE_DOCUMENT': {
          const { id, updates, hasNewFile } = action.payload;
          if (hasNewFile) {
            const fileData: Blob | null = await db.documentFiles.getItem(id);
            if (fileData && updates.filePath) {
              try {
                const { error: storageError } = await supabase.storage.from('crm_documents').upload(updates.filePath, fileData, { upsert: true });
                if (storageError && isNetworkOrTransientError(storageError)) {
                  throw new Error(`[NetworkError] Storage update failed: ${storageError.message}`);
                }
              } catch (err: any) {
                if (isNetworkOrTransientError(err)) throw err;
                console.warn('[Sync] UPDATE_DOCUMENT Non-blocking storage warning:', err);
              }
            }
          }
          const dbUpdates: any = { updated_at: new Date().toISOString() };
          if (updates.name !== undefined) dbUpdates.name = updates.name;
          if (updates.type !== undefined) dbUpdates.type = updates.type;
          if (updates.sizeBytes !== undefined) dbUpdates.size_bytes = updates.sizeBytes;
          if (updates.folderId !== undefined) dbUpdates.folder_id = isUuid(updates.folderId) ? updates.folderId : null;
          if (updates.clientId !== undefined) dbUpdates.client_id = isUuid(updates.clientId) ? updates.clientId : null;
          if (updates.category !== undefined) dbUpdates.category = updates.category || 'Autre';
          if (updates.isShared !== undefined) dbUpdates.is_shared = !!updates.isShared;

          let { error } = await supabase.from('crm_documents').update(dbUpdates).eq('id', id);
          if (error && isForeignKeyError(error)) {
            console.warn('[Sync] UPDATE_DOCUMENT violation FK détectée, repli sans les relations');
            const fallback = await supabase.from('crm_documents').update({
              name: updates.name,
              type: updates.type,
              size_bytes: updates.sizeBytes,
              folder_id: null,
              affaire_id: null,
              client_id: null,
              category: updates.category || 'Autre',
              is_shared: !!updates.isShared,
              updated_at: new Date().toISOString()
            }).eq('id', id);
            error = fallback.error;
          }
          if (error) console.error('[Sync] UPDATE_DOCUMENT DB Error:', error.message);
          success = checkResult(error);
          break;
        }
        case 'DELETE_DOCUMENT': {
          const { error } = await supabase.from('crm_documents').delete().eq('id', action.payload.id);
          if (action.payload.filePath) {
            try {
              await supabase.storage.from('crm_documents').remove([action.payload.filePath]);
            } catch (err) {
              console.warn('[Sync] DELETE_DOCUMENT Storage remove warning:', err);
            }
          }
          success = checkResult(error);
          break;
        }
        case 'INSERT_NOTIFICATION': {
          const p = action.payload || {};
          // Notifications = non-critiques : un échec ne doit jamais produire
          // de toast "Échec de synchronisation" ni bloquer la file.
          // Causes vues en prod : user_id non-UUID, destinataire absent de
          // profiles (FK 23503), RLS 42501, rejeu (doublon 23505).
          // Dans tous ces cas permanents → on jette silencieusement (succès).
          if (!isUuid(p.id) || !isUuid(p.user_id)) {
            console.warn('[Sync] INSERT_NOTIFICATION ignorée : id/user_id non-UUID.', { id: p.id, user_id: p.user_id });
            success = true;
            break;
          }
          // NOTE : on utilise insert() et non upsert() : un upsert exige les droits
          // RLS INSERT + UPDATE. La politique UPDATE est limitée à ses propres
          // notifications (auth.uid() = user_id), donc notifier un autre utilisateur
          // (cas Direction) échouait en 42501. L'id est un uuidv4 frais, le doublon
          // ne peut venir que d'un rejeu → traité comme succès (idempotent).
          const { error } = await supabase.from('notifications').insert([{
            id: p.id,
            user_id: p.user_id,
            title: p.title || 'Notification',
            message: p.message || '',
            type: p.type || 'info',
            is_read: !!p.is_read,
            link: p.link || null,
            created_at: p.created_at || new Date().toISOString()
          }]);
          if (error && isUniqueViolationError(error)) {
            success = true;
            break;
          }
          if (error && (isForeignKeyError(error) || (error as any).code === '42501' ||
            /row.?level|policy|permission|not found|schema cache|PGRST/i.test(error.message || ''))) {
            console.warn('[Sync] INSERT_NOTIFICATION ignorée (destinataire inconnu ou droits insuffisants) :', error.message);
            success = true;
            break;
          }
          if (error) console.error('[Sync] INSERT_NOTIFICATION échoué :', error.message, error);
          success = checkResult(error);
          break;
        }
        case 'MARK_NOTIFICATION_READ': {
          const { error } = await supabase.from('notifications').update({ is_read: true }).eq('id', action.payload.id);
          if (error && ((error as any).code === '42501' || /row.?level|policy|permission|PGRST/i.test(error.message || ''))) {
            // Marquer comme lue la notif d'un autre utilisateur est refusé par RLS :
            // non-critique → on jette silencieusement.
            console.warn('[Sync] MARK_NOTIFICATION_READ ignorée (RLS) :', error.message);
            success = true;
            break;
          }
          if (error) console.error('[Sync] MARK_NOTIFICATION_READ échoué :', error.message);
          success = checkResult(error);
          break;
        }
        case 'MARK_ALL_NOTIFICATIONS_READ': {
          const { error } = await supabase.from('notifications').update({ is_read: true }).eq('user_id', action.payload.user_id).eq('is_read', false);
          if (error && ((error as any).code === '42501' || /row.?level|policy|permission|PGRST/i.test(error.message || ''))) {
            console.warn('[Sync] MARK_ALL_NOTIFICATIONS_READ ignorée (RLS) :', error.message);
            success = true;
            break;
          }
          if (error) console.error('[Sync] MARK_ALL_NOTIFICATIONS_READ échoué :', error.message);
          success = checkResult(error);
          break;
        }
        case 'INSERT_PRESTATION': {
          const { error } = await supabase.from('prestations').upsert([{
            id: action.payload.id, code: action.payload.code, name: action.payload.name, description: action.payload.description, price: action.payload.price, service_id: isUuid(action.payload.serviceId) ? action.payload.serviceId : null, unit: action.payload.unit, cost_price: action.payload.costPrice || 0
          }], { onConflict: 'id' });
          if (error) console.error('[Sync] INSERT_PRESTATION échoué :', error.message);
          success = checkResult(error);
          break;
        }
        case 'DELETE_PRESTATION': {
          const { error } = await supabase.from('prestations').delete().eq('id', action.payload.id);
          success = checkResult(error);
          break;
        }
        case 'UPDATE_PRESTATION': {
          const { id, ...updateData } = action.payload;
          const { error } = await supabase.from('prestations').update({
            code: updateData.code, name: updateData.name, description: updateData.description, price: updateData.price, service_id: isUuid(updateData.serviceId) ? updateData.serviceId : null, unit: updateData.unit, cost_price: updateData.costPrice || 0
          }).eq('id', id);
          if (error) console.error('[Sync] UPDATE_PRESTATION échoué :', error.message);
          success = checkResult(error);
          break;
        }
        case 'INSERT_SERVICE': {
          const { error } = await supabase.from('services').upsert([{
            id: action.payload.id,
            name: action.payload.name,
            description: action.payload.description,
            members: action.payload.members,
            commission_rate: action.payload.commissionRate !== undefined ? action.payload.commissionRate : null
          }], { onConflict: 'id' });
          if (error) console.error('[Sync] INSERT_SERVICE échoué :', error.message);
          success = checkResult(error);
          break;
        }
        case 'UPDATE_SERVICE': {
          const { id, ...updateData } = action.payload;
          const mapped: any = {};
          if (updateData.name !== undefined) mapped.name = updateData.name;
          if (updateData.description !== undefined) mapped.description = updateData.description;
          if (updateData.members !== undefined) mapped.members = updateData.members;
          if (updateData.commissionRate !== undefined) mapped.commission_rate = updateData.commissionRate;
          const { error } = await supabase.from('services').update(mapped).eq('id', id);
          if (error) console.error('[Sync] UPDATE_SERVICE échoué :', error.message);
          success = checkResult(error);
          break;
        }
        case 'DELETE_SERVICE': {
          const { error } = await supabase.from('services').delete().eq('id', action.payload.id);
          success = checkResult(error);
          break;
        }
        case 'UPSERT_INVOICE': {
          const { invoice, items, replaceItems } = action.payload || {};
          let { error } = await supabase.from('invoices').upsert(invoice, { onConflict: 'id' });
          if (error && isUniqueViolationError(error) && invoice?.invoice_number) {
            // Collision de N° facture multi-poste : regenere une fois + backfill local.
            const candidate = { ...invoice, invoice_number: `${String(invoice.invoice_number).split('-bis')[0]}-bis${Math.floor(1000 + Math.random() * 9000)}` };
            const retry = await supabase.from('invoices').upsert(candidate, { onConflict: 'id' });
            error = retry.error;
            if (!error) {
              try {
                const rows: any[] = (await db.invoices.getItem('data')) || [];
                await db.invoices.setItem('data', rows.map(x => x.id === invoice.id ? { ...x, invoiceNumber: candidate.invoice_number } : x));
              } catch {}
            }
          }
          let itemsOk = !error;
          if (!error && replaceItems) {
            // Upsert d'abord, purge des obsolètes après succès (jamais de delete-first).
            if (items && items.length > 0) {
              const { error: itErr } = await supabase.from('invoice_items').upsert(items, { onConflict: 'id' });
              if (itErr) {
                if (isNetworkOrTransientError(itErr)) throw new Error(`[NetworkError] ${itErr.message}`);
                console.error('[Sync] UPSERT_INVOICE lignes échouées :', itErr.message);
                itemsOk = false;
              } else {
                try {
                  const { data: existing } = await supabase.from('invoice_items').select('id').eq('invoice_id', invoice.id);
                  const keep = new Set(items.map((l: any) => l.id).filter(Boolean));
                  const doomed = ((existing as any[]) || []).map(r => r.id).filter((lid: string) => !keep.has(lid));
                  if (doomed.length > 0) {
                    const { error: delErr } = await supabase.from('invoice_items').delete().in('id', doomed);
                    if (delErr) {
                      if (isNetworkOrTransientError(delErr)) throw new Error(`[NetworkError] ${delErr.message}`);
                      console.error('[Sync] UPSERT_INVOICE purge obsolètes échouée :', delErr.message);
                    }
                  }
                } catch (e: any) {
                  if (String(e?.message || '').startsWith('[NetworkError]')) throw e;
                }
              }
            }
          }
          if (error) console.error('[Sync] UPSERT_INVOICE échoué :', error.message);
          success = !error && itemsOk ? checkResult(error) : false;
          break;
        }
        case 'DELETE_INVOICE': {
          const id = action.payload.id;
          const e1 = (await supabase.from('invoice_payments').delete().eq('invoice_id', id)).error;
          const e2 = (await supabase.from('invoice_items').delete().eq('invoice_id', id)).error;
          const e3 = (await supabase.from('invoices').delete().eq('id', id)).error;
          const err = e1 || e2 || e3;
          if (err) {
            if (isNetworkOrTransientError(err)) throw new Error(`[NetworkError] ${err.message}`);
            console.error('[Sync] DELETE_INVOICE échoué :', err.message);
          }
          success = checkResult(err);
          break;
        }
        case 'UPSERT_INVOICE_PAYMENT': {
          const { payment, invoiceUpdate } = action.payload || {};
          const { error } = await supabase.from('invoice_payments').upsert(payment, { onConflict: 'id' });
          let invOk = !error;
          if (!error && invoiceUpdate?.id) {
            const { id: _omitId, created_at: _omitCreated, ...invoicePatch } = invoiceUpdate;
            const { error: invErr } = await supabase.from('invoices').update(invoicePatch).eq('id', invoiceUpdate.id);
            if (invErr) {
              if (isNetworkOrTransientError(invErr)) throw new Error(`[NetworkError] ${invErr.message}`);
              console.error('[Sync] UPSERT_INVOICE_PAYMENT statut échoué :', invErr.message);
              invOk = false;
            }
          }
          if (error) console.error('[Sync] UPSERT_INVOICE_PAYMENT échoué :', error.message);
          success = !error && invOk ? checkResult(error) : false;
          break;
        }
        case 'DELETE_INVOICE_PAYMENT': {
          const { id, invoiceUpdate } = action.payload || {};
          const { error } = await supabase.from('invoice_payments').delete().eq('id', id);
          let invOk = !error;
          if (!error && invoiceUpdate?.id) {
            const { id: _omitId, created_at: _omitCreated, ...invoicePatch } = invoiceUpdate;
            const { error: invErr } = await supabase.from('invoices').update(invoicePatch).eq('id', invoiceUpdate.id);
            if (invErr) {
              if (isNetworkOrTransientError(invErr)) throw new Error(`[NetworkError] ${invErr.message}`);
              console.error('[Sync] DELETE_INVOICE_PAYMENT statut échoué :', invErr.message);
              invOk = false;
            }
          }
          if (error) console.error('[Sync] DELETE_INVOICE_PAYMENT échoué :', error.message);
          success = !error && invOk ? checkResult(error) : false;
          break;
        }
        case 'UPDATE_PROFILE': {
          const { id, ...data } = action.payload;
          const mapped: any = { updated_at: new Date().toISOString() };
          if (data.photo !== undefined) mapped.photo = data.photo || null;
          if (data.name !== undefined) mapped.name = data.name;
          if (data.pin !== undefined) mapped.pin = data.pin;
          if (data.role !== undefined) mapped.role = data.role;
          if (data.active !== undefined) mapped.active = data.active;
          if (data.serviceId !== undefined) mapped.service_id = data.serviceId || null;
          if (data.service_id !== undefined) mapped.service_id = data.service_id || null;

          // Permissions CRM
          if (data.crmPrestationsEnabled !== undefined) mapped.crm_prestations_enabled = data.crmPrestationsEnabled;
          if (data.crm_prestations_enabled !== undefined) mapped.crm_prestations_enabled = data.crm_prestations_enabled;
          if (data.crmCaisseEnabled !== undefined) mapped.crm_caisse_enabled = data.crmCaisseEnabled;
          if (data.crm_caisse_enabled !== undefined) mapped.crm_caisse_enabled = data.crm_caisse_enabled;
          if (data.crmMaintenanceEnabled !== undefined) mapped.crm_maintenance_enabled = data.crmMaintenanceEnabled;
          if (data.crm_maintenance_enabled !== undefined) mapped.crm_maintenance_enabled = data.crm_maintenance_enabled;
          if (data.crmStocksEnabled !== undefined) mapped.crm_stocks_enabled = data.crmStocksEnabled;
          if (data.crm_stocks_enabled !== undefined) mapped.crm_stocks_enabled = data.crm_stocks_enabled;
          if (data.crmTiersEnabled !== undefined) mapped.crm_tiers_enabled = data.crmTiersEnabled;
          if (data.crm_tiers_enabled !== undefined) mapped.crm_tiers_enabled = data.crm_tiers_enabled;
          if (data.crmCommerciauxEnabled !== undefined) mapped.crm_commerciaux_enabled = data.crmCommerciauxEnabled;
          if (data.crm_commerciaux_enabled !== undefined) mapped.crm_commerciaux_enabled = data.crm_commerciaux_enabled;
          if (data.crmCommissionsEnabled !== undefined) mapped.crm_commissions_enabled = data.crmCommissionsEnabled;
          if (data.crm_commissions_enabled !== undefined) mapped.crm_commissions_enabled = data.crm_commissions_enabled;
          if (data.crmFacturationEnabled !== undefined) mapped.crm_facturation_enabled = data.crmFacturationEnabled;
          if (data.crm_facturation_enabled !== undefined) mapped.crm_facturation_enabled = data.crm_facturation_enabled;
          if (data.crmSupFacturesEnabled !== undefined) mapped.crm_sup_factures_enabled = data.crmSupFacturesEnabled;
          if (data.crm_sup_factures_enabled !== undefined) mapped.crm_sup_factures_enabled = data.crm_sup_factures_enabled;
          if (data.crmReportsEnabled !== undefined) mapped.crm_reports_enabled = data.crmReportsEnabled;
          if (data.crm_reports_enabled !== undefined) mapped.crm_reports_enabled = data.crm_reports_enabled;
          if (data.crmTeamReportsEnabled !== undefined) mapped.crm_team_reports_enabled = data.crmTeamReportsEnabled;
          if (data.crm_team_reports_enabled !== undefined) mapped.crm_team_reports_enabled = data.crm_team_reports_enabled;

          let { error } = await supabase.from('profiles').update(mapped).eq('id', id);
          if (error && (error.message?.includes('column') || error.message?.includes('schema cache') || (error as any).code === 'PGRST204')) {
            console.warn('[Sync] Retrying UPDATE_PROFILE without optional newly added columns:', error.message);
            const fallbackMapped = { ...mapped };
            delete fallbackMapped.crm_team_reports_enabled;
            delete fallbackMapped.crm_reports_enabled;
            const retryRes = await supabase.from('profiles').update(fallbackMapped).eq('id', id);
            if (!retryRes.error) {
              error = null;
              // B7 : ne jamais perdre silencieusement des flags — tracer un
              // avertissement visible (id stable : pas d'empilement en boucle).
              await upsertSyncWarning(`warn-UPDATE_PROFILE-${id}-reports`, 'UPDATE_PROFILE', { id, droppedFlags: ['crm_team_reports_enabled', 'crm_reports_enabled'] }, 'Permissions rapports non persistées (colonnes absentes côté serveur)');
            } else {
              // Ultime fallback: uniquement les colonnes de base standard de profiles
              console.warn('[Sync] Retrying UPDATE_PROFILE with base profile columns only:', retryRes.error.message);
              const coreMapped: any = { updated_at: mapped.updated_at };
              if (mapped.name !== undefined) coreMapped.name = mapped.name;
              if (mapped.role !== undefined) coreMapped.role = mapped.role;
              if (mapped.active !== undefined) coreMapped.active = mapped.active;
              if (mapped.photo !== undefined) coreMapped.photo = mapped.photo;
              const coreRes = await supabase.from('profiles').update(coreMapped).eq('id', id);
              if (!coreRes.error) {
                error = null;
                // Ne jamais perdre silencieusement des flags (cf. B7 ci-dessus) :
                // avertissement à id stable (pas d'empilement en boucle).
                const droppedCore = Object.keys(mapped).filter(k => !(k in coreMapped));
                await upsertSyncWarning(`warn-UPDATE_PROFILE-${id}-fallback`, 'UPDATE_PROFILE', { id, droppedFlags: droppedCore }, 'Permissions non persistées (fallback colonnes de base) : ' + droppedCore.join(', '));
              } else {
                error = coreRes.error;
              }
            }
          }
          if (error) console.error('[Sync] UPDATE_PROFILE échoué :', error.message);
          success = checkResult(error);
          break;
        }
        case 'DELETE_PROFILE': {
          const { error } = await supabase.from('profiles').delete().eq('id', action.payload.id);
          if (error) console.error('[Sync] DELETE_PROFILE échoué :', error.message);
          success = checkResult(error);
          break;
        }
        default:
          success = true; // Ignore unknown actions
        }
        return success;
      };

      try {
        const actionTimeout = (action.type === 'INSERT_DOCUMENT' || action.type === 'UPDATE_DOCUMENT') ? 90000 : 25000;
        success = await withSyncTimeout(executeAction(), actionTimeout);
        consecutiveNetworkErrors = 0;
      } catch (e: any) {
        // CORRIGÉ : JWT expiré mid-run → refresh session puis conservation en file
        // (pas de classement réseau, pas de bascule en erreur définitive).
        if (isAuthError(e) || String(e?.message || '').includes('[AuthError]')) {
          console.warn(`[Sync] Session expirée sur ${action.type}, rafraîchissement…`);
          try { await ensureSupabaseAuth(); } catch {}
          consecutiveNetworkErrors++;
          if (consecutiveNetworkErrors >= 5) break;
          continue;
        }
        if (isNetworkOrTransientError(e) || e?.message?.includes('[NetworkError]')) {
          // Head-of-line : on saute l'action fautive (conservée en file) au lieu de
          // bloquer les centaines suivantes. Après 5 échecs réseau d'affilée, on
          // considère la liaison comme coupée et on arrête le run.
          consecutiveNetworkErrors++;
          console.warn(`[Sync] Réseau instable sur ${action.type} (${consecutiveNetworkErrors}/5). Action conservée, suite de la file.`);
          if (consecutiveNetworkErrors >= 5) break;
          continue;
        }
        console.error('Erreur inattendue pour l\'action', action, e);
        success = false;
      }

      if (success) {
        processedIds.add(action.id);
      } else {
        processedIds.add(action.id);

        // Ne jamais enregistrer en erreur ni notifier les actions des services retirés
        // ni les notifications (non-critiques : pas de toast "Échec de synchronisation").
        if (isRetiredServicePayload(action.type, action.payload)) {
          continue;
        }
        if (action.type === 'INSERT_NOTIFICATION' || action.type === 'MARK_NOTIFICATION_READ' || action.type === 'MARK_ALL_NOTIFICATIONS_READ') {
          console.warn(`[Sync] Notification ${action.type} rejetée par le serveur, jetée sans erreur visible.`);
          continue;
        }

        // En cas de rejet définitif du serveur (ex: violation de schéma PostgreSQL avec données corrompues)
        console.warn(`[Sync] Action ${action.type} rejetée définitivement par la base de données. Sauvegardée dans syncErrors.`);
        const labels: Partial<Record<SyncActionType, string>> = {
          'INSERT_CRM_FOLDER': '⚠️ Échec de synchronisation d\'un dossier CRM.',
          'DELETE_CRM_FOLDER': '⚠️ Échec de suppression d\'un dossier CRM.',
          'INSERT_DOCUMENT': '⚠️ Échec de synchronisation d\'un document.',
          'UPDATE_DOCUMENT': '⚠️ Échec de mise à jour d\'un document.',
          'INSERT_QUOTE': '⚠️ Échec de synchronisation d\'un devis.',
          'INSERT_SALE': '⚠️ Échec de synchronisation d\'une vente.',
          'INSERT_CLIENT': '⚠️ Échec de synchronisation d\'un client.',
        };
        const message = labels[action.type] || `⚠️ Échec de synchronisation : ${action.type}`;
        let currentErrorsCount = 1;
        try {
          const errors = await db.syncErrors.getItem<any[]>('errors') || [];
          // Dédupliquer par entité : un rejeu ("Tout ré-essayer", réconciliation)
          // remplace l'entrée existante au lieu d'empiler un doublon identique.
          // L'entrée garde le message + tentatives (backoff réconciliation + page erreurs).
          const entityId = (action.payload && (action.payload.id ?? action.payload.reference)) ?? '';
          const dedupKey = (e: any) => `${e?.action?.type}::${(e?.action?.payload && (e.action.payload.id ?? e.action.payload.reference)) ?? ''}`;
          const incomingKey = `${action.type}::${entityId}`;
          const existingIdx = entityId === '' ? -1 : errors.findIndex(e => dedupKey(e) === incomingKey);
          // Le compteur transporté depuis la réconciliation (le vide du store à
          // chaque rejeu remettait attempts à zéro) : le backoff s'enclenche vraiment.
          const carried = carriedAttempts.get(incomingKey) ?? 0;
          if (carried > 0) carriedAttempts.delete(incomingKey);
          const prevAttempts = Math.max((existingIdx >= 0 ? (errors[existingIdx] as any)?.attempts : 0) || 0, carried);
          const entry = {
            action,
            failedAt: new Date().toISOString(),
            message,
            attempts: prevAttempts + 1,
            lastTried: Date.now(),
          };
          if (existingIdx >= 0) {
            errors[existingIdx] = entry;
          } else {
            errors.push(entry);
          }
          await db.syncErrors.setItem('errors', errors);
          currentErrorsCount = errors.length;
        } catch(err) {
          console.error('Impossible de sauvegarder dans syncErrors', err);
        }
        if (typeof window !== 'undefined') {
          // Anti-boucle : au-delà de 3 échecs en 30 min pour la même entité, plus
          // de toast — le badge d'erreurs reste la seule surface (silencieux).
          const toastKey = `${action.type}::${(action.payload && (action.payload.id ?? action.payload.reference)) ?? ''}`;
          const toastAllowed = shouldToastError(toastKey);
          markErrorSeen(toastKey);
          if (toastAllowed) {
            window.dispatchEvent(new CustomEvent('sync-critical-error', { detail: { message, action } }));
          }
          window.dispatchEvent(new CustomEvent('sync-errors-updated', { detail: { count: currentErrorsCount } }));
        }
      }
    } catch (e) {
      console.error('Erreur boucle de synchronisation pour l\'action', action, e);
      break;
    }
  }

  // Sauvegarder la file d'attente restante via la chaîne sérialisée (D1) : un
  // queueSyncAction concurrent intercalé n'est plus écrasé (vente perdue).
  const drainTask = async () => {
    const latestQueue: SyncAction[] = (await db.syncQueue.getItem('queue')) || [];
    const nextQueue = latestQueue.filter(a => !processedIds.has(a.id));
    await db.syncQueue.setItem('queue', nextQueue);
  };
  queueChain = queueChain.then(drainTask, drainTask);
  try {
    await queueChain;
  } catch (e) {
    console.error('[Sync] Écriture finale de file échouée :', e);
  }
  } finally {
    syncLock = false;
  }
};

// Démon de surveillance automatique et résilience en tâche de fond (Watchdog)
if (typeof window !== 'undefined') {
  // 1. Déclencheur au retour réseau
  window.addEventListener('online', () => {
    console.log('[SyncWatchdog] Connexion rétablie. Lancement immédiat de la synchronisation...');
    processSyncQueue();
  });

  // 2. Déclencheur au focus de la fenêtre (reprise d'activité de l'utilisateur)
  window.addEventListener('focus', () => {
    if (navigator.onLine) {
      processSyncQueue();
    }
  });

  // 3. Déclencheur au changement de visibilité de l'onglet
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && navigator.onLine) {
      processSyncQueue();
    }
  });

  // 4. Heartbeat récurrent toutes les 20 secondes pour vider la file et auto-réparer
  setInterval(async () => {
    if (navigator.onLine && !syncLock) {
      try {
        const queue = (await db.syncQueue.getItem<SyncAction[]>('queue')) || [];
        if (queue.length > 0) {
          processSyncQueue();
        }
      } catch (err) {
        console.warn('[SyncWatchdog] Erreur vérification périodique :', err);
      }
    }
  }, 20000);
}

/**
 * Rapprochement complet de TOUT le système (CRM + Factures + Devis + Rapports)
 */
export const reconcileAllOfflineDataWithCloud = async () => {
  // CRM Sales / Couts / FacturePaiements auto-reconciliation
  try {
    if (navigator.onLine) {
      await processSyncQueue();
    }
  } catch (e) {
    console.warn('[SyncAll] Erreur vidage file CRM :', e);
  }
};

