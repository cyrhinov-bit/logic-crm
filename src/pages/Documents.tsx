import React, { useState, useRef, useMemo, useEffect } from 'react';
import { Upload, FileText, Download, Trash2, Folder, FolderPlus, ChevronRight, Eye, Edit2, Edit3, Settings, Search, Filter, Share2, User as UserIcon, Building, Image as ImageIcon, Table as TableIcon, Code } from 'lucide-react';
import { useConfirm } from '../components/ConfirmModal';
import { useAppContext, type CrmDocument, type CrmFolder } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { DocumentPreviewModal } from '../components/DocumentPreviewModal';
import { DocumentEditorModal } from '../components/DocumentEditorModal';
import './Documents.css';

const FOLDER_COLORS = [
  { name: 'Bleu Logic (Défaut)', hex: '#1879C8' },
  { name: 'Bleu Océan', hex: '#2563EB' },
  { name: 'Indigo', hex: '#6366F1' },
  { name: 'Violet Royal', hex: '#7C3AED' },
  { name: 'Rose Vif', hex: '#E11D48' },
  { name: 'Ambre / Or', hex: '#D97706' },
  { name: 'Émeraude', hex: '#059669' },
  { name: 'Orange Feu', hex: '#EA580C' },
  { name: 'Ardoise', hex: '#475569' },
];

const CATEGORIES: Array<NonNullable<CrmDocument['category']>> = [
  'Contrat / Devis signé',
  'Bon de Commande',
  'BAT / Maquette',
  'Facture / Reçu',
  'Rapport',
  'Autre'
];

