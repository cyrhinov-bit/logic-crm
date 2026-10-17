import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Wand2, X, Save, Camera, Upload } from 'lucide-react';
import type { PosProduct } from '../../../context/AppContext';
import { useAppContext } from '../../../context/AppContext';
import { enhanceProductImage, type EnhanceOptions, PRESET_CONFIGS } from '../../../lib/imageEnhancer';
import { regenerateProductImageWithAi } from '../services/ProductImageAiService';
import { supabase } from '../../../lib/supabase';
import { db } from '../../../lib/db';
import { toast } from 'react-hot-toast';

import { useProductCamera } from './studio/useProductCamera';
import { StudioSelectSourceView } from './studio/StudioSelectSourceView';
import { StudioCameraView } from './studio/StudioCameraView';
import { StudioPreviewCard } from './studio/StudioPreviewCard';
import { StudioAiPanel } from './studio/StudioAiPanel';
import { StudioFilterBar } from './studio/StudioFilterBar';

export interface ProductPhotoStudioModalProps {
  product: PosProduct | null;
  isOpen: boolean;
  onClose: () => void;
  onSaved?: (updated: PosProduct) => void;
}

type StudioMode = 'select' | 'camera' | 'edit' | 'saving';

export function ProductPhotoStudioModal({
  product,
  isOpen,
  onClose,
  onSaved
}: ProductPhotoStudioModalProps) {
  const { updatePosProduct } = useAppContext();

  const [mode, setMode] = useState<StudioMode>('select');
  const [rawImageSource, setRawImageSource] = useState<string | null>(null);
  const [processedDataUrl, setProcessedDataUrl] = useState<string | null>(null);
  const [processedBlob, setProcessedBlob] = useState<Blob | null>(null);
  const [fileSizeKb, setFileSizeKb] = useState<number>(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);

  // IA Studio
  const [isRegeneratingAi, setIsRegeneratingAi] = useState(false);
  const [aiRegenerationSource, setAiRegenerationSource] = useState<string | null>(null);

  // Amélioration classique
  const [preset, setPreset] = useState<EnhanceOptions['preset']>('auto');
  const [rotation, setRotation] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Hook caméra personnalisé
  const {
    videoRef,
    startCamera,
    stopCameraStream,
    toggleFacingMode,
    capturePhoto
  } = useProductCamera((dataUrl) => {
    setRawImageSource(dataUrl);
    setPreset('auto');
    setRotation(0);
    setAiRegenerationSource(null);
    setMode('edit');
  });

  // Initialisation à l'ouverture
  useEffect(() => {
    if (isOpen && product) {
      if (product.imageUrl) {
        setRawImageSource(product.imageUrl);
        setMode('edit');
      } else {
        setMode('select');
        setRawImageSource(null);
      }
      setPreset('auto');
      setRotation(0);
      setAiRegenerationSource(null);
    }
  }, [isOpen, product]);

  // Arrêt caméra si fermeture
  useEffect(() => {
    if (!isOpen) {
      stopCameraStream();
    }
  }, [isOpen, stopCameraStream]);

  // Algorithme d'optimisation classique
  const processImage = useCallback(async () => {
    if (!rawImageSource) return;
    setIsProcessing(true);
    try {
      const options: EnhanceOptions = {
        preset,
        rotation,
        targetSize: 800,
        quality: 0.88
      };

      if (preset && preset !== 'none') {
        const cfg = PRESET_CONFIGS[preset];
        options.brightness = cfg.brightness;
        options.contrast = cfg.contrast;
        options.saturation = cfg.saturation;
        options.sharpen = cfg.sharpen;
        options.whiteBoost = cfg.whiteBoost;
      }

      const result = await enhanceProductImage(rawImageSource, options);
      setProcessedDataUrl(result.dataUrl);
      setProcessedBlob(result.blob);
      setFileSizeKb(Math.round(result.blob.size / 1024));
    } catch (err) {
      console.error('Erreur traitement image:', err);
      toast.error("Erreur lors du traitement visuel de l'image.");
    } finally {
      setIsProcessing(false);
    }
  }, [rawImageSource, preset, rotation]);

  useEffect(() => {
    if (mode === 'edit' && rawImageSource && !aiRegenerationSource) {
      processImage();
    }
  }, [mode, rawImageSource, preset, rotation, aiRegenerationSource, processImage]);

  // Sélection de filtre classique
  const handleSelectPreset = (newPreset: EnhanceOptions['preset']) => {
    setAiRegenerationSource(null);
    setPreset(newPreset);
  };

  // Rotation 90°
  const handleRotate = () => {
    setRotation((prev) => (prev + 90) % 360);
  };

  // Régénération par l'IA avec le prompt officiel
  const handleAiRegenerate = async () => {
    if (!rawImageSource || !product) return;
    setIsRegeneratingAi(true);
    const toastId = toast.loading('Régénération IA studio en cours...');
    try {
      const result = await regenerateProductImageWithAi({
        imageSource: rawImageSource,
        productName: product.name,
        category: product.family || 'Fourniture',
        reference: product.reference
      });

      setProcessedDataUrl(result.imageUrl);
      setAiRegenerationSource(result.source);

      // Conversion en Blob pour publication
      const res = await fetch(result.imageUrl);
      const blob = await res.blob();
      setProcessedBlob(blob);
      setFileSizeKb(Math.round(blob.size / 1024));

      toast.success("Photo régénérée avec succès par l'IA !", { id: toastId });
    } catch (err) {
      console.error('Erreur régénération IA:', err);
      toast.error("Erreur lors de la régénération par l'IA.", { id: toastId });
    } finally {
      setIsRegeneratingAi(false);
    }
  };

  // Rétablir les filtres classiques
  const handleResetToStandard = () => {
    setAiRegenerationSource(null);
    processImage();
    toast.success('Rétabli aux filtres classiques.');
  };

  // Enregistrer et publier
  const handleSaveAndPublish = async () => {
    if (!product || !processedDataUrl || !processedBlob) return;
    setMode('saving');

    try {
      let finalImageUrl = processedDataUrl;

      // 1. Upload Supabase Storage si en ligne
      if (navigator.onLine) {
        try {
          const ext = processedBlob.type.includes('webp') ? 'webp' : 'jpg';
          const filename = `product_${product.id}_${Date.now()}.${ext}`;
          const filePath = `products/${product.id}/${filename}`;

          const { error: uploadErr } = await supabase.storage
            .from('product-images')
            .upload(filePath, processedBlob, { upsert: true, contentType: processedBlob.type });

          if (!uploadErr) {
            const { data: publicUrlData } = supabase.storage
              .from('product-images')
              .getPublicUrl(filePath);

            if (publicUrlData?.publicUrl) {
              finalImageUrl = publicUrlData.publicUrl;
            }
          }
        } catch (storageErr) {
          console.warn('Storage upload fallback:', storageErr);
        }
      }

      // 2. Mettre à jour le produit
      const updatedProduct: PosProduct = {
        ...product,
        imageUrl: finalImageUrl,
        updatedAt: new Date().toISOString()
      };

      await updatePosProduct(product.id, { imageUrl: finalImageUrl });

      // 3. Mise à jour IndexedDB local
      await db.posProducts.setItem(
        'data',
        ((await db.posProducts.getItem<PosProduct[]>('data')) || []).map((p) =>
          p.id === product.id ? updatedProduct : p
        )
      );

      toast.success(`Photo de "${product.name}" enregistrée et publiée au catalogue !`);
      if (onSaved) onSaved(updatedProduct);
      onClose();
    } catch (err) {
      console.error('Erreur sauvegarde photo:', err);
      toast.error('Erreur lors de la sauvegarde de la photo.');
      setMode('edit');
    }
  };

  // Sélection directe d'un fichier depuis l'écran edit
  const handleDirectFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Veuillez sélectionner un fichier image valide.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      setRawImageSource(dataUrl);
      setPreset('auto');
      setRotation(0);
      setAiRegenerationSource(null);
      setMode('edit');
    };
    reader.readAsDataURL(file);
  };

  if (!isOpen || !product) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        backdropFilter: 'blur(4px)'
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          backgroundColor: 'white',
          borderRadius: '20px',
          width: '100%',
          maxWidth: '560px',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
          overflow: 'hidden',
          animation: 'scaleUp 0.2s ease-out'
        }}
      >
        {/* EN-TÊTE MODALE */}
        <div
          style={{
            padding: '14px 18px',
            borderBottom: '1px solid #E2E8F0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#F8FAFC'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
            <div style={{ backgroundColor: '#CCFBF1', color: '#0F766E', padding: '8px', borderRadius: '10px', display: 'flex' }}>
              <Wand2 size={20} />
            </div>
            <div style={{ minWidth: 0 }}>
              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                Studio Photo — {product.name}
              </h3>
              <span style={{ fontSize: '11px', color: '#64748B' }}>
                {product.reference ? `Réf: ${product.reference} • ` : ''}Packshot & Optimisation e-commerce
              </span>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              background: '#F1F5F9',
              border: 'none',
              borderRadius: '50%',
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer'
            }}
          >
            <X size={16} color="#475569" />
          </button>
        </div>

        {/* CORPS DE LA MODALE */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
          {/* 1. Sélection source */}
          {mode === 'select' && (
            <StudioSelectSourceView
              onStartCamera={() => {
                setMode('camera');
                startCamera();
              }}
              onFileSelect={(dataUrl) => {
                setRawImageSource(dataUrl);
                setPreset('auto');
                setRotation(0);
                setAiRegenerationSource(null);
                setMode('edit');
              }}
            />
          )}

          {/* 2. Caméra en direct */}
          {mode === 'camera' && (
            <StudioCameraView
              videoRef={videoRef}
              onToggleFacingMode={toggleFacingMode}
              onCapture={capturePhoto}
              onCancel={() => {
                stopCameraStream();
                setMode('select');
              }}
            />
          )}

          {/* 3. Retouche & Studio IA */}
          {(mode === 'edit' || mode === 'saving') && (
            <div>
              {/* Carte Aperçu & Commandes Rapides */}
              <StudioPreviewCard
                currentSrc={processedDataUrl || rawImageSource || ''}
                originalSrc={rawImageSource}
                showOriginal={showOriginal}
                onHoldOriginalStart={() => setShowOriginal(true)}
                onHoldOriginalEnd={() => setShowOriginal(false)}
                onRotate={handleRotate}
                fileSizeKb={fileSizeKb}
                isRegeneratingAi={isRegeneratingAi}
              />

              {/* Module Studio IA avec le prompt officiel */}
              <StudioAiPanel
                onRegenerate={handleAiRegenerate}
                isRegenerating={isRegeneratingAi}
                aiSource={aiRegenerationSource}
                onResetStandard={handleResetToStandard}
              />

              {/* Filtres Algorithmiques Instantanés */}
              <StudioFilterBar
                currentPreset={preset}
                onSelectPreset={handleSelectPreset}
                isAiActive={!!aiRegenerationSource}
              />

              {/* Reprise photo ou changement de fichier */}
              <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', fontSize: '12px', marginTop: '8px' }}>
                <button
                  type="button"
                  onClick={() => {
                    setMode('camera');
                    startCamera();
                  }}
                  style={{ background: 'none', border: 'none', color: '#0F766E', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                >
                  <Camera size={14} />
                  <span>Reprendre une photo</span>
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  style={{ background: 'none', border: 'none', color: '#475569', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                >
                  <Upload size={14} />
                  <span>Changer de fichier</span>
                </button>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={handleDirectFileSelect}
              />
            </div>
          )}
        </div>

        {/* PIED DE PAGE & VALIDATION */}
        {mode === 'edit' && (
          <div
            style={{
              padding: '14px 18px',
              borderTop: '1px solid #E2E8F0',
              backgroundColor: '#F8FAFC',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '10px'
            }}
          >
            <button
              type="button"
              onClick={onClose}
              style={{
                backgroundColor: '#E2E8F0',
                color: '#334155',
                border: 'none',
                padding: '10px 16px',
                borderRadius: '10px',
                fontWeight: 600,
                fontSize: '13px',
                cursor: 'pointer'
              }}
            >
              Annuler
            </button>

            <button
              type="button"
              onClick={handleSaveAndPublish}
              disabled={isProcessing || isRegeneratingAi}
              style={{
                flex: 1,
                backgroundColor: '#0F766E',
                color: 'white',
                border: 'none',
                padding: '11px 18px',
                borderRadius: '10px',
                fontWeight: 700,
                fontSize: '14px',
                cursor: isProcessing || isRegeneratingAi ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                boxShadow: '0 2px 8px rgba(15, 118, 110, 0.3)'
              }}
            >
              <Save size={16} />
              <span>Enregistrer & Publier au Catalogue</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
