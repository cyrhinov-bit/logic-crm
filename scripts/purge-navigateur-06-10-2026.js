/**
 * ÉPURATION NAVIGATEUR — Poste de vente HINOV
 * Objectif : faire respecter exactement l'historique serveur du 06/10/2026.
 *
 * Référence serveur (07/10/2026, compte s.diallo@hinovgroup.com) :
 *   06/10/2026 = 15 transactions Validées, CA 73 940 FCFA
 *   (espèces 33 300 / mobile 40 640, 15 lignes, 15 paiements,
 *    0 retour, session fermée b850d452-8f1f-47f7-82a7-a4bd8830898f)
 *
 * MODE D'EMPLOI (sur le poste de vente lui-même) :
 *   1. Ouvrez l'application sur le poste de vente, page « Historique des ventes ».
 *   2. Ouvrez les DevTools (F12) > onglet Console.
 *   3. Copiez-collez TOUT ce fichier dans la console, Entrée.
 *   4. Le script vide le cache local POS + la file fantôme, recharge l'app,
 *      qui re-télécharge la vérité serveur. Vérifiez ensuite :
 *      filtrez sur la semaine du 06/10/2026 → 15 ventes, CA 73 940 FCFA.
 *
 * NOTE : depuis la mise à jour, le bouton « Épurer le navigateur » dans
 * « Historique des ventes » fait la même chose proprement (avec vérification).
 * Ce script reste utile si l'affichage est trop pollué pour cliquer.
 */
(async () => {
  const DAY = '2026-10-06';
  const EXPECTED_COUNT = 15;
  const EXPECTED_CA = 73940;
  const DB_NAME = 'hinov';
  const STORES = ['posTransactions', 'posPayments', 'posReturns', 'posCashSessions', 'syncQueue', 'syncErrors', 'syncMetadata'];

  const log = (...a) => console.log('[Purge Navigateur]', ...a);

  // 1. Photo avant
  try {
    const keys = Object.keys(localStorage);
    log('localStorage :', keys.length, 'clés');
  } catch (e) { log('localStorage illisible', e); }

  // 2. Vider les object stores IndexedDB « hinov »
  const clearStores = () => new Promise((resolve) => {
    const req = indexedDB.open(DB_NAME);
    req.onerror = () => { log('IndexedDB inaccessible :', req.error); resolve({ cleared: [], error: String(req.error) }); };
    req.onsuccess = () => {
      const db = req.result;
      const existing = Array.from(db.objectStoreNames || []);
      const targets = STORES.filter((s) => existing.includes(s));
      log('stores existants :', existing.join(', '));
      if (targets.length === 0) { db.close(); resolve({ cleared: [] }); return; }
      const tx = db.transaction(targets, 'readwrite');
      const cleared = [];
      tx.oncomplete = () => { db.close(); resolve({ cleared }); };
      tx.onerror = () => { log('Erreur transaction clear :', tx.error); db.close(); resolve({ cleared, error: String(tx.error) }); };
      for (const name of targets) {
        try {
          const st = tx.objectStore(name);
          const c = st.clear();
          c.onsuccess = () => { cleared.push(name); log('store vidé :', name); };
          c.onerror = () => log('Échec vidage :', name, c.error);
        } catch (e) { log('Store ignoré :', name, e); }
      }
    };
  });

  await clearStores();

  // 3. localStorage parasite (paniers / tickets / brouillons) — jamais l'auth
  const keep = new Set(['auth_last_user', 'app_theme_primary', 'gemini_api_key']);
  const purgeRe = /(pos|cart|suspend|ticket|quote_draft|hinov_public_cart|receipt)/i;
  const removed = [];
  try {
    const all = [];
    for (let i = 0; i < localStorage.length; i++) all.push(localStorage.key(i));
    for (const k of all) {
      if (!k || keep.has(k)) continue;
      if (k.startsWith('user_theme_primary_') || k.startsWith('gemini_')) continue;
      if (purgeRe.test(k)) { localStorage.removeItem(k); removed.push(k); }
    }
    log('localStorage purgé :', removed.length ? removed.join(', ') : '(rien à purger)');
  } catch (e) { log('Purge localStorage impossible :', e); }

  log(`Avant rechargement — attendu le ${DAY} : ${EXPECTED_COUNT} ventes / ${EXPECTED_CA.toLocaleString('fr-FR')} FCFA.`);
  log('Rechargement dans 1,5 s pour re-télécharger la vérité serveur…');
  await new Promise((r) => setTimeout(r, 1500));
  location.reload();
})();
