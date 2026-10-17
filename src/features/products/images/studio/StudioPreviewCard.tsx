import React from 'react';
import { Eye, RotateCw, Loader2 } from 'lucide-react';

interface StudioPreviewCardProps {
  currentSrc: string;
  originalSrc: string | null;
  showOriginal: boolean;
  onHoldOriginalStart: () => void;
  onHoldOriginalEnd: () => void;
  onRotate: () => void;
  fileSizeKb: number;
  isRegeneratingAi: boolean;
}

export const StudioPreviewCard: React.FC<StudioPreviewCardProps> = ({
  currentSrc,
  originalSrc,
  showOriginal,
  onHoldOriginalStart,
  onHoldOriginalEnd,
  onRotate,
  fileSizeKb,
  isRegeneratingAi
}) => {
  const displaySrc = showOriginal && originalSrc ? originalSrc : currentSrc;

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        maxWidth: '320px',
        aspectRatio: '1 / 1',
        margin: '0 auto 16px auto',
        backgroundColor: '#FFFFFF',
        borderRadius: '16px',
        border: '1px solid #E2E8F0',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 4px 12px rgba(0,0,0,0.06)'
      }}
    >
      <img
        src={displaySrc}
        alt="Aperçu Studio"
        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
      />

      {/* Overlay de chargement IA */}
      {isRegeneratingAi && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.78)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
            textAlign: 'center',
            color: 'white',
            zIndex: 10
          }}
        >
          <Loader2 size={36} style={{ animation: 'spin 1s linear infinite', marginBottom: '12px', color: '#5EEAD4' }} />
          <span style={{ fontWeight: 800, fontSize: '14px', marginBottom: '4px' }}>
            Régénération Studio IA en cours...
          </span>
          <span style={{ fontSize: '11px', color: '#CBD5E1', maxWidth: '240px' }}>
            Application du prompt d'éclairage et présentation catalogue
          </span>
        </div>
      )}

      {/* Badge format et poids */}
      <div
        style={{
          position: 'absolute',
          bottom: '8px',
          left: '8px',
          backgroundColor: 'rgba(15, 23, 42, 0.75)',
          color: 'white',
          fontSize: '10px',
          fontWeight: 700,
          padding: '3px 8px',
          borderRadius: '6px',
          backdropFilter: 'blur(4px)'
        }}
      >
        800×800 • {fileSizeKb > 0 ? `${fileSizeKb} Ko` : 'WebP'}
      </div>

      {/* Bouton Avant / Après (Original) */}
      {originalSrc && (
        <button
          type="button"
          onClick={e => { e.preventDefault(); e.stopPropagation(); }}
          onMouseDown={onHoldOriginalStart}
          onMouseUp={onHoldOriginalEnd}
          onTouchStart={onHoldOriginalStart}
          onTouchEnd={onHoldOriginalEnd}
          style={{
            position: 'absolute',
            top: '8px',
            left: '8px',
            backgroundColor: showOriginal ? '#0F766E' : 'rgba(255, 255, 255, 0.9)',
            color: showOriginal ? 'white' : '#1E293B',
            border: 'none',
            borderRadius: '8px',
            padding: '4px 8px',
            fontSize: '11px',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            boxShadow: '0 2px 6px rgba(0,0,0,0.1)'
          }}
          title="Maintenir pour voir l'image brute"
        >
          <Eye size={12} />
          <span>{showOriginal ? 'Original' : 'Avant/Après'}</span>
        </button>
      )}

      {/* Bouton Rotation 90° */}
      <button
        type="button"
        onClick={onRotate}
        style={{
          position: 'absolute',
          top: '8px',
          right: '8px',
          backgroundColor: 'rgba(255, 255, 255, 0.9)',
          color: '#1E293B',
          border: 'none',
          borderRadius: '8px',
          width: '30px',
          height: '30px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          boxShadow: '0 2px 6px rgba(0,0,0,0.1)'
        }}
        title="Pivoter de 90°"
      >
        <RotateCw size={14} />
      </button>
    </div>
  );
};
