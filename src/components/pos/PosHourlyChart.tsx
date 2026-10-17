import React, { useState } from 'react';
import { Clock, Flame } from 'lucide-react';

export interface HourlyDataPoint {
  hour: number; // 8 to 20
  label: string; // "08h", "09h", ...
  revenue: number;
  count: number;
}

interface PosHourlyChartProps {
  data: HourlyDataPoint[];
  title?: string;
  subtitle?: string;
}

export function PosHourlyChart({
  data,
  title = "Affluence & Heures de Pointe (Aujourd'hui)",
  subtitle = "Distribution du chiffre d'affaires et nombre de tickets heure par heure"
}: PosHourlyChartProps) {
  const [hoverHour, setHoverHour] = useState<number | null>(null);

  const maxRevenue = Math.max(...data.map(d => d.revenue), 1000);
  const peakItem = [...data].sort((a, b) => b.revenue - a.revenue)[0];
  const hasSales = data.some(d => d.revenue > 0 || d.count > 0);

  return (
    <div style={{ background: 'white', borderRadius: 'var(--radius-lg, 12px)', padding: '20px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: '1px solid var(--color-border, #E2E8F0)', display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
        <div>
          <h3 style={{ fontSize: '15px', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Clock size={18} color="var(--color-primary, #0D9488)" />
            {title}
          </h3>
          <p style={{ fontSize: '12px', color: 'var(--color-text-muted, #64748B)', margin: '3px 0 0' }}>{subtitle}</p>
        </div>
        {hasSales && peakItem && peakItem.revenue > 0 && (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', backgroundColor: '#FEF3C7', color: '#92400E', padding: '4px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 700 }}>
            <Flame size={14} color="#D97706" />
            Pic d'affluence : {peakItem.label} ({peakItem.revenue.toLocaleString('fr-FR')} F)
          </div>
        )}
      </div>

      {!hasSales ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, minHeight: '160px', color: 'var(--color-text-muted, #64748B)', fontSize: '13px' }}>
          Aucune vente enregistrée pour la journée en cours
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '6px', height: '180px', paddingTop: '20px', paddingBottom: '20px', position: 'relative' }}>
          {data.map((item) => {
            const heightPercent = maxRevenue > 0 ? Math.max(4, (item.revenue / maxRevenue) * 100) : 4;
            const isPeak = peakItem && peakItem.hour === item.hour && item.revenue > 0;
            const isHover = hoverHour === item.hour;

            return (
              <div
                key={item.hour}
                onMouseEnter={() => setHoverHour(item.hour)}
                onMouseLeave={() => setHoverHour(null)}
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  height: '100%',
                  justifyContent: 'flex-end',
                  position: 'relative',
                  cursor: 'pointer'
                }}
              >
                {/* Tooltip au survol */}
                {isHover && (
                  <div
                    style={{
                      position: 'absolute',
                      bottom: `${heightPercent + 12}%`,
                      background: '#0F172A',
                      color: 'white',
                      borderRadius: '6px',
                      padding: '6px 10px',
                      fontSize: '11px',
                      whiteSpace: 'nowrap',
                      zIndex: 10,
                      boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                      pointerEvents: 'none',
                      transform: 'translateX(-50%)',
                      left: '50%'
                    }}
                  >
                    <div style={{ fontWeight: 700 }}>Tranche {item.label}</div>
                    <div style={{ color: '#34D399' }}>{item.revenue.toLocaleString('fr-FR')} FCFA</div>
                    <div style={{ color: '#94A3B8', fontSize: '10px' }}>{item.count} transaction(s)</div>
                  </div>
                )}

                {/* Barre de hauteur proportionnelle */}
                <div
                  style={{
                    width: '100%',
                    maxWidth: '32px',
                    height: `${heightPercent}%`,
                    backgroundColor: isPeak ? '#F59E0B' : isHover ? 'var(--color-primary, #0D9488)' : '#CBD5E1',
                    borderRadius: '4px 4px 2px 2px',
                    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                    boxShadow: isPeak ? '0 2px 8px rgba(245, 158, 11, 0.4)' : undefined
                  }}
                />

                {/* Label heure */}
                <span
                  style={{
                    fontSize: '10px',
                    color: isHover || isPeak ? 'var(--color-primary, #0D9488)' : '#64748B',
                    fontWeight: isHover || isPeak ? 700 : 500,
                    marginTop: '6px'
                  }}
                >
                  {item.label}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
