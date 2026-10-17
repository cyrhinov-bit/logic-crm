import React, { useState, useRef } from 'react';
import { X, Save, Upload, FileText, Check, AlertCircle, Trash2, Folder, Briefcase, User, RefreshCw } from 'lucide-react';
import { useAppContext, type CrmDocument } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';

interface DocumentEditorModalProps {
  document: CrmDocument;
  onClose: () => void;
  onSaved?: (updatedDoc: CrmDocument) => void;
}

const CATEGORIES: Array<NonNullable<CrmDocument['category']>> = [
  'Contrat / Devis signé',
  'Bon de Commande',
  'BAT / Maquette',
  'Facture / Reçu',
  'Rapport',
  'Autre'
];

export function DocumentEditorModal({ document: doc, onClose, onSaved }: DocumentEditorModalProps) {
  const { crmFolders, clients, updateCrmDocument } = useAppContext();
  const { currentUser } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(doc.name);
  const [category, setCategory] = useState<CrmDocument['category']>(doc.category || 'Autre');
  const [folderId, setFolderId] = useState<string>(doc.folderId || '');
  const [clientId, setClientId] = useState<string>(doc.clientId || '');
  const [isShared, setIsShared] = useState<boolean>(Boolean(doc.isShared));

  // File replacement
  const [replacementFile, setReplacementFile] = useState<File | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const availableFolders = crmFolders.filter(f => 
    isShared ? f.isShared : (f.ownerId === (doc.uploaderId || currentUser?.id) && !f.isShared)
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setReplacementFile(file);
      if (name === doc.name) {
        setName(file.name);
      }
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Le nom du document ne peut pas être vide.');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const updates: Partial<CrmDocument> = {
        name: name.trim(),
        category,
        folderId: folderId || undefined,
        clientId: clientId || undefined,
        isShared
      };

      if (replacementFile) {
        updates.type = replacementFile.type || 'application/octet-stream';
        updates.sizeBytes = replacementFile.size;
      }

      await updateCrmDocument(doc.id, updates, replacementFile || undefined);
      
      if (onSaved) {
        onSaved({
          ...doc,
          ...updates,
          type: updates.type || doc.type,
          sizeBytes: updates.sizeBytes ?? doc.sizeBytes,
          updatedAt: new Date().toISOString()
        });
      }
      onClose();
    } catch (err: any) {
      console.error('Erreur lors de la sauvegarde du document:', err);
      setError(err.message || 'Erreur lors de la sauvegarde du document.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="doc-preview-backdrop" onClick={onClose} style={{ zIndex: 10000 }}>
      <div 
        className="doc-preview-container" 
        onClick={e => e.stopPropagation()} 
        style={{ maxWidth: '640px', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}
      >
        {/* Header */}
        <div className="doc-preview-header">
          <div className="doc-preview-title">
            <FileText size={20} color="#1879C8" />
            <span>Propriétés du document</span>
          </div>
          <button className="btn-icon" onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}>
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSave} style={{ padding: '24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {error && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 16px', background: 'rgba(239, 68, 68, 0.1)', color: '#EF4444', borderRadius: '8px', fontSize: '0.9rem' }}>
              <AlertCircle size={18} />
              <span>{error}</span>
            </div>
          )}

          {/* Nom du document */}
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '6px', display: 'block' }}>
              Nom du document <span style={{ color: 'var(--color-error, #EF4444)' }}>*</span>
            </label>
            <input
              type="text"
              className="form-input"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Ex: Devis_Signe_Client_2026.pdf"
              required
              style={{ width: '100%' }}
            />
          </div>

          {/* Catégorie & Dossier */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '6px', display: 'block' }}>
                Catégorie GED
              </label>
              <select
                className="form-select"
                value={category}
                onChange={e => setCategory(e.target.value as any)}
                style={{ width: '100%' }}
              >
                {CATEGORIES.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '6px', display: 'block' }}>
                Dossier de destination
              </label>
              <select
                className="form-select"
                value={folderId}
                onChange={e => setFolderId(e.target.value)}
                style={{ width: '100%' }}
              >
                <option value="">(Racine / Aucun dossier)</option>
                {availableFolders.map(f => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Liaison Client */}
          <div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '6px', display: 'block' }}>
                Lier à un Client
              </label>
              <select
                className="form-select"
                value={clientId}
                onChange={e => setClientId(e.target.value)}
                style={{ width: '100%' }}
              >
                <option value="">(Aucun client)</option>
                {clients.map(c => (
                  <option key={c.id} value={c.id}>{c.company || c.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Partage */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px', background: 'var(--color-bg-subtle, rgba(0,0,0,0.03))', borderRadius: '8px' }}>
            <input
              type="checkbox"
              id="edit-doc-shared"
              checked={isShared}
              onChange={e => setIsShared(e.target.checked)}
              style={{ width: '18px', height: '18px', cursor: 'pointer' }}
            />
            <label htmlFor="edit-doc-shared" style={{ cursor: 'pointer', fontSize: '0.9rem', margin: 0, userSelect: 'none' }}>
              <strong>Partager avec toute l'équipe</strong> (accessible dans l'onglet Documents Partagés)
            </label>
          </div>

          {/* Remplacement du fichier */}
          <div style={{ borderTop: '1px solid var(--color-border, #E2E8F0)', paddingTop: '16px' }}>
            <label className="form-label" style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <RefreshCw size={15} color="#1879C8" />
              <span>Remplacer le fichier (Nouvelle version)</span>
            </label>
            <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted, #64748B)', margin: '0 0 10px' }}>
              Permet de mettre à jour le contenu du fichier tout en conservant son historique et ses liaisons.
            </p>

            <input
              type="file"
              ref={fileInputRef}
              style={{ display: 'none' }}
              onChange={handleFileChange}
            />

            {replacementFile ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'rgba(24, 121, 200, 0.08)', border: '1px solid #1879C8', borderRadius: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                  <Check size={18} color="#1879C8" />
                  <span style={{ fontSize: '0.85rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    Nouveau fichier sélectionné : <strong>{replacementFile.name}</strong> ({(replacementFile.size / 1024).toFixed(1)} KB)
                  </span>
                </div>
                <button
                  type="button"
                  className="btn-icon text-error"
                  onClick={() => setReplacementFile(null)}
                  title="Annuler le remplacement"
                  style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => fileInputRef.current?.click()}
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '10px' }}
              >
                <Upload size={16} />
                Choisir un nouveau fichier à substituer
              </button>
            )}
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '10px' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={isSaving}>
              Annuler
            </button>
            <button type="submit" className="btn btn-primary" disabled={isSaving} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Save size={16} />
              {isSaving ? 'Enregistrement...' : 'Enregistrer les modifications'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
