import React from 'react';
import { PieChart, BookOpen, PenTool, Printer, Wallet, Smartphone, CreditCard, Banknote } from 'lucide-react';

export interface FamilyBreakdown {
  name: string;
  revenue: number;
  quantity: number;
  color: string;
  icon?: React.ElementType;
}

export interface PaymentBreakdown {
  method: string;
  amount: number;
  count: number;
  color: string;
}

interface PosDistributionProps {
  families: FamilyBreakdown[];
  payments: PaymentBreakdown[];
  totalRevenue: number;
}

export function PosFamilyDistributionChart({
  families,
  payments,
  totalRevenue
}: PosDistributionProps) {
  const totalFamilyRev = families.reduce((s, f) => s + f.revenue, 0);
  const totalPaymentAmt = payments.reduce((s, p) => s + p.amount, 0);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
      {/* 1. Répartition par Famille de Produits */}
      <div style={{ background: 'white', borderRadius: 'var(--radius-lg, 12px)', padding: '20px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: '1px solid var(--color-border, #E2E8F0)' }}>
        <h3 style={{ fontSize: '15px', fontWeight: 700, margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <PieChart size={18} color="var(--color-primary, #0D9488)" />
          Répartition des Ventes par Famille
        </h3>
        <p style={{ fontSize: '12px', color: 'var(--color-text-muted, #64748B)', margin: '0 0 16px' }}>
          Part du Chiffre d'Affaires généré par catégorie
        </p>

        {totalFamilyRev === 0 ? (
          <div style={{ padding: '30px 0', textAlign: 'center', color: 'var(--color-text-muted, #64748B)', fontSize: '13px' }}>
            Aucune vente sur la période
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {/* Barre empilée multi-couleurs */}
            <div style={{ height: '14px', width: '100%', borderRadius: '7px', display: 'flex', overflow: 'hidden', backgroundColor: '#F1F5F9' }}>
              {families.map((fam, idx) => {
                const pct = totalFamilyRev > 0 ? (fam.revenue / totalFamilyRev) * 100 : 0;
                if (pct <= 0) return null;
                return (
                  <div
                    key={idx}
                    title={`${fam.name}: ${fam.revenue.toLocaleString('fr-FR')} FCFA (${pct.toFixed(1)}%)`}
                    style={{
                      width: `${pct}%`,
                      backgroundColor: fam.color,
                      transition: 'width 0.3s ease'
                    }}
                  />
                );
              })}
            </div>

            {/* Liste détaillée */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {families.map((fam, idx) => {
                const pct = totalFamilyRev > 0 ? ((fam.revenue / totalFamilyRev) * 100).toFixed(1) : '0';
                return (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: fam.color, flexShrink: 0 }} />
                      <span style={{ fontWeight: 600, color: '#334155' }}>{fam.name}</span>
                      <span style={{ fontSize: '11px', color: 'var(--color-text-muted, #64748B)' }}>({fam.quantity} unités)</span>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontWeight: 700, color: '#0F172A' }}>{fam.revenue.toLocaleString('fr-FR')} FCFA</span>
                      <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-muted, #64748B)', marginLeft: '6px' }}>
                        {pct}%
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* 2. Répartition par Mode de Paiement */}
      <div style={{ background: 'white', borderRadius: 'var(--radius-lg, 12px)', padding: '20px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: '1px solid var(--color-border, #E2E8F0)' }}>
        <h3 style={{ fontSize: '15px', fontWeight: 700, margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Wallet size={18} color="#6366F1" />
          Mix des Modes d'Encaissement
        </h3>
        <p style={{ fontSize: '12px', color: 'var(--color-text-muted, #64748B)', margin: '0 0 16px' }}>
          Ventilation des encaissements (Espèces, Mobile Money, Cartes)
        </p>

        {totalPaymentAmt === 0 ? (
          <div style={{ padding: '30px 0', textAlign: 'center', color: 'var(--color-text-muted, #64748B)', fontSize: '13px' }}>
            Aucun paiement enregistré sur la période
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {/* Barre empilée */}
            <div style={{ height: '14px', width: '100%', borderRadius: '7px', display: 'flex', overflow: 'hidden', backgroundColor: '#F1F5F9' }}>
              {payments.map((p, idx) => {
                const pct = totalPaymentAmt > 0 ? (p.amount / totalPaymentAmt) * 100 : 0;
                if (pct <= 0) return null;
                return (
                  <div
                    key={idx}
                    title={`${p.method}: ${p.amount.toLocaleString('fr-FR')} FCFA (${pct.toFixed(1)}%)`}
                    style={{
                      width: `${pct}%`,
                      backgroundColor: p.color,
                      transition: 'width 0.3s ease'
                    }}
                  />
                );
              })}
            </div>

            {/* Détails modes */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {payments.map((p, idx) => {
                const pct = totalPaymentAmt > 0 ? ((p.amount / totalPaymentAmt) * 100).toFixed(1) : '0';
                return (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: p.color, flexShrink: 0 }} />
                      <span style={{ fontWeight: 600, color: '#334155' }}>{p.method}</span>
                      <span style={{ fontSize: '11px', color: 'var(--color-text-muted, #64748B)' }}>({p.count} paiements)</span>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontWeight: 700, color: '#0F172A' }}>{p.amount.toLocaleString('fr-FR')} FCFA</span>
                      <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-muted, #64748B)', marginLeft: '6px' }}>
                        {pct}%
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
