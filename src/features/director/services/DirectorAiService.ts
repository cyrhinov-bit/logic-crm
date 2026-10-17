import { getUserGeminiKey } from '../../../lib/geminiKey';
import type { PosProduct, PosTransaction, PosCashSession, PosReturn, User } from '../../../context/AppContext';

export interface CopilotMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
  highlights?: string[];
  tables?: { headers: string[]; rows: string[][] };
  suggestedFollowUps?: string[];
}

export interface CopilotContextData {
  posProducts: PosProduct[];
  posTransactions: PosTransaction[];
  posCashSessions: PosCashSession[];
  posReturns?: PosReturn[];
  users: User[];
  currentUserName?: string;
  userId?: string;
}

/**
 * Prépare un condensé des métriques clés du Point de Vente (POS) pour le prompt IA
 */
function buildPosSummary(context: CopilotContextData) {
  const { posProducts, posTransactions, posCashSessions, posReturns = [], users } = context;

  // Calculs Ventes POS
  const validTransactions = posTransactions.filter(t => t.status === 'Validée');
  const totalPosRevenue = validTransactions.reduce((sum, t) => sum + (t.total || 0), 0);
  const totalPosDiscounts = validTransactions.reduce((sum, t) => sum + (t.discountAmount || 0), 0);
  const averageTicket = validTransactions.length > 0 ? Math.round(totalPosRevenue / validTransactions.length) : 0;
  
  // Ventes par mode de paiement
  let cashRevenue = 0;
  let mobileRevenue = 0;
  let otherRevenue = 0;
  validTransactions.forEach(t => {
    (t.payments || []).forEach(p => {
      if (p.method === 'Espèces') cashRevenue += p.amount;
      else if (p.method === 'Mobile Money') mobileRevenue += p.amount;
      else otherRevenue += p.amount;
    });
  });

  // Stocks & Produits Magasin
  const activeProducts = posProducts.filter(p => p.isActive !== false && p.status !== 'Inactive');
  const outOfStock = activeProducts.filter(p => p.quantity <= 0);
  const lowStock = activeProducts.filter(p => p.quantity > 0 && p.quantity <= (p.minStock || 5));
  const totalStockPurchaseValue = activeProducts.reduce((sum, p) => sum + (p.purchasePrice || 0) * (p.quantity || 0), 0);
  const totalStockSellingValue = activeProducts.reduce((sum, p) => sum + (p.sellingPrice || 0) * (p.quantity || 0), 0);
  const theoreticalProfitMargin = totalStockSellingValue - totalStockPurchaseValue;

  // Top 5 produits par chiffre d'affaires
  const productSalesMap = new Map<string, { name: string; qty: number; revenue: number }>();
  validTransactions.forEach(tx => {
    (tx.lines || []).forEach(line => {
      const key = line.productId || line.description;
      const existing = productSalesMap.get(key) || { name: line.description, qty: 0, revenue: 0 };
      existing.qty += line.quantity;
      existing.revenue += line.total;
      productSalesMap.set(key, existing);
    });
  });
  const topProducts = Array.from(productSalesMap.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 5);

  // Sessions de caisse & Écarts
  const closedSessions = posCashSessions.filter(s => s.status === 'Fermée');
  const totalCashDiscrepancies = closedSessions.reduce((sum, s) => sum + (s.difference || 0), 0);
  const sessionsWithDiscrepancy = closedSessions
    .filter(s => typeof s.difference === 'number' && Math.abs(s.difference) > 0)
    .map(s => {
      const cashier = users.find(u => u.id === s.cashierId)?.name || 'Inconnu';
      return {
        sessionDate: s.closedAt || s.openedAt,
        cashier,
        difference: s.difference,
        expected: s.expectedAmount,
        counted: s.finalAmount
      };
    });

  // Retours POS
  const totalReturnsAmount = posReturns.reduce((sum, r) => sum + (r.totalRefund || 0), 0);

  return {
    kpis: {
      totalPosRevenue,
      totalPosDiscounts,
      averageTicket,
      totalValidTransactions: validTransactions.length,
      cashRevenue,
      mobileRevenue,
      otherRevenue,
      activeProductsCount: activeProducts.length,
      outOfStockCount: outOfStock.length,
      lowStockCount: lowStock.length,
      totalStockPurchaseValue,
      totalStockSellingValue,
      theoreticalProfitMargin,
      totalCashDiscrepancies,
      closedSessionsCount: closedSessions.length,
      totalReturnsAmount
    },
    topProducts,
    outOfStockSample: outOfStock.slice(0, 8).map(p => ({ name: p.name, ref: p.reference })),
    lowStockSample: lowStock.slice(0, 8).map(p => ({ name: p.name, ref: p.reference, stock: p.quantity, min: p.minStock })),
    sessionsWithDiscrepancy: sessionsWithDiscrepancy.slice(0, 5)
  };
}

