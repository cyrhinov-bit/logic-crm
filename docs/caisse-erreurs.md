# Caisse POS — Que se passe-t-il si le caissier se trompe ?

Ce document décrit le comportement de la caisse POS face aux erreurs du caissier
(produit ou quantité erroné, mauvaise remise, paiement validé par erreur, retour
créé par erreur…), ainsi que les permissions associées.

## 1. Sommaire des permissions

| Action | Caissier | Gérant | Directeur (Admin POS) |
|---|---|---|---|
| Vendre (Terminal) | ✅ | — | ✅ |
| Ouvrir / fermer la caisse | ✅ | — | ✅ |
| Consulter l'historique des ventes | ✅ | — | ✅ |
| **Annuler une vente (void)** | ✅ ses ventes de la **session caisse ouverte** | ✅ toutes | ✅ toutes |
| **Créer / voir des retours** | ❌ | ✅ | ✅ |
| **Annuler un retour** | ❌ | ✅ | ✅ |

Le Gérant n'a pas d'accès au Terminal ni à l'Historique des ventes (navigation
existante) — il gère le catalogue, le stock et désormais les retours.

## 2. Avant paiement (panier en cours) — aucune conséquence

- Le caissier peut corriger librement sa commande : supprimer une ligne, changer
  une quantité, ajuster une remise ligne/globale, ou vider le panier
  (`PosTerminal.tsx`).
- Tant que « Payer » n'est pas confirmé, **aucune transaction n'est créée** : le
  stock n'est pas modifié, aucun ticket n'est imprimé.

## 3. Après paiement — la vente est enregistrée

Dès la validation (« Payer ») :
1. Une transaction `Validée` est créée (`AppContext.addPosTransaction`).
2. Le stock des produits est décrémenté (localement et côté Supabase via
   `INSERT_POS_TRANSACTION`).
3. Le ticket est imprimé.

### 3.1 Annuler une vente (void)

- Bouton **« Annuler »** dans l'historique des ventes (`PosTransactions`),
  avec confirmation.
- Effets :
  - statut de la transaction → **`Annulée`** ;
  - **stock restauré** (local + Supabase via `UPDATE_POS_PRODUCT`) ;
  - la transaction annulée est **exclue** du calcul du montant attendu en
    caisse (`PosCash` ne prend en compte que les transaction `Validée`).
- Périmètre :
  - **Caissier** : uniquement ses ventes de la **session caisse actuellement
    ouverte** (une fois la caisse fermée, il ne peut plus annuler) ;
  - **Gérant / Directeur** : toute vente `Validée`.

### 3.2 Retour d'un produit vendu

- Uniquement disponible pour le **Gérant** et le **Directeur** (page
  `Retours`, bouton « Retour » de l'historique).
- Le caissier n'a **ni accès à la page Retours** (menu masqué + garde de route)
  ni bouton « Retour » dans l'historique.
- Effets d'un retour créé (`AppContext.addPosReturn`) :
  - le stock des articles retournés est **réintégré** (local + Supabase) ;
  - le **remboursement réel** (total `totalRefund`) est comptabilisé en caisse ;
  - la transaction d'origine passe en **`Retournée` uniquement si le retour est
    complet** (voir §4), sinon elle reste `Validée`.

## 4. Retours partiels

- Un retour peut couvrir seulement une partie des quantités d'une vente.
- La transaction d'origine n'est marquée **`Retournée`** que si **toutes** les
  quantités de ses lignes ont été retournées (retours actifs cumulés). Sinon son
  statut reste **`Validée`**, ce qui permet de créer des retours supplémentaires.
- Le calcul de caisse (`PosCash`) soustrait le **remboursement réel** (sommes
  des `totalRefund` des retours `Traité` liés à la session) et non le montant
  total de la vente. Le montant attendu en caisse :
  `fond initial + ventes validées − remboursements réels`.

## 5. Annuler un retour

- Un retour `Traité` peut être annulé (bouton **« Annuler »**, Gérant /
  Directeur uniquement).
- Effets de `cancelPosReturn` :
  - statut du retour → **`Annulé`** ;
  - le stock retourné est **réinjecté** dans l'inventaire (les articles
    redeviennent disponibles : décrément du stock, local + Supabase) ;
  - le **statut de la transaction liée est recalculé** : si aucun retour actif
    ne subsiste, elle repasse en `Validée` ; si d'autres retours actifs couvrent
    tout, elle reste `Retournée`.

## 6. Gestion de caisse (clôture)

- À la clôture, le caissier saisit le **montant réel** en caisse.
- L'**écart** (`réal − attendu`) est calculé avec le montant attendu défini au
  §4 ; un écart positif ou négatif est affiché et enregistré sur la session.
- Les ventes annulées n'apparaissent pas dans l'attendu ; les remboursements
  (retours `Traité`) sont bien déduits.

## 7. Synchronisation (mode hors-ligne / Supabase)

- Les actions sont mises en file localement (`localforage`) puis rejouées vers
  Supabase dès que la connexion revient.
- **Stock** :
  - vente : décrément côté serveur géré par `INSERT_POS_TRANSACTION` ;
  - void / retour / annulation de retour : le stock est synchronisé via des
    actions `UPDATE_POS_PRODUCT` (quantité absolue recalculée localement).
  - Les lignes de plusieurs produits identiques dans une même vente/retour sont
    **correctement cumulées** (correction du bug de relecture d'un état stale).

## 8. Limites connues

- Il n'existe pas de statut « partiellement retourné » distinct : une vente
  partiellement retournée reste `Validée` et n'affiche pas le montant déjà
  rendu — seule la page Retours (par transaction d'origine) permet de retrouver
  l'historique des retours.
- Un void effectué après la clôture de la session n'est pas attribué à une
  session ouverte ; la traçabilité reste assurée par le statut et l'historique.