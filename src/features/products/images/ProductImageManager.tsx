import { useState, useMemo } from 'react';
import { 
  Camera, Image as ImageIcon, Search, Filter, Sparkles, 
  CheckCircle2, AlertCircle, RefreshCw, Upload, Play,
  Plus, Eye, Trash2, ArrowRight
} from 'lucide-react';
import type { PosProduct } from '../../../context/AppContext';
import { useAppContext } from '../../../context/AppContext';
import { formatFCFA } from '../../../lib/whatsappOrder';
import { ProductPhotoStudioModal } from './ProductPhotoStudioModal';
import { toast } from 'react-hot-toast';
import { matchesProductSearch } from '../../../lib/searchUtils';

export function ProductImageManager() {
  const { posProducts, posCategories, updatePosProduct, refreshData } = useAppContext();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');
  const [filterMode, setFilterMode] = useState<'all' | 'missing' | 'has_photo'>('all');
  
  // Modale Studio Photo
  const [studioProduct, setStudioProduct] = useState<PosProduct | null>(null);
  const [isStudioOpen, setIsStudioOpen] = useState(false);
  const [isShootingExpress, setIsShootingExpress] = useState(false);

  // Statistiques
  const activeProducts = useMemo(() => {
    return posProducts.filter(p => p.isActive !== false && p.status !== 'Inactive');
  }, [posProducts]);

  const totalCount = activeProducts.length;
  const withPhotoCount = activeProducts.filter(p => !!p.imageUrl).length;
  const missingPhotoCount = totalCount - withPhotoCount;
  const coveragePercent = totalCount > 0 ? Math.round((withPhotoCount / totalCount) * 100) : 0;

  // Filtrage des produits
  const filteredProducts = useMemo(() => {
    return activeProducts.filter(p => {
      // Filtre statut photo
      if (filterMode === 'missing' && !!p.imageUrl) return false;
      if (filterMode === 'has_photo' && !p.imageUrl) return false;

      // Filtre catégorie
      if (selectedCategoryId !== 'all' && p.categoryId !== selectedCategoryId) return false;

      // Recherche texte
      if (searchQuery.trim()) {
        return matchesProductSearch(p, searchQuery);
      }

      return true;
    });
  }, [activeProducts, filterMode, selectedCategoryId, searchQuery]);

  // Ouvrir le studio photo pour un produit
  const openStudio = (product: PosProduct) => {
    setStudioProduct(product);
    setIsStudioOpen(true);
  };

  // Lancer le shooting express (enchaîne les produits sans photo)
  const startExpressShooting = () => {
    const nextMissing = activeProducts.find(p => !p.imageUrl);
    if (!nextMissing) {
      toast.success('Félicitations ! Tous les articles ont déjà une photo HD.');
      return;
    }
    setIsShootingExpress(true);
    openStudio(nextMissing);
  };

  // Après enregistrement d'une photo
  const handleProductSaved = (updated: PosProduct) => {
    if (isShootingExpress) {
      // Trouver le prochain produit sans photo
      const nextMissing = activeProducts.find(p => p.id !== updated.id && !p.imageUrl);
      if (nextMissing) {
        setTimeout(() => {
          openStudio(nextMissing);
        }, 300);
      } else {
        setIsShootingExpress(false);
        toast.success('Shooting Express terminé ! Tous les produits sont photographiés.');
      }
    }
  };

  // Supprimer la photo d'un produit
  const handleDeletePhoto = async (product: PosProduct, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Supprimer la photo de "${product.name}" ?`)) return;

    try {
      await updatePosProduct(product.id, { imageUrl: '' });
      toast.success('Photo supprimée.');
    } catch (err) {
      toast.error('Erreur lors de la suppression de la photo.');
    }
  };

  return (
    <div style={{ padding: '20px', maxWidth: '1400px', margin: '0 auto' }}>
      {/* EN-TÊTE DE PAGE */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 800, color: '#0F172A', margin: '0 0 4px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>📸</span> Studio & Gestionnaire des Photos Produits
          </h1>
          <p style={{ fontSize: '13px', color: '#64748B', margin: 0 }}>
            Capturez des photos au smartphone ou téléversez des visuels améliorés automatiquement pour le catalogue public.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          {missingPhotoCount > 0 && (
            <button
              onClick={startExpressShooting}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                backgroundColor: '#0F766E',
                color: 'white',
                border: 'none',
                padding: '10px 18px',
                borderRadius: '12px',
                fontWeight: 700,
                fontSize: '13px',
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(15, 118, 110, 0.25)'
              }}
            >
              <Play size={16} fill="white" />
              <span>Shooting Express ({missingPhotoCount} sans photo)</span>
            </button>
          )}

          <button
            onClick={() => refreshData?.()}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: 'white',
              color: '#475569',
              border: '1px solid #CBD5E1',
              padding: '10px 14px',
              borderRadius: '12px',
              fontWeight: 600,
              fontSize: '13px',
              cursor: 'pointer'
            }}
            title="Rafraîchir les données"
          >
            <RefreshCw size={15} />
          </button>
        </div>
      </div>

      {/* KPI STATISTIQUES */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', marginBottom: '20px' }}>
        <div style={{ backgroundColor: 'white', padding: '16px', borderRadius: '16px', border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <span style={{ fontSize: '12px', color: '#64748B', fontWeight: 600 }}>Total Articles Actifs</span>
          <div style={{ fontSize: '24px', fontWeight: 800, color: '#0F172A', marginTop: '4px' }}>{totalCount}</div>
        </div>

        <div style={{ backgroundColor: 'white', padding: '16px', borderRadius: '16px', border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '12px', color: '#059669', fontWeight: 600 }}>Avec Photo HD</span>
            <CheckCircle2 size={16} color="#059669" />
          </div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: '#059669', marginTop: '4px' }}>
            {withPhotoCount} <span style={{ fontSize: '14px', fontWeight: 600, opacity: 0.8 }}>({coveragePercent}%)</span>
          </div>
        </div>

        <div style={{ backgroundColor: 'white', padding: '16px', borderRadius: '16px', border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '12px', color: missingPhotoCount > 0 ? '#D97706' : '#64748B', fontWeight: 600 }}>Sans Photo (À faire)</span>
            <AlertCircle size={16} color={missingPhotoCount > 0 ? '#D97706' : '#64748B'} />
          </div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: missingPhotoCount > 0 ? '#D97706' : '#64748B', marginTop: '4px' }}>
            {missingPhotoCount}
          </div>
        </div>
      </div>

      {/* BARRE DE FILTRES ET RECHERCHE */}
      <div style={{ backgroundColor: 'white', padding: '14px 16px', borderRadius: '16px', border: '1px solid #E2E8F0', marginBottom: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        {/* Onglets statut photo */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => setFilterMode('all')}
            style={{
              padding: '6px 14px',
              borderRadius: '20px',
              border: `1px solid ${filterMode === 'all' ? '#0F766E' : '#E2E8F0'}`,
              backgroundColor: filterMode === 'all' ? '#0F766E' : 'white',
              color: filterMode === 'all' ? 'white' : '#475569',
              fontWeight: 600,
              fontSize: '12px',
              cursor: 'pointer'
            }}
          >
            Tous ({totalCount})
          </button>

          <button
            onClick={() => setFilterMode('missing')}
            style={{
              padding: '6px 14px',
              borderRadius: '20px',
              border: `1px solid ${filterMode === 'missing' ? '#D97706' : '#E2E8F0'}`,
              backgroundColor: filterMode === 'missing' ? '#FEF3C7' : 'white',
              color: filterMode === 'missing' ? '#92400E' : '#475569',
              fontWeight: 700,
              fontSize: '12px',
              cursor: 'pointer'
            }}
          >
            ⚠️ Sans photo ({missingPhotoCount})
          </button>

          <button
            onClick={() => setFilterMode('has_photo')}
            style={{
              padding: '6px 14px',
              borderRadius: '20px',
              border: `1px solid ${filterMode === 'has_photo' ? '#059669' : '#E2E8F0'}`,
              backgroundColor: filterMode === 'has_photo' ? '#D1FAE5' : 'white',
              color: filterMode === 'has_photo' ? '#065F46' : '#475569',
              fontWeight: 600,
              fontSize: '12px',
              cursor: 'pointer'
            }}
          >
            📸 Avec photo ({withPhotoCount})
          </button>
        </div>

        {/* Recherche et Catégorie */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, maxWidth: '480px' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Search size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
            <input
              type="text"
              placeholder="Rechercher par titre, réf, code..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px 8px 32px',
                borderRadius: '10px',
                border: '1px solid #E2E8F0',
                fontSize: '13px',
                outline: 'none'
              }}
            />
          </div>

          <select
            value={selectedCategoryId}
            onChange={e => setSelectedCategoryId(e.target.value)}
            style={{
              padding: '8px 12px',
              borderRadius: '10px',
              border: '1px solid #E2E8F0',
              fontSize: '13px',
              color: '#475569',
              outline: 'none',
              backgroundColor: 'white'
            }}
          >
            <option value="all">Toutes catégories</option>
            {posCategories.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* GRILLE DES PRODUITS */}
      {filteredProducts.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', backgroundColor: 'white', borderRadius: '16px', border: '1px solid #E2E8F0' }}>
          <ImageIcon size={48} style={{ opacity: 0.3, marginBottom: '12px' }} />
          <h3 style={{ fontSize: '16px', color: '#1E293B', margin: '0 0 6px 0' }}>Aucun produit ne correspond à vos filtres</h3>
          <p style={{ fontSize: '13px', color: '#64748B', margin: 0 }}>Modifiez vos critères de recherche.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '16px' }}>
          {filteredProducts.map(product => {
            const hasPhoto = !!product.imageUrl;
            const category = posCategories.find(c => c.id === product.categoryId);

            return (
              <div
                key={product.id}
                onClick={() => openStudio(product)}
                style={{
                  backgroundColor: 'white',
                  borderRadius: '16px',
                  border: `1px solid ${hasPhoto ? '#E2E8F0' : '#FCD34D'}`,
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                  cursor: 'pointer',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                  transition: 'transform 0.15s, box-shadow 0.15s'
                }}
              >
                {/* Image ou Zone de Capture */}
                <div
                  style={{
                    width: '100%',
                    aspectRatio: '1 / 1',
                    backgroundColor: '#F8FAFC',
                    position: 'relative',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden'
                  }}
                >
                  {hasPhoto ? (
                    <img
                      src={product.imageUrl}
                      alt={product.name}
                      style={{ width: '100%', height: '100%', objectFit: 'contain', padding: '8px' }}
                      loading="lazy"
                    />
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', color: '#D97706' }}>
                      <Camera size={32} />
                      <span style={{ fontSize: '11px', fontWeight: 700 }}>Prendre photo</span>
                    </div>
                  )}

                  {/* Badge statut */}
                  <span
                    style={{
                      position: 'absolute',
                      top: '8px',
                      left: '8px',
                      padding: '2px 8px',
                      borderRadius: '6px',
                      fontSize: '10px',
                      fontWeight: 700,
                      backgroundColor: hasPhoto ? '#D1FAE5' : '#FEF3C7',
                      color: hasPhoto ? '#065F46' : '#92400E',
                      textTransform: 'uppercase'
                    }}
                  >
                    {hasPhoto ? 'Photo HD' : 'Sans photo'}
                  </span>

                  {/* Bouton supprimer photo si existante */}
                  {hasPhoto && (
                    <button
                      onClick={e => handleDeletePhoto(product, e)}
                      style={{
                        position: 'absolute',
                        top: '8px',
                        right: '8px',
                        backgroundColor: 'rgba(255, 255, 255, 0.85)',
                        border: 'none',
                        borderRadius: '50%',
                        width: '26px',
                        height: '26px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#EF4444',
                        cursor: 'pointer'
                      }}
                      title="Supprimer la photo"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>

                {/* Détails Produit */}
                <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', flex: 1 }}>
                  <span style={{ fontSize: '10px', fontWeight: 700, color: '#0F766E', textTransform: 'uppercase' }}>
                    {category?.name || product.family || 'Article'}
                  </span>
                  <h4 style={{ fontSize: '13px', fontWeight: 700, color: '#1E293B', margin: '2px 0 4px 0', lineHeight: '1.3', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {product.name}
                  </h4>
                  {product.reference && (
                    <span style={{ fontSize: '11px', color: '#94A3B8', marginBottom: '8px' }}>
                      Réf: {product.reference}
                    </span>
                  )}

                  <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '8px', borderTop: '1px solid #F1F5F9' }}>
                    <span style={{ fontSize: '13px', fontWeight: 800, color: '#0F766E' }}>
                      {formatFCFA(product.sellingPrice)}
                    </span>

                    <span style={{ fontSize: '11px', fontWeight: 700, color: '#0F766E', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Camera size={13} />
                      <span>{hasPhoto ? 'Changer' : 'Capturer'}</span>
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MODALE DU STUDIO PHOTO */}
      <ProductPhotoStudioModal
        product={studioProduct}
        isOpen={isStudioOpen}
        onClose={() => {
          setIsStudioOpen(false);
          setIsShootingExpress(false);
        }}
        onSaved={handleProductSaved}
      />
    </div>
  );
}
