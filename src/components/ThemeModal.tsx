import React, { useState, useEffect, useMemo } from 'react';
import { Palette, Check, RotateCcw, X, Sparkles } from 'lucide-react';
import { THEME_PRESETS, THEME_CATEGORIES, DEFAULT_THEME_COLOR, getUserThemeColor, setUserThemeColor, applyTheme } from '../lib/theme';
import { useAuth } from '../context/AuthContext';
import { useAppContext } from '../context/AppContext';
import './ThemeModal.css';

interface ThemeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ThemeModal({ isOpen, onClose }: ThemeModalProps) {
  const { currentUser } = useAuth();
  const { posSettings, updatePosSettings } = useAppContext();
  const initialColor = getUserThemeColor(currentUser?.id);
  const [selectedColor, setSelectedColor] = useState<string>(initialColor);
  const [activeCategory, setActiveCategory] = useState<string>('Tous');

  useEffect(() => {
    if (isOpen) {
      const currentColor = getUserThemeColor(currentUser?.id);
      setSelectedColor(currentColor);
      applyTheme(currentColor);
    }
  }, [isOpen, currentUser?.id]);

  const filteredPresets = useMemo(() => {
    if (activeCategory === 'Tous') return THEME_PRESETS;
    return THEME_PRESETS.filter(p => p.category === activeCategory);
  }, [activeCategory]);

  if (!isOpen) return null;

  const handleSelectColor = (hex: string) => {
    setSelectedColor(hex);
    applyTheme(hex); // Aperçu en direct immédiat
  };

  const handleSave = async () => {
    if (currentUser?.id) {
      setUserThemeColor(currentUser.id, selectedColor);
      if (currentUser.role === 'Directeur' || currentUser.role === 'SuperAdmin') {
        localStorage.setItem('director_theme_color', selectedColor);
        if (updatePosSettings) {
          await updatePosSettings({ ...posSettings, themeColor: selectedColor });
        }
      }
    }
    onClose();
  };

  const handleCancel = () => {
    applyTheme(initialColor); // Rétablir la couleur initiale
    onClose();
  };

  const handleResetDefault = () => {
    handleSelectColor(DEFAULT_THEME_COLOR);
  };

  return (
    <div className="theme-modal-backdrop" onClick={handleCancel}>
      <div className="theme-modal-card" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="theme-modal-header">
          <div className="theme-modal-title">
            <Palette size={20} color="var(--color-primary)" />
            <span>Personnaliser mon Thème ({THEME_PRESETS.length} nuances)</span>
          </div>
          <button
            className="btn-icon"
            onClick={handleCancel}
            style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="theme-modal-body">
          <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b' }}>
            Choisissez la couleur primaire de votre interface. Les boutons, badges, accents et menus s'adapteront immédiatement à votre préférence.
          </p>

          {/* Filtres par familles de couleurs */}
          <div className="theme-cat-pills">
            {THEME_CATEGORIES.map(cat => (
              <button
                key={cat}
                type="button"
                className={`theme-cat-pill ${activeCategory === cat ? 'active' : ''}`}
                onClick={() => setActiveCategory(cat)}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Grille des thèmes prédéfinis */}
          <div>
            <div className="theme-grid">
              {filteredPresets.map(preset => {
                const isSelected = selectedColor.toLowerCase() === preset.hex.toLowerCase();
                return (
                  <div
                    key={preset.hex}
                    className={`theme-swatch-item ${isSelected ? 'selected' : ''}`}
                    onClick={() => handleSelectColor(preset.hex)}
                  >
                    <div className="theme-circle" style={{ backgroundColor: preset.hex }}>
                      {isSelected && <Check size={18} strokeWidth={3} />}
                    </div>
                    <div className="theme-swatch-name">{preset.name}</div>
                    <div className="theme-swatch-mood">{preset.mood}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Sélecteur de couleur personnalisé */}
          <div>
            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: '8px' }}>
              Couleur Personnalisée (Nuancier libre)
            </div>
            <div className="theme-custom-picker">
              <input
                type="color"
                className="theme-custom-input"
                value={selectedColor}
                onChange={e => handleSelectColor(e.target.value)}
              />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '0.88rem', fontWeight: 600, color: '#0f172a' }}>
                  Code Hexadécimal : <span style={{ color: 'var(--color-primary)', fontFamily: 'monospace' }}>{selectedColor.toUpperCase()}</span>
                </div>
                <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                  Cliquez sur le carré pour ouvrir la roue de couleurs
                </div>
              </div>
            </div>
          </div>

          {/* Aperçu en direct */}
          <div className="theme-preview-box">
            <div className="theme-preview-header">Aperçu en Direct</div>
            <div className="theme-preview-elements">
              <button type="button" tabIndex={-1} aria-hidden="true" className="btn btn-primary" style={{ pointerEvents: 'none' }}>
                <Sparkles size={14} style={{ marginRight: '6px' }} /> Bouton Principal
              </button>
              <span className="badge-status bg-primary">
                Badge Actif
              </span>
              <div
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  backgroundColor: 'var(--color-primary-tint)',
                  color: 'var(--color-primary-strong)',
                  fontWeight: 600,
                  fontSize: '0.8rem'
                }}
              >
                Texte d'Accentuation
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="theme-modal-footer">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={handleResetDefault}
            title="Rétablir la couleur par défaut Sarcelle Hinov"
          >
            <RotateCcw size={14} style={{ marginRight: '4px' }} />
            Par défaut
          </button>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="button" className="btn btn-secondary" onClick={handleCancel}>
              Annuler
            </button>
            <button type="button" className="btn btn-primary" onClick={handleSave}>
              <Check size={16} style={{ marginRight: '6px' }} />
              Appliquer le thème
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
