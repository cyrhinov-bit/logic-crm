import { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Package, Upload, Camera, FileSpreadsheet, Search, Images, Edit, ArrowLeft, Trash2, Combine } from 'lucide-react';
import { toast } from 'react-hot-toast';
import ProductEntryForm from '../../features/products/presentation/ProductEntryForm';
import ImportExportPanel from '../../features/products/presentation/ImportExportPanel';
import ProductList from '../../features/products/presentation/ProductList';
import BarcodeScannerPanel from '../../features/products/presentation/BarcodeScannerPanel';
import ProductImageGallery from '../../features/products/images/ProductImageGallery';
import { ProductImageManager } from '../../features/products/images/ProductImageManager';
import { ProductPhotoStudioModal } from '../../features/products/images/ProductPhotoStudioModal';
import ProductImage from '../../features/products/images/ProductImage';
import { useAppContext } from '../../context/AppContext';
import { useProductImages } from '../../features/products/images/ProductImagesContext';
import { useConfirm } from '../../components/ConfirmModal';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { useCanManagePosReferentials } from '../../hooks/useCanManagePosReferentials';
import { matchesProductSearch } from '../../lib/searchUtils';

export default function PosProducts() {
  const navigate = useNavigate();
  const { posProducts, deletePosProduct, mergePosProducts } = useAppContext();
  const canManage = useCanManagePosReferentials();
  const { setProductImage } = useProductImages();
  const { confirm } = useConfirm();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'catalog';
  const setActiveTab = (tab: string) => setSearchParams({ tab });
  const [search, setSearch] = useState('');
  const [initialBarcode, setInitialBarcode] = useState('');
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [studioProduct, setStudioProduct] = useState<any>(null);
  // Fusion de doublons : produit à absorber + gardien + aperçu d'impact.
  const [mergeLoser, setMergeLoser] = useState<any>(null);
  const [keeperSearch, setKeeperSearch] = useState('');
  const [keeperId, setKeeperId] = useState('');
  const [mergePreview, setMergePreview] = useState<Record<string, number> | null>(null);
  const [isMerging, setIsMerging] = useState(false);

  const openMerge = async (loser: any) => {
    setMergeLoser(loser);
    setKeeperSearch('');
    setKeeperId('');
    setMergePreview(null);
    try {
      const { supabase } = await import('../../lib/supabase');
      const tables = ['pos_transaction_lines', 'pos_stock_entry_lines', 'pos_inventory_lines', 'pos_return_lines', 'pos_stock_movements', 'product_completions'];
      const counts: Record<string, number> = {};
      for (const t of tables) {
        const { count } = await supabase.from(t).select('id', { count: 'exact', head: true }).eq('product_id', loser.id);
        counts[t] = count || 0;
      }
      setMergePreview(counts);
    } catch {
      setMergePreview({});
    }
  };

  const closeMerge = () => {
    setMergeLoser(null);
    setKeeperSearch('');
    setKeeperId('');
    setMergePreview(null);
  };

  const keeperCandidates = (keeperSearch.trim()
    ? posProducts.filter(p => p.id !== mergeLoser?.id && matchesProductSearch(p, keeperSearch))
    : posProducts.filter(p => {
        if (!mergeLoser || p.id === mergeLoser.id) return false;
        const norm = (s?: string) => (s || '').trim().toLowerCase();
        return norm(p.name) === norm(mergeLoser.name) || norm(p.reference) === norm(mergeLoser.reference);
      })
  ).slice(0, 8);

  const handleMerge = async () => {
    if (!mergeLoser || !keeperId || isMerging) return;
    const keeper = posProducts.find(p => p.id === keeperId);
    confirm({
      title: 'Fusionner les doublons',
      message: `« ${mergeLoser.name} » sera absorbé par « ${keeper?.name} » : tout son historique est transféré, les stocks sont cumulés, puis le doublon est supprimé. Irréversible. Continuer ?`,
      variant: 'danger',
      confirmLabel: 'Fusionner',
      onConfirm: async () => {
        setIsMerging(true);
        try {
          const res = await mergePosProducts(mergeLoser.id, keeperId);
          toast.success(res.message, { duration: 6000 });
          closeMerge();
        } catch (e: any) {
          toast.error('Fusion impossible : ' + (e?.message || e), { duration: 6000 });
        } finally {
          setIsMerging(false);
        }
      },
    });
  };

  const tabs = [
    { id: 'catalog', label: 'Catalogue', icon: Package },
    { id: 'new', label: 'Nouveau produit', icon: Package },
    { id: 'import', label: 'Import / Export', icon: Upload },
    { id: 'studio', label: 'Studio Photo', icon: Camera },
    { id: 'gallery', label: 'Galerie', icon: Images },
    { id: 'scan', label: 'Scanner', icon: Camera },
    { id: 'complete', label: 'À compléter', icon: FileSpreadsheet },
  ];

  const filteredProducts = posProducts.filter(p => {
    if (!search || !search.trim()) return true;
    return matchesProductSearch(p, search);
  });

  return (
    <div className="pos-page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button onClick={() => navigate('/pos')} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', background: 'white', cursor: 'pointer', color: 'var(--color-text)' }} title="Retour">
            <ArrowLeft size={20} />
          </button>
          <h1 style={{ fontSize: '24px', fontWeight: 700, margin: 0 }}>Produits</h1>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id);
                setSearch('');
                if (tab.id !== 'new') {
                  setInitialBarcode('');
                  setEditingProduct(null);
                }
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '10px 16px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border)',
                background: activeTab === tab.id ? 'var(--color-surface-alt)' : 'white',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: activeTab === tab.id ? 600 : 400,
                color: activeTab === tab.id ? 'var(--color-text)' : 'var(--color-text-muted)'
              }}
            >
              <tab.icon size={14} />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'catalog' && (
        <>
          <div style={{ marginBottom: '16px', position: 'relative' }}>
            <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
            <input
              autoFocus
              style={{ width: '300px', padding: '10px 12px 10px 36px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', fontSize: '14px', outline: 'none' }}
              placeholder="Rechercher par nom, référence ou code..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.currentTarget.select();
                  if (search.trim() && filteredProducts.length === 0) {
                    toast(
                      (t) => (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <span>Produit introuvable : <b>{search}</b></span>
                          <button 
                            onClick={() => {
                              toast.dismiss(t.id);
                              setInitialBarcode(search);
                              setActiveTab('new');
                            }}
                            style={{ padding: '6px 12px', background: 'var(--color-primary)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}
                          >
                            Créer ce produit
                          </button>
                        </div>
                      ),
                      { duration: 5000, icon: '⚠️' }
                    );
                  }
                }
              }}
            />
          </div>

          <div style={{ background: 'white', borderRadius: 'var(--radius-lg)', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <div className="table-responsive">
<table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border)', textAlign: 'left' }}>
                  <th style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-muted)' }}>Image</th>
                  <th style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-muted)' }}>Désignation / Référence</th>
                  <th style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-muted)' }}>Code-barres</th>
                  <th style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-muted)' }}>ISBN</th>
                  <th style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-muted)' }}>Famille</th>
                  <th style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-muted)', textAlign: 'right' }}>Prix Achat</th>
                  <th style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-muted)', textAlign: 'right' }}>Prix Vente</th>
                  <th style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-muted)', textAlign: 'right' }}>Stock</th>
                  <th style={{ padding: '12px 16px', width: '60px' }}></th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map(product => (
                  <tr key={product.id} style={{ borderBottom: '1px solid var(--color-surface-alt)' }}>
                    <td style={{ padding: '12px 16px' }}>
                      <label style={{ cursor: 'pointer', display: 'block' }} title="Cliquez pour changer l'image">
                        <ProductImage product={product} size={40} />
                        <input 
                          type="file" 
                          accept="image/png,image/jpeg" 
                          style={{ display: 'none' }}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              const reader = new FileReader();
                              reader.onload = async () => {
                                 await setProductImage(product, reader.result as string);
                              };
                              reader.readAsDataURL(file);
                            }
                            e.target.value = '';
                          }}
                        />
                      </label>
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '14px', fontWeight: 500 }}>{product.name || product.reference}</td>
                    <td style={{ padding: '12px 16px', fontSize: '14px', color: 'var(--color-text-muted)' }}>{product.barcode || '-'}</td>
                    <td style={{ padding: '12px 16px', fontSize: '14px', color: 'var(--color-text-muted)' }}>{product.isbn || '-'}</td>
                    <td style={{ padding: '12px 16px' }}>
                      {product.family ? (
                        <span style={{ 
                          padding: '2px 8px', 
                          borderRadius: 'var(--radius-md)', 
                          fontSize: '11px', 
                          fontWeight: 500, 
                          background: product.family === 'Livre' ? 'var(--color-primary-tint)' : product.family === 'Service' ? '#f3e8ff' : 'var(--color-success-tint)', 
                          color: product.family === 'Livre' ? 'var(--color-primary)' : product.family === 'Service' ? '#7c3aed' : 'var(--color-success)' 
                        }}>
                          {product.family === 'Service' ? '🖨️ Service' : product.family}
                        </span>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '14px', textAlign: 'right' }}>
                      {product.family === 'Service' ? (product.purchasePrice ? `${product.purchasePrice.toLocaleString()} FCFA` : '-') : (product.purchasePrice ? `${product.purchasePrice.toLocaleString()} FCFA` : '-')}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '14px', textAlign: 'right', fontWeight: 600 }}>
                      {product.sellingPrice ? `${product.sellingPrice.toLocaleString()} FCFA` : '-'}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '14px', textAlign: 'right' }}>
                      {product.family === 'Service' ? (
                        <span style={{ padding: '2px 8px', borderRadius: '10px', background: '#f5f3ff', color: '#7c3aed', fontSize: '11px', fontWeight: 600 }}>
                          Non stocké
                        </span>
                      ) : (
                        product.quantity
                      )}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                      <button
                        onClick={() => setStudioProduct(product)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: product.imageUrl ? 'var(--color-primary)' : '#94a3b8' }}
                        title={product.imageUrl ? 'Modifier la photo (Studio)' : 'Prendre une photo (Studio)'}
                      >
                        <Camera size={16} />
                      </button>
                      <button
                        onClick={() => {
                          setEditingProduct(product);
                          setActiveTab('new');
                        }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)' }}
                        title="Modifier"
                      >
                        <Edit size={16} />
                      </button>
                      {canManage && (
                        <button
                          onClick={() => openMerge(product)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-primary)' }}
                          title="Fusionner ce doublon dans un autre produit (transfère l'historique)"
                        >
                          <Combine size={16} />
                        </button>
                      )}
                      <button
                        onClick={() => {
                          confirm({
                            title: 'Supprimer le produit',
                            message: `Êtes-vous sûr de vouloir supprimer le produit "${product.name || product.reference}" ? Cette action est irréversible.`,
                            confirmLabel: 'Supprimer',
                            cancelLabel: 'Annuler',
                            variant: 'danger',
                            onConfirm: async () => {
                              try {
                                if (deletePosProduct) {
                                  const ok = await deletePosProduct(product.id);
                                  if (ok) toast.success('Produit supprimé avec succès');
                                  else toast.error("Suppression impossible : ce produit a un historique (ventes, stocks, retours). Désactivez-le ou fusionnez-le avec le bouton « Fusionner ».");
                                }
                              } catch (error) {
                                console.error(error);
                                toast.error('Erreur lors de la suppression du produit');
                              }
                            }
                          });
                        }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-error)' }}
                        title="Supprimer"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
                {filteredProducts.length === 0 && (
                  <tr><td colSpan={9} style={{ padding: '24px', textAlign: 'center', color: 'var(--color-text-muted)' }}>Aucun produit</td></tr>
                )}
              </tbody>
            </table>
