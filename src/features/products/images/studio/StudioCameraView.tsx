import React from 'react';
import { Camera, SwitchCamera } from 'lucide-react';

interface StudioCameraViewProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  onToggleFacingMode: () => void;
  onCapture: () => void;
  onCancel: () => void;
}

export const StudioCameraView: React.FC<StudioCameraViewProps> = ({
  videoRef,
  onToggleFacingMode,
  onCapture,
  onCancel
}) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: '360px',
          aspectRatio: '1 / 1',
          backgroundColor: '#000',
          borderRadius: '16px',
          overflow: 'hidden',
          marginBottom: '16px',
          boxShadow: '0 4px 15px rgba(0,0,0,0.2)'
        }}
      >
        <video
          ref={videoRef as any}
          autoPlay
          playsInline
          muted
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />

        {/* Grille de cadrage 1:1 règle des tiers */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            border: '2px solid rgba(255, 255, 255, 0.4)',
            pointerEvents: 'none',
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            gridTemplateRows: '1fr 1fr 1fr'
          }}
        >
          <div style={{ borderRight: '1px solid rgba(255,255,255,0.2)', borderBottom: '1px solid rgba(255,255,255,0.2)' }} />
          <div style={{ borderRight: '1px solid rgba(255,255,255,0.2)', borderBottom: '1px solid rgba(255,255,255,0.2)' }} />
          <div style={{ borderBottom: '1px solid rgba(255,255,255,0.2)' }} />
          <div style={{ borderRight: '1px solid rgba(255,255,255,0.2)', borderBottom: '1px solid rgba(255,255,255,0.2)' }} />
          <div style={{ borderRight: '1px solid rgba(255,255,255,0.2)', borderBottom: '1px solid rgba(255,255,255,0.2)' }} />
          <div style={{ borderBottom: '1px solid rgba(255,255,255,0.2)' }} />
          <div style={{ borderRight: '1px solid rgba(255,255,255,0.2)' }} />
          <div style={{ borderRight: '1px solid rgba(255,255,255,0.2)' }} />
          <div />
        </div>

        {/* Basculer caméra avant / arrière */}
        <button
          type="button"
          onClick={onToggleFacingMode}
          style={{
            position: 'absolute',
            top: '12px',
            right: '12px',
            background: 'rgba(0, 0, 0, 0.5)',
            color: 'white',
            border: 'none',
            borderRadius: '50%',
            width: '36px',
            height: '36px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            backdropFilter: 'blur(4px)'
          }}
          title="Changer de caméra"
        >
          <SwitchCamera size={18} />
        </button>
      </div>

      {/* Déclencheur & Annuler */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
        <button
          type="button"
          onClick={onCancel}
          style={{ background: 'none', border: 'none', color: '#64748B', fontWeight: 600, fontSize: '13px', cursor: 'pointer' }}
        >
          Annuler
        </button>

        <button
          type="button"
          onClick={onCapture}
          style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            backgroundColor: '#0F766E',
            border: '4px solid white',
            boxShadow: '0 4px 15px rgba(15, 118, 110, 0.4)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white'
          }}
          title="Prendre la photo"
        >
          <Camera size={28} />
        </button>
      </div>
    </div>
  );
};