export function Documents() {
  const { confirm } = useConfirm();
  const { crmDocuments, crmFolders, clients, addCrmDocument, deleteCrmDocument, downloadCrmDocument, addCrmFolder, updateCrmFolder, deleteCrmFolder, users } = useAppContext();
  const { currentUser } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState<'MY_DOCS' | 'SHARED'>('MY_DOCS');
  const [currentFolderId, setCurrentFolderId] = useState<string | undefined>(undefined);
  const [selectedUserId, setSelectedUserId] = useState<string>(currentUser?.id || '');
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');

  // Modals
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderColor, setNewFolderColor] = useState('#1879C8');
  const [newFolderIsShared, setNewFolderIsShared] = useState(false);

  const [editingFolder, setEditingFolder] = useState<CrmFolder | null>(null);
  const [editFolderName, setEditFolderName] = useState('');
  const [editFolderColor, setEditFolderColor] = useState('#1879C8');

  // Rich Upload Modal
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadCategory, setUploadCategory] = useState<CrmDocument['category']>('Autre');
  const [uploadClientId, setUploadClientId] = useState('');
  const [uploadIsShared, setUploadIsShared] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  // Preview & Edit Modals
  const [previewDoc, setPreviewDoc] = useState<CrmDocument | null>(null);
  const [editingDoc, setEditingDoc] = useState<CrmDocument | null>(null);

  const isAdmin = ['Directeur', 'Directeur adjoint', 'SuperAdmin'].includes(currentUser?.role || '');
  const displayedUserId = isAdmin ? selectedUserId : (currentUser?.id || '');

  // Synchronize selectedUserId when currentUser loads
  useEffect(() => {
    if (currentUser?.id && !selectedUserId && !isAdmin) {
      setSelectedUserId(currentUser.id);
    }
  }, [currentUser, selectedUserId, isAdmin]);

  // Filter folders & documents based on current tab
  const scopedFolders = useMemo(() => {
    if (activeTab === 'SHARED') {
      return crmFolders.filter(f => f.isShared);
    }
    if (isAdmin && !displayedUserId) {
      return crmFolders.filter(f => !f.isShared);
    }
    return crmFolders.filter(f => (f.ownerId === displayedUserId || (!f.ownerId && displayedUserId === currentUser?.id)) && !f.isShared);
  }, [crmFolders, displayedUserId, isAdmin, currentUser, activeTab]);

  const scopedDocuments = useMemo(() => {
    if (activeTab === 'SHARED') {
      return crmDocuments.filter(d => d.isShared);
    }
    if (isAdmin && !displayedUserId) {
      return crmDocuments.filter(d => !d.isShared);
    }
    return crmDocuments.filter(d => (d.uploaderId === displayedUserId || (!d.uploaderId && (!displayedUserId || displayedUserId === currentUser?.id))) && !d.isShared);
  }, [crmDocuments, displayedUserId, isAdmin, currentUser, activeTab]);

  // Current level folders & files
  const currentLevelFolders = useMemo(() => {
    if (searchQuery.trim()) {
      return scopedFolders.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()));
    }
    return scopedFolders.filter(f => f.parentId === currentFolderId);
  }, [scopedFolders, currentFolderId, searchQuery]);

  const currentLevelDocuments = useMemo(() => {
    let docs = scopedDocuments.filter(d => (searchQuery.trim() ? true : d.folderId === currentFolderId));
    if (searchQuery.trim()) {
      docs = docs.filter(d => d.name.toLowerCase().includes(searchQuery.toLowerCase()));
    }
    if (categoryFilter) {
      docs = docs.filter(d => d.category === categoryFilter);
    }
    return docs;
  }, [scopedDocuments, currentFolderId, searchQuery, categoryFilter]);

  // Breadcrumbs
  const breadcrumbs = useMemo(() => {
    const crumbs: { id: string | undefined; name: string; color?: string }[] = [];
    let curr = currentFolderId;
    while (curr) {
      const f = scopedFolders.find(folder => folder.id === curr);
      if (f) {
        crumbs.unshift({ id: f.id, name: f.name, color: f.color });
        curr = f.parentId;
      } else {
        break;
      }
    }
    const rootName = activeTab === 'SHARED' ? 'Documents Partagés' : 'Mes Documents';
    return [{ id: undefined, name: rootName }, ...crumbs];
  }, [currentFolderId, scopedFolders, activeTab]);

  // Folder creation
  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    await addCrmFolder(
      newFolderName.trim(),
      displayedUserId || currentUser?.id || 'system',
      currentFolderId,
      newFolderColor,
      activeTab === 'SHARED' || newFolderIsShared
    );
    setShowFolderModal(false);
    setNewFolderName('');
    setNewFolderColor('#1879C8');
    setNewFolderIsShared(false);
  };

  // Folder edit
  const startEditFolder = (folder: CrmFolder, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingFolder(folder);
    setEditFolderName(folder.name);
    setEditFolderColor(folder.color || '#1879C8');
  };

  const handleSaveEditFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingFolder || !editFolderName.trim()) return;
    await updateCrmFolder(editingFolder.id, {
      name: editFolderName.trim(),
      color: editFolderColor
    });
    setEditingFolder(null);
  };

  const handleDeleteFolder = (folder: CrmFolder, e: React.MouseEvent) => {
    e.stopPropagation();
    const hasChildren = crmFolders.some(f => f.parentId === folder.id) || crmDocuments.some(d => d.folderId === folder.id);
    if (hasChildren) {
      alert("Impossible de supprimer un dossier qui n'est pas vide. Veuillez d'abord vider son contenu.");
      return;
    }
    confirm({
      title: 'Supprimer le dossier',
      message: `Voulez-vous vraiment supprimer le dossier "${folder.name}" ?`,
      confirmLabel: 'Supprimer',
      variant: 'danger',
      onConfirm: () => deleteCrmFolder(folder.id)
    });
  };

  // Rich Upload submission
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setUploadFile(e.target.files[0]);
      setShowUploadModal(true);
    }
  };

  const handleConfirmUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile) return;

    setIsUploading(true);
    try {
      await addCrmDocument(uploadFile, {
        uploaderId: displayedUserId || currentUser?.id,
        folderId: currentFolderId,
        clientId: uploadClientId || undefined,
        category: uploadCategory,
        isShared: activeTab === 'SHARED' || uploadIsShared
      });
      setShowUploadModal(false);
      setUploadFile(null);
      setUploadClientId('');
      setUploadCategory('Autre');
      setUploadIsShared(false);
    } catch (err) {
      console.error("Erreur d'upload :", err);
      alert("Erreur lors de l'enregistrement du document.");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDeleteDocument = (doc: CrmDocument) => {
    confirm({
      title: 'Supprimer le document',
      message: `Voulez-vous vraiment supprimer "${doc.name}" ? Cette action est définitive.`,
      confirmLabel: 'Supprimer',
      variant: 'danger',
      onConfirm: () => deleteCrmDocument(doc.id)
    });
  };

  const formatSize = (bytes: number) => {
    if (bytes > 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / 1024).toFixed(1) + ' KB';
  };

  const getClientName = (id?: string) => clients.find(c => c.id === id)?.name;

  return (
    <div className="dashboard">
      <div className="doc-manager-header">
        <div>
          <h2>Gestion Électronique des Documents (GED)</h2>
          <p style={{ color: 'var(--color-text-muted)', margin: '4px 0 0' }}>
            Classement sécurisé, dossiers personnalisés et pièces jointes des clients
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          {isAdmin && activeTab === 'MY_DOCS' && (
            <select 
              className="table-input" 
              value={selectedUserId} 
              onChange={e => { setSelectedUserId(e.target.value); setCurrentFolderId(undefined); }}
              style={{ minWidth: '190px' }}
            >
              <option value="">Tous les collaborateurs</option>
              {users.map(u => (
                <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
              ))}
            </select>
          )}

          <button className="btn-new-folder" onClick={() => setShowFolderModal(true)}>
            <FolderPlus size={16} /> Nouveau dossier
          </button>

          <button className="btn btn-primary" onClick={() => fileInputRef.current?.click()} disabled={isUploading}>
            <Upload size={16} style={{ marginRight: '6px' }} /> {isUploading ? 'Upload en cours...' : 'Ajouter un document'}
          </button>
          <input type="file" ref={fileInputRef} style={{ display: 'none' }} onChange={handleFileSelect} />
        </div>
      </div>

      {/* Tabs */}
      <div className="doc-manager-tabs">
        <button
          className={`doc-tab-btn ${activeTab === 'MY_DOCS' ? 'active' : ''}`}
          onClick={() => { setActiveTab('MY_DOCS'); setCurrentFolderId(undefined); }}
        >
          <UserIcon size={16} /> Mes Documents Personnels
        </button>

        <button
          className={`doc-tab-btn ${activeTab === 'SHARED' ? 'active' : ''}`}
          onClick={() => { setActiveTab('SHARED'); setCurrentFolderId(undefined); }}
        >
          <Share2 size={16} /> Documents Partagés Entreprise
        </button>
      </div>

      {/* Search and Filters Bar */}
      <div className="doc-search-bar">
        <div style={{ position: 'relative', flex: 1, minWidth: '220px' }}>
          <Search size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
          <input
            type="text"
            className="table-input"
            style={{ width: '100%', paddingLeft: '32px' }}
            placeholder="Rechercher un document par mot-clé..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>

        <select
          className="table-input"
          style={{ maxWidth: '200px' }}
          value={categoryFilter}
          onChange={e => setCategoryFilter(e.target.value)}
        >
          <option value="">Toutes les catégories</option>
          {CATEGORIES.map(cat => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>
      </div>

      {/* Breadcrumbs Navigation */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '16px', fontSize: '0.875rem', flexWrap: 'wrap' }}>
        {breadcrumbs.map((crumb, idx) => (
          <React.Fragment key={crumb.id || 'root'}>
            <span
              onClick={() => setCurrentFolderId(crumb.id)}
              style={{
                cursor: 'pointer',
                color: idx === breadcrumbs.length - 1 ? '#0F172A' : (crumb.color || 'var(--color-primary)'),
                fontWeight: idx === breadcrumbs.length - 1 ? 700 : 500
              }}
            >
              {crumb.name}
            </span>
            {idx < breadcrumbs.length - 1 && <ChevronRight size={14} color="#94A3B8" />}
          </React.Fragment>
        ))}
      </div>

      {/* Main Files & Folders Table */}
      <div className="card">
        <div className="table-responsive">
          <table className="data-table responsive-table">
            <thead>
              <tr>
                <th>Nom</th>
                <th>Catégorie / Type</th>
                <th>Rattachement</th>
                <th>Date d'ajout</th>
                <th>Taille</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {/* Folders */}
              {currentLevelFolders.map(folder => {
                const subItemsCount = crmFolders.filter(f => f.parentId === folder.id).length + crmDocuments.filter(d => d.folderId === folder.id).length;
                const folderColor = folder.color || '#1879C8';

                return (
                  <tr key={folder.id} style={{ cursor: 'pointer' }} onClick={() => setCurrentFolderId(folder.id)}>
                    <td data-label="Nom" style={{ fontWeight: 600, color: '#0F172A' }}>
                      <span
                        className="doc-folder-icon-wrapper"
                        style={{ backgroundColor: `${folderColor}18`, color: folderColor }}
                      >
                        <Folder size={18} fill={folderColor} />
                      </span>
                      <span>{folder.name}</span>
                    </td>

                    <td data-label="Type">
                      <span className="badge-status bg-info" style={{ backgroundColor: `${folderColor}15`, color: folderColor }}>
                        Dossier ({subItemsCount} éléments)
                      </span>
                    </td>

                    <td data-label="Rattachement">
                      {folder.isShared ? (
                        <span className="badge-status bg-success" style={{ fontSize: '0.75rem' }}>
                          <Share2 size={12} style={{ display: 'inline', marginRight: '3px' }} /> Partagé Entreprise
                        </span>
                      ) : (
                        <span style={{ fontSize: '0.8rem', color: '#64748B' }}>Personnel</span>
                      )}
                    </td>

                    <td data-label="Date">
                      {new Date(folder.createdAt).toLocaleDateString('fr-FR')}
                    </td>

                    <td data-label="Taille">-</td>

                    <td data-label="Actions" onClick={e => e.stopPropagation()}>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button
                          className="icon-button"
                          style={{ color: folderColor }}
                          onClick={e => startEditFolder(folder, e)}
                          title="Modifier le dossier (nom et couleur)"
                        >
                          <Edit2 size={15} />
                        </button>

                        <button
                          className="icon-button text-error"
                          onClick={e => handleDeleteFolder(folder, e)}
                          title="Supprimer le dossier"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {/* Documents */}
              {currentLevelDocuments.map(doc => {
                const clientName = getClientName(doc.clientId);
                const fileName = doc.name.toLowerCase();
                const fileType = doc.type.toLowerCase();
                const isPdf = fileType.includes('pdf') || fileName.endsWith('.pdf');
                const isImage = fileType.startsWith('image/') || /\.(png|jpe?g|webp|gif|svg|bmp|ico)$/i.test(fileName);
                const isDocx = fileName.endsWith('.docx') || fileType.includes('wordprocessingml');
                const isDoc = (fileName.endsWith('.doc') || fileType === 'application/msword') && !isDocx;
                const isExcel = fileName.endsWith('.xlsx') || fileName.endsWith('.xls') || fileType.includes('spreadsheetml') || fileType.includes('excel');
                const isCsv = (fileType.includes('csv') || /\.(csv|tsv)$/i.test(fileName)) && !isExcel;
                const isMarkdown = fileName.endsWith('.md') || fileName.endsWith('.markdown');
                const isTextOrCode =
                  !isPdf &&
                  !isImage &&
                  !isDocx &&
                  !isDoc &&
                  !isExcel &&
                  (
                    isMarkdown ||
                    isCsv ||
                    fileType.startsWith('text/') ||
                    fileType === 'application/json' ||
                    fileType === 'application/xml' ||
                    fileType === 'text/xml' ||
                    /\.(txt|json|xml|html|htm|css|js|jsx|ts|tsx|log|env|sql|yml|yaml|ini|config|sh|bat)$/i.test(fileName)
                  );
                const isEditable = isTextOrCode || isCsv;

                return (
                  <tr key={doc.id}>
                    <td data-label="Nom">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {isPdf && <FileText size={18} color="#1879C8" />}
                        {isImage && <ImageIcon size={18} color="#3B82F6" />}
                        {(isDocx || isDoc) && <FileText size={18} color="#2563EB" />}
                        {isExcel && <TableIcon size={18} color="#16A34A" />}
                        {isCsv && !isExcel && <TableIcon size={18} color="#10B981" />}
                        {isTextOrCode && !isCsv && <Code size={18} color="#6366F1" />}
                        {!isPdf && !isImage && !isDocx && !isDoc && !isExcel && !isTextOrCode && <FileText size={18} color="#64748B" />}

                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontWeight: 600, cursor: 'pointer' }} onClick={() => setPreviewDoc(doc)}>
                            {doc.name}
                          </span>
                          {isDocx && (
                            <span style={{ fontSize: '0.7rem', color: '#2563EB', fontWeight: 500 }}>
                              • Document Word
                            </span>
                          )}
                          {isExcel && (
                            <span style={{ fontSize: '0.7rem', color: '#16A34A', fontWeight: 500 }}>
                              • Feuille Excel
                            </span>
                          )}
                          {isEditable && (
                            <span style={{ fontSize: '0.7rem', color: '#1879C8', fontWeight: 500 }}>
                              • Modifiable en ligne
                            </span>
                          )}
                        </div>
                      </div>
                    </td>

                    <td data-label="Catégorie">
                      <span className="badge-status bg-primary" style={{ fontSize: '0.78rem' }}>
                        {doc.category || 'Autre'}
                      </span>
                    </td>

                    <td data-label="Rattachement">
                      <div style={{ fontSize: '0.8rem', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        {clientName && (
                          <span style={{ color: '#64748B' }}>
                            <Building size={12} style={{ display: 'inline', marginRight: '3px' }} />
                            {clientName}
                          </span>
                        )}
                        {!clientName && <span style={{ color: '#94A3B8' }}>-</span>}
                      </div>
                    </td>

                    <td data-label="Date">
                      {new Date(doc.createdAt).toLocaleDateString('fr-FR')}
                    </td>

                    <td data-label="Taille">
                      {formatSize(doc.sizeBytes)}
                    </td>

                    <td data-label="Actions">
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button
                          className="icon-button text-teal-700"
                          onClick={() => setPreviewDoc(doc)}
                          title={isEditable ? 'Aperçu et modification du contenu' : 'Aperçu du document'}
                        >
                          {isEditable ? <Edit3 size={16} /> : <Eye size={16} />}
                        </button>

                        <button
                          className="icon-button text-indigo-600"
                          onClick={() => setEditingDoc(doc)}
                          title="Propriétés & Remplacement de fichier"
                        >
                          <Settings size={15} />
                        </button>

                        <button
                          className="icon-button text-blue-600"
                          onClick={() => downloadCrmDocument(doc)}
                          title="Télécharger"
                        >
                          <Download size={16} />
                        </button>

                        <button
                          className="icon-button text-error"
                          onClick={() => handleDeleteDocument(doc)}
                          title="Supprimer"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {currentLevelFolders.length === 0 && currentLevelDocuments.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '40px', color: 'var(--color-text-muted)' }}>
                    <Folder size={36} style={{ opacity: 0.35, marginBottom: '8px' }} />
                    <div>Aucun document ou dossier trouvé dans cet espace.</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal : Nouveau Dossier avec Palette de Couleurs */}
      {showFolderModal && (
        <div className="commission-modal-backdrop" onClick={() => setShowFolderModal(false)}>
          <div className="commission-modal-container" onClick={e => e.stopPropagation()} style={{ maxWidth: '460px' }}>
            <div className="commission-modal-header">
              <div className="commission-modal-title">
                <FolderPlus size={20} color={newFolderColor} />
                <span>Nouveau dossier</span>
              </div>
            </div>

            <form onSubmit={handleCreateFolder}>
              <div className="commission-modal-body">
                <div>
                  <label className="report-field-label">Nom du dossier *</label>
                  <input
                    type="text"
                    className="table-input"
                    placeholder="Ex: Contrats 2026, Factures SODECI..."
                    autoFocus
                    required
                    value={newFolderName}
                    onChange={e => setNewFolderName(e.target.value)}
                  />
                </div>

                <div>
                  <label className="report-field-label">Couleur distinctive de l'icône</label>
                  <div className="doc-color-palette">
                    {FOLDER_COLORS.map(c => (
                      <div
                        key={c.hex}
                        className={`doc-color-swatch ${newFolderColor === c.hex ? 'selected' : ''}`}
                        style={{ backgroundColor: c.hex }}
                        onClick={() => setNewFolderColor(c.hex)}
                        title={c.name}
                      />
                    ))}
                  </div>
                  <div style={{ marginTop: '8px', fontSize: '0.8rem', color: '#64748B' }}>
                    Couleur sélectionnée : <strong style={{ color: newFolderColor }}>{FOLDER_COLORS.find(c => c.hex === newFolderColor)?.name}</strong>
                  </div>
                </div>

                {isAdmin && activeTab !== 'SHARED' && (
                  <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input
                      type="checkbox"
                      id="sharedCheckbox"
                      checked={newFolderIsShared}
                      onChange={e => setNewFolderIsShared(e.target.checked)}
                    />
                    <label htmlFor="sharedCheckbox" style={{ fontSize: '0.85rem', cursor: 'pointer' }}>
                      Rendre ce dossier accessible à toute l'équipe (Partagé Entreprise)
                    </label>
                  </div>
                )}
              </div>

              <div className="commission-modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowFolderModal(false)}>
                  Annuler
                </button>
                <button type="submit" className="btn btn-primary" disabled={!newFolderName.trim()}>
                  Créer le dossier
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal : Modifier Dossier (Nom & Couleur) */}
      {editingFolder && (
        <div className="commission-modal-backdrop" onClick={() => setEditingFolder(null)}>
          <div className="commission-modal-container" onClick={e => e.stopPropagation()} style={{ maxWidth: '460px' }}>
            <div className="commission-modal-header">
              <div className="commission-modal-title">
                <Edit2 size={20} color={editFolderColor} />
                <span>Modifier le dossier : {editingFolder.name}</span>
              </div>
            </div>

            <form onSubmit={handleSaveEditFolder}>
              <div className="commission-modal-body">
                <div>
                  <label className="report-field-label">Nom du dossier *</label>
                  <input
                    type="text"
                    className="table-input"
                    required
                    value={editFolderName}
                    onChange={e => setEditFolderName(e.target.value)}
                  />
                </div>

                <div>
                  <label className="report-field-label">Couleur distinctive</label>
                  <div className="doc-color-palette">
                    {FOLDER_COLORS.map(c => (
                      <div
                        key={c.hex}
                        className={`doc-color-swatch ${editFolderColor === c.hex ? 'selected' : ''}`}
                        style={{ backgroundColor: c.hex }}
                        onClick={() => setEditFolderColor(c.hex)}
                        title={c.name}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <div className="commission-modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setEditingFolder(null)}>
                  Annuler
                </button>
                <button type="submit" className="btn btn-primary" disabled={!editFolderName.trim()}>
                  Sauvegarder
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal : Enrichissement Upload Document (Rattachement & Catégorie) */}
      {showUploadModal && uploadFile && (
        <div className="commission-modal-backdrop" onClick={() => setShowUploadModal(false)}>
          <div className="commission-modal-container" onClick={e => e.stopPropagation()} style={{ maxWidth: '540px' }}>
            <div className="commission-modal-header">
              <div className="commission-modal-title">
                <Upload size={20} color="#1879C8" />
                <span>Enregistrer le document</span>
              </div>
            </div>

            <form onSubmit={handleConfirmUpload}>
              <div className="commission-modal-body">
                <div style={{ background: '#F8FAFC', padding: '10px 14px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                  <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{uploadFile.name}</div>
                  <div style={{ fontSize: '0.8rem', color: '#64748B' }}>
                    Taille : {formatSize(uploadFile.size)} • Type : {uploadFile.type || 'Fichier'}
                  </div>
                </div>

                <div>
                  <label className="report-field-label">Catégorie métier *</label>
                  <select
                    className="table-input"
                    value={uploadCategory}
                    onChange={e => setUploadCategory(e.target.value as any)}
                  >
                    {CATEGORIES.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="report-field-label">Rattacher à un Client (optionnel)</label>
                  <select
                    className="table-input"
                    value={uploadClientId}
                    onChange={e => setUploadClientId(e.target.value)}
                  >
                    <option value="">Aucun client spécifique</option>
                    {clients.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                {isAdmin && activeTab !== 'SHARED' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input
                      type="checkbox"
                      id="docSharedCheckbox"
                      checked={uploadIsShared}
                      onChange={e => setUploadIsShared(e.target.checked)}
                    />
                    <label htmlFor="docSharedCheckbox" style={{ fontSize: '0.85rem', cursor: 'pointer' }}>
                      Partager ce document avec toute l'équipe (Espace Partagé)
                    </label>
                  </div>
                )}
              </div>

              <div className="commission-modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowUploadModal(false)}>
                  Annuler
                </button>
                <button type="submit" className="btn btn-primary" disabled={isUploading}>
                  {isUploading ? 'Enregistrement...' : 'Valider & Uploader'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Preview & Content Editor */}
      {previewDoc && (
        <DocumentPreviewModal
          document={previewDoc}
          onClose={() => setPreviewDoc(null)}
        />
      )}

      {/* Modal Properties & File Replacement */}
      {editingDoc && (
        <DocumentEditorModal
          document={editingDoc}
          onClose={() => setEditingDoc(null)}
        />
      )}
    </div>
  );
}
