import { getUserGeminiKey } from '../../../lib/geminiKey';
import type { PosProduct, PosTransaction, PosCashSession, PosReturn, User } from '../../../context/AppContext';

export interface AuditAnomaly {
  id: string;
  type: 'CASH_DISCREPANCY' | 'LOSS_SALE' | 'HIGH_DISCOUNT' | 'VOIDED_TX' | 'UNJUSTIFIED_RETURN' | 'STOCK_VARIANCE';
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  title: string;
  description: string;
  amount?: number;
  date: string;
  responsibleName?: string;
  reference?: string;
  recommendedAction: string;
}

export interface AuditReportResult {
  healthScore: number; // 0 à 100
  status: 'OPTIMAL' | 'ATTENTION' | 'CRITIQUE';
  summary: string;
  totalLossRisk: number;
  totalCashDiscrepancy: number;
  totalHighDiscounts: number;
  anomalies: AuditAnomaly[];
  aiAnalysisText?: string;
}

/**
 * Analyse l'ensemble des données POS pour détecter les anomalies et fraudes potentielles
 */
export function runFinancialAudit(params: {
  posTransactions: PosTransaction[];
  posCashSessions: PosCashSession[];
  posProducts: PosProduct[];
  posReturns?: PosReturn[];
  users: User[];
}): AuditReportResult {
  const { posTransactions, posCashSessions, posProducts, posReturns = [], users } = params;
  const anomalies: AuditAnomaly[] = [];

  let totalCashDiscrepancy = 0;
  let totalLossRisk = 0;
  let totalHighDiscounts = 0;

  const getUserName = (id?: string) => users.find(u => u.id === id)?.name || 'Caissier / Collaborateur inconnu';

  // 1. Audit des Sessions de Caisse (Écarts de fond de caisse)
  posCashSessions.forEach(session => {
    if (session.status === 'Fermée' && typeof session.difference === 'number' && Math.abs(session.difference) > 0) {
      const diff = session.difference;
      const isNegative = diff < 0;
      totalCashDiscrepancy += Math.abs(diff);

      anomalies.push({
        id: `cash-${session.id}`,
        type: 'CASH_DISCREPANCY',
        severity: Math.abs(diff) >= 5000 ? 'CRITICAL' : 'WARNING',
        title: isNegative ? `Manquant de caisse : -${Math.abs(diff).toLocaleString()} FCFA` : `Surplus inexpliqué : +${diff.toLocaleString()} FCFA`,
        description: `Session fermée le ${new Date(session.closedAt || session.openedAt).toLocaleDateString('fr-FR')} par ${getUserName(session.cashierId)}. Montant théorique : ${(session.expectedAmount || 0).toLocaleString()} FCFA, compté : ${(session.finalAmount || 0).toLocaleString()} FCFA.`,
        amount: Math.abs(diff),
        date: session.closedAt || session.openedAt,
        responsibleName: getUserName(session.cashierId),
        reference: `Session #${session.id.slice(0, 8)}`,
        recommendedAction: isNegative
          ? "Exiger une justification écrite du caissier et vérifier les tickets d'annulation du jour."
          : "Enregistrer l'écart positif en compte de régularisation et contrôler les encaissements non saisis."
      });
    }
  });

  // 2. Audit des Transactions POS (Ventes à perte & Remises anormales)
  posTransactions.forEach(tx => {
    // Détection remises excessives (> 20% ou remise > 10 000 FCFA)
    if (tx.discountAmount > 0 && tx.subtotal > 0) {
      const discountRate = (tx.discountAmount / tx.subtotal) * 100;
      if (discountRate >= 20 || tx.discountAmount >= 15000) {
        totalHighDiscounts += tx.discountAmount;
        anomalies.push({
          id: `disc-${tx.id}`,
          type: 'HIGH_DISCOUNT',
          severity: discountRate >= 35 ? 'CRITICAL' : 'WARNING',
          title: `Remise exceptionnelle de ${discountRate.toFixed(1)}% (${tx.discountAmount.toLocaleString()} FCFA)`,
          description: `Transaction ${tx.transactionNumber} effectuée par ${getUserName(tx.cashierId)}. Total payé : ${tx.total.toLocaleString()} FCFA (Sous-total : ${tx.subtotal.toLocaleString()} FCFA).`,
          amount: tx.discountAmount,
          date: tx.date,
          responsibleName: getUserName(tx.cashierId),
          reference: tx.transactionNumber,
          recommendedAction: "Vérifier si cette remise a fait l'objet d'une validation préalable de la Direction."
        });
      }
    }

    // Détection des ventes à perte par ligne d'article
    (tx.lines || []).forEach(line => {
      const prod = posProducts.find(p => p.id === line.productId);
      if (prod && prod.purchasePrice > 0) {
        const netLineUnitPrice = line.quantity > 0 ? line.total / line.quantity : line.unitPrice;
        if (netLineUnitPrice < prod.purchasePrice) {
          const lossPerUnit = prod.purchasePrice - netLineUnitPrice;
          const totalLineLoss = lossPerUnit * line.quantity;
          totalLossRisk += totalLineLoss;

          anomalies.push({
            id: `loss-${tx.id}-${line.id}`,
            type: 'LOSS_SALE',
            severity: 'CRITICAL',
            title: `Vente à perte détectée : ${line.description}`,
            description: `Vendu à ${Math.round(netLineUnitPrice).toLocaleString()} FCFA / unité alors que le coût d'achat fournisseur est de ${prod.purchasePrice.toLocaleString()} FCFA. Perte sèche : -${Math.round(totalLineLoss).toLocaleString()} FCFA.`,
            amount: totalLineLoss,
            date: tx.date,
            responsibleName: getUserName(tx.cashierId),
            reference: tx.transactionNumber,
            recommendedAction: "Alerter le caissier et verrouiller les seuils de remises sur les articles sensibles."
          });
        }
      }
    });

    // Détection des transactions annulées
    if (tx.status === 'Annulée') {
      anomalies.push({
        id: `void-${tx.id}`,
        type: 'VOIDED_TX',
        severity: 'WARNING',
        title: `Ticket annulé : ${tx.transactionNumber} (${tx.total.toLocaleString()} FCFA)`,
        description: `Vente annulée enregistrée par ${getUserName(tx.cashierId)} pour un montant de ${tx.total.toLocaleString()} FCFA.`,
        amount: tx.total,
        date: tx.date,
        responsibleName: getUserName(tx.cashierId),
        reference: tx.transactionNumber,
        recommendedAction: "Vérifier la concordance physique entre les articles remis en rayon et le ticket annulé."
      });
    }
  });

  // Calcul du score de santé (de 0 à 100)
  let penalty = 0;
  anomalies.forEach(a => {
    if (a.severity === 'CRITICAL') penalty += 15;
    else if (a.severity === 'WARNING') penalty += 6;
    else penalty += 2;
  });

  const healthScore = Math.max(20, Math.min(100, Math.round(100 - penalty)));
  let status: 'OPTIMAL' | 'ATTENTION' | 'CRITIQUE' = 'OPTIMAL';
  if (healthScore < 60) status = 'CRITIQUE';
  else if (healthScore < 85) status = 'ATTENTION';

  // Synthèse textuelle
  const criticalCount = anomalies.filter(a => a.severity === 'CRITICAL').length;
  const warningCount = anomalies.filter(a => a.severity === 'WARNING').length;

  let summary = `Score de conformité de ${healthScore}/100. `;
  if (anomalies.length === 0) {
    summary += "Aucune anomalie financière ou opérationnelle détectée. Les flux de caisse et marges sont parfaitement conformes.";
  } else {
    summary += `${anomalies.length} point(s) d'attention relevé(s) (${criticalCount} critique(s), ${warningCount} avertissement(s)). Écarts cumulés : ${totalCashDiscrepancy.toLocaleString()} FCFA.`;
  }

  return {
    healthScore,
    status,
    summary,
    totalLossRisk,
    totalCashDiscrepancy,
    totalHighDiscounts,
    anomalies: anomalies.sort((a, b) => (a.severity === 'CRITICAL' ? -1 : 1))
  };
}

