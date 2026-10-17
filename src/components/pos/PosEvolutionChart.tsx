import React, { useState, useMemo } from 'react';

export interface DataPoint {
  label: string;
  value1: number; // ex: Chiffre d'Affaires
  value2?: number; // ex: Marge ou Coût
  secondary?: number; // ex: Nombre de transactions
  subLabel?: string;
  dateKey?: string;
}

interface PosEvolutionChartProps {
  data: DataPoint[];
  title?: string;
  subtitle?: string;
  series1Name?: string;
  series2Name?: string;
  color1?: string;
  color2?: string;
  height?: number;
  unit?: string;
  isCurrency?: boolean;
  showToggleMode?: boolean;
}

export function PosEvolutionChart({
  data,
  title,
  subtitle,
  series1Name = 'Chiffre d\'Affaires',
  series2Name = 'Marge Brute',
  color1 = '#0D9488', // Emerald
  color2 = '#3B82F6', // Blue
  height = 280,
  unit = 'FCFA',
  isCurrency = true,
  showToggleMode = true,
}: PosEvolutionChartProps) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [chartMode, setChartMode] = useState<'line' | 'bar'>('line');

  const width = 800;
  const padding = { top: 25, right: 30, bottom: 40, left: 65 };
  const graphWidth = width - padding.left - padding.right;
  const graphHeight = height - padding.top - padding.bottom;

  const { maxVal, minVal, points1, points2, bars } = useMemo(() => {
    if (!data || data.length === 0) {
      return { maxVal: 100, minVal: 0, points1: [], points2: [], bars: [] };
    }

    const allValues = data.flatMap(d => [d.value1, d.value2 ?? 0]);
    const calculatedMax = Math.max(...allValues, 10);
    // Arrondi supérieur propre pour l'axe Y
    const magnitude = Math.pow(10, Math.floor(Math.log10(calculatedMax)));
    const maxVal = Math.ceil(calculatedMax / magnitude) * magnitude || 100;
    const minVal = 0;

    const count = data.length;
    const stepX = count > 1 ? graphWidth / (count - 1) : graphWidth / 2;

    const points1 = data.map((d, i) => {
      const x = count === 1 ? padding.left + graphWidth / 2 : padding.left + i * stepX;
      const y = padding.top + graphHeight - ((d.value1 - minVal) / (maxVal - minVal || 1)) * graphHeight;
      return { x, y, val: d.value1, ...d };
    });

    const points2 = data.map((d, i) => {
      const val = d.value2 ?? 0;
      const x = count === 1 ? padding.left + graphWidth / 2 : padding.left + i * stepX;
      const y = padding.top + graphHeight - ((val - minVal) / (maxVal - minVal || 1)) * graphHeight;
      return { x, y, val, ...d };
    });

    const barWidth = Math.max(6, Math.min(36, (graphWidth / count) * 0.45));
    const bars = data.map((d, i) => {
      const centerX = count === 1 ? padding.left + graphWidth / 2 : padding.left + i * (graphWidth / (count > 1 ? count - 1 : 1));
      const h1 = ((d.value1 - minVal) / (maxVal - minVal || 1)) * graphHeight;
      const y1 = padding.top + graphHeight - h1;

      const v2 = d.value2 ?? 0;
      const h2 = ((v2 - minVal) / (maxVal - minVal || 1)) * graphHeight;
      const y2 = padding.top + graphHeight - h2;

      return {
        centerX,
        barWidth,
        y1,
        h1,
        y2,
        h2,
        val1: d.value1,
        val2: v2,
        label: d.label,
      };
    });

    return { maxVal, minVal, points1, points2, bars };
  }, [data, graphWidth, graphHeight, padding.left, padding.top]);

  // Génération du tracé SVG lissé (courbe de Bézier cubique)
  const createSmoothPath = (pts: { x: number; y: number }[]) => {
    if (pts.length === 0) return '';
    if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;

    let path = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const current = pts[i];
      const next = pts[i + 1];
      const controlX1 = current.x + (next.x - current.x) * 0.45;
      const controlY1 = current.y;
      const controlX2 = next.x - (next.x - current.x) * 0.45;
      const controlY2 = next.y;
      path += ` C ${controlX1} ${controlY1}, ${controlX2} ${controlY2}, ${next.x} ${next.y}`;
    }
    return path;
  };

  const linePath1 = createSmoothPath(points1);
  const linePath2 = createSmoothPath(points2);

  // Surface dégradée sous la courbe 1
  const areaPath1 = useMemo(() => {
    if (points1.length === 0) return '';
    const first = points1[0];
    const last = points1[points1.length - 1];
    const bottomY = padding.top + graphHeight;
    return `${linePath1} L ${last.x} ${bottomY} L ${first.x} ${bottomY} Z`;
  }, [linePath1, points1, padding.top, graphHeight]);

  // Formatage des montants
  const formatValue = (v: number) => {
    if (isCurrency) {
      if (v >= 1000000) return `${(v / 1000000).toFixed(1)}M`;
      if (v >= 1000) return `${(v / 1000).toFixed(0)}k`;
      return v.toLocaleString('fr-FR');
    }
    return v.toLocaleString('fr-FR');
  };

  // 4 paliers horizontaux sur l'axe Y
  const yTicks = [0, maxVal * 0.33, maxVal * 0.66, maxVal];

  const activeItem = hoverIndex !== null && data[hoverIndex] ? data[hoverIndex] : null;

  return (
    <div style={{ background: 'white', borderRadius: 'var(--radius-lg, 12px)', padding: '20px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: '1px solid var(--color-border, #E2E8F0)' }}>
      {/* En-tête du graphique */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          {title && <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: 'var(--color-text, #1E293B)' }}>{title}</h3>}
          {subtitle && <p style={{ fontSize: '13px', color: 'var(--color-text-muted, #64748B)', margin: '3px 0 0' }}>{subtitle}</p>}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {/* Légende */}
          <div style={{ display: 'flex', gap: '14px', alignItems: 'center', fontSize: '12px', fontWeight: 600 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#334155' }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: color1 }} />
              {series1Name}
            </span>
            {data.some(d => (d.value2 ?? 0) > 0) && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#334155' }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: color2 }} />
                {series2Name}
              </span>
            )}
          </div>

          {/* Toggle Courbe / Barres */}
          {showToggleMode && (
            <div style={{ display: 'inline-flex', background: '#F1F5F9', padding: '3px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
              <button
                type="button"
                onClick={() => setChartMode('line')}
                style={{
                  padding: '4px 10px',
                  fontSize: '11px',
                  fontWeight: 600,
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  background: chartMode === 'line' ? 'white' : 'transparent',
                  color: chartMode === 'line' ? 'var(--color-primary, #0D9488)' : '#64748B',
                  boxShadow: chartMode === 'line' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                  transition: 'all 0.15s ease'
                }}
              >
                Courbe
              </button>
              <button
                type="button"
                onClick={() => setChartMode('bar')}
                style={{
                  padding: '4px 10px',
                  fontSize: '11px',
                  fontWeight: 600,
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  background: chartMode === 'bar' ? 'white' : 'transparent',
                  color: chartMode === 'bar' ? 'var(--color-primary, #0D9488)' : '#64748B',
                  boxShadow: chartMode === 'bar' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                  transition: 'all 0.15s ease'
                }}
              >
                Barres
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Surface SVG interactive */}
      <div style={{ position: 'relative', width: '100%', overflow: 'hidden' }}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          style={{ width: '100%', height: 'auto', display: 'block', overflow: 'visible' }}
          onMouseLeave={() => setHoverIndex(null)}
        >
          <defs>
            {/* Dégradé sous la courbe 1 */}
            <linearGradient id="gradient1" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color1} stopOpacity="0.32" />
              <stop offset="100%" stopColor={color1} stopOpacity="0.0" />
            </linearGradient>
            {/* Dégradé sous la courbe 2 */}
            <linearGradient id="gradient2" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color2} stopOpacity="0.25" />
              <stop offset="100%" stopColor={color2} stopOpacity="0.0" />
            </linearGradient>
            <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
              <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="rgba(0,0,0,0.15)" />
            </filter>
          </defs>

          {/* Grille horizontale et valeurs d'axe Y */}
          {yTicks.map((val, idx) => {
            const y = padding.top + graphHeight - ((val - minVal) / (maxVal - minVal || 1)) * graphHeight;
            return (
              <g key={idx}>
                <line
                  x1={padding.left}
                  y1={y}
                  x2={width - padding.right}
                  y2={y}
                  stroke="#E2E8F0"
                  strokeDasharray={idx === 0 ? undefined : '4 4'}
                  strokeWidth={idx === 0 ? 1.5 : 1}
                />
                <text
                  x={padding.left - 10}
                  y={y + 4}
                  textAnchor="end"
                  fontSize="10"
                  fill="#94A3B8"
                  fontWeight="500"
                >
                  {formatValue(val)}
                </text>
              </g>
            );
          })}

          {/* Rendu Mode Barres */}
          {chartMode === 'bar' &&
            bars.map((bar, i) => {
              const hasVal2 = bar.val2 > 0;
              const bWidth = hasVal2 ? bar.barWidth * 0.6 : bar.barWidth;
              const isHover = hoverIndex === i;

              return (
                <g
                  key={i}
                  onMouseEnter={() => setHoverIndex(i)}
                  style={{ cursor: 'pointer' }}
                >
                  {/* Barre Série 1 (CA) */}
                  <rect
                    x={hasVal2 ? bar.centerX - bWidth - 1 : bar.centerX - bWidth / 2}
                    y={bar.y1}
                    width={bWidth}
                    height={Math.max(2, bar.h1)}
                    rx={3}
                    fill={color1}
                    opacity={isHover ? 1 : 0.85}
                    style={{ transition: 'all 0.2s ease' }}
                  />
                  {/* Barre Série 2 (Marge) */}
                  {hasVal2 && (
                    <rect
                      x={bar.centerX + 1}
                      y={bar.y2}
                      width={bWidth}
                      height={Math.max(2, bar.h2)}
                      rx={3}
                      fill={color2}
                      opacity={isHover ? 1 : 0.85}
                      style={{ transition: 'all 0.2s ease' }}
                    />
                  )}
                  {/* Zone tactile invisible plus large */}
                  <rect
                    x={bar.centerX - bar.barWidth}
                    y={padding.top}
                    width={bar.barWidth * 2}
                    height={graphHeight}
                    fill="transparent"
                  />
                </g>
              );
            })}

          {/* Rendu Mode Courbe Lisse */}
          {chartMode === 'line' && (
            <>
              {/* Aire dégradée */}
              <path d={areaPath1} fill="url(#gradient1)" />

              {/* Ligne 2 (Marge) si présente */}
              {data.some(d => (d.value2 ?? 0) > 0) && (
                <path
                  d={linePath2}
                  fill="none"
                  stroke={color2}
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity="0.85"
                />
              )}

              {/* Ligne 1 (CA) principale */}
              <path
                d={linePath1}
                fill="none"
                stroke={color1}
                strokeWidth="3.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                filter="url(#shadow)"
              />

              {/* Points sur la courbe */}
              {points1.map((p, i) => {
                const isHover = hoverIndex === i;
                return (
                  <g
                    key={i}
                    onMouseEnter={() => setHoverIndex(i)}
                    style={{ cursor: 'pointer' }}
                  >
                    {/* Zone de survol élargie */}
                    <circle cx={p.x} cy={p.y} r={16} fill="transparent" />

                    {/* Point extérieur */}
                    <circle
                      cx={p.x}
                      cy={p.y}
                      r={isHover ? 6.5 : 4}
                      fill="white"
                      stroke={color1}
                      strokeWidth={isHover ? 3 : 2.5}
                      style={{ transition: 'r 0.15s ease' }}
                    />
                  </g>
                );
              })}
            </>
          )}

          {/* Ligne verticale repère au survol */}
          {hoverIndex !== null && points1[hoverIndex] && (
            <line
              x1={points1[hoverIndex].x}
              y1={padding.top}
              x2={points1[hoverIndex].x}
              y2={padding.top + graphHeight}
              stroke="#94A3B8"
              strokeWidth="1.2"
              strokeDasharray="3 3"
            />
          )}

          {/* Étiquettes de l'axe X (Dates / Heures) */}
          {data.map((d, i) => {
            const count = data.length;
            const x = count === 1 ? padding.left + graphWidth / 2 : padding.left + i * (graphWidth / (count > 1 ? count - 1 : 1));
            // Affichage intelligent des labels pour éviter les chevauchements
            const showLabel = count <= 12 || i % Math.ceil(count / 10) === 0 || i === count - 1;
            if (!showLabel) return null;

            return (
              <text
                key={i}
                x={x}
                y={height - 12}
                textAnchor="middle"
                fontSize="11"
                fill={hoverIndex === i ? 'var(--color-primary, #0D9488)' : '#64748B'}
                fontWeight={hoverIndex === i ? '700' : '500'}
              >
                {d.label}
              </text>
            );
          })}
        </svg>

        {/* Tooltip flottant haute fidélité */}
        {activeItem && hoverIndex !== null && points1[hoverIndex] && (
          <div
            style={{
              position: 'absolute',
              top: '12px',
              left: Math.min(
                Math.max(10, (points1[hoverIndex].x / width) * 100),
                78
              ) + '%',
              transform: 'translateX(-50%)',
              background: '#0F172A',
              color: 'white',
              borderRadius: '10px',
              padding: '10px 14px',
              fontSize: '12px',
              boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.4)',
              pointerEvents: 'none',
              zIndex: 10,
              minWidth: '170px',
              backdropFilter: 'blur(8px)'
            }}
          >
            <div style={{ fontWeight: 700, fontSize: '12px', borderBottom: '1px solid rgba(255,255,255,0.15)', paddingBottom: '4px', marginBottom: '6px', color: '#E2E8F0' }}>
              {activeItem.subLabel || activeItem.label}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', margin: '3px 0' }}>
              <span style={{ color: '#94A3B8', display: 'flex', alignItems: 'center', gap: '5px' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: color1 }} />
                {series1Name}:
              </span>
              <span style={{ fontWeight: 700, color: '#34D399' }}>
                {activeItem.value1.toLocaleString('fr-FR')} {unit}
              </span>
            </div>
            {activeItem.value2 !== undefined && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', margin: '3px 0' }}>
                <span style={{ color: '#94A3B8', display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: color2 }} />
                  {series2Name}:
                </span>
                <span style={{ fontWeight: 700, color: '#60A5FA' }}>
                  {activeItem.value2.toLocaleString('fr-FR')} {unit}
                  {activeItem.value1 > 0 && (
                    <span style={{ fontSize: '10px', color: '#94A3B8', marginLeft: '4px' }}>
                      ({((activeItem.value2 / activeItem.value1) * 100).toFixed(0)}%)
                    </span>
                  )}
                </span>
              </div>
            )}
            {activeItem.secondary !== undefined && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', margin: '3px 0', borderTop: '1px dashed rgba(255,255,255,0.12)', paddingTop: '4px', marginTop: '4px' }}>
                <span style={{ color: '#94A3B8' }}>Transactions:</span>
                <span style={{ fontWeight: 700, color: '#F8FAFC' }}>
                  {activeItem.secondary} tickets
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
