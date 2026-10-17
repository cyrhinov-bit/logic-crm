import { db } from './db';
import { supabase } from './supabase';
import { toLocalDayKey } from './dates';

/**
 * Épuration du navigateur du poste de vente — vérité serveur "server-wins".
 *
 * Contexte : l'historique des ventes du 06/10/2026 fait foi côté serveur
 * (15 transactions Validées, CA 73 940 FCFA, 15 lignes, 15 paiements,
 * 0 retour, 1 session de caisse fermée b850d452-...).
 *
 * Cause de divergence constatée : `refreshData()` fusionne (merge) le cache
 * local IndexedDB avec le serveur sans jamais supprimer les fantômes locaux
 * (brouillons hors-ligne, doublons, file sync non purgée). L'épuration :
 *  1. photographie le cache local,
 *  2. neutralise la file de sync POS fantôme (elle re-pousserait le sale),
 *  3. remplace les stores locaux par la vérité serveur (hard replace),
 *  4. nettoie les clés localStorage parasites (paniers/tickets/brouillons),
 *  5. vérifie que le 06/10/2026 affiche exactement la référence.
 */

export const PURGE_TARGET_DAY = '2026-10-06';

// Vérité serveur relevée le 07/10/2026 (compte authentifié s.diallo@hinovgroup.com)
export const EXPECTED_20261006 = {
  day: PURGE_TARGET_DAY,
  txCount: 15,
  caTotal: 73940,
  cashTotal: 33300,
  mobileTotal: 40640,
  lineCount: 15,
  paymentCount: 15,
  returnCount: 0,
  sessionId: 'b850d452-8f1f-47f7-82a7-a4bd8830898f',
  txIds: [
    '0e641989-c8a7-4540-83a3-57d00af92cb7',
    '4d5efc92-ef90-4983-9b97-cf0452012018',
    'c16711d5-1b3c-42d2-9c56-732d3f656524',
    '58cf5c90-a2cc-49b8-9421-0854d7aa36ef',
    '26d097ce-2279-48fd-b9ee-6e4615ad3965',
    '41edfad5-1407-4e8b-8e00-7b3606997390',
    '2528083c-7f5d-446c-b43f-9bc7d4f15d3a',
    '88f7697e-051a-470b-b6a6-0fb97c930e25',
    '82533c06-9e94-4b2d-9f8e-844da7e1c435',
    'a307586d-6fa5-4327-b096-ae218f4d6399',
    '59652b7a-9608-49e3-8978-dc621c4a32a2',
    'df995c8c-5c13-4fec-900c-09aaf0c53daf',
    'e416e9f7-3f24-40bc-93a0-661f76e7ad72',
    'a3b3cf6c-6204-453f-959a-e36f12a3db50',
    'b59f8325-3e80-4cc0-88d7-94a26e61f858',
  ],
};

export interface PosBrowserPurgeReport {
  ok: boolean;
  day: string;
  before: { tx: number; dayTx: number; queue: number; droppedQueue: number };
  after: { tx: number; dayTx: number; dayCa: number; dayCash: number; dayMobile: number; dayLines: number; dayPayments: number; dayReturns: number };
  /** Numéros de tickets présents dans le navigateur mais absents du serveur (remis en file de synchro, jamais supprimés). */
  replayedLocalOnly: string[];
  /** @deprecated alias de replayedLocalOnly (conservé pour compatibilité). */
  removedLocalOnly: string[];
  expected: typeof EXPECTED_20261006;
  errors: string[];
}

async function fetchAll(table: string, select = '*'): Promise<any[] | null> {
  try {
    const PAGE = 1000;
    const out: any[] = [];
    for (let guard = 0; guard < 50; guard++) {
      let q: any = supabase.from(table).select(select).range(out.length, out.length + PAGE - 1);
      try {
        q = q.order('created_at', { ascending: true });
      } catch {
        /* certaines tables n'ont pas created_at */
      }
      const res = await q;
      if (res?.error) return guard === 0 ? null : out;
      const rows = res?.data;
      if (!Array.isArray(rows) || rows.length === 0) break;
      out.push(...rows);
      if (rows.length < PAGE) break;
    }
    return out;
  } catch {
    return null;
  }
}

