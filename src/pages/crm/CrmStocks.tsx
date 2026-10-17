import React, { useState } from 'react';
import { Plus, Search, Edit2, Trash2, Package, AlertTriangle, TrendingUp, DollarSign, ArrowUpDown, Filter, History } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { useAppContext } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { useConfirm } from '../../components/ConfirmModal';
import type { CatalogueArticle } from '../../types/crmModules';

interface ArticleFormData {
  code_article: string;
  designation: string;
  categorie: string;
  // Stockés en string pour permettre la suppression totale du contenu
  // (un number contrôlé force le retour du "0" et empêche l'effacement).
  quantite_stock: string;
  seuil_alerte: string;
  cout_unitaire_achat: string;
  prix_unitaire_vente: string;
}

export function CrmStocks() {
  const { crmArticles, crmStockMouvements, users, addCrmArticle, updateCrmArticle, deleteCrmArticle, addCrmStockMouvement } = useAppContext();
  const { currentUser: authUser } = useAuth();
  const currentUser = users.find(u => u.id === authUser?.id) || authUser;
  const isDirecteur = ['Directeur', 'Directeur adjoint', 'SuperAdmin'].includes(currentUser?.role || '');
  const { confirm } = useConfirm();

  // Propriété alignée sur le RLS serveur (auteur ou Direction) : sans elle,
  // l'édition locale est rejetée côté serveur (42501) et l'objet « revient ».
  // Les lignes historiques sans auteur sont réservées à la Direction.
  const canManageArticle = (art: Pick<CatalogueArticle, 'cree_par'>) =>
    isDirecteur || (!!art.cree_par && art.cree_par === currentUser?.id);

  const [searchTerm, setSearchTerm] = useState('');
  const [filterAlertOnly, setFilterAlertOnly] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [showModal, setShowModal] = useState(false);
  const [editingArticle, setEditingArticle] = useState<CatalogueArticle | null>(null);

  // Quick adjust modal
  const [adjustingArticle, setAdjustingArticle] = useState<CatalogueArticle | null>(null);
  const [adjustQty, setAdjustQty] = useState<string>('0');
  const [adjustMotif, setAdjustMotif] = useState<string>('');
  // History modal (journal des mouvements, lecture seule)
  const [historyArticle, setHistoryArticle] = useState<CatalogueArticle | null>(null);

  const [formData, setFormData] = useState<ArticleFormData>({
    code_article: '',
    designation: '',
    categorie: 'Consommable',
    quantite_stock: '',
    seuil_alerte: '5',
    cout_unitaire_achat: '',
    prix_unitaire_vente: ''
  });

  const categories = Array.from(new Set(crmArticles.map(a => a.categorie || 'Général')));

  const filteredArticles = crmArticles.filter(a => {
    const matchesSearch =
      (a.code_article || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (a.designation || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (a.categorie || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesAlert = !filterAlertOnly || (a.quantite_stock || 0) <= (a.seuil_alerte || 5);
    const matchesCat = categoryFilter === 'ALL' || a.categorie === categoryFilter;
    return matchesSearch && matchesAlert && matchesCat;
  });

  // Financial Valuations
  const valAchatTotal = crmArticles.reduce((sum, a) => sum + (a.quantite_stock || 0) * (a.cout_unitaire_achat || 0), 0);
  const valVenteTotal = crmArticles.reduce((sum, a) => sum + (a.quantite_stock || 0) * (a.prix_unitaire_vente || 0), 0);
  const margePotentielle = valVenteTotal - valAchatTotal;
  const alertesCount = crmArticles.filter(a => (a.quantite_stock || 0) <= (a.seuil_alerte || 5)).length;

  const handleOpenAdd = () => {
    setEditingArticle(null);
    const seq = (crmArticles.length + 1).toString().padStart(3, '0');
    setFormData({
      code_article: `ART-${seq}`,
      designation: '',
      categorie: 'Consommable',
      quantite_stock: '',
      seuil_alerte: '5',
      cout_unitaire_achat: '',
      prix_unitaire_vente: ''
    });
    setShowModal(true);
  };

  const handleOpenEdit = (art: CatalogueArticle) => {
    setEditingArticle(art);
    // Normaliser en strings (permet l'effacement complet dans les inputs)
    setFormData({
      code_article: art.code_article ?? '',
      designation: art.designation ?? '',
      categorie: art.categorie || 'Consommable',
      quantite_stock: art.quantite_stock !== undefined && art.quantite_stock !== null ? String(art.quantite_stock) : '',
      seuil_alerte: art.seuil_alerte !== undefined && art.seuil_alerte !== null ? String(art.seuil_alerte) : '5',
      cout_unitaire_achat: art.cout_unitaire_achat !== undefined && art.cout_unitaire_achat !== null ? String(art.cout_unitaire_achat) : '',
      prix_unitaire_vente: art.prix_unitaire_vente !== undefined && art.prix_unitaire_vente !== null ? String(art.prix_unitaire_vente) : ''
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.designation?.trim() || !formData.code_article?.trim()) {
      alert('Veuillez saisir le code et la désignation.');
      return;
    }

    const toNumber = (v: string, fallback: number) => {
      if (v === undefined || v === null || String(v).trim() === '') return fallback;
      const n = Number(String(v).replace(',', '.'));
      return Number.isNaN(n) ? fallback : n;
    };

    const payload: CatalogueArticle = {
      id: editingArticle ? editingArticle.id : uuidv4(),
      code_article: formData.code_article.trim().toUpperCase(),
      designation: formData.designation.trim(),
      categorie: formData.categorie?.trim() || 'Général',
      quantite_stock: Math.max(0, toNumber(formData.quantite_stock, 0)),
      seuil_alerte: Math.max(0, toNumber(formData.seuil_alerte, 5)),
      cout_unitaire_achat: Math.max(0, toNumber(formData.cout_unitaire_achat, 0)),
      prix_unitaire_vente: Math.max(0, toNumber(formData.prix_unitaire_vente, 0)),
      cree_par: editingArticle ? editingArticle.cree_par : currentUser?.id,
      cree_par_nom: editingArticle ? editingArticle.cree_par_nom : currentUser?.name
    };

    if (editingArticle) {
      if (!canManageArticle(editingArticle)) {
        alert('Modification réservée à l\'auteur de la fiche ou à la Direction.');
        return;
      }
      await updateCrmArticle(editingArticle.id, payload);
      // Journal : toute variation de stock issue de la fiche est tracée.
      const avant = Number(editingArticle.quantite_stock) || 0;
      if (payload.quantite_stock !== avant) {
        await addCrmStockMouvement({
          article_id: editingArticle.id,
          article_code: payload.code_article,
          type: 'AJUSTEMENT',
          quantite: Math.abs(payload.quantite_stock - avant),
          stock_avant: avant,
          stock_apres: payload.quantite_stock,
          motif: 'Modification fiche article'
        });
      }
    } else {
      await addCrmArticle(payload);
      // Journal : stock initial (avant = 0). Rien si créé à 0.
      if (payload.quantite_stock > 0) {
        await addCrmStockMouvement({
          article_id: payload.id,
          article_code: payload.code_article,
          type: 'CREATION',
          quantite: payload.quantite_stock,
          stock_avant: 0,
          stock_apres: payload.quantite_stock,
          motif: 'Stock initial'
        });
      }
    }
    setShowModal(false);
  };

  const handleDelete = (art: CatalogueArticle) => {
    if (!canManageArticle(art)) {
      alert('Suppression réservée à l\'auteur de la fiche ou à la Direction.');
      return;
    }
    confirm({
      title: 'Supprimer l\'article',
      message: `Êtes-vous sûr de vouloir supprimer l'article ${art.code_article} (${art.designation}) ?`,
      confirmLabel: 'Supprimer',
      onConfirm: () => deleteArticle(art)
    });
  };

  const deleteArticle = async (art: CatalogueArticle) => {
    // Journal : trace de sortie avant suppression (l'article disparaît, le mouvement reste).
    const avant = Number(art.quantite_stock) || 0;
    if (avant > 0) {
      await addCrmStockMouvement({
        article_id: art.id,
        article_code: art.code_article,
        type: 'SUPPRESSION',
        quantite: avant,
        stock_avant: avant,
        stock_apres: 0,
        motif: 'Suppression article'
      });
    }
    await deleteCrmArticle(art.id);
  };

  const handleOpenAdjust = (art: CatalogueArticle) => {
    if (!canManageArticle(art)) {
      alert('Ajustement réservé à l\'auteur de la fiche ou à la Direction.');
      return;
    }
    setAdjustingArticle(art);
    setAdjustQty(art.quantite_stock !== undefined && art.quantite_stock !== null ? String(art.quantite_stock) : '0');
    setAdjustMotif('');
  };

  const handleSaveAdjust = async () => {
    if (!adjustingArticle) return;
    if (!canManageArticle(adjustingArticle)) {
      alert('Ajustement réservé à l\'auteur de la fiche ou à la Direction.');
      return;
    }
    const raw = String(adjustQty ?? '').trim();
    const finalQty = raw === '' ? 0 : Math.max(0, Number(raw.replace(',', '.')) || 0);
    const avant = Number(adjustingArticle.quantite_stock) || 0;
    await updateCrmArticle(adjustingArticle.id, { quantite_stock: finalQty });
    // Journal : toute variation (même vers 0) est tracée avec son motif.
    if (finalQty !== avant) {
      await addCrmStockMouvement({
        article_id: adjustingArticle.id,
        article_code: adjustingArticle.code_article,
        type: 'AJUSTEMENT',
        quantite: Math.abs(finalQty - avant),
        stock_avant: avant,
        stock_apres: finalQty,
        motif: adjustMotif.trim() || 'Ajustement manuel'
      });
    }
    setAdjustingArticle(null);
  };

  if (!isDirecteur && currentUser?.crmStocksEnabled === false) {
    return (
      <div className="dashboard" style={{ textAlign: 'center', padding: '60px 20px' }}>
        <Package size={48} color="var(--color-error)" style={{ margin: '0 auto 16px' }} />
        <h2>Module Stocks non activé</h2>
        <p style={{ color: 'var(--color-text-muted)' }}>
          Ce module n'est pas activé sur votre profil utilisateur. Veuillez contacter la Direction.
        </p>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2>Stocks & Consommables Métier</h2>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', marginTop: '4px' }}>
            Suivi quantitatif, valorisation financière de l'inventaire en temps réel et alertes de réapprovisionnement.
          </p>
        </div>
        <button className="btn btn-primary" onClick={handleOpenAdd}>
          <Plus size={16} style={{ marginRight: '8px' }} /> Nouvel Article
        </button>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        <div className="card" style={{ padding: '16px' }}>
          <div style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem', marginBottom: '4px' }}>Valorisation Achat</div>
          <div style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--color-text)' }}>
            {valAchatTotal.toLocaleString('fr-FR')} FCFA
          </div>
        </div>

        <div className="card" style={{ padding: '16px' }}>
          <div style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem', marginBottom: '4px' }}>Valorisation Vente Potentielle</div>
          <div style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--color-primary)' }}>
            {valVenteTotal.toLocaleString('fr-FR')} FCFA
          </div>
        </div>

        <div className="card" style={{ padding: '16px', borderLeft: '4px solid #10B981' }}>
          <div style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem', marginBottom: '4px' }}>Marge Potentielle Stock</div>
          <div style={{ fontSize: '1.35rem', fontWeight: 700, color: '#10B981' }}>
            {margePotentielle.toLocaleString('fr-FR')} FCFA
          </div>
        </div>

        <div className="card" style={{ padding: '16px', borderLeft: `4px solid ${alertesCount > 0 ? '#EF4444' : '#10B981'}` }}>
          <div style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem', marginBottom: '4px' }}>Ruptures & Alertes Seuil</div>
          <div style={{ fontSize: '1.35rem', fontWeight: 700, color: alertesCount > 0 ? '#EF4444' : '#10B981' }}>
            {alertesCount} article(s)
          </div>
        </div>
      </div>

      {/* Filter / Search Bar */}
      <div className="card" style={{ marginBottom: '20px', padding: '12px 16px', display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: '220px' }}>
          <Search size={18} color="var(--color-text-muted)" />
          <input
            type="text"
            placeholder="Rechercher par code, désignation, catégorie..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            style={{
              flex: 1,
              border: 'none',
              outline: 'none',
              background: 'transparent',
              fontSize: '0.9rem',
              color: 'var(--color-text)'
            }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <select
            className="table-input"
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
            style={{ padding: '4px 8px', fontSize: '0.85rem', width: 'auto' }}
          >
            <option value="ALL">Toutes les catégories</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>

          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 500, color: alertesCount > 0 ? '#EF4444' : 'inherit' }}>
            <input
              type="checkbox"
              checked={filterAlertOnly}
              onChange={e => setFilterAlertOnly(e.target.checked)}
            />
            <span>Alertes Stock uniquement</span>
          </label>
        </div>
      </div>

      {/* Table */}
      <div className="card">
        <div className="table-responsive">
          <table className="data-table responsive-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Désignation & Catégorie</th>
                <th style={{ textAlign: 'center' }}>En Stock</th>
                <th style={{ textAlign: 'center' }}>Seuil Alerte</th>
                <th style={{ textAlign: 'right' }}>Coût Unit. Achat</th>
                <th style={{ textAlign: 'right' }}>Prix Unit. Vente</th>
                <th style={{ textAlign: 'right' }}>Marge Unit.</th>
                <th style={{ textAlign: 'right' }}>Val. Stock Achat</th>
                <th>État Stock</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredArticles.map(art => {
                const qty = art.quantite_stock || 0;
                const isAlert = qty <= (art.seuil_alerte || 5);
                // Rupture : stock épuisé ou incohérent (<= 0) — un négatif hérité reste signalé rupture
                const isRupture = qty <= 0;
                const totalValAchat = (art.quantite_stock || 0) * (art.cout_unitaire_achat || 0);
                const coutAchat = art.cout_unitaire_achat || 0;
                const prixVente = art.prix_unitaire_vente || 0;
                const margeUnitaire = prixVente - coutAchat;
                const tauxMarge = coutAchat > 0 ? (margeUnitaire / coutAchat) * 100 : (prixVente > 0 ? 100 : 0);

                return (
                  <tr key={art.id}>
                    <td data-label="Code">
                      <strong style={{ color: 'var(--color-primary)' }}>{art.code_article}</strong>
                    </td>
                    <td data-label="Désignation">
                      <div style={{ fontWeight: 600 }}>{art.designation}</div>
                      <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{art.categorie || 'Général'}</span>
                    </td>
                    <td data-label="En Stock" style={{ textAlign: 'center' }}>
                      <strong style={{ fontSize: '1rem', color: isAlert ? '#EF4444' : 'inherit' }}>
                        {art.quantite_stock || 0}
                      </strong>
                    </td>
                    <td data-label="Seuil Alerte" style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>
                      {art.seuil_alerte || 5}
                    </td>
                    <td data-label="Coût Achat" style={{ textAlign: 'right' }}>
                      {(art.cout_unitaire_achat || 0).toLocaleString('fr-FR')} FCFA
                    </td>
                    <td data-label="Prix Vente" style={{ textAlign: 'right', fontWeight: 600 }}>
                      {(art.prix_unitaire_vente || 0).toLocaleString('fr-FR')} FCFA
                    </td>
                    <td data-label="Marge Unit." style={{ textAlign: 'right', fontWeight: 600, color: margeUnitaire > 0 ? '#10B981' : margeUnitaire < 0 ? '#EF4444' : 'var(--color-text-muted)' }}>
                      <div>{margeUnitaire.toLocaleString('fr-FR')} FCFA</div>
                      <span style={{ fontSize: '0.75rem', fontWeight: 500 }}>
                        {tauxMarge.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %
                      </span>
                    </td>
                    <td data-label="Val. Achat" style={{ textAlign: 'right', color: '#2563EB', fontWeight: 600 }}>
                      {totalValAchat.toLocaleString('fr-FR')} FCFA
                    </td>
                    <td data-label="État">
                      {isRupture ? (
                        <span className="badge-status bg-error" style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                          <AlertTriangle size={11} /> Rupture
                        </span>
                      ) : isAlert ? (
                        <span className="badge-status" style={{ background: 'rgba(234, 179, 8, 0.15)', color: '#CA8A04', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                          <AlertTriangle size={11} /> Alerte stock
                        </span>
                      ) : (
                        <span className="badge-status bg-success">Normal</span>
                      )}
                    </td>
                    <td data-label="Actions">
                      <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                        <button
                          className="icon-button"
                          title="Historique des mouvements"
                          onClick={() => setHistoryArticle(art)}
                          style={{ color: 'var(--color-text-muted)' }}
                        >
                          <History size={14} />
                        </button>
                        {canManageArticle(art) ? (
                          <>
                            <button
                              className="btn btn-secondary"
                              style={{ padding: '3px 8px', fontSize: '11px' }}
                              title="Ajuster le niveau de stock"
                              onClick={() => handleOpenAdjust(art)}
                            >
                              <ArrowUpDown size={12} style={{ marginRight: '2px' }} /> Ajuster
                            </button>
                            <button className="icon-button" title="Modifier" onClick={() => handleOpenEdit(art)} style={{ color: 'var(--color-primary)' }}>
                              <Edit2 size={14} />
                            </button>
                            <button className="icon-button text-error" title="Supprimer" onClick={() => handleDelete(art)}>
                              <Trash2 size={14} />
                            </button>
                          </>
                        ) : (
                          <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }} title="Fiche d'un autre auteur : modification réservée">
                            Lecture seule
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredArticles.length === 0 && (
                <tr>
                  <td colSpan={10} style={{ textAlign: 'center', padding: '32px', color: 'var(--color-text-muted)' }}>
                    Aucun article trouvé.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Ajout / Modification */}
      {showModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000, padding: '16px'
        }}>
          <div className="card" style={{ maxWidth: '540px', width: '100%', padding: '24px' }}>
            <h3 style={{ marginBottom: '16px' }}>
              {editingArticle ? `Modifier l'Article ${editingArticle.code_article}` : 'Nouvel Article / Consommable'}
            </h3>

            <form onSubmit={handleSubmit} className="responsive-form-grid">
              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>Code Article *</label>
                <input
                  type="text"
                  className="table-input"
                  value={formData.code_article || ''}
                  onChange={e => setFormData({ ...formData, code_article: e.target.value })}
                  placeholder="Ex: ART-001 ou CONS-TONER"
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>Catégorie</label>
                <input
                  type="text"
                  className="table-input"
                  value={formData.categorie || ''}
                  onChange={e => setFormData({ ...formData, categorie: e.target.value })}
                  placeholder="Ex: Consommable, Pièce Rechange, Câble"
                />
              </div>

              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>Désignation de l'article *</label>
                <input
                  type="text"
                  className="table-input"
                  value={formData.designation || ''}
                  onChange={e => setFormData({ ...formData, designation: e.target.value })}
                  placeholder="Ex: Cartouche Toner HP Laserjet 85A"
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>Quantité initiale en Stock</label>
                <input
                  type="number"
                  min="0"
                  className="table-input"
                  placeholder="0"
                  value={formData.quantite_stock}
                  onChange={e => setFormData({ ...formData, quantite_stock: e.target.value })}
                  onFocus={e => e.target.select()}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>Seuil d'alerte stock</label>
                <input
                  type="number"
                  min="0"
                  className="table-input"
                  placeholder="5"
                  value={formData.seuil_alerte}
                  onChange={e => setFormData({ ...formData, seuil_alerte: e.target.value })}
                  onFocus={e => e.target.select()}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>Coût Unitaire Achat (FCFA)</label>
                <input
                  type="number"
                  min="0"
                  className="table-input"
                  placeholder="0"
                  value={formData.cout_unitaire_achat}
                  onChange={e => setFormData({ ...formData, cout_unitaire_achat: e.target.value })}
                  onFocus={e => e.target.select()}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>Prix Unitaire Vente (FCFA)</label>
                <input
                  type="number"
                  min="0"
                  className="table-input"
                  placeholder="0"
                  value={formData.prix_unitaire_vente}
                  onChange={e => setFormData({ ...formData, prix_unitaire_vente: e.target.value })}
                  onFocus={e => e.target.select()}
                />
              </div>

              <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Annuler</button>
                <button type="submit" className="btn btn-primary">{editingArticle ? 'Enregistrer' : 'Créer l\'Article'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Ajustement Rapide de Stock */}
      {adjustingArticle && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000, padding: '16px'
        }}>
          <div className="card" style={{ maxWidth: '400px', width: '100%', padding: '24px' }}>
            <h3 style={{ marginBottom: '8px' }}>Ajuster le Stock</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginBottom: '16px' }}>
              Article : <strong>{adjustingArticle.designation}</strong> ({adjustingArticle.code_article})
            </p>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>Nouvelle Quantité en Stock</label>
              <input
                type="number"
                min="0"
                className="table-input"
                placeholder="0"
                value={adjustQty}
                onChange={e => setAdjustQty(e.target.value)}
                onFocus={e => e.target.select()}
                autoFocus
              />
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>Motif (tracé dans le journal)</label>
              <input
                type="text"
                className="table-input"
                placeholder="Ex : Inventaire, casse, réception fournisseur…"
                value={adjustMotif}
                onChange={e => setAdjustMotif(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button className="btn btn-secondary" onClick={() => setAdjustingArticle(null)}>Annuler</button>
              <button className="btn btn-primary" onClick={handleSaveAdjust}>Mettre à jour</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Historique des mouvements (journal, lecture seule) */}
      {historyArticle && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000, padding: '16px'
        }}>
          <div className="card" style={{ maxWidth: '620px', width: '100%', padding: '24px', maxHeight: '80vh', overflowY: 'auto' }}>
            <h3 style={{ marginBottom: '4px' }}>Journal des mouvements</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginBottom: '16px' }}>
              <strong>{historyArticle.designation}</strong> ({historyArticle.code_article}) — stock actuel : <strong>{historyArticle.quantite_stock || 0}</strong>
            </p>
            {(() => {
              const moves = crmStockMouvements
                .filter(m => m.article_id === historyArticle.id)
                .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
              const typeStyle: Record<string, { bg: string; color: string; label: string }> = {
                CREATION: { bg: 'rgba(37, 99, 235, 0.12)', color: '#2563EB', label: 'Création' },
                ENTREE: { bg: 'rgba(16, 185, 129, 0.12)', color: '#10B981', label: 'Entrée' },
                SORTIE: { bg: 'rgba(239, 68, 68, 0.12)', color: '#DC2626', label: 'Sortie' },
                AJUSTEMENT: { bg: 'rgba(234, 179, 8, 0.15)', color: '#CA8A04', label: 'Ajustement' },
                SUPPRESSION: { bg: 'rgba(100, 116, 139, 0.15)', color: '#64748B', label: 'Suppression' }
              };
              if (moves.length === 0) {
                return <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>Aucun mouvement enregistré pour cet article (journal actif depuis cette version).</p>;
              }
              return (
                <table className="data-table" style={{ fontSize: '0.85rem' }}>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Type</th>
                      <th style={{ textAlign: 'right' }}>Avant → Après</th>
                      <th>Motif / Auteur</th>
                    </tr>
                  </thead>
                  <tbody>
                    {moves.map(m => {
                      const t = typeStyle[m.type] || typeStyle.AJUSTEMENT;
                      const delta = (m.stock_apres || 0) - (m.stock_avant || 0);
                      return (
                        <tr key={m.id}>
                          <td style={{ whiteSpace: 'nowrap' }}>
                            {m.created_at ? new Date(m.created_at).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                          </td>
                          <td><span className="badge-status" style={{ background: t.bg, color: t.color }}>{t.label}</span></td>
                          <td style={{ textAlign: 'right', fontWeight: 600 }}>
                            {m.stock_avant} → {m.stock_apres}{' '}
                            <span style={{ color: delta > 0 ? '#10B981' : delta < 0 ? '#EF4444' : 'var(--color-text-muted)' }}>
                              ({delta > 0 ? `+${delta}` : delta})
                            </span>
                          </td>
                          <td>
                            <div>{m.motif || '—'}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{m.cree_par_nom || ''}</div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              );
            })()}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
              <button className="btn btn-secondary" onClick={() => setHistoryArticle(null)}>Fermer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
