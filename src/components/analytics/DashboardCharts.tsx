import { useState } from 'react';
import { 
  TrendingUp, 
  Award, 
  CheckCircle2, 
  Clock, 
  XCircle, 
  FileText,
  Percent,
  ArrowUpRight,
  Sparkles,
  BarChart3,
  PieChart as PieIcon,
  ChevronRight,
  ShoppingBag,
  DollarSign,
  Wrench,
  Package,
  Users as UsersIcon,
  UserCheck,
  Layers,
  Shield,
  Activity,
  Wallet
} from 'lucide-react';

/* ─── 1. Donut / Pie Chart SVG ─────────────────────────────────── */
export interface DonutDataPoint {
  label: string;
  value: number;
  color: string;
  secondaryText?: string;
}

export function DonutChart({
  data,
  title,
  subTitle,
  centerLabel,
  centerValue,
  size = 180,
  strokeWidth = 26
}: {
  data: DonutDataPoint[];
  title?: string;
  subTitle?: string;
  centerLabel?: string;
  centerValue?: string | number;
  size?: number;
  strokeWidth?: number;
}) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const total = data.reduce((acc, d) => acc + d.value, 0);

  const radius = (size - strokeWidth) / 2;
  const center = size / 2;
  const circumference = 2 * Math.PI * radius;

  let accumulatedPercent = 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {title && (
        <div style={{ marginBottom: '14px' }}>
          <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: 'var(--color-text)' }}>{title}</h4>
          {subTitle && <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>{subTitle}</p>}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '20px', flexWrap: 'wrap', flex: 1 }}>
        {/* SVG Circle */}
        <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
          <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
            {/* Background track */}
            <circle
              cx={center}
              cy={center}
              r={radius}
              fill="none"
              stroke="var(--color-surface-alt, #f1f5f9)"
              strokeWidth={strokeWidth}
            />
            {total === 0 ? (
              <circle
                cx={center}
                cy={center}
                r={radius}
                fill="none"
                stroke="#E2E8F0"
                strokeWidth={strokeWidth}
              />
            ) : (
              data.map((item, idx) => {
                if (item.value <= 0) return null;
                const percent = (item.value / total);
                const strokeDasharray = `${circumference * percent} ${circumference * (1 - percent)}`;
                const strokeDashoffset = -circumference * accumulatedPercent;
                accumulatedPercent += percent;
                const isHovered = hoveredIdx === idx;

                return (
                  <circle
                    key={idx}
                    cx={center}
                    cy={center}
                    r={radius}
                    fill="none"
                    stroke={item.color}
                    strokeWidth={isHovered ? strokeWidth + 4 : strokeWidth}
                    strokeDasharray={strokeDasharray}
                    strokeDashoffset={strokeDashoffset}
                    style={{
                      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                      cursor: 'pointer'
                    }}
                    onMouseEnter={() => setHoveredIdx(idx)}
                    onMouseLeave={() => setHoveredIdx(null)}
                  />
                );
              })
            )}
          </svg>

          {/* Center Text */}
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
            textAlign: 'center',
            padding: '10px'
          }}>
            <span style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--color-text)', lineHeight: 1.1 }}>
              {centerValue !== undefined ? centerValue : total}
            </span>
            {centerLabel && (
              <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', marginTop: '2px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                {centerLabel}
              </span>
            )}
          </div>
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minWidth: '130px', flex: 1 }}>
          {data.map((item, idx) => {
            const pct = total > 0 ? Math.round((item.value / total) * 100) : 0;
            const isHovered = hoveredIdx === idx;
            return (
              <div 
                key={idx} 
                onMouseEnter={() => setHoveredIdx(idx)}
                onMouseLeave={() => setHoveredIdx(null)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '4px 8px',
                  borderRadius: '6px',
                  background: isHovered ? 'var(--color-surface-alt, #f8fafc)' : 'transparent',
                  cursor: 'pointer',
                  transition: 'background 0.15s ease'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                  <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: item.color, flexShrink: 0 }} />
                  <span style={{ fontSize: '0.8rem', fontWeight: isHovered ? 700 : 500, color: 'var(--color-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {item.label}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: '8px' }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-text)' }}>
                    {item.value}
                  </span>
                  <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', minWidth: '30px', textAlign: 'right' }}>
                    ({pct}%)
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ─── 2. Multi-Bar Comparison Chart (Par Responsable) ────────────── */
export interface BarComparisonItem {
  id: string;
  name: string;
  role: string;
  serviceName: string;
  totalValue: number;
  acceptedValue: number;
  pendingValue: number;
  quoteCount: number;
  acceptedCount: number;
  rate: number;
}

export function BarComparisonChart({
  items,
  title,
  subTitle,
  primaryColor = '#3B82F6',
  secondaryColor = '#10B981',
  primaryLabel = 'Montant Total',
  secondaryLabel = 'Montant Réalisé',
  onSelectUser,
  selectedUserId
}: {
  items: BarComparisonItem[];
  title?: string;
  subTitle?: string;
  primaryColor?: string;
  secondaryColor?: string;
  primaryLabel?: string;
  secondaryLabel?: string;
  onSelectUser?: (userId: string) => void;
  selectedUserId?: string;
}) {
  const maxValue = Math.max(...items.map(i => Math.max(i.totalValue, i.acceptedValue)), 1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {title && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
          <div>
            <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: 'var(--color-text)' }}>{title}</h4>
            {subTitle && <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>{subTitle}</p>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', fontSize: '0.75rem', fontWeight: 600 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
              <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: primaryColor }} />
              {primaryLabel}
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
              <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: secondaryColor }} />
              {secondaryLabel}
            </span>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', overflowY: 'auto', maxHeight: '420px', paddingRight: '4px' }}>
        {items.map(item => {
          const totalPct = Math.min(100, Math.round((item.totalValue / maxValue) * 100));
          const acceptedPct = Math.min(100, Math.round((item.acceptedValue / maxValue) * 100));
          const isSelected = selectedUserId === item.id;

          return (
            <div 
              key={item.id}
              onClick={() => onSelectUser && onSelectUser(item.id)}
              style={{
                padding: '12px 14px',
                borderRadius: '8px',
                border: isSelected ? '1.5px solid #2563EB' : '1px solid var(--color-border)',
                background: isSelected ? 'rgba(37, 99, 235, 0.04)' : 'var(--color-surface)',
                cursor: onSelectUser ? 'pointer' : 'default',
                transition: 'all 0.15s ease'
              }}
            >
              {/* Info Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap', gap: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '26px', height: '26px', borderRadius: '50%', background: 'var(--color-primary-tint)', color: 'var(--color-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700 }}>
                    {item.name.substring(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <strong style={{ fontSize: '0.88rem', color: 'var(--color-text)' }}>{item.name}</strong>
                    <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginLeft: '6px' }}>
                      ({item.serviceName})
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>
                    <strong>{item.quoteCount}</strong> opérations ({item.acceptedCount} finalisées)
                  </span>
                  <span className="badge-status" style={{ background: item.rate >= 50 ? 'rgba(16, 185, 129, 0.12)' : 'rgba(245, 158, 11, 0.12)', color: item.rate >= 50 ? '#059669' : '#D97706', fontSize: '11px', fontWeight: 700 }}>
                    {item.rate}% succès
                  </span>
                </div>
              </div>

              {/* Barres horizontales de progression */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {/* Total Bar */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ flex: 1, height: '8px', background: 'var(--color-surface-alt, #e2e8f0)', borderRadius: '4px', overflow: 'hidden' }}>
                    <div 
                      style={{ 
                        width: `${totalPct}%`, 
                        height: '100%', 
                        background: primaryColor, 
                        borderRadius: '4px',
                        transition: 'width 0.5s cubic-bezier(0.4, 0, 0.2, 1)' 
                      }} 
                    />
                  </div>
                  <span style={{ fontSize: '0.78rem', fontWeight: 600, minWidth: '105px', textAlign: 'right', color: primaryColor }}>
                    {item.totalValue.toLocaleString('fr-FR')} F
                  </span>
                </div>

                {/* Finalisé Bar */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ flex: 1, height: '8px', background: 'var(--color-surface-alt, #e2e8f0)', borderRadius: '4px', overflow: 'hidden' }}>
                    <div 
                      style={{ 
                        width: `${acceptedPct}%`, 
                        height: '100%', 
                        background: secondaryColor, 
                        borderRadius: '4px',
                        transition: 'width 0.5s cubic-bezier(0.4, 0, 0.2, 1)' 
                      }} 
                    />
                  </div>
                  <span style={{ fontSize: '0.78rem', fontWeight: 700, minWidth: '105px', textAlign: 'right', color: secondaryColor }}>
                    {item.acceptedValue.toLocaleString('fr-FR')} F
                  </span>
                </div>
              </div>
            </div>
          );
        })}

        {items.length === 0 && (
          <div style={{ padding: '30px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
            Aucune donnée disponible pour la sélection actuelle.
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── 3. Monthly Trend Bars / Sparklines ────────────────────────── */
export interface TrendPeriodItem {
  period: string;
  total: number;
  accepted: number;
  count: number;
}

export function TrendBarsChart({
  data,
  title,
  subTitle
}: {
  data: TrendPeriodItem[];
  title?: string;
  subTitle?: string;
}) {
  const maxAmount = Math.max(...data.map(d => Math.max(d.total, d.accepted)), 1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {title && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
          <div>
            <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: 'var(--color-text)' }}>{title}</h4>
            {subTitle && <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>{subTitle}</p>}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '8px', height: '170px', padding: '10px 0 0', borderBottom: '1px solid var(--color-border)' }}>
        {data.map((item, idx) => {
          const totalHeight = Math.max(6, Math.round((item.total / maxAmount) * 120));
          const acceptedHeight = Math.max(4, Math.round((item.accepted / maxAmount) * 120));

          return (
            <div key={idx} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, height: '100%', justifyContent: 'flex-end', gap: '6px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: '3px', height: '120px', width: '100%', justifyContent: 'center' }}>
                {/* Total bar */}
                <div 
                  title={`Émis : ${item.total.toLocaleString('fr-FR')} FCFA (${item.count} opérations)`}
                  style={{
                    width: '12px',
                    height: `${totalHeight}px`,
                    background: '#93C5FD',
                    borderRadius: '3px 3px 0 0',
                    transition: 'height 0.4s ease'
                  }} 
                />
                {/* Accepted bar */}
                <div 
                  title={`Validé : ${item.accepted.toLocaleString('fr-FR')} FCFA`}
                  style={{
                    width: '12px',
                    height: `${acceptedHeight}px`,
                    background: '#10B981',
                    borderRadius: '3px 3px 0 0',
                    transition: 'height 0.4s ease'
                  }} 
                />
              </div>
              <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                {item.period}
              </span>
            </div>
          );
        })}
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', marginTop: '10px', fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: '#93C5FD' }} />
          Total Flux
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: '#10B981' }} />
          Validé / Réalisé
        </span>
      </div>
    </div>
  );
}