/**
 * Génère une analyse narrative approfondie par Gemini pour la Direction
 */
export async function generateAiAuditDiagnostic(
  audit: AuditReportResult,
  userId?: string
): Promise<string> {
  const userApiKey = getUserGeminiKey(userId);
  if (!userApiKey) {
    return audit.summary;
  }

  const prompt = `
Tu es l'Auditeur Financier et Conseiller de Gestion Senior en Chef du Point de Vente de HINOV GROUP.
Voici les résultats de l'audit automatique des caisses, remises et marges du magasin :

Score global de santé financière : ${audit.healthScore}/100 (${audit.status})
Écarts de caisse cumulés : ${audit.totalCashDiscrepancy.toLocaleString()} FCFA
Pertes potentielles sur ventes à perte : ${audit.totalLossRisk.toLocaleString()} FCFA
Total des remises exceptionnelles : ${audit.totalHighDiscounts.toLocaleString()} FCFA

Liste détaillée des anomalies constatées :
${JSON.stringify(audit.anomalies.slice(0, 15), null, 2)}

INSTRUCTIONS DE RÉDACTION :
1. Rédige un diagnostic d'audit exécutif percutant, chiffré et direct pour le Directeur Général.
2. Évalue clairement le niveau de risque financier et de fuite de trésorerie en caisse.
3. INCLURE OBLIGATOIREMENT : "### 💡 Recommandations & Conseils Correctifs pour la Direction" avec 3 à 5 directives précises (ex: procédures de contrôle de caisse, plafonnement strict des remises, sanctions ou entretiens avec les caissiers à écarts répétés, audit physique de stock).
`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${encodeURIComponent(userApiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.2 }
        })
      }
    );

    if (res.ok) {
      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) return text;
    }
  } catch (err) {
    console.warn('Erreur Gemini Diagnostic Audit:', err);
  }

  return audit.summary;
}

