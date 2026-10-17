import { useState, useEffect, useCallback } from 'react';
import { useAppContext } from '../../../context/AppContext';
import { Camera, Search, ShoppingCart } from 'lucide-react';
import { barcodeScannerService } from '../services/BarcodeScannerService';
import ProductImage from '../images/ProductImage';
import type { PosProduct } from '../../../context/AppContext';

interface BarcodeScannerPanelProps {
  onNotFound?: (barcode: string) => void;
}

export default function BarcodeScannerPanel({ onNotFound }: BarcodeScannerPanelProps = {}) {
  const { posProducts, posCashSessions } = useAppContext();
  const [scannerActive, setScannerActive] = useState(false);
  const [scanInput, setScanInput] = useState('');
  const [scanResult, setScanResult] = useState<PosProduct | null>(null);
  const [lastScan, setLastScan] = useState<string>('');
  const [cartItems, setCartItems] = useState<PosProduct[]>([]);
  const [justAdded, setJustAdded] = useState<string | null>(null);

  const handleScan = useCallback((code: string) => {
    const result = barcodeScannerService.searchProduct(code, posProducts);
    if (result.scanned && result.products.length > 0) {
      setScanResult(result.products[0]);
    } else {
      setScanResult(null);
    }
  }, [posProducts]);

  useEffect(() => {
    barcodeScannerService.startKeyboardListener();
    
    const unsubscribe = barcodeScannerService.subscribe((barcode: string) => {
      setLastScan(barcode);
      setScanInput(barcode);
      handleScan(barcode);
    });

    return () => {
      unsubscribe();
      barcodeScannerService.stopKeyboardListener();
    };
  }, [handleScan]);

  const handleScanClick = () => {
    setScannerActive(true);
    setTimeout(() => setScannerActive(false), 2000);
  };

  const handleAddToCart = () => {
    if (!scanResult) return;
    setCartItems(prev => [...prev, scanResult]);
    setJustAdded(scanResult.name);
    setTimeout(() => setJustAdded(null), 2000);
    setScanResult(null);
    setScanInput('');
    setLastScan('');
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setScanInput(e.target.value);
    if (e.target.value.length >= 4) {
      handleScan(e.target.value);
    }
  };

  const openSession = posCashSessions.find(s => s.status === 'Ouverte');

  return (
    <div>
      <h2 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '24px' }}>Scanner Code-barres</h2>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '24px' }}>
        <div className="card" style={{ padding: '20px', textAlign: 'center' }}>
          <Camera size={32} color="var(--color-primary)" style={{ marginBottom: '12px' }} />
          <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '8px' }}>Scanner actif</h3>
          <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginBottom: '16px' }}>
            {scannerActive ? 'Prêt à scanner...' : 'Cliquez pour activer le scanner'}
          </p>
          <button
            className="btn btn-primary"
            onClick={handleScanClick}
            style={{ fontSize: '13px' }}
          >
            Activer le scanner
          </button>
        </div>

        <div className="card" style={{ padding: '20px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '12px' }}>Recherche par code</h3>
          <div style={{ marginBottom: '12px', position: 'relative' }}>
            <input
              type="text"
              className="table-input"
              placeholder="Saisir un code-barres ou ISBN..."
              value={scanInput}
              onChange={handleInputChange}
              autoFocus
            />
            <Search size={16} style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
          </div>

          {lastScan && (
            <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '8px' }}>
              Dernier scan : {lastScan}
            </p>
          )}

          {scanResult && (
            <div style={{ padding: '12px', background: 'var(--color-success-tint)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-success-tint)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <ProductImage product={scanResult} size={48} />
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 600 }}>{scanResult.name}</div>
                  <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                    Réf: {scanResult.reference} | Stock: {scanResult.quantity}
                  </div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--color-success)' }}>
                    {scanResult.sellingPrice.toLocaleString()} FCFA
                  </div>
                </div>
              </div>
              <div style={{ marginTop: '8px', display: 'flex', gap: '8px' }}>
                <button
                  className="btn btn-primary"
                  style={{ fontSize: '12px', padding: '6px 12px' }}
                  onClick={handleAddToCart}
                >
                  <ShoppingCart size={14} style={{ marginRight: '4px' }} /> Ajouter au panier
                </button>
              </div>
            </div>
          )}

          {!scanResult && scanInput && scanInput.length >= 4 && (
            <div style={{ padding: '12px', background: 'var(--color-warning-tint)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-warning-tint)' }}>
              <p style={{ fontSize: '13px', color: 'var(--color-warning-strong)', marginBottom: onNotFound ? '12px' : '0' }}>
                Produit introuvable pour le code : {scanInput}
              </p>
              {onNotFound && (
                <button
                  className="btn btn-primary"
                  style={{ fontSize: '12px', padding: '6px 12px' }}
                  onClick={() => onNotFound(scanInput)}
                >
                  Créer ce produit
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {cartItems.length > 0 && (
        <div className="card" style={{ padding: '20px', marginBottom: '24px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '12px' }}>
            Produits ajoutés ({cartItems.length})
          </h3>
          {justAdded && (
            <p style={{ fontSize: '13px', color: 'var(--color-success)', marginBottom: '8px' }}>
              ✓ {justAdded} ajouté au panier
            </p>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {cartItems.map((item, idx) => (
              <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px', background: 'var(--color-surface-alt)', borderRadius: 'var(--radius-sm)' }}>
                <div style={{ fontSize: '13px', fontWeight: 500 }}>{item.name}</div>
                <div style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>
                  {item.sellingPrice.toLocaleString()} FCFA
                </div>
              </div>
            ))}
          </div>
          <button
            className="btn"
            style={{ fontSize: '12px', marginTop: '12px' }}
            onClick={() => setCartItems([])}
          >
            Vider
          </button>
        </div>
      )}

      {!openSession && (
        <div className="card" style={{ padding: '16px', background: 'var(--color-error-tint)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-error-tint)' }}>
          <p style={{ fontSize: '13px', color: 'var(--color-error-strong)' }}>
            ⚠️ Aucune session de caisse ouverte. Veuillez ouvrir une session pour effectuer des ventes.
          </p>
        </div>
      )}
    </div>
  );
}