/** Récupère la vérité serveur et la mappe au format applicatif (même mapping que AppContext). */
async function fetchServerTruth() {
  const [txRows, sessionRows, returnRows, paymentRows] = await Promise.all([
    fetchAll('pos_transactions', '*, pos_transaction_lines(*), pos_payments(*)'),
    fetchAll('pos_cash_sessions'),
    fetchAll('pos_returns', '*, pos_return_lines(*)'),
    fetchAll('pos_payments'),
  ]);
  if (!txRows) throw new Error('Serveur injoignable (pos_transactions). Réessayez en ligne.');
  if (!sessionRows) throw new Error('Serveur injoignable (pos_cash_sessions). Réessayez en ligne.');

  const transactions = (txRows || []).map((t: any) => ({
    id: t.id,
    transactionNumber: t.transaction_number,
    cashierId: t.cashier_id,
    sessionId: t.session_id,
    date: t.date,
    subtotal: t.subtotal,
    vat: t.vat ?? 0,
    discountAmount: t.discount_amount,
    total: t.total,
    status: t.status,
    lines: (t.pos_transaction_lines || []).map((l: any) => ({
      id: l.id,
      productId: l.product_id,
      description: l.description,
      quantity: l.quantity,
      unitPrice: l.unit_price,
      discountPercent: l.discount_percent,
      discountAmount: l.discount_amount,
      total: l.total,
      costPrice: l.cost_price !== null && l.cost_price !== undefined ? Number(l.cost_price) : undefined,
    })),
    payments: (t.pos_payments || []).map((p: any) => ({
      id: p.id,
      transactionId: p.transaction_id,
      method: p.method,
      amount: p.amount,
      reference: p.reference,
    })),
  }));

  const sessions = (sessionRows || []).map((s: any) => ({
    id: s.id,
    cashierId: s.cashier_id,
    openedAt: s.opened_at,
    closedAt: s.closed_at,
    initialFund: s.initial_fund,
    finalAmount: s.final_amount,
    expectedAmount: s.expected_amount,
    difference: s.difference,
    status: s.status,
  }));

  const payments = (paymentRows || []).map((p: any) => ({
    id: p.id,
    transactionId: p.transaction_id,
    method: p.method,
    amount: p.amount,
    reference: p.reference,
  }));

  const returns = (returnRows || []).map((r: any) => ({
    id: r.id,
    returnNumber: r.return_number,
    transactionId: r.transaction_id || undefined,
    sessionId: r.session_id || undefined,
    date: r.date,
    type: r.type,
    totalRefund: r.total_refund,
    totalExchange: r.total_exchange || 0,
    amountToPay: r.amount_to_pay || 0,
    refundMethod: r.refund_method || 'Espèces',
    complementTransactionId: r.complement_transaction_id || undefined,
    status: r.status,
    notes: r.notes || '',
    createdBy: r.created_by || undefined,
    lines: (r.pos_return_lines || []).filter((l: any) => l.reason !== 'Échange').map((l: any) => ({
      id: l.id,
      productId: l.product_id || undefined,
      description: l.description,
      quantity: l.quantity,
      unitPrice: l.unit_price,
      total: l.total,
      reason: l.reason || '',
    })),
    exchangeLines: (r.pos_return_lines || []).filter((l: any) => l.reason === 'Échange').map((l: any) => ({
      id: l.id,
      productId: l.product_id || undefined,
      description: l.description,
      quantity: l.quantity,
      unitPrice: l.unit_price,
      total: l.total,
    })),
  }));

  return { transactions, sessions, payments, returns };
}

function statsForDay(transactions: any[], returns: any[], day: string) {
  const dayTxs = transactions.filter((t: any) => toLocalDayKey(t.date) === day);
  const dayTxIds = new Set(dayTxs.map((t: any) => t.id));
  const dayCa = dayTxs.reduce((a: number, t: any) => a + (Number(t.total) || 0), 0);
  const dayCash = dayTxs.reduce((a: number, t: any) => {
    const cash = (t.payments || [])
      .filter((p: any) => p.method === 'Espèces' || p.method === 'Mixte')
      .reduce((s: number, p: any) => s + (Number(p.amount) || 0), 0);
    return a + (cash > 0 ? cash : (t.payments?.length === 0 ? Number(t.total) || 0 : 0));
  }, 0);
  const dayMobile = dayTxs.reduce((a: number, t: any) => a + (t.payments || [])
    .filter((p: any) => p.method === 'Mobile Money')
    .reduce((s: number, p: any) => s + (Number(p.amount) || 0), 0), 0);
  const dayLines = dayTxs.reduce((a: number, t: any) => a + (t.lines?.length || 0), 0);
  const dayPayments = dayTxs.reduce((a: number, t: any) => a + (t.payments?.length || 0), 0);
  const dayReturns = returns.filter((r: any) => toLocalDayKey(r.date) === day || (r.transactionId && dayTxIds.has(r.transactionId))).length;
  return { dayTxs, dayTxIds, dayCa, dayCash, dayMobile, dayLines, dayPayments, dayReturns };
}

