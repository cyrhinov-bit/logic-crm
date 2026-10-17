import React from 'react';
import type { EnhanceOptions } from '../../../../lib/imageEnhancer';

interface StudioFilterBarProps {
  currentPreset: EnhanceOptions['preset'];
  onSelectPreset: (preset: EnhanceOptions['preset']) => void;
  isAiActive: boolean;
}

export const StudioFilterBar: React.FC<StudioFilterBarProps> = ({
  currentPreset,
  onSelectPreset,
  isAiActive
}) => {
  const filters: { id: EnhanceOptions['preset']; label: string; sub: string }[] = [
    { id: 'auto', label: '⚡ Auto', sub: 'Équilibré' },
    { id: 'studio', label: '🧼 Fond Blanc', sub: 'Détourage' },
    { id: 'vibrant', label: '🎨 Vives', sub: 'Couleurs' },
    { id: 'sharp', label: '🔍 Textes', sub: 'Netteté' }
  ];

  return (
    <div style={{ marginBottom: '14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
        <label style={{ fontSize: '11px', fontWeight: 700, color: '#475569' }}>
          Filtres d'optimisation instantanés (Hors IA)
        </label>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
        {filters.map((f) => {
          const isSelected = currentPreset === f.id && !isAiActive;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => onSelectPreset(f.id)}
              style={{
                padding: '7px 4px',
                borderRadius: '8px',
                border: `1px solid ${isSelected ? '#0F766E' : '#E2E8F0'}`,
                backgroundColor: isSelected ? '#F0FDFA' : 'white',
                color: isSelected ? '#0F766E' : '#475569',
                fontWeight: 700,
                fontSize: '11px',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '2px'
              }}
            >
              <span>{f.label}</span>
              <span style={{ fontSize: '9px', fontWeight: 500, opacity: 0.8 }}>{f.sub}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
