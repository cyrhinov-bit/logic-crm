import { useState, useEffect } from 'react';
import { useAppContext } from '../../../context/AppContext';
import { useAuth } from '../../../context/AuthContext';
import { Save, X, Plus, Upload } from 'lucide-react';
import { useProductImages } from '../images/ProductImagesContext';
import { v4 as uuidv4 } from 'uuid';
import { toast } from 'react-hot-toast';
import type { PosProduct } from '../../../context/AppContext';

interface ProductFormData {
  reference: string;
  barcode: string;
  isbn: string;
  name: string;
  purchasePrice: number | '';
  quantity: number | '';
  sellingPrice: number | '';
  family: 'Livre' | 'Fourniture' | 'Service';
}

interface AutoCalculations {
  totalPurchase: number;
  totalSelling: number;
  margin: number;
  stockValue: number;
}

interface ProductEntryFormProps {
  initialBarcode?: string;
  initialProduct?: PosProduct | null;
  onCancel?: () => void;
}

export default function ProductEntryForm({ initialBarcode, initialProduct, onCancel }: ProductEntryFormProps = {}) {
  const { posProducts, addPosProduct, updatePosProduct, addPosStockMovement } = useAppContext();
  const { currentUser } = useAuth();
  const { setProductImage } = useProductImages();
  const [formData, setFormData] = useState<ProductFormData>({
    reference: initialProduct?.reference || '',
    barcode: initialProduct?.barcode || initialBarcode || '',
    isbn: initialProduct?.isbn || '',
    name: initialProduct?.name || '',
    purchasePrice: initialProduct?.purchasePrice ?? 0,
    quantity: initialProduct?.quantity ?? 0,
    sellingPrice: initialProduct?.sellingPrice ?? 0,
    family: initialProduct?.family || 'Fourniture',
  });
  const [calc, setCalc] = useState<AutoCalculations>({
    totalPurchase: 0,
    totalSelling: 0,
    margin: 0,
    stockValue: 0,
  });
  const [scanResult, setScanResult] = useState<PosProduct | null>(null);
  const [imageDataUri, setImageDataUri] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (initialProduct) {
      setFormData({
        reference: initialProduct.reference || '',
        barcode: initialProduct.barcode || initialBarcode || '',
        isbn: initialProduct.isbn || '',
        name: initialProduct.name || '',
        purchasePrice: initialProduct.purchasePrice ?? 0,
        quantity: initialProduct.quantity ?? 0,
        sellingPrice: initialProduct.sellingPrice ?? 0,
        family: initialProduct.family || 'Fourniture',
      });
      setImageDataUri(undefined);
    } else {
      setFormData({
        reference: '',
        barcode: initialBarcode || '',
        isbn: '',
        name: '',
        purchasePrice: 0,
        quantity: 0,
        sellingPrice: 0,
        family: 'Fourniture',
      });
      setImageDataUri(undefined);
    }
  }, [initialProduct, initialBarcode]);

  useEffect(() => {
    const quantity = Number(formData.quantity) || 0;
    const purchasePrice = Number(formData.purchasePrice) || 0;
    const sellingPrice = Number(formData.sellingPrice) || 0;

    setCalc({
      totalPurchase: purchasePrice * quantity,
      totalSelling: sellingPrice * quantity,
      margin: (sellingPrice - purchasePrice) * quantity,
      stockValue: purchasePrice * quantity,
    });
  }, [formData.purchasePrice, formData.quantity, formData.sellingPrice]);

  const checkExistingProduct = (code: string) => {
    // Don't show "already exists" if we are editing the same product
    const existing = posProducts.find(p => (p.barcode === code || p.isbn === code) && (!initialProduct || p.id !== initialProduct.id));
    if (existing) {
      setScanResult(existing);
    }
  };

  const generateReferenceFromName = (name: string): string => {
    return name
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  };

  const handleSubmit = async (e: React.FormEvent, resetAfter = false) => {
    e.preventDefault();

    const reference = formData.reference.trim() || generateReferenceFromName(formData.name || formData.reference);
    const normRef = reference.trim().toLowerCase();
    const normBarcode = (formData.barcode || '').trim().toLowerCase();
    const normIsbn = (formData.isbn || '').trim().toLowerCase();

    // F2 : référence finale vide interdite (slug vide reproductible à l'infini).
    if (!normRef) {
      toast.error('Référence invalide : saisissez un nom ou une référence.');
      return;
    }
    // F3 : prix bornés (négatifs interdits, vente > 0 si renseignée).
    const purchasePrice = Number(formData.purchasePrice) || 0;
    const sellingPrice = Number(formData.sellingPrice) || 0;
    if (purchasePrice < 0 || sellingPrice < 0) {
      toast.error("Les prix d'achat et de vente ne peuvent pas être négatifs.");
      return;
    }

    // Unicité (B4) : référence / code-barres / ISBN déjà utilisés par un AUTRE produit = blocage
    const duplicate = posProducts.find(p => {
      if (initialProduct && p.id === initialProduct.id) return false;
      if (normRef && (p.reference || '').trim().toLowerCase() === normRef) return true;
      if (normBarcode && (p.barcode || '').trim().toLowerCase() === normBarcode) return true;
      if (normIsbn && (p.isbn || '').trim().toLowerCase() === normIsbn) return true;
      return false;
    });
    if (duplicate) {
      setScanResult(duplicate);
      toast.error(`Doublon refusé : déjà utilisé par « ${duplicate.name} » (${duplicate.reference}).`);
      return;
    }
    // F1 : contrôle serveur anti-doublon cross-terminal (le local ne voit pas les
    // créations hors-ligne des autres postes — la contrainte d'unicité ayant sauté).
    if (!initialProduct) {
      try {
        const { supabase } = await import('../../../lib/supabase');
        const { data: serverDup } = await supabase
          .from('pos_products')
          .select('id, name, reference')
          .ilike('reference', reference)
          .limit(1)
          .maybeSingle();
        const dupRow = serverDup as any;
        if (dupRow?.id) {
          toast.error(`Doublon serveur : la référence « ${reference} » existe déjà (« ${dupRow.name} »).`);
          return;
        }
      } catch { /* hors-ligne : le contrôle local ci-dessus s'applique, la synchro tranchera */ }
    }

    if (initialProduct) {
      // Edit mode — F7 : le stock ne s'édite plus dans la fiche (last-writer-wins) :
      // quantité conservée telle quelle, ajustements via entrée/inventaire.
      await updatePosProduct(initialProduct.id, {
        reference,
        barcode: formData.barcode || '',
        isbn: formData.isbn || '',
        name: formData.name || reference,
        purchasePrice,
        sellingPrice,
        family: formData.family,
      });

      if (imageDataUri) {
        await setProductImage(initialProduct, imageDataUri);
      }
      
      toast.success('Produit / Service mis à jour avec succès');
      if (onCancel) onCancel(); // Return to catalog
    } else {
      // Create mode
      const id = uuidv4();
      const isService = formData.family === 'Service';
      const initialQuantity = isService ? 0 : (Number(formData.quantity) || 0);

      const newProduct: PosProduct = {
        id,
        reference,
        barcode: formData.barcode || '',
        isbn: formData.isbn || '',
        name: formData.name || reference,
        categoryId: '',
        brandId: '',
        supplierId: '',
        purchasePrice: Number(formData.purchasePrice) || 0,
        sellingPrice: Number(formData.sellingPrice) || 0,
        quantity: initialQuantity,
        minStock: isService ? 0 : 10,
        imageUrl: '',
        isActive: true,
        family: formData.family,
      };

      await addPosProduct(newProduct);

      if (imageDataUri) {
        await setProductImage(newProduct, imageDataUri);
      }

      if (initialQuantity > 0 && !isService) {
        await addPosStockMovement({
          productId: id,
          type: 'Ajustement Manuel',
          quantity: initialQuantity,
          reference: `INIT-${reference}`,
          createdBy: currentUser?.name || 'Utilisateur',
          notes: 'Stock initial à la création du produit'
        });
      }

      if (resetAfter) {
        setFormData({
          reference: '',
          barcode: '',
          isbn: '',
          name: '',
          purchasePrice: 0,
          quantity: 0,
          sellingPrice: 0,
          family: 'Fourniture',
        });
        setCalc({ totalPurchase: 0, totalSelling: 0, margin: 0, stockValue: 0 });
        setScanResult(null);
        setImageDataUri(undefined);
      } else {
        if (onCancel) onCancel();
      }
    }
  };

  const handleBarcodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setFormData(prev => ({ ...prev, barcode: value }));
    if (value) {
      checkExistingProduct(value);
    } else {
      setScanResult(null);
    }
  };

  return (
    <div className="card" style={{ padding: '24px', marginBottom: '24px' }}>
      <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '20px' }}>
        {initialProduct ? 'Modifier le produit' : 'Nouveau produit'}
      </h3>

      <form onSubmit={(e) => handleSubmit(e, false)}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '20px' }}>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 600, color: 'var(--color-text)' }}>
                Désignation (Nom) *
              </label>
              <input
                className="table-input"
                placeholder="Nom du produit"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 600, color: 'var(--color-text)' }}>
                Référence
              </label>
              <input
                className="table-input"
                placeholder="Réf. interne (auto)"
                value={formData.reference}
                onChange={(e) => setFormData({ ...formData, reference: e.target.value })}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 600, color: 'var(--color-text)' }}>
                Famille *
              </label>
              <select
                className="table-input"
                value={formData.family}
                onChange={(e) => {
                  const newFamily = e.target.value as 'Livre' | 'Fourniture' | 'Service';
                  if (newFamily === 'Livre' && formData.sellingPrice !== '') {
                    const sp = Number(formData.sellingPrice) || 0;
                    setFormData({ ...formData, family: newFamily, purchasePrice: Math.round(sp * 0.75) });
                  } else {
                    setFormData({ ...formData, family: newFamily });
                  }
                }}
                required
              >
                <option value="Livre">Livre</option>
                <option value="Fourniture">Fourniture</option>
                <option value="Service">Service / Impression</option>
              </select>
            </div>
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 600, color: 'var(--color-text)' }}>
              Code-barres / ISBN
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                className="table-input"
                placeholder="Saisissez un code-barres"
                value={formData.barcode}
                onChange={handleBarcodeChange}
              />
            </div>
          </div>

          {scanResult && (
            <div style={{ padding: '12px', background: 'var(--color-warning-tint)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-warning-tint)' }}>
              <p style={{ fontSize: '13px', color: 'var(--color-warning-strong)', marginBottom: '8px' }}>
                Produit déjà existant : <strong>{scanResult.name}</strong> (Référence: {scanResult.reference})
              </p>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => window.open(`/pos/products/${scanResult.id}`, '_blank')}
                  className="btn btn-primary"
                  style={{ fontSize: '12px', padding: '6px 12px' }}
                >
                  Modifier
                </button>
                <button
                  type="button"
                  onClick={() => { setScanResult(null); }}
                  className="btn btn-secondary"
                  style={{ fontSize: '12px', padding: '6px 12px' }}
                >
                  Annuler
                </button>
              </div>
            </div>
          )}

          <div>
            <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 600, color: 'var(--color-text)' }}>
              Image du produit
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              {imageDataUri ? (
                <img src={imageDataUri} alt="Aperçu" style={{ width: '64px', height: '64px', objectFit: 'cover', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }} />
              ) : (
                <div style={{ width: '64px', height: '64px', background: 'var(--color-surface-alt)', borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)', fontSize: '12px' }}>Aucune</div>
              )}
              <label className="btn btn-secondary" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px', margin: 0 }}>
                <Upload size={14} /> {imageDataUri ? 'Changer' : 'Choisir une image'}
                <input
                  type="file"
                  accept="image/png,image/jpeg"
                  style={{ display: 'none' }}
                  onChange={e => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.onload = () => setImageDataUri(reader.result as string);
                      reader.readAsDataURL(file);
                    }
                    e.target.value = '';
                  }}
                />
              </label>
              {imageDataUri && (
                <button type="button" className="btn btn-secondary" onClick={() => setImageDataUri(undefined)}>Retirer</button>
              )}
            </div>
            <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
              Optionnel — PNG ou JPG. L'image sera attribuée automatiquement au produit créé.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px', fontSize: '13px', fontWeight: 600, color: 'var(--color-text)' }}>
                <span>Prix d'achat unitaire {formData.family === 'Service' ? '(optionnel)' : '*'}</span>
                {formData.family === 'Livre' && (
                  <span style={{ fontSize: '11px', color: 'var(--color-primary)', fontWeight: 500 }}>
                    (Auto: 75% du prix de vente)
                  </span>
                )}
                {formData.family === 'Service' && (
                  <span style={{ fontSize: '11px', color: '#7c3aed', fontWeight: 500 }}>
                    (Prestation de service)
                  </span>
                )}
              </label>
              <input
                type="number"
                step="0.01"
                className="table-input"
                placeholder="0 FCFA"
                value={formData.purchasePrice}
                onChange={(e) => setFormData({ ...formData, purchasePrice: e.target.value === '' ? '' : parseFloat(e.target.value) })}
                required={formData.family !== 'Service'}
              />
            </div>

            {formData.family === 'Service' ? (
              <div style={{ background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 'var(--radius-md)', padding: '10px 14px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#7c3aed' }}>Prestation non stockée</div>
                <div style={{ fontSize: '11px', color: '#6d28d9', marginTop: '2px' }}>
                  Ce service n'a pas de stock physique et ne sera pas comptabilisé dans la valorisation du stock.
                </div>
              </div>
            ) : (
              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 600, color: 'var(--color-text)' }}>
                  Quantité en stock {initialProduct ? '(lecture seule — ajuster via Entrée ou Inventaire)' : '*'}
                </label>
                <input
                  type="number"
                  className="table-input"
                  placeholder="0"
                  min="0"
                  value={formData.quantity}
                  onChange={(e) => setFormData({ ...formData, quantity: e.target.value === '' ? '' : Math.max(0, parseInt(e.target.value)) })}
                  required={!initialProduct}
                  disabled={!!initialProduct}
                  title={initialProduct ? 'Stock modifiable uniquement via Approvisionnement ou Inventaire' : undefined}
                />
              </div>
            )}

            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 600, color: 'var(--color-text)' }}>
                Prix de vente unitaire *
              </label>
              <input
                type="number"
                step="0.01"
                className="table-input"
                placeholder="0 FCFA"
                value={formData.sellingPrice}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === '') {
                    setFormData({
                      ...formData,
                      sellingPrice: '',
                      purchasePrice: formData.family === 'Livre' ? '' : formData.purchasePrice
                    });
                  } else {
                    const sp = parseFloat(val);
                    const validSp = isNaN(sp) ? 0 : sp;
                    if (formData.family === 'Livre') {
                      setFormData({
                        ...formData,
                        sellingPrice: val as any,
                        purchasePrice: Math.round(validSp * 0.75)
                      });
                    } else {
                      setFormData({
                        ...formData,
                        sellingPrice: val as any
                      });
                    }
                  }
                }}
                required
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div style={{ background: 'var(--color-surface-alt)', padding: '16px', borderRadius: 'var(--radius-md)' }}>
              <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '4px' }}>Prix Achat Total</div>
              <div style={{ fontSize: '16px', fontWeight: 700 }}>{calc.totalPurchase.toLocaleString()} FCFA</div>
            </div>
            <div style={{ background: 'var(--color-surface-alt)', padding: '16px', borderRadius: 'var(--radius-md)' }}>
              <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '4px' }}>Prix Vente Total</div>
              <div style={{ fontSize: '16px', fontWeight: 700 }}>{calc.totalSelling.toLocaleString()} FCFA</div>
            </div>
            <div style={{ background: 'var(--color-surface-alt)', padding: '16px', borderRadius: 'var(--radius-md)' }}>
              <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '4px' }}>Marge</div>
              <div style={{ fontSize: '16px', fontWeight: 700, color: calc.margin >= 0 ? 'var(--color-success)' : 'var(--color-error)' }}>
                {calc.margin.toLocaleString()} FCFA
              </div>
            </div>
            <div style={{ background: 'var(--color-surface-alt)', padding: '16px', borderRadius: 'var(--radius-md)' }}>
              <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '4px' }}>Valeur Stock</div>
              <div style={{ fontSize: '16px', fontWeight: 700 }}>{calc.stockValue.toLocaleString()} FCFA</div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
              <Save size={16} style={{ marginRight: '6px' }} /> Enregistrer
            </button>
            {!initialProduct && (
              <button
                type="button"
                className="btn btn-secondary"
                style={{ flex: 1 }}
                onClick={(e) => { e.preventDefault(); handleSubmit(e, true); }}
              >
                <Plus size={16} style={{ marginRight: '6px' }} /> Enregistrer et Nouveau
              </button>
            )}
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                if (onCancel) {
                  onCancel();
                } else {
                  setFormData({
                    reference: '',
                    barcode: '',
                    isbn: '',
                    name: '',
                    purchasePrice: 0,
                    quantity: 0,
                    sellingPrice: 0,
                    family: 'Fourniture',
                  });
                  setCalc({ totalPurchase: 0, totalSelling: 0, margin: 0, stockValue: 0 });
                }
              }}
            >
              <X size={16} /> Annuler
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