/**
 * Épure le navigateur du poste de vente : la vérité serveur écrase le cache.
 * À appeler depuis le poste de vente lui-même (bouton "Épurer le navigateur").
 */
export async function purgePosBrowserToServerTruth(day: string = PURGE_TARGET_DAY): Promise<PosBrowserPurgeReport> {
  const errors: string[] = [];
  const exp = day === PURGE_TARGET_DAY ? EXPECTED_20261006 : { ...EXPECTED_20261006, day };

  // 1. Photo avant
  const beforeTxList: any[] = (await db.posTransactions.getItem<any[]>('data').catch(() => null)) || [];
  const beforeDayTx = beforeTxList.filter((t: any) => {
    try {
      return toLocalDayKey(t.date) === day;
    } catch {
      return false;
    }
  }).length;
  const queue: any[] = (await db.syncQueue.getItem<any[]>('queue').catch(() => null)) || [];

  // 2. Vérité serveur D'ABORD (E1) : si injoignable, on ne touche à RIEN
  // (ni file, ni cache, ni stockages) — retour en échec sans effet de bord.
  let truth;
  try {
    truth = await fetchServerTruth();
  } catch (e: any) {
    return {
      ok: false,
      day,
      before: { tx: beforeTxList.length, dayTx: beforeDayTx, queue: queue.length, droppedQueue: 0 },
      after: { tx: beforeTxList.length, dayTx: beforeDayTx, dayCa: 0, dayCash: 0, dayMobile: 0, dayLines: 0, dayPayments: 0, dayReturns: 0 },
      replayedLocalOnly: [],
      removedLocalOnly: [],
      expected: exp,
      errors: [...errors, e?.message || String(e)],
    };
  }
  const serverIds = new Set(truth.transactions.map((t: any) => t.id));
  const serverSessionIds = new Set(truth.sessions.map((s: any) => s.id));

  // 3. Ventes locales absentes du serveur → remises en file (E1/E2), JAMAIS
  // supprimées : ce sont soit des ventes hors-ligne légitimes, soit des lignes
  // à réparer (le chemin résilient détachera les produits inconnus).
  // Seules les actions déjà matérialisées côté serveur sont retirées de la file.
  let replayed = 0;
  let droppedQueue = 0;
  try {
    const { queueSyncAction } = await import('./sync');
    const queuedTxIds = new Set(queue.filter((a: any) => a?.type === 'INSERT_POS_TRANSACTION').map((a: any) => a?.payload?.id));
    const queuedSessionIds = new Set(queue.filter((a: any) => a?.type === 'INSERT_POS_CASH_SESSION').map((a: any) => a?.payload?.id));
    for (const t of beforeTxList) {
      if (!t?.id || serverIds.has(t.id) || queuedTxIds.has(t.id)) continue;
      if ((t.lines?.length || 0) === 0) continue; // coquille vide : rien à rejouer
      await queueSyncAction('INSERT_POS_TRANSACTION', t);
      replayed++;
    }
    const beforeSessions: any[] = (await db.posCashSessions.getItem<any[]>('data').catch(() => null)) || [];
    for (const s of beforeSessions) {
      if (!s?.id || serverSessionIds.has(s.id) || queuedSessionIds.has(s.id)) continue;
      await queueSyncAction('INSERT_POS_CASH_SESSION', s);
      replayed++;
    }
    // Retirer de la file les actions POS déjà matérialisées serveur (vrais doublons).
    const materialized = (a: any) => {
      const pid = a?.payload?.id;
      if (!pid) return false;
      if (a.type === 'INSERT_POS_TRANSACTION' || a.type === 'UPDATE_POS_TRANSACTION') return serverIds.has(pid);
      if (a.type === 'INSERT_POS_CASH_SESSION' || a.type === 'UPDATE_POS_CASH_SESSION') return serverSessionIds.has(pid);
      return false;
    };
    const doomed = queue.filter(materialized);
    if (doomed.length > 0) {
      const doomedIds = new Set(doomed.map((a: any) => a?.id).filter(Boolean));
      const kept = queue.filter((a: any) => !(a?.id && doomedIds.has(a.id)));
      await db.syncQueue.setItem('queue', kept);
      droppedQueue = doomed.length;
    }
    // syncErrors : conservées telles quelles (traces utiles, jamais purgées ici).
  } catch (e: any) {
    errors.push('Rejeu file : ' + (e?.message || e));
  }

  // 4. Hard replace des stores (server-wins, pas de merge)
  try {
    await db.posTransactions.setItem('data', truth.transactions);
    await db.posPayments.setItem('data', truth.payments);
    await db.posReturns.setItem('data', truth.returns);
    await db.posCashSessions.setItem('data', truth.sessions);
    await db.syncMetadata.setItem('lastSyncTime', new Date().toISOString());
  } catch (e: any) {
    errors.push('Écriture cache : ' + (e?.message || e));
  }

  // 5. localStorage — E3 : allowlist stricte de clés parasites (débris de test).
  // Le panier en cours (pos_active_*), le panier public et les brouillons ne sont
  // JAMAIS effacés ici (perte de travail constatée avec l'ancienne regex large).
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const doomed: string[] = [];
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i);
        if (!k) continue;
        if (k === 'hinov_test_role') doomed.push(k);
        else if (/^pos_(receipt_preview|ticket_draft|sync_debug)_/.test(k)) doomed.push(k);
      }
      doomed.forEach((k) => window.localStorage.removeItem(k));
    }
  } catch (e: any) {
    errors.push('localStorage : ' + (e?.message || e));
  }

  // 6. Vérification jour cible + tickets locaux absents du serveur (remis en file).
  const replayedLocalOnly = beforeTxList
    .filter((t: any) => {
      try {
        return toLocalDayKey(t.date) === day && !serverIds.has(t.id);
      } catch {
        return false;
      }
    })
    .map((t: any) => t.transactionNumber || t.id)
    .slice(0, 50);
  const s = statsForDay(truth.transactions, truth.returns, day);
  const after = {
    tx: truth.transactions.length,
    dayTx: s.dayTxs.length,
    dayCa: s.dayCa,
    dayCash: s.dayCash,
    dayMobile: s.dayMobile,
    dayLines: s.dayLines,
    dayPayments: s.dayPayments,
    dayReturns: s.dayReturns,
  };

  const ok =
    errors.length === 0 &&
    (day !== PURGE_TARGET_DAY ||
      (after.dayTx === exp.txCount &&
        after.dayCa === exp.caTotal &&
        after.dayCash === exp.cashTotal &&
        after.dayMobile === exp.mobileTotal &&
        after.dayPayments === exp.paymentCount &&
        after.dayReturns === exp.returnCount));

  return {
    ok,
    day,
    before: { tx: beforeTxList.length, dayTx: beforeDayTx, queue: queue.length, droppedQueue },
    after,
    replayedLocalOnly,
    removedLocalOnly: replayedLocalOnly,
    expected: exp,
    errors,
  };
}

