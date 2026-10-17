import React, { useRef } from 'react';
import { Camera, Upload } from 'lucide-react';
import { toast } from 'react-hot-toast';

interface StudioSelectSourceViewProps {
  onStartCamera: () => void;
  onFileSelect: (dataUrl: string) => void;
}

export const StudioSelectSourceView: React.FC<StudioSelectSourceViewProps> = ({
  onStartCamera,
  onFileSelect
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Veuillez sélectionner un fichier image valide (PNG, JPG, WEBP).');
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      onFileSelect(dataUrl);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div style={{ textAlign: 'center', padding: '20px 0' }}>
      <p style={{ fontSize: '13px', color: '#64748B', marginBottom: '24px' }}>
        Capturez une photo directement avec votre téléphone ou téléversez un fichier image.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '20px' }}>
        <button
          type="button"
          onClick={onStartCamera}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px',
            padding: '24px 16px',
            borderRadius: '16px',
            border: '2px dashed #0F766E',
            backgroundColor: '#F0FDFA',
            color: '#0F766E',
            cursor: 'pointer',
            transition: 'transform 0.15s'
          }}
        >
          <Camera size={36} />
          <span style={{ fontWeight: 700, fontSize: '14px' }}>Prendre une photo</span>
          <span style={{ fontSize: '11px', opacity: 0.8 }}>Caméra smartphone</span>
        </button>

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px',
            padding: '24px 16px',
            borderRadius: '16px',
            border: '2px dashed #CBD5E1',
            backgroundColor: '#F8FAFC',
            color: '#475569',
            cursor: 'pointer',
            transition: 'transform 0.15s'
          }}
        >
          <Upload size={36} />
          <span style={{ fontWeight: 700, fontSize: '14px' }}>Importer image</span>
          <span style={{ fontSize: '11px', color: '#94A3B8' }}>PNG, JPG, WEBP</span>
        </button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />
    </div>
  );
};