</div>
          </div>
        </>
      )}

      {activeTab === 'new' && (
        <ProductEntryForm 
          key={editingProduct?.id || 'new'}
          initialBarcode={initialBarcode} 
          initialProduct={editingProduct} 
          onCancel={() => { setActiveTab('catalog'); setInitialBarcode(''); setEditingProduct(null); }} 
        />
      )}
      {activeTab === 'import' && <ImportExportPanel />}
      {activeTab === 'studio' && <ProductImageManager />}
      {activeTab === 'gallery' && <ProductImageGallery />}
      {activeTab === 'scan' && <BarcodeScannerPanel onNotFound={(barcode) => {
        setInitialBarcode(barcode);
        setActiveTab('new');
      }} />}
      {activeTab === 'complete' && <ProductList />}

      {/* Studio Photo Modal pour édition directe depuis le tableau */}
      <ProductPhotoStudioModal
        product={studioProduct}
        isOpen={Boolean(studioProduct)}
        onClose={() => setStudioProduct(null)}
      />

      {/* Modale de fusion de doublons (direction/gérance) */}
      {mergeLoser && (
        <Modal
          open={Boolean(mergeLoser)}
          onClose={closeMerge}
          title={`Fusionner « ${mergeLoser.name} »`}
          footer={
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', width: '100%' }}>
              <Button variant="secondary" onClick={closeMerge}>Annuler</Button>
              <Button variant="danger" onClick={handleMerge} disabled={!keeperId || isMerging}>
                {isMerging ? 'Fusion en cours...' : 'Fusionner'}
              </Button>
            </div>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '13px' }}>
            <div style={{ background: 'var(--color-surface-alt)', borderRadius: 'var(--radius-md)', padding: '10px 12px' }}>
              <div><strong>Doublon à absorber :</strong> {mergeLoser.name} ({mergeLoser.reference}) — stock {mergeLoser.quantity ?? 0}</div>
              {mergePreview ? (
                <div style={{ marginTop: '6px', color: 'var(--color-text-muted)' }}>
                  Historique rattaché : {(mergePreview['pos_transaction_lines'] || 0)} ligne(s) de vente, {(mergePreview['pos_stock_entry_lines'] || 0)} entrée(s), {(mergePreview['pos_inventory_lines'] || 0)} inventaire(s), {(mergePreview['pos_return_lines'] || 0)} retour(s), {(mergePreview['pos_stock_movements'] || 0)} mouvement(s).
                  Tout sera transféré, puis les stocks cumulés.
                </div>
              ) : (
                <div style={{ marginTop: '6px', color: 'var(--color-text-muted)' }}>Chargement de l'historique...</div>
              )}
            </div>
            <div>
              <div style={{ fontWeight: 600, marginBottom: '4px' }}>Produit gardien (conservé) :</div>
              <input
                autoFocus
                style={{ width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', fontSize: '13px', outline: 'none', marginBottom: '8px' }}
                placeholder="Rechercher le produit gardien..."
                value={keeperSearch}
                onChange={e => setKeeperSearch(e.target.value)}
              />
              {keeperCandidates.length === 0 && (
                <div style={{ color: 'var(--color-text-muted)' }}>Aucun gardien trouvé — précisez la recherche.</div>
              )}
              {keeperCandidates.map(p => (
                <label key={p.id} style={{ display: 'flex', gap: '8px', alignItems: 'center', padding: '6px 8px', borderRadius: 'var(--radius-sm)', background: keeperId === p.id ? 'var(--color-primary-tint)' : 'transparent', cursor: 'pointer' }}>
                  <input type="radio" name="keeper" checked={keeperId === p.id} onChange={() => setKeeperId(p.id)} />
                  <span><strong>{p.name}</strong> <span style={{ color: 'var(--color-text-muted)' }}>({p.reference}) — stock {p.quantity ?? 0}</span></span>
                </label>
              ))}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