/** Résumé lisible du rapport pour toast / console du poste de vente. */
export function formatPurgeReport(r: PosBrowserPurgeReport): string {
  const replayed = r.replayedLocalOnly ?? r.removedLocalOnly ?? [];
  const lines = [
    `Épuration navigateur (${r.day}) : ${r.ok ? 'OK — conforme serveur' : 'ÉCART — voir détails'}`,
    `Avant : ${r.before.tx} ventes en cache (${r.before.dayTx} le ${r.day}), file ${r.before.queue} dont ${r.before.droppedQueue} déjà synchronisée(s) retirée(s).`,
    `Après : ${r.after.tx} ventes (serveur), jour J : ${r.after.dayTx} ventes / CA ${r.after.dayCa.toLocaleString('fr-FR')} FCFA (espèces ${r.after.dayCash.toLocaleString('fr-FR')}, mobile ${r.after.dayMobile.toLocaleString('fr-FR')}, ${r.after.dayLines} lignes, ${r.after.dayPayments} paiements, ${r.after.dayReturns} retours).`,
    `Attendu ${r.expected.day} : ${r.expected.txCount} ventes / ${r.expected.caTotal.toLocaleString('fr-FR')} FCFA (espèces ${r.expected.cashTotal.toLocaleString('fr-FR')}, mobile ${r.expected.mobileTotal.toLocaleString('fr-FR')}).`,
  ];
  if (replayed.length > 0) lines.push('Ventes locales absentes du serveur, remises en file (jamais supprimées) : ' + replayed.join(', '));
  if (r.errors.length > 0) lines.push('Erreurs : ' + r.errors.join(' | '));
  return lines.join('\n');
}