/* ─── 4. User Multi-Module 360° Supervision Card ─────────────────── */
export interface UserModuleSummary {
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
    serviceName: string;
    activeModulesCount: number;
    enabled: {
      prestations: boolean;
      caisse: boolean;
      maintenance: boolean;
      stocks: boolean;
      tiers: boolean;
      commerciaux: boolean;
      commissions: boolean;
    };
  };
  quotes: {
    count: number;
    totalValue: number;
    acceptedValue: number;
    rate: number;
  };
  prestations: {
    count: number;
    totalVente: number;
    margeInterne: number;
    beneficeNet: number;
    payeeCount: number;
  };
  caisse: {
    mouvementsCount: number;
    totalEntrees: number;
    totalSorties: number;
    solde: number;
  };
  maintenance: {
    ticketsCount: number;
    urgentsCount: number;
    totalFacturation: number;
    resolusCount: number;
  };
  tiers: {
    totalTiers: number;
    clientsCount: number;
    partenairesCount: number;
  };
  commissions: {
    count: number;
    totalMontant: number;
    payeeMontant: number;
    attenteMontant: number;
  };
}

export function UserMultiModuleSupervisionCard({
  summary,
  onInspect,
  onNavigateModule
}: {
  summary: UserModuleSummary;
  onInspect?: () => void;
  onNavigateModule?: (path: string) => void;
}) {
  const { user, quotes, prestations, caisse, maintenance, tiers, commissions } = summary;

  // Donut chart of activity distribution for this user
  const activityDonutData: DonutDataPoint[] = [
    { label: 'Commandes', value: prestations.count, color: '#10B981' },
    { label: 'Devis', value: quotes.count, color: '#3B82F6' },
    { label: 'Caisse', value: caisse.mouvementsCount, color: '#EF4444' },
    { label: 'Maintenance', value: maintenance.ticketsCount, color: '#F59E0B' },
    { label: 'Tiers', value: tiers.totalTiers, color: '#8B5CF6' }
  ].filter(d => d.value > 0);

  return (
    <div 
      className="card" 
      style={{ 
        padding: '20px', 
        borderLeft: '4px solid var(--color-primary)',
        background: 'var(--color-surface)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        gap: '16px'
      }}
    >
      <div>
        {/* Entête collaborateur */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '42px', height: '42px', borderRadius: '50%', background: 'var(--color-primary-tint)', color: 'var(--color-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '15px' }}>
              {user.name.substring(0, 2).toUpperCase()}
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700 }}>{user.name}</h4>
                <span className="badge-status" style={{ background: '#DBEAFE', color: '#1D4ED8', fontSize: '11px' }}>{user.role}</span>
              </div>
              <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                {user.serviceName} • {user.email}
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span className="badge-status" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#059669', fontSize: '11px', fontWeight: 600 }}>
              {user.activeModulesCount} modules actifs
            </span>
          </div>
        </div>

        {/* Grille multi-modules de ce collaborateur */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px', marginBottom: '16px' }}>
          {/* Module 1: Prestations */}
          {user.enabled.prestations && (
            <div style={{ padding: '10px', borderRadius: '8px', background: 'rgba(16, 185, 129, 0.05)', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.72rem', color: '#059669', fontWeight: 700 }}>
                <ShoppingBag size={12} />
                <span>COMMANDES</span>
              </div>
              <div style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--color-text)', marginTop: '2px' }}>
                {prestations.totalVente.toLocaleString('fr-FR')} F
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>
                {prestations.count} commandes • Marge: {prestations.margeInterne.toLocaleString('fr-FR')} F
              </div>
            </div>
          )}

          {/* Module Devis */}
          <div style={{ padding: '10px', borderRadius: '8px', background: 'rgba(59, 130, 246, 0.05)', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.72rem', color: '#2563EB', fontWeight: 700 }}>
              <FileText size={12} />
              <span>DEVIS CLIENTS</span>
            </div>
            <div style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--color-text)', marginTop: '2px' }}>
              {quotes.totalValue.toLocaleString('fr-FR')} F
            </div>
            <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>
              {quotes.count} devis • {quotes.rate}% acceptés
            </div>
          </div>

          {/* Module 2: Caisse */}
          {user.enabled.caisse && (
            <div style={{ padding: '10px', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.72rem', color: '#DC2626', fontWeight: 700 }}>
                <Wallet size={12} />
                <span>FLUX CAISSE</span>
              </div>
              <div style={{ fontSize: '0.95rem', fontWeight: 800, color: caisse.solde >= 0 ? '#059669' : '#DC2626', marginTop: '2px' }}>
                {caisse.solde.toLocaleString('fr-FR')} F
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>
                {caisse.mouvementsCount} mouv. ({caisse.totalSorties.toLocaleString('fr-FR')} F sorties)
              </div>
            </div>
          )}

          {/* Module 3: Maintenance */}
          {user.enabled.maintenance && (
            <div style={{ padding: '10px', borderRadius: '8px', background: 'rgba(245, 158, 11, 0.05)', border: '1px solid rgba(245, 158, 11, 0.2)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.72rem', color: '#D97706', fontWeight: 700 }}>
                <Wrench size={12} />
                <span>MAINTENANCE</span>
              </div>
              <div style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--color-text)', marginTop: '2px' }}>
                {maintenance.ticketsCount} tickets
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>
                {maintenance.urgentsCount} urgences • Facturé: {maintenance.totalFacturation.toLocaleString('fr-FR')} F
              </div>
            </div>
          )}

          {/* Module 5: Tiers */}
          {user.enabled.tiers && (
            <div style={{ padding: '10px', borderRadius: '8px', background: 'rgba(139, 92, 246, 0.05)', border: '1px solid rgba(139, 92, 246, 0.2)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.72rem', color: '#7C3AED', fontWeight: 700 }}>
                <UsersIcon size={12} />
                <span>PORT. TIERS</span>
              </div>
              <div style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--color-text)', marginTop: '2px' }}>
                {tiers.totalTiers} contacts
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>
                {tiers.clientsCount} clients • {tiers.partenairesCount} partenaires
              </div>
            </div>
          )}

          {/* Module 7: Commissions */}
          {user.enabled.commissions && (
            <div style={{ padding: '10px', borderRadius: '8px', background: 'rgba(217, 119, 6, 0.05)', border: '1px solid rgba(217, 119, 6, 0.2)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.72rem', color: '#B45309', fontWeight: 700 }}>
                <Award size={12} />
                <span>COMMISSIONS</span>
              </div>
              <div style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--color-text)', marginTop: '2px' }}>
                {commissions.totalMontant.toLocaleString('fr-FR')} F
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>
                {commissions.payeeMontant.toLocaleString('fr-FR')} F réglés • {commissions.attenteMontant.toLocaleString('fr-FR')} F en attente
              </div>
            </div>
          )}
        </div>

        {/* Diagramme de distribution multi-activités */}
        {activityDonutData.length > 0 && (
          <div style={{ background: 'var(--color-surface-alt)', padding: '12px', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
            <DonutChart 
              data={activityDonutData}
              title="Distribution des activités CRM du collaborateur"
              centerLabel="Opérations"
              centerValue={activityDonutData.reduce((s, a) => s + a.value, 0)}
              size={120}
              strokeWidth={18}
            />
          </div>
        )}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '10px', borderTop: '1px solid var(--color-border)' }}>
        <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
          {summary.prestations.beneficeNet > 0 ? `Bénéfice net généré : ${summary.prestations.beneficeNet.toLocaleString('fr-FR')} FCFA` : ''}
        </span>
        {onInspect && (
          <button 
            className="btn btn-outline" 
            style={{ fontSize: '0.8rem', padding: '5px 12px', display: 'flex', alignItems: 'center', gap: '4px' }}
            onClick={onInspect}
          >
            <span>Superviser en détail</span>
            <ArrowUpRight size={14} />
          </button>
        )}
      </div>
    </div>
  );
}

/* ─── 5. User Analytics Detail Card (Simple) ────────────────────── */
export function UserAnalyticsCard({
  user,
  stats,
  onClose,
  onViewQuotes
}: {
  user: { id: string; name: string; email: string; role: string; serviceName: string };
  stats: {
    quoteCount: number;
    acceptedCount: number;
    pendingCount: number;
    refusedCount: number;
    totalValue: number;
    acceptedValue: number;
    pendingValue: number;
    refusedValue: number;
    acceptanceRate: number;
    averageQuoteValue: number;
  };
  onClose?: () => void;
  onViewQuotes?: () => void;
}) {
  const donutData: DonutDataPoint[] = [
    { label: 'Acceptés', value: stats.acceptedCount, color: '#10B981' },
    { label: 'En cours', value: stats.pendingCount, color: '#F59E0B' },
    { label: 'Refusés', value: stats.refusedCount, color: '#EF4444' },
  ];

  return (
    <div className="card" style={{ padding: '20px 24px', border: '1.5px solid var(--color-primary)', background: 'linear-gradient(180deg, rgba(37, 99, 235, 0.02) 0%, var(--color-surface) 100%)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '46px', height: '46px', borderRadius: '50%', background: 'linear-gradient(135deg, #2563EB, #1D4ED8)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', fontWeight: 800 }}>
            {user.name.substring(0, 2).toUpperCase()}
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700 }}>{user.name}</h3>
              <span className="badge-status" style={{ background: '#DBEAFE', color: '#1D4ED8', fontSize: '11px' }}>{user.role}</span>
            </div>
            <p style={{ margin: '2px 0 0', fontSize: '0.82rem', color: 'var(--color-text-muted)' }}>
              {user.serviceName} • {user.email}
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {onViewQuotes && (
            <button className="btn btn-primary" style={{ fontSize: '0.8rem', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '4px' }} onClick={onViewQuotes}>
              <span>Voir ses devis</span>
              <ArrowUpRight size={14} />
            </button>
          )}
          {onClose && (
            <button className="btn btn-secondary" style={{ fontSize: '0.8rem', padding: '6px 10px' }} onClick={onClose}>
              Fermer
            </button>
          )}
        </div>
      </div>

      {/* Mini KPIs User */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginBottom: '20px' }}>
        <div style={{ padding: '12px', borderRadius: '8px', background: 'var(--color-surface-alt)', border: '1px solid var(--color-border)' }}>
          <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Total Émis</div>
          <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--color-text)', marginTop: '2px' }}>
            {stats.totalValue.toLocaleString('fr-FR')} F
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', marginTop: '2px' }}>{stats.quoteCount} devis au total</div>
        </div>

        <div style={{ padding: '12px', borderRadius: '8px', background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
          <div style={{ fontSize: '0.72rem', color: '#059669', fontWeight: 600, textTransform: 'uppercase' }}>Total Accepté</div>
          <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#059669', marginTop: '2px' }}>
            {stats.acceptedValue.toLocaleString('fr-FR')} F
          </div>
          <div style={{ fontSize: '0.72rem', color: '#059669', marginTop: '2px' }}>{stats.acceptedCount} devis acceptés</div>
        </div>

        <div style={{ padding: '12px', borderRadius: '8px', background: 'var(--color-surface-alt)', border: '1px solid var(--color-border)' }}>
          <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Panier Moyen</div>
          <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--color-text)', marginTop: '2px' }}>
            {stats.averageQuoteValue.toLocaleString('fr-FR')} F
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', marginTop: '2px' }}>Moyenne par devis</div>
        </div>

        <div style={{ padding: '12px', borderRadius: '8px', background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
          <div style={{ fontSize: '0.72rem', color: '#2563EB', fontWeight: 600, textTransform: 'uppercase' }}>Taux de Succès</div>
          <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#2563EB', marginTop: '2px' }}>
            {stats.acceptanceRate}%
          </div>
          <div style={{ fontSize: '0.72rem', color: '#2563EB', marginTop: '2px' }}>Conversion globale</div>
        </div>
      </div>

      {/* Diagramme de répartition personnel */}
      <div style={{ background: 'var(--color-surface)', padding: '16px', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
        <DonutChart 
          data={donutData}
          title="Répartition analytique des devis du collaborateur"
          subTitle="Distribution par issue commerciale"
          centerLabel="Devis émis"
          centerValue={stats.quoteCount}
          size={140}
          strokeWidth={20}
        />
      </div>
    </div>
  );
}