/**
 * Interroge le Copilot Direction POS (Gemini) avec l'état temps réel du Point de Vente
 */
export async function askDirectorCopilot(
  userQuery: string,
  context: CopilotContextData,
  conversationHistory: { role: 'user' | 'model'; parts: { text: string }[] }[] = []
): Promise<{ replyText: string; suggestedFollowUps: string[] }> {
  const query = userQuery.trim();
  if (!query) {
    return {
      replyText: "Veuillez poser une question sur les ventes, stocks, caisses ou finances du magasin.",
      suggestedFollowUps: ["💡 Vos conseils pour augmenter les ventes", "📦 Articles en alerte de stock", "💰 Contrôle des écarts de caisse"]
    };
  }

  const posData = buildPosSummary(context);
  const userApiKey = getUserGeminiKey(context.userId);

  const systemInstruction = `
Tu es le Copilote Décisionnel et Conseiller Stratégique Senior exclusif du Point de Vente (POS / Boutique / Caisse) de HINOV GROUP.
Tu t'adresses directement à la Direction du Point de Vente (${context.currentUserName || 'Monsieur le Directeur'}).
Tu es 100% focalisé sur la gestion du magasin, les ventes en caisse, les stocks de la boutique, les sessions de caisse, les prix, les remises et la rentabilité du point de vente.

DONNÉES EN TEMPS RÉEL DU POINT DE VENTE (POS) :
${JSON.stringify(posData, null, 2)}

RÈGLES DE RÉPONSE STRICTES :
1. Sois direct, professionnel, chiffré, rigoureux et orienté décision magasin.
2. Utilise impérativement la devise FCFA pour tous les montants.
3. Mets en valeur les chiffres clés en gras, et utilise des listes à puces ou tableaux simples pour la lisibilité.
4. OBLIGATION DE CONSEIL : Tu ne dois pas être un simple tableau de chiffres passif. TU DOIS SYSTÉMATIQUEMENT INCLURE UNE SECTION :
   "### 💡 Conseils & Recommandations Stratégiques"
   avec 2 à 4 conseils très concrets, actionnables et personnalisés (ex: booster le panier moyen par de la vente additionnelle en caisse, réajuster les prix/marges, lancer des réapprovisionnements prioritaires, former les caissiers pour éviter les écarts).
5. Ne fais AUCUNE mention du CRM ou des devis B2B car ton périmètre est strictement le Point de Vente / Magasin.
6. Propose 2 à 3 questions de suivi pertinentes à la fin sous format JSON structuré si possible.
`;

  if (userApiKey) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${encodeURIComponent(userApiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              ...conversationHistory,
              {
                role: 'user',
                parts: [{ text: `${systemInstruction}\n\nQUESTION DE LA DIRECTION :\n"${query}"` }]
              }
            ],
            generationConfig: {
              temperature: 0.25
            }
          })
        }
      );

      if (response.ok) {
        const data = await response.json();
        const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (reply) {
          return {
            replyText: reply,
            suggestedFollowUps: [
              "💡 Comment booster notre panier moyen ce mois-ci ?",
              "📦 Quels articles commander d'urgence aux fournisseurs ?",
              "💰 Quel plan d'action pour sécuriser les clôtures de caisse ?"
            ]
          };
        }
      }
    } catch (err) {
      console.warn('Erreur appel Copilot Direction POS :', err);
    }
  }

  // Fallback intelligent en local avec conseils contextuels
  return generateLocalPosAnalysis(query, posData);
}

