// Barres mensuelles CSS pures (zéro dépendance) — partagées par les modules
// de suivi factures (clients + fournisseurs) pour la vue annuelle.
export interface MonthlyBarPoint {
  label: string;
  v1: number;
  v2: number;
}

interface MonthlyBarsProps {
  data: MonthlyBarPoint[];
  legend1: string;
  legend2: string;
  color1?: string;
  color2?: string;
  height?: number;
}

const fmt = (n: number) => `${Math.round(n).toLocaleString('fr-FR')} F`;

export function MonthlyBars({
  data,
  legend1,
  legend2,
  color1 = '#3B82F6',
  color2 = '#10B981',
  height = 150,
}: MonthlyBarsProps) {
  const max = Math.max(1, ...data.map((d) => Math.max(d.v1, d.v2)));
  return (
    <div>
      <div style={{ display: 'flex', gap: '16px', fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '8px', flexWrap: 'wrap' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ width: '12px', height: '12px', borderRadius: '3px', background: color1, display: 'inline-block' }} />
          {legend1}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ width: '12px', height: '12px', borderRadius: '3px', background: color2, display: 'inline-block' }} />
          {legend2}
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${data.length}, 1fr)`, gap: '4px', height: `${height}px` }}>
        {data.map((d, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%', minWidth: 0 }}>
            <div style={{ display: 'flex', gap: '3px', alignItems: 'flex-end', flex: 1, width: '100%', justifyContent: 'center' }}>
              <div
                title={`${d.label} — ${legend1} : ${fmt(d.v1)}`}
                style={{ width: '11px', borderRadius: '3px 3px 0 0', background: color1, height: `${Math.max(2, (d.v1 / max) * 100)}%`, opacity: d.v1 > 0 ? 1 : 0.25 }}
              />
              <div
                title={`${d.label} — ${legend2} : ${fmt(d.v2)}`}
                style={{ width: '11px', borderRadius: '3px 3px 0 0', background: color2, height: `${Math.max(2, (d.v2 / max) * 100)}%`, opacity: d.v2 > 0 ? 1 : 0.25 }}
              />
            </div>
            <span style={{ fontSize: '10px', color: 'var(--color-text-muted)', marginTop: '4px', fontWeight: 600 }}>{d.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
