import { useState, useMemo, useEffect, useRef } from 'react';
import { Search, ShoppingBag, Plus, Check, X, Smartphone, Home, Layers, Sparkles, RefreshCw, Loader2 } from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import type { PosProduct, PosCategory } from '../../context/AppContext';
import type { CartItem } from '../../lib/whatsappOrder';
import { formatFCFA } from '../../lib/whatsappOrder';
import { getDirectorThemeColor, hexToRgb, shadeColor } from '../../lib/theme';
import { supabase } from '../../lib/supabase';
import { db } from '../../lib/db';
import { CatalogCartDrawer } from './components/CatalogCartDrawer';
import { PwaInstallPrompt } from './components/PwaInstallPrompt';
import { matchesProductSearch } from '../../lib/searchUtils';
import './PublicCatalog.css';

export function PublicCatalog() {
  const { posProducts, posCategories, posBrands, posSettings, users, refreshData } = useAppContext();

  // Produits et catégories de secours si le contexte n'a pas encore chargé
  const [localProducts, setLocalProducts] = useState<PosProduct[]>([]);
  const [localCategories, setLocalCategories] = useState<PosCategory[]>([]);
  const [isFetchingDirect, setIsFetchingDirect] = useState(false);

  // Charger les données du catalogue public directement depuis Supabase ou IndexedDB
  const fetchPublicProducts = async () => {
    setIsFetchingDirect(true);
    try {
      // 1. Lire d'abord depuis IndexedDB
      const cachedProds = await db.posProducts.getItem<PosProduct[]>('data');
      const cachedCats = await db.posCategories.getItem<PosCategory[]>('data');
      if (cachedProds && cachedProds.length > 0) {
        setLocalProducts(cachedProds);
      }
      if (cachedCats && cachedCats.length > 0) {
        setLocalCategories(cachedCats);
      }

      // 2. Récupérer depuis Supabase si connecté
      if (navigator.onLine) {
        const [prodsRes, catsRes] = await Promise.all([
          supabase.from('pos_products').select('id,reference,barcode,isbn,name,family,category_id,brand_id,selling_price,quantity,min_stock,image_url,description,status,is_active,unit,created_at,updated_at'),
          supabase.from('pos_categories').select('*')
        ]);

        if (prodsRes.data && prodsRes.data.length > 0) {
          const parsed: PosProduct[] = prodsRes.data.map((p: any) => {
            let purchasePrice = p.purchase_price;
            if (p.family === 'Livre' && (!purchasePrice || purchasePrice === 0) && p.selling_price > 0) {
              purchasePrice = Math.round(p.selling_price * 0.75);
            }
            return {
              id: p.id,
              reference: p.reference || '',
              barcode: p.barcode || '',
              isbn: p.isbn || '',
              name: p.name || 'Article',
              family: p.family || 'Fourniture',
              categoryId: p.category_id || '',
              brandId: p.brand_id || '',
              supplierId: p.supplier_id || '',
              purchasePrice: purchasePrice ?? 0,
              sellingPrice: p.selling_price ?? 0,
              quantity: p.quantity ?? 0,
              minStock: p.min_stock ?? 5,
              imageUrl: p.image_url,
              description: p.description,
              status: p.status || 'Active',
              isActive: p.is_active !== false,
              unit: p.unit,
              createdAt: p.created_at,
              updatedAt: p.updated_at
            };
          });
          setLocalProducts(parsed);
          await db.posProducts.setItem('data', parsed);
        }

        if (catsRes.data && catsRes.data.length > 0) {
          const parsedCats: PosCategory[] = catsRes.data.map((c: any) => ({
            id: c.id,
            name: c.name,
            family: c.family || 'Fourniture'
          }));
          setLocalCategories(parsedCats);
          await db.posCategories.setItem('data', parsedCats);
        }
      }
    } catch (err) {
      console.error('Erreur chargement public direct:', err);
    } finally {
      setIsFetchingDirect(false);
    }
  };

  useEffect(() => {
    if (posProducts.length === 0) {
      fetchPublicProducts();
    }
  }, [posProducts.length]);

  const activeProducts = posProducts.length > 0 ? posProducts : localProducts;
  const activeCategories = posCategories.length > 0 ? posCategories : localCategories;

  // Couleur du thème choisie par le Directeur
  const themeColor = useMemo(() => getDirectorThemeColor(posSettings, users), [posSettings, users]);

  // Variables de style CSS dynamiques calculées pour le thème
  const themeStyles = useMemo(() => {
    const { r, g, b } = hexToRgb(themeColor);
    return {
      '--catalog-primary': themeColor,
      '--catalog-primary-dark': shadeColor(themeColor, -20),
      '--catalog-primary-light': `rgba(${r}, ${g}, ${b}, 0.12)`,
    } as React.CSSProperties;
  }, [themeColor]);

  // Appliquer sur les variables CSS globales pour le catalogue
  useEffect(() => {
    const { r, g, b } = hexToRgb(themeColor);
    document.documentElement.style.setProperty('--color-primary', themeColor);
    document.documentElement.style.setProperty('--color-primary-tint', `rgba(${r}, ${g}, ${b}, 0.12)`);
  }, [themeColor]);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');
  const [inStockOnly, setInStockOnly] = useState(false);
  const [sortBy, setSortBy] = useState<'name' | 'price-asc' | 'price-desc'>('name');
  
  // Panier avec persistance locale
  const [cart, setCart] = useState<CartItem[]>(() => {
    const saved = localStorage.getItem('hinov_public_cart');
    if (saved) {
      try { return JSON.parse(saved); } catch {}
    }
    return [];
  });

  const [isCartOpen, setIsCartOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<PosProduct | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Sauvegarder le panier dans localStorage
  useEffect(() => {
    localStorage.setItem('hinov_public_cart', JSON.stringify(cart));
  }, [cart]);

  // Ajouter au panier
  const handleAddToCart = (product: PosProduct, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setCart(prev => {
      const existing = prev.find(item => item.id === product.id);
      if (existing) {
        return prev.map(item =>
          item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [
        ...prev,
        {
          id: product.id,
          reference: product.reference,
          name: product.name,
          sellingPrice: product.sellingPrice,
          quantity: 1,
          imageUrl: product.imageUrl,
          family: product.family,
          unit: product.unit
        }
      ];
    });
  };

  // Modifier la quantité
  const handleUpdateQuantity = (id: string, delta: number) => {
    setCart(prev =>
      prev
        .map(item => {
          if (item.id === id) {
            const newQty = item.quantity + delta;
            return newQty > 0 ? { ...item, quantity: newQty } : null;
          }
          return item;
        })
        .filter(Boolean) as CartItem[]
    );
  };

  // Supprimer un article
  const handleRemoveItem = (id: string) => {
    setCart(prev => prev.filter(item => item.id !== id));
  };

  // Vider le panier
  const handleClearCart = () => {
    setCart([]);
  };

  // Nombre total d'articles dans le panier
  const totalCartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  // Filtrage et tri des produits
  const filteredProducts = useMemo(() => {
    return activeProducts
      .filter(p => {
        // Filtrer les inactifs
        if (p.isActive === false || p.status === 'Inactive') return false;

        // Filtre de stock
        if (inStockOnly && (p.quantity || 0) <= 0) return false;

        // Filtre de catégorie
        if (selectedCategoryId !== 'all' && p.categoryId !== selectedCategoryId) return false;

        // Recherche par texte tolérante aux accents et multi-mots
        if (searchQuery.trim()) {
          return matchesProductSearch(p, searchQuery);
        }

        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'price-asc') return a.sellingPrice - b.sellingPrice;
        if (sortBy === 'price-desc') return b.sellingPrice - a.sellingPrice;
        return a.name.localeCompare(b.name);
      });
  }, [activeProducts, inStockOnly, selectedCategoryId, searchQuery, sortBy]);

  const companyName = posSettings.libraryName || 'Hinov Group';
  const whatsappNumber = (posSettings as any).whatsappOrderPhone || posSettings.phone || '';

  const focusSearch = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setTimeout(() => {
      searchInputRef.current?.focus();
    }, 200);
  };

  const isLoading = isFetchingDirect && activeProducts.length === 0;

  return (
    <div className="native-catalog-app" style={themeStyles}>
      {/* 1. TOP APP BAR NATIVE */}
      <header className="native-appbar">
        <div className="native-appbar-inner">
          <div className="native-appbar-left">
            <img src="logoh.png" alt="Logo" className="native-appbar-logo" onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }} />
            <div className="native-appbar-titles">
              <h1 className="native-appbar-brand">{companyName}</h1>
              <div className="native-appbar-sub">
                <span className="native-live-dot" />
                <span>Catalogue & Boutique</span>
              </div>
            </div>
          </div>

          <div className="native-appbar-right">
            {/* Bouton installation direct */}
            <PwaInstallPrompt variant="icon-button" />

            {/* Bouton Panier avec badge */}
            <button
              className="native-topbar-cart-btn"
              onClick={() => setIsCartOpen(true)}
              title="Voir mon panier"
            >
              <ShoppingBag size={20} />
              {totalCartCount > 0 && (
                <span className="native-badge-count">
                  {totalCartCount > 99 ? '99+' : totalCartCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* 2. BANNIÈRE PROMO ULTRA-COMPACTE */}
      <div className="native-promo-strip">
        <Sparkles size={14} style={{ flexShrink: 0 }} />
        <span>{(posSettings as any).catalogBannerText || 'Commandez en direct et faites-vous livrer rapidement via WhatsApp !'}</span>
      </div>

      {/* 3. SECTION COMMANDES (RECHERCHE & CHIPS HORIZONTAUX) */}
      <div className="native-controls-section">
        <div className="native-search-bar">
          <Search className="native-search-icon-left" size={16} />
          <input
            ref={searchInputRef}
            type="text"
            className="native-search-input"
            placeholder="Rechercher un article, titre, référence..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              className="native-search-clear-btn"
              onClick={() => setSearchQuery('')}
              title="Effacer"
            >
              <X size={12} />
            </button>
          )}
        </div>

        {/* CAROUSEL DES CATÉGORIES (HORIZONTAL SWIPE) */}
        <div className="native-chips-scroll">
          <button
            className={`native-chip ${selectedCategoryId === 'all' ? 'active' : ''}`}
            onClick={() => setSelectedCategoryId('all')}
          >
            Tous ({activeProducts.filter(p => p.isActive !== false).length})
          </button>
          {activeCategories.map(cat => {
            const count = activeProducts.filter(p => p.isActive !== false && p.categoryId === cat.id).length;
            return (
              <button
                key={cat.id}
                className={`native-chip ${selectedCategoryId === cat.id ? 'active' : ''}`}
                onClick={() => setSelectedCategoryId(cat.id)}
              >
                {cat.name} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {/* 4. BARRE DE FILTRES SECONDAIRE */}
      <div className="native-filter-bar">
        <label className="native-stock-toggle">
          <input
            type="checkbox"
            checked={inStockOnly}
            onChange={e => setInStockOnly(e.target.checked)}
          />
          <span>En stock uniquement</span>
        </label>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <select
            className="native-sort-select"
            value={sortBy}
            onChange={e => setSortBy(e.target.value as any)}
          >
            <option value="name">Nom (A-Z)</option>
            <option value="price-asc">Prix croissant</option>
            <option value="price-desc">Prix décroissant</option>
          </select>
        </div>
      </div>

      {/* 5. GRILLE PRODUITS 2 COLONNES TACTILE */}
      <div className="native-catalog-body">
        {isLoading ? (
          /* SQUELETTES DE CHARGEMENT ANIMÉS */
          <div className="native-product-grid">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="native-product-card" style={{ opacity: 0.6, animation: 'pulse 1.5s infinite' }}>
                <div className="native-card-image-box" style={{ background: '#E2E8F0' }} />
                <div className="native-card-content">
                  <div style={{ width: '40%', height: '10px', background: '#E2E8F0', borderRadius: '4px', marginBottom: '6px' }} />
                  <div style={{ width: '80%', height: '14px', background: '#E2E8F0', borderRadius: '4px', marginBottom: '8px' }} />
                  <div style={{ width: '60%', height: '14px', background: '#E2E8F0', borderRadius: '4px', marginTop: 'auto' }} />
                </div>
              </div>
            ))}
          </div>
        ) : filteredProducts.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '50px 16px', background: 'white', borderRadius: '16px', border: '1px solid #E2E8F0', marginTop: '10px' }}>
            <div style={{ fontSize: '36px', marginBottom: '8px' }}>🔍</div>
            <h3 style={{ fontSize: '16px', color: '#1E293B', margin: '0 0 4px 0' }}>Aucun produit trouvé</h3>
            <p style={{ fontSize: '13px', color: '#64748B', margin: '0 0 16px 0' }}>
              {activeProducts.length === 0
                ? "Le catalogue est en cours de synchronisation avec la base de données..."
                : "Modifiez votre recherche ou sélectionnez une autre catégorie."}
            </p>
            <button
              onClick={() => { fetchPublicProducts(); if (refreshData) refreshData(); }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 18px',
                backgroundColor: 'var(--catalog-primary, #0D9488)',
                color: 'white',
                border: 'none',
                borderRadius: '12px',
                fontWeight: 600,
                fontSize: '13px',
                cursor: 'pointer'
              }}
            >
              <RefreshCw size={14} />
              <span>Actualiser le catalogue</span>
            </button>
          </div>
        ) : (
          <div className="native-product-grid">
            {filteredProducts.map(product => {
              const inCartItem = cart.find(item => item.id === product.id);
              const qtyInCart = inCartItem?.quantity || 0;
              const category = activeCategories.find(c => c.id === product.categoryId);
              const isOutOfStock = (product.quantity || 0) <= 0;
              const isLowStock = !isOutOfStock && (product.quantity || 0) <= (product.minStock || 3);

              return (
                <div
                  key={product.id}
                  className="native-product-card"
                  onClick={() => setSelectedProduct(product)}
                >
                  {/* Image carrée 1:1 & Badge Stock */}
                  <div className="native-card-image-box">
                    {product.imageUrl ? (
                      <img src={product.imageUrl} alt={product.name} className="native-card-image" loading="lazy" />
                    ) : (
                      <span style={{ fontSize: '36px' }}>📦</span>
                    )}

                    {isOutOfStock ? (
                      <span className="native-stock-tag tag-out-of-stock">Rupture</span>
                    ) : isLowStock ? (
                      <span className="native-stock-tag tag-low-stock">Derniers</span>
                    ) : (
                      <span className="native-stock-tag tag-in-stock">En stock</span>
                    )}
                  </div>

                  {/* Corps de la carte */}
                  <div className="native-card-content">
                    <span className="native-card-category">
                      {category?.name || product.family || 'Article'}
                    </span>
                    <h3 className="native-card-name" title={product.name}>
                      {product.name}
                    </h3>
                    {product.reference && (
                      <span className="native-card-ref">Réf: {product.reference}</span>
                    )}

                    {/* Footer : Prix & Bouton Rapide + */}
                    <div className="native-card-footer">
                      <div className="native-card-price">
                        {formatFCFA(product.sellingPrice)}
                      </div>

                      <button
                        className={`native-quick-add-btn ${qtyInCart > 0 ? 'in-cart' : ''}`}
                        onClick={e => handleAddToCart(product, e)}
                        title="Ajouter au panier"
                        type="button"
                      >
                        {qtyInCart > 0 ? (
                          <Check size={16} />
                        ) : (
                          <Plus size={16} />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 6. MODALE FICHE PRODUIT MOBILE (BOTTOM SHEET NATIVE) */}
      {selectedProduct && (
        <div className="native-sheet-overlay" onClick={e => e.target === e.currentTarget && setSelectedProduct(null)}>
          <div className="native-sheet-modal">
            <div className="native-sheet-handle" />
            <button
              onClick={() => setSelectedProduct(null)}
              style={{
                position: 'absolute',
                top: '12px',
                right: '14px',
                background: '#F1F5F9',
                border: 'none',
                borderRadius: '50%',
                width: '30px',
                height: '30px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                zIndex: 10
              }}
            >
              <X size={16} color="#475569" />
            </button>

            <div className="native-sheet-body">
              <div
                style={{
                  width: '100%',
                  aspectRatio: '1 / 1',
                  maxHeight: '260px',
                  backgroundColor: '#F8FAFC',
                  borderRadius: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                  margin: '0 auto 16px auto'
                }}
              >
                {selectedProduct.imageUrl ? (
                  <img src={selectedProduct.imageUrl} alt={selectedProduct.name} style={{ width: '100%', height: '100%', objectFit: 'contain', padding: '10px' }} />
                ) : (
                  <span style={{ fontSize: '50px' }}>📦</span>
                )}
              </div>

              <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--catalog-primary, #0D9488)', textTransform: 'uppercase' }}>
                {activeCategories.find(c => c.id === selectedProduct.categoryId)?.name || selectedProduct.family || 'Article'}
              </span>
              <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#0F172A', margin: '4px 0 8px 0', lineHeight: '1.3' }}>
                {selectedProduct.name}
              </h2>

              <div style={{ display: 'flex', gap: '12px', fontSize: '12px', color: '#64748B', marginBottom: '14px', flexWrap: 'wrap' }}>
                {selectedProduct.reference && <span><strong>Réf :</strong> {selectedProduct.reference}</span>}
                {selectedProduct.barcode && <span><strong>Code-barres :</strong> {selectedProduct.barcode}</span>}
                {selectedProduct.isbn && <span><strong>ISBN :</strong> {selectedProduct.isbn}</span>}
              </div>

              {selectedProduct.description && (
                <div style={{ marginBottom: '16px' }}>
                  <h4 style={{ fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>Description</h4>
                  <p style={{ fontSize: '13px', color: '#64748B', lineHeight: '1.5', margin: 0 }}>
                    {selectedProduct.description}
                  </p>
                </div>
              )}
            </div>

            <div className="native-sheet-footer">
              <div>
                <span style={{ fontSize: '11px', color: '#94A3B8', display: 'block' }}>Prix unitaire</span>
                <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--catalog-primary, #0D9488)' }}>
                  {formatFCFA(selectedProduct.sellingPrice)}
                </div>
              </div>

              <button
                className="native-sheet-add-btn"
                onClick={() => {
                  handleAddToCart(selectedProduct);
                  setSelectedProduct(null);
                  setIsCartOpen(true);
                }}
              >
                <Plus size={18} />
                <span>Ajouter au panier</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7. TIROIR DU PANIER & VALIDATION WHATSAPP */}
      <CatalogCartDrawer
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        items={cart}
        onUpdateQuantity={handleUpdateQuantity}
        onRemoveItem={handleRemoveItem}
        onClearCart={handleClearCart}
        whatsappPhone={whatsappNumber}
        companyName={companyName}
        primaryColor={themeColor}
      />

      {/* 8. BARRE DE NAVIGATION INFÉRIEURE (BOTTOM BAR NATIVE POUR SMARTPHONE) */}
      <nav className="native-bottom-nav">
        <button
          className="native-bottom-nav-item active"
          onClick={() => {
            setSelectedCategoryId('all');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
        >
          <Home size={20} />
          <span>Catalogue</span>
        </button>

        <button
          className="native-bottom-nav-item"
          onClick={focusSearch}
        >
          <Search size={20} />
          <span>Rechercher</span>
        </button>

        <button
          className="native-bottom-nav-item"
          onClick={() => setIsCartOpen(true)}
        >
          <div className="nav-icon-badge-wrap">
            <ShoppingBag size={20} />
            {totalCartCount > 0 && (
              <span className="native-badge-count" style={{ top: '-6px', right: '-8px' }}>
                {totalCartCount}
              </span>
            )}
          </div>
          <span>Panier</span>
        </button>

        {/* Bouton d'installation native directe */}
        <PwaInstallPrompt variant="nav-item" />
      </nav>
    </div>
  );
}