function generateLocalPosAnalysis(query: string, posData: ReturnType<typeof buildPosSummary>) {
  const q = query.toLowerCase();
  const { kpis, topProducts, sessionsWithDiscrepancy, outOfStockSample, lowStockSample } = posData;

  if (q.includes('conseil') || q.includes('recommandation') || q.includes('strategie') || q.includes('booster') || q.includes('ameliorer')) {
    return {
      replyText: `### 💡 Plan d'Actions & Conseils Stratégiques Magasin\n\n` +
        `Voici les 4 leviers prioritaires identifiés pour optimiser les performances de la boutique :\n\n` +
        `1. **Augmentation du Panier Moyen (${kpis.averageTicket.toLocaleString()} FCFA actuel) :**\n` +
        `   - Mettre en place des ventes croisées au comptoir de caisse (articles d'impulsion : stylos, correcteurs, consommables rapides).\n` +
        `   - Créer des packs ou bundles avantageux pour les fournitures à forte rotation.\n\n` +
        `2. **Sécurisation de la Trésorerie & Clôtures de Caisse :**\n` +
        `   - Écarts constatés : **${kpis.totalCashDiscrepancies.toLocaleString()} FCFA**. Imposer un recomptage à l'aveugle par le caissier avant impression du Z de caisse.\n` +
        `   - Conditionner toute annulation de ticket à la validation du Gérant.\n\n` +
        `3. **Gestion des Stocks & Ruptures Critiques :**\n` +
        `   - **${kpis.outOfStockCount}** articles en rupture totale et **${kpis.lowStockCount}** en stock critique.\n` +
        `   - Passer immédiatement commande auprès des fournisseurs pour les bestsellers afin d'éviter le manque à gagner.\n\n` +
        `4. **Optimisation des Marges & Remises :**\n` +
        `   - Remises accordées : **${kpis.totalPosDiscounts.toLocaleString()} FCFA**. Plafonner les remises caissiers à 5% maximum sans visa hiérarchique.`,
      suggestedFollowUps: [
        "Quels sont les articles en rupture urgente ?",
        "Détail des écarts de caisse par session",
        "Top des meilleures ventes boutique"
      ]
    };
  }

  if (q.includes('bilan') || q.includes('chiffre') || q.includes('revenu') || q.includes('total') || q.includes('finance')) {
    return {
      replyText: `### 📊 Synthèse Financière du Point de Vente\n\n` +
        `- **Chiffre d'affaires Magasin :** **${kpis.totalPosRevenue.toLocaleString()} FCFA** (${kpis.totalValidTransactions} ventes validées)\n` +
        `- **Panier moyen :** **${kpis.averageTicket.toLocaleString()} FCFA**\n` +
        `- **Répartition des encaissements :**\n` +
        `  - 💵 Espèces : **${kpis.cashRevenue.toLocaleString()} FCFA**\n` +
        `  - 📱 Mobile Money : **${kpis.mobileRevenue.toLocaleString()} FCFA**\n` +
        `- **Remises accordées :** **${kpis.totalPosDiscounts.toLocaleString()} FCFA**\n` +
        `- **Valeur du stock en magasin :** **${kpis.totalStockPurchaseValue.toLocaleString()} FCFA** (Valeur vente : **${kpis.totalStockSellingValue.toLocaleString()} FCFA**)\n` +
        `- **Marge brute potentielle :** **${kpis.theoreticalProfitMargin.toLocaleString()} FCFA**\n\n` +
        `### 💡 Conseils pour la Direction :\n` +
        `- Favoriser les paiements Mobile Money pour limiter les manipulations de cash et réduire le risque de vol ou d'erreur de caisse.\n` +
        `- Inciter les caissiers à proposer un article complémentaire pour faire passer le panier moyen au-dessus de **${(kpis.averageTicket * 1.2).toLocaleString()} FCFA**.`,
      suggestedFollowUps: [
        "💡 Vos conseils pour augmenter les ventes",
        "Quels sont les articles en rupture ?",
        "Y a-t-il des écarts de caisse ?"
      ]
    };
  }

  if (q.includes('stock') || q.includes('rupture') || q.includes('alerte') || q.includes('approvisionnement')) {
    const outList = outOfStockSample.length > 0
      ? outOfStockSample.map(p => `- ❌ **${p.name}** (Réf: ${p.ref || 'N/A'})`).join('\n')
      : "✅ Aucune rupture totale de stock.";

    const lowList = lowStockSample.length > 0
      ? lowStockSample.map(p => `- ⚠️ **${p.name}** : **${p.stock}** restants (Seuil min: ${p.min})`).join('\n')
      : "✅ Aucun stock sous le seuil minimum.";

    return {
      replyText: `### 📦 État des Stocks du Magasin\n\n` +
        `- **Articles actifs au catalogue :** ${kpis.activeProductsCount}\n` +
        `- **Articles en rupture totale :** **${kpis.outOfStockCount}**\n` +
        `- **Articles en stock critique :** **${kpis.lowStockCount}**\n\n` +
        `#### ❌ Ruptures critiques :\n${outList}\n\n` +
        `#### ⚠️ Alertes réapprovisionnement :\n${lowList}\n\n` +
        `### 💡 Conseils d'Approvisionnement :\n` +
        `- Négocier des remises de volume avec vos fournisseurs principaux pour réapprovisionner les articles en rupture.\n` +
        `- Rehausser le seuil d'alerte sur les articles à rotation rapide pour anticiper les délais de livraison.`,
      suggestedFollowUps: [
        "Quelle est la valeur totale de notre stock ?",
        "💡 Conseils pour liquider les stocks dormants",
        "Bilan financier global du magasin"
      ]
    };
  }

  if (q.includes('écart') || q.includes('caisse') || q.includes('clôture') || q.includes('session') || q.includes('manquant')) {
    const discList = sessionsWithDiscrepancy.length > 0
      ? sessionsWithDiscrepancy.map(s => {
          const diff = s.difference || 0;
          return `- **${s.cashier}** (${new Date(s.sessionDate).toLocaleDateString('fr-FR')}) : **${diff < 0 ? '-' : '+'}${Math.abs(diff).toLocaleString()} FCFA** (Compté: ${(s.counted || 0).toLocaleString()} vs Attendu: ${(s.expected || 0).toLocaleString()})`;
        }).join('\n')
      : "✅ Aucun écart significatif enregistré sur les dernières sessions fermées.";

    return {
      replyText: `### 💰 Contrôle des Sessions de Caisse\n\n` +
        `- **Sessions fermées analysées :** ${kpis.closedSessionsCount}\n` +
        `- **Cumul net des écarts de caisse :** **${kpis.totalCashDiscrepancies.toLocaleString()} FCFA**\n\n` +
        `#### Détail des écarts récents :\n${discList}\n\n` +
        `### 💡 Conseils Anti-Fraude & Sécurité :\n` +
        `- Instaurer un contrôle quotidien contradictoire en fin de journée.\n` +
        `- Tout écart supérieur à 2 000 FCFA doit donner lieu à une fiche d'explication signée du caissier.`,
      suggestedFollowUps: [
        "Vérifier le bouclier anti-fraude",
        "💡 Comment former les caissiers ?",
        "Bilan financier du magasin"
      ]
    };
  }

  // Réponse générique avec conseils
  return {
    replyText: `### 🏪 Point de Situation Magasin & Recommandations\n\n` +
      `- **Chiffre d'affaires POS :** **${kpis.totalPosRevenue.toLocaleString()} FCFA**\n` +
      `- **Articles en rupture :** **${kpis.outOfStockCount}**\n` +
      `- **Écarts de caisse :** **${kpis.totalCashDiscrepancies.toLocaleString()} FCFA**\n` +
      `- **Valeur stock vente :** **${kpis.totalStockSellingValue.toLocaleString()} FCFA**\n\n` +
      `### 💡 Conseil clé du jour :\n` +
      `Concentrez les efforts sur le réapprovisionnement des **${kpis.outOfStockCount}** articles en rupture et le contrôle strict des remises accordées en caisse.`,
    suggestedFollowUps: [
      "💡 Donnez-moi vos conseils pour booster les ventes",
      "Articles en alerte de stock",
      "Contrôle des écarts de caisse"
    ]
  };
}
