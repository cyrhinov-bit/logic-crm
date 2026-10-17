import { useRef, useState } from 'react';
import { useAppContext } from '../../../context/AppContext';
import { useProductImages } from './ProductImagesContext';
import { Upload, Trash2, Link2, Wand2, CloudUpload, ImagePlus, CloudDownload, Cloud, HardDrive, Camera } from 'lucide-react';
import CameraCapture from '../presentation/CameraCapture';

export default function ProductImageGallery() {
  const { posProducts } = useAppContext();
  const {
    images,
    loading,
    uploadFiles,
    assignImageToProduct,
    deleteImage,
    downloadImage,
    syncPending,
    applyAutoMatch,
    refresh
  } = useProductImages();

  const [isUploading, setIsUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [busyFilename, setBusyFilename] = useState<string | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (files: FileList | File[]) => {
    const list = Array.from(files).filter(f => /\.(png|jpe?g)$/i.test(f.name));
    if (list.length === 0) {
      setMessage('Seuls les fichiers PNG et JPG sont acceptés.');
      return;
    }
    setIsUploading(true);
    setMessage(null);
    try {
      const results = await uploadFiles(list);
      const linked = results.filter(r => r.matchedProductId).length;
      const pending = results.filter(r => r.matchedProductId && !r.uploaded).length;
      setMessage(
        `${results.length} image(s) importée(s) — ${linked} liée(s) à un produit` +
        (pending > 0 ? `, ${pending} en attente de synchronisation cloud` : '') +
        (results.length - linked > 0 ? `, ${results.length - linked} sans correspondance` : '')
      );
    } catch (e) {
      console.error('Upload échoué :', e);
      setMessage('Échec de l\'import des images.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleSyncPending = async () => {
    setSyncing(true);
    try {
      const count = await syncPending();
      setMessage(count > 0 ? `${count} image(s) synchronisée(s) vers le cloud.` : 'Aucune image en attente.');
    } finally {
      setSyncing(false);
    }
  };

  const handleAutoMatch = async () => {
    const count = await applyAutoMatch();
    setMessage(count > 0 ? `${count} image(s) attribuée(s) automatiquement.` : 'Aucune nouvelle correspondance trouvée.');
  };

  const sortedImages = [...images].sort((a, b) => a.filename.localeCompare(b.filename));

  return (
    <div>
      <h2 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '8px' }}>Galerie d'images produits</h2>
      <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginBottom: '20px' }}>
        Téléversez des images PNG / JPG. Le nom du fichier doit correspondre au nom du produit (ex. « Cahier A4.png »)
        pour être attribué automatiquement.
      </p>

      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
        onClick={() => fileInputRef.current?.click()}
        style={{
          border: `2px dashed ${dragOver ? 'var(--color-primary)' : 'var(--color-border)'}`,
          borderRadius: 'var(--radius-lg)',
          padding: '32px',
          textAlign: 'center',
          cursor: 'pointer',
          marginBottom: '20px',
          background: dragOver ? 'var(--color-primary-tint)' : 'var(--color-surface-alt)',
          transition: 'background 0.2s'
        }}
      >
        <ImagePlus size={32} color="var(--color-primary)" style={{ marginBottom: '8px' }} />
        <div style={{ fontSize: '14px', fontWeight: 600 }}>
          {isUploading ? 'Importation en cours...' : 'Glissez-déposez vos images ici ou cliquez pour choisir'}
        </div>
        <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
          Formats acceptés : PNG, JPG — plusieurs fichiers possibles
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg"
          multiple
          style={{ display: 'none' }}
          onChange={e => {
            if (e.target.files) handleFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </div>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '20px' }}>
        <button className="btn btn-secondary" onClick={handleAutoMatch} disabled={loading}>
          <Wand2 size={14} style={{ marginRight: '6px' }} /> Attribuer automatiquement
        </button>
        <button className="btn btn-secondary" onClick={() => setShowCamera(true)}>
          <Camera size={14} style={{ marginRight: '6px' }} /> Prendre une photo
        </button>
        <button className="btn btn-secondary" onClick={handleSyncPending} disabled={syncing}>
          <CloudUpload size={14} style={{ marginRight: '6px' }} /> {syncing ? 'Synchronisation...' : 'Synchroniser vers le cloud'}
        </button>
        <button className="btn btn-secondary" onClick={() => refresh()}>
          <Upload size={14} style={{ marginRight: '6px' }} /> Actualiser
        </button>
      </div>

      {showCamera && (
        <CameraCapture 
          onCapture={(file) => {
            setShowCamera(false);
            handleFiles([file]);
          }}
          onCancel={() => setShowCamera(false)}
        />
      )}

      {message && (
        <div style={{ padding: '10px 14px', background: 'var(--color-primary-tint)', borderRadius: 'var(--radius-md)', marginBottom: '20px', fontSize: '13px' }}>
          {message}
        </div>
      )}

      {loading && images.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--color-text-muted)' }}>Chargement de la galerie...</div>
      ) : sortedImages.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--color-text-muted)' }}>Aucune image dans la galerie.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px' }}>
          {sortedImages.map(image => (
            <div key={image.filename} style={{ background: 'white', borderRadius: 'var(--radius-lg)', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
              <div style={{ height: '140px', background: 'var(--color-surface-alt)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <img
                  src={image.dataUri}
                  alt={image.filename}
                  style={{ maxWidth: '100%', maxHeight: '140px', objectFit: 'cover', display: 'block' }}
                />
              </div>
              <div style={{ padding: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                  <div style={{ fontSize: '12px', fontFamily: 'monospace', wordBreak: 'break-all', flex: 1 }}>{image.filename}</div>
                  <span
                    title={image.source === 'cloud' ? 'Image présente uniquement dans le cloud' : 'Image stockée localement'}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '3px',
                      padding: '2px 6px',
                      borderRadius: 'var(--radius-md)',
                      fontSize: '10px',
                      fontWeight: 600,
                      whiteSpace: 'nowrap',
                      background: image.source === 'cloud' ? 'var(--color-primary-tint)' : 'var(--color-success-tint)',
                      color: image.source === 'cloud' ? 'var(--color-primary)' : 'var(--color-success)'
                    }}
                  >
                    {image.source === 'cloud' ? <Cloud size={11} /> : <HardDrive size={11} />}
                    {image.source === 'cloud' ? 'Cloud' : 'Local'}
                  </span>
                </div>

                {image.productId && image.productName ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', marginBottom: '8px' }}>
                    <Link2 size={14} color="var(--color-success)" />
                    <span style={{ color: 'var(--color-success)' }}>{image.productName}</span>
                  </div>
                ) : (
                  <div style={{ marginBottom: '8px' }}>
                    <div style={{ fontSize: '11px', color: 'var(--color-warning-strong)', marginBottom: '4px' }}>Non attribuée</div>
                    <select
                      style={{ width: '100%', padding: '6px 8px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', fontSize: '12px' }}
                      value=""
                      onChange={async e => {
                        if (e.target.value) {
                          await assignImageToProduct(image, e.target.value);
                          setMessage(`Image attribuée à ${posProducts.find(p => p.id === e.target.value)?.name}.`);
                        }
                      }}
                    >
                      <option value="" disabled>Attribuer à...</option>
                      {posProducts.map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div style={{ display: 'flex', gap: '6px' }}>
                  {image.source === 'cloud' && (
                    <button
                      className="btn btn-secondary"
                      style={{ flex: 1, fontSize: '12px', padding: '6px 10px' }}
                      disabled={busyFilename === image.filename}
                      onClick={async () => {
                        setBusyFilename(image.filename);
                        try {
                          await downloadImage(image);
                          setMessage(`Image « ${image.filename} » récupérée en local.`);
                        } catch {
                          setMessage('Échec de la récupération en local.');
                        } finally {
                          setBusyFilename(null);
                        }
                      }}
                    >
                      <CloudDownload size={12} style={{ marginRight: '4px' }} />
                      {busyFilename === image.filename ? '...' : 'Récupérer en local'}
                    </button>
                  )}
                  <button
                    className="btn btn-secondary"
                    style={{ flex: image.source === 'cloud' ? 0.6 : 1, fontSize: '12px', padding: '6px 10px' }}
                    disabled={busyFilename === image.filename}
                    onClick={async () => {
                      if (window.confirm(`Supprimer l'image « ${image.filename} » ?`)) {
                        setBusyFilename(image.filename);
                        try {
                          await deleteImage(image);
                          setMessage('Image supprimée.');
                        } finally {
                          setBusyFilename(null);
                        }
                      }
                    }}
                  >
                    <Trash2 size={12} style={{ marginRight: '4px' }} /> Supprimer
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
