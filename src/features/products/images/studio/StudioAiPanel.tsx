import React from 'react';
import { Sparkles, Wand2, Loader2, CheckCircle2, ShieldCheck } from 'lucide-react';

interface StudioAiPanelProps {
  onRegenerate: () => void;
  isRegenerating: boolean;
  aiSource: string | null;
  onResetStandard: () => void;
}

export const StudioAiPanel: React.FC<StudioAiPanelProps> = ({
  onRegenerate,
  isRegenerating,
  aiSource,
  onResetStandard
}) => {
  return (
    <div
      style={{
        marginBottom: '16px',
        backgroundColor: '#F0FDFA',
        border: '1px solid #99F6E4',
        borderRadius: '14px',
        padding: '14px'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Sparkles size={18} color="#0D9488" />
          <span style={{ fontSize: '13px', fontWeight: 800, color: '#0F766E' }}>
            Régénération Studio Photo IA
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', backgroundColor: '#CCFBF1', color: '#0F766E', padding: '2px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: 700 }}>
          <ShieldCheck size={12} />
          <span>Fidélité 100%</span>
        </div>
      </div>

      <p style={{ fontSize: '11px', color: '#115E59', margin: '0 0 12px 0', lineHeight: '1.45' }}>
        L'IA transforme la photo en cliché e-commerce haut de gamme : produit strictement identique, éclairage studio professionnel, netteté maximale et fond catalogue élégant.
      </p>

      {/* Bouton direct de déclenchement de la régénération IA */}
      <button
        type="button"
        onClick={onRegenerate}
        disabled={isRegenerating}
        style={{
          width: '100%',
          padding: '12px 16px',
          borderRadius: '10px',
          background: 'linear-gradient(135deg, #0D9488 0%, #0F766E 100%)',
          color: 'white',
          border: 'none',
          fontWeight: 800,
          fontSize: '14px',
          cursor: isRegenerating ? 'not-allowed' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          boxShadow: '0 4px 12px rgba(13, 148, 136, 0.25)',
          opacity: isRegenerating ? 0.75 : 1,
          transition: 'all 0.15s ease'
        }}
      >
        {isRegenerating ? (
          <>
            <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
            <span>Régénération IA en cours...</span>
          </>
        ) : (
          <>
            <Wand2 size={18} />
            <span>🪄 Régénérer la photo avec l'IA</span>
          </>
        )}
      </button>

      {/* Statut si l'image est générée par l'IA */}
      {aiSource && (
        <div
          style={{
            marginTop: '10px',
            padding: '8px 12px',
            borderRadius: '8px',
            backgroundColor: '#FFFFFF',
            border: '1px solid #99F6E4',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '11px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#0F766E', fontWeight: 700 }}>
            <CheckCircle2 size={14} color="#0D9488" />
            <span>Photo sublimée par l'IA (Prête pour catalogue)</span>
          </div>
          <button
            type="button"
            onClick={onResetStandard}
            style={{
              background: 'none',
              border: 'none',
              color: '#64748B',
              fontSize: '11px',
              textDecoration: 'underline',
              cursor: 'pointer'
            }}
          >
            Filtre classique
          </button>
        </div>
      )}
    </div>
  );
};
