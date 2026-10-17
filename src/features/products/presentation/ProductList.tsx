import { useState } from 'react';
import { useAppContext } from '../../../context/AppContext';
import { Search, Edit, Camera, Upload } from 'lucide-react';
import { productCompletionService } from '../services/ProductCompletionService';
import { barcodeScannerService } from '../services/BarcodeScannerService';
import { useProductImages } from '../images/ProductImagesContext';
import ProductImage from '../images/ProductImage';
import EditProductForm from './EditProductForm';
import type { ProductCompletionFilters } from '../../../context/AppContext';

import { matchesProductSearch } from '../../../lib/searchUtils';

export default function ProductList() {
  const { posProducts, posCategories, posBrands, posSuppliers, completeProduct } = useAppContext();
  const { setProductImage } = useProductImages();
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<ProductCompletionFilters>({
    noFamily: false,
    noCategory: false,
    noBrand: false,
    noSupplier: false,
    noImage: false,
    noBarcode: false,
    noIsbn: false,
    minStockExceeded: false,
  });
  const [editingProduct, setEditingProduct] = useState<string | null>(null);

  const readFileAsDataUri = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  };

  const handleImportImage = async (productId: string, file: File) => {
    const product = posProducts.find(p => p.id === productId);
    if (!product) return;
    const dataUri = await readFileAsDataUri(file);
    await setProductImage(product, dataUri);
  };

  const filteredProducts = productCompletionService.getIncompleteProducts(posProducts, filters);
  const searchResults = search 
    ? filteredProducts.filter(p => matchesProductSearch(p, search))
    : filteredProducts;

  const handleFilterChange = (field: keyof ProductCompletionFilters) => {
    setFilters(prev => ({ ...prev, [field]: !prev[field] }));
  };

  const getMissingFields = (product: any) => {
    const missing: string[] = [];
    if (!product.family) missing.push('Famille');
    if (product.family === 'Service') {
      // Services only need name, reference and selling price
      return missing;
    }
    if (!product.categoryId) missing.push('Catégorie');
    if (!product.brandId) missing.push('Marque');
    if (!product.supplierId) missing.push('Fournisseur');
    if (!product.imageUrl) missing.push('Image');
    if (!product.barcode) missing.push('Code-barres');
    if (!product.isbn) missing.push('ISBN');
    if (!product.minStock || product.minStock <= 0) missing.push('Stock min');
    return missing;
  };

  const handleCompleteProduct = async (productId: string, updates: any, imageDataUri?: string) => {
    if (imageDataUri) {
      const product = posProducts.find(p => p.id === productId);
      if (product) await setProductImage(product, imageDataUri);
    }
    await completeProduct(productId, updates);
    setEditingProduct(null);
  };

  return (
    <div>
      <h2 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '24px' }}>Produits à compléter</h2>

      <div style={{ marginBottom: '16px', position: 'relative' }}>
        <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
        <input
          style={{ width: '100%', padding: '10px 12px 10px 36px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', fontSize: '14px', outline: 'none' }}
          placeholder="Rechercher par nom, référence ou code-barres..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      <div style={{ background: 'white', borderRadius: 'var(--radius-lg)', padding: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', marginBottom: '24px' }}>
        <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px', color: 'var(--color-text)' }}>Filtres</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '8px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
            <input type="checkbox" checked={filters.noFamily} onChange={() => handleFilterChange('noFamily')} />
            Sans Famille
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
            <input type="checkbox" checked={filters.noCategory} onChange={() => handleFilterChange('noCategory')} />
            Sans Catégorie
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
            <input type="checkbox" checked={filters.noBrand} onChange={() => handleFilterChange('noBrand')} />
            Sans Marque
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
            <input type="checkbox" checked={filters.noSupplier} onChange={() => handleFilterChange('noSupplier')} />
            Sans Fournisseur
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
            <input type="checkbox" checked={filters.noImage} onChange={() => handleFilterChange('noImage')} />
            Sans Image
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
            <input type="checkbox" checked={filters.noBarcode} onChange={() => handleFilterChange('noBarcode')} />
            Sans Code-barres
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
            <input type="checkbox" checked={filters.noIsbn} onChange={() => handleFilterChange('noIsbn')} />
            Sans ISBN
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
            <input type="checkbox" checked={filters.minStockExceeded} onChange={() => handleFilterChange('minStockExceeded')} />
            Stock minimum dépassé
          </label>
        </div>
      </div>

      <div style={{ background: 'white', borderRadius: 'var(--radius-lg)', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        <div className="table-responsive">
<table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
              <th style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-muted)', textAlign: 'left' }}>Produit</th>
              <th style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-muted)', textAlign: 'left' }}>Référence</th>
              <th style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-muted)', textAlign: 'left' }}>Champs manquants</th>
              <th style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-muted)', textAlign: 'center' }}>Stock</th>
              <th style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-muted)', textAlign: 'right' }}>Prix Vente</th>
              <th style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-muted)', textAlign: 'center' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {searchResults.map(product => {
              const missingFields = getMissingFields(product);
              return (
                <tr key={product.id} style={{ borderBottom: '1px solid var(--color-surface-alt)' }}>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <ProductImage product={product} size={40} />
                      <div>
                        <div style={{ fontSize: '14px', fontWeight: 500 }}>{product.name}</div>
                        <span style={{ 
                          fontSize: '12px', 
                          color: product.family === 'Livre' ? 'var(--color-primary)' : product.family === 'Service' ? '#7c3aed' : 'var(--color-success)',
                          fontWeight: 500
                        }}>
                          {product.family === 'Service' ? '🖨️ Service' : product.family}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: '14px', fontFamily: 'monospace', color: 'var(--color-text-muted)' }}>{product.reference}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                      {missingFields.map((field, idx) => (
                        <span key={idx} style={{ padding: '2px 8px', background: 'var(--color-warning-tint)', color: 'var(--color-warning-strong)', borderRadius: 'var(--radius-md)', fontSize: '11px' }}>
                          {field}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'center', fontSize: '13px' }}>
                    {product.family === 'Service' ? (
                      <span style={{ padding: '3px 8px', borderRadius: '12px', background: '#f5f3ff', color: '#7c3aed', fontSize: '11px', fontWeight: 600 }}>
                        Non stocké
                      </span>
                    ) : (
                      <>
                        <span style={{ fontWeight: product.quantity <= product.minStock ? 'bold' : 'normal', color: product.quantity <= product.minStock ? 'var(--color-error)' : 'var(--color-text)' }}>
                          {product.quantity}
                        </span>
                        {product.minStock > 0 && <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}> / {product.minStock}</span>}
                      </>
                    )}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: '14px', textAlign: 'right', fontWeight: 600 }}>{product.sellingPrice.toLocaleString()} FCFA</td>
                  <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                      <button
                        onClick={() => setEditingProduct(product.id)}
                        style={{ padding: '4px 8px', background: 'var(--color-surface-alt)', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}
                        title="Compléter"
                      >
                        <Edit size={14} color="var(--color-primary)" />
                      </button>
                      <button
                        style={{ padding: '4px 8px', background: 'var(--color-surface-alt)', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}
                        title="Scanner"
                        onClick={() => {
                          const barcode = window.prompt('Scanner un code-barres pour : ' + product.name);
                          if (barcode) {
                            barcodeScannerService.searchProduct(barcode, posProducts);
                          }
                        }}
                      >
                        <Camera size={14} color="var(--color-text-muted)" />
                      </button>
                      <button
                        style={{ padding: '4px 8px', background: 'var(--color-surface-alt)', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}
                        title="Importer image"
                        onClick={() => document.getElementById(`product-image-input-${product.id}`)?.click()}
                      >
                        <Upload size={14} color="var(--color-text-muted)" />
                      </button>
                      <input
                        id={`product-image-input-${product.id}`}
                        type="file"
                        accept="image/png,image/jpeg"
                        style={{ display: 'none' }}
                        onChange={e => {
                          const file = e.target.files?.[0];
                          if (file) void handleImportImage(product.id, file);
                          e.target.value = '';
                        }}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
            {searchResults.length === 0 && (
              <tr>
                <td colSpan={6} style={{ padding: '24px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                  {search ? 'Aucun produit correspondant à la recherche' : 'Aucun produit incomplet'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
</div>
      </div>

      {editingProduct && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', borderRadius: 'var(--radius-lg)', padding: '24px', width: '600px', maxHeight: '80vh', overflow: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 700 }}>Compléter le produit</h3>
              <button onClick={() => setEditingProduct(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>×</button>
            </div>

            {editingProduct && (
              <EditProductForm
                product={posProducts.find(p => p.id === editingProduct)!}
                categories={posCategories}
                brands={posBrands}
                suppliers={posSuppliers}
                onComplete={handleCompleteProduct}
                onCancel={() => setEditingProduct(null)}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
