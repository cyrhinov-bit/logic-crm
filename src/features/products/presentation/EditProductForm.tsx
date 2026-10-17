import { useState } from 'react';
import { Upload } from 'lucide-react';
import { useProductImages } from '../images/ProductImagesContext';
import ProductImage from '../images/ProductImage';
import type { PosProduct, PosCategory, PosBrand, PosSupplier } from '../../../context/AppContext';

interface EditProductFormProps {
  product: PosProduct;
  categories: PosCategory[];
  brands: PosBrand[];
  suppliers: PosSupplier[];
  onComplete: (productId: string, updates: Partial<PosProduct>, imageDataUri?: string) => void;
  onCancel: () => void;
}

export default function EditProductForm({ product, categories, brands, suppliers, onComplete, onCancel }: EditProductFormProps) {
  const { getImageUrl } = useProductImages();
  const [formData, setFormData] = useState<Partial<PosProduct>>({
    name: product.name,
    reference: product.reference,
    barcode: product.barcode,
    isbn: product.isbn,
    purchasePrice: product.purchasePrice,
    sellingPrice: product.sellingPrice,
    quantity: product.quantity,
    family: product.family,
    categoryId: product.categoryId,
    brandId: product.brandId,
    supplierId: product.supplierId,
    imageUrl: product.imageUrl,
    minStock: product.minStock,
    description: product.description || ''
  });
  const [imageDataUri, setImageDataUri] = useState<string | undefined>(undefined);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setImageDataUri(reader.result as string);
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const isService = formData.family === 'Service';
    const payload = {
      ...formData,
      quantity: isService ? 0 : (formData.quantity ?? 0),
      minStock: isService ? 0 : (formData.minStock ?? 0),
    };
    onComplete(product.id, payload, imageDataUri);
  };

  const previewSrc = imageDataUri || getImageUrl(product);

  return (
    <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
      <div style={{ gridColumn: 'span 2' }}>
        <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 600, color: 'var(--color-text)' }}>Image</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {previewSrc ? (
            <img src={previewSrc} alt={product.name} style={{ width: '64px', height: '64px', objectFit: 'cover', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }} />
          ) : (
            <ProductImage product={product} size={64} />
          )}
          <label className="btn btn-secondary" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px', margin: 0 }}>
            <Upload size={14} /> {imageDataUri ? 'Changer l\'image' : 'Choisir une image'}
            <input type="file" accept="image/png,image/jpeg" style={{ display: 'none' }} onChange={handleImageChange} />
          </label>
          {imageDataUri && (
            <button type="button" className="btn btn-secondary" onClick={() => setImageDataUri(undefined)}>Annuler</button>
          )}
        </div>
      </div>

      <div>
        <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 600, color: 'var(--color-text)' }}>Nom</label>
        <input
          type="text"
          className="table-input"
          value={formData.name || ''}
          onChange={e => setFormData({ ...formData, name: e.target.value })}
        />
      </div>

      <div>
        <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 600, color: 'var(--color-text)' }}>Référence</label>
        <input
          type="text"
          className="table-input"
          value={formData.reference || ''}
          onChange={e => setFormData({ ...formData, reference: e.target.value })}
        />
      </div>

      <div>
        <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 600, color: 'var(--color-text)' }}>Code-barres</label>
        <input
          type="text"
          className="table-input"
          value={formData.barcode || ''}
          onChange={e => setFormData({ ...formData, barcode: e.target.value })}
        />
      </div>

      <div>
        <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 600, color: 'var(--color-text)' }}>ISBN</label>
        <input
          type="text"
          className="table-input"
          value={formData.isbn || ''}
          onChange={e => setFormData({ ...formData, isbn: e.target.value })}
        />
      </div>

      <div>
        <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px', fontSize: '13px', fontWeight: 600, color: 'var(--color-text)' }}>
          <span>Prix d'achat</span>
          {formData.family === 'Livre' && (
            <span style={{ fontSize: '11px', color: 'var(--color-primary)', fontWeight: 500 }}>
              (Auto: 75% du prix de vente)
            </span>
          )}
        </label>
        <input
          type="number"
          className="table-input"
          value={formData.purchasePrice ?? 0}
          onChange={e => setFormData({ ...formData, purchasePrice: parseFloat(e.target.value) || 0 })}
        />
      </div>

      <div>
        <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 600, color: 'var(--color-text)' }}>Prix de vente</label>
        <input
          type="number"
          className="table-input"
          value={formData.sellingPrice ?? 0}
          onChange={e => {
            const sp = parseFloat(e.target.value) || 0;
            if (formData.family === 'Livre') {
              setFormData({
                ...formData,
                sellingPrice: sp,
                purchasePrice: Math.round(sp * 0.75)
              });
            } else {
              setFormData({ ...formData, sellingPrice: sp });
            }
          }}
        />
      </div>

      <div>
        <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 600, color: 'var(--color-text)' }}>Famille</label>
        <select
          className="table-input"
          value={formData.family || 'Fourniture'}
          onChange={e => {
            const newFamily = e.target.value as 'Livre' | 'Fourniture' | 'Service';
            if (newFamily === 'Livre' && (formData.sellingPrice || 0) > 0) {
              const sp = formData.sellingPrice || 0;
              setFormData({ ...formData, family: newFamily, purchasePrice: Math.round(sp * 0.75) });
            } else if (newFamily === 'Service') {
              setFormData({ ...formData, family: newFamily, quantity: 0 });
            } else {
              setFormData({ ...formData, family: newFamily });
            }
          }}
        >
          <option value="Livre">Livre</option>
          <option value="Fourniture">Fourniture</option>
          <option value="Service">Service / Impression</option>
        </select>
      </div>

      <div>
        {formData.family === 'Service' ? (
          <div style={{ background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 'var(--radius-md)', padding: '10px 12px', marginTop: '4px' }}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#7c3aed' }}>Prestation non stockée</div>
            <div style={{ fontSize: '11px', color: '#6d28d9', marginTop: '2px' }}>
              Quantité non comptabilisée dans le stock.
            </div>
          </div>
        ) : (
          <>
            <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 600, color: 'var(--color-text)' }}>Stock (Quantité)</label>
            <input
              type="number"
              className="table-input"
              value={formData.quantity ?? 0}
              onChange={e => setFormData({ ...formData, quantity: parseInt(e.target.value) || 0 })}
            />
          </>
        )}
      </div>

      <div>
        <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 600, color: 'var(--color-text)' }}>Catégorie</label>
        <select
          className="table-input"
          value={formData.categoryId || ''}
          onChange={e => setFormData({ ...formData, categoryId: e.target.value })}
        >
          <option value="">Sélectionner...</option>
          {categories.map(cat => (
            <option key={cat.id} value={cat.id}>{cat.name}</option>
          ))}
        </select>
      </div>

      <div>
        <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 600, color: 'var(--color-text)' }}>Marque</label>
        <select
          className="table-input"
          value={formData.brandId || ''}
          onChange={e => setFormData({ ...formData, brandId: e.target.value })}
        >
          <option value="">Sélectionner...</option>
          {brands.map(b => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
      </div>

      <div>
        <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 600, color: 'var(--color-text)' }}>Fournisseur</label>
        <select
          className="table-input"
          value={formData.supplierId || ''}
          onChange={e => setFormData({ ...formData, supplierId: e.target.value })}
        >
          <option value="">Sélectionner...</option>
          {suppliers.map(s => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>

      <div>
        <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 600, color: 'var(--color-text)' }}>Stock minimum</label>
        <input
          type="number"
          className="table-input"
          value={formData.minStock}
          onChange={e => setFormData({ ...formData, minStock: parseInt(e.target.value) || 0 })}
        />
      </div>

      <div>
        <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 600, color: 'var(--color-text)' }}>Statut</label>
        <select
          className="table-input"
          value={formData.status || 'Active'}
          onChange={e => setFormData({ ...formData, status: e.target.value as any })}
        >
          <option value="Active">Actif</option>
          <option value="Inactive">Inactif</option>
        </select>
      </div>

      <div style={{ gridColumn: 'span 2' }}>
        <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 600, color: 'var(--color-text)' }}>Description</label>
        <textarea
          className="table-input"
          rows={3}
          value={formData.description || ''}
          onChange={e => setFormData({ ...formData, description: e.target.value })}
          placeholder="Description détaillée du produit..."
        />
      </div>

      <div style={{ gridColumn: 'span 2', display: 'flex', gap: '12px' }}>
        <button type="submit" className="btn btn-primary">Enregistrer</button>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>Annuler</button>
      </div>
    </form>
  );
}
