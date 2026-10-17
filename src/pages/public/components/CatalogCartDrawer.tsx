import { useState } from 'react';
import { X, Trash2, Plus, Minus, Send, ShoppingBag, MapPin, User, Phone, FileText, CheckCircle2, AlertCircle } from 'lucide-react';
import type { CartItem, CustomerOrderInfo } from '../../../lib/whatsappOrder';
import { formatFCFA, openWhatsAppOrder } from '../../../lib/whatsappOrder';

interface CatalogCartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  items: CartItem[];
  onUpdateQuantity: (id: string, delta: number) => void;
  onRemoveItem: (id: string) => void;
  onClearCart: () => void;
  whatsappPhone: string;
  companyName?: string;
  primaryColor?: string;
}

export function CatalogCartDrawer({
  isOpen,
  onClose,
  items,
  onUpdateQuantity,
  onRemoveItem,
  onClearCart,
  whatsappPhone,
  companyName = 'Hinov Group',
  primaryColor
}: CatalogCartDrawerProps) {
  const brandColor = primaryColor || 'var(--catalog-primary, #0F766E)';
  const [customer, setCustomer] = useState<CustomerOrderInfo>(() => {
    const saved = localStorage.getItem('hinov_customer_info');
    if (saved) {
      try { return JSON.parse(saved); } catch {}
    }
    return { fullName: '', phone: '', address: '', city: 'Abidjan', notes: '' };
  });

  const [step, setStep] = useState<'cart' | 'checkout' | 'success'>('cart');
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
  const totalAmount = items.reduce((sum, item) => sum + item.quantity * item.sellingPrice, 0);

  const handleCheckoutSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!customer.fullName.trim()) {
      setError('Veuillez renseigner votre nom complet.');
      return;
    }
    if (!customer.phone.trim() || customer.phone.replace(/[^0-9]/g, '').length < 8) {
      setError('Veuillez renseigner un numéro WhatsApp valide.');
      return;
    }
    if (!customer.address.trim()) {
      setError('Veuillez préciser votre lieu ou quartier de livraison.');
      return;
    }

    // Sauvegarder les coordonnées pour la prochaine commande
    localStorage.setItem('hinov_customer_info', JSON.stringify(customer));

    // Numéro de destination WhatsApp (depuis les paramètres POS ou variable d'environnement)
    const targetPhone = whatsappPhone || import.meta.env.VITE_WHATSAPP_ORDER_PHONE || '';
    if (!targetPhone) {
      setError("Le numéro WhatsApp de la boutique n'a pas encore été configuré. Veuillez contacter directement Hinov Group.");
      return;
    }

    const result = openWhatsAppOrder(targetPhone, customer, items, companyName);
    if (result.success) {
      setStep('success');
      onClearCart();
    } else {
      setError(result.error || 'Impossible d\'ouvrir WhatsApp.');
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        zIndex: 9999,
        display: 'flex',
        justifyContent: 'flex-end',
        backdropFilter: 'blur(2px)'
      }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          backgroundColor: 'white',
          width: '100%',
          maxWidth: '480px',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '-4px 0 25px rgba(0,0,0,0.15)',
          animation: 'slideLeft 0.25s ease-out'
        }}
      >
        {/* EN-TÊTE TIROIR */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid #E5E7EB',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: '#FAFAFA'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ backgroundColor: 'var(--catalog-primary-light, #CCFBF1)', padding: '8px', borderRadius: '8px', color: brandColor }}>
              <ShoppingBag size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 700, color: '#111827' }}>
                {step === 'cart' ? 'Mon Panier' : step === 'checkout' ? 'Validation de commande' : 'Commande transmise'}
              </h3>
              <span style={{ fontSize: '12px', color: '#6B7280' }}>
                {totalItems} article{totalItems > 1 ? 's' : ''} sélectionné{totalItems > 1 ? 's' : ''}
              </span>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              background: '#F3F4F6',
              border: 'none',
              borderRadius: '50%',
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer'
            }}
          >
            <X size={18} color="#4B5563" />
          </button>
        </div>

        {/* CORPS DU TIROIR */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
          {step === 'success' ? (
            <div style={{ textAlign: 'center', padding: '30px 10px' }}>
              <div style={{ width: '64px', height: '64px', backgroundColor: '#D1FAE5', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px auto' }}>
                <CheckCircle2 size={36} color="#059669" />
              </div>
              <h3 style={{ fontSize: '20px', fontWeight: 700, color: '#111827', marginBottom: '8px' }}>
                Commande envoyée sur WhatsApp !
              </h3>
              <p style={{ fontSize: '14px', color: '#4B5563', lineHeight: '1.5', marginBottom: '24px' }}>
                Votre bon de commande a été préparé et transmis à notre service client sur WhatsApp. Nous confirmons la disponibilité et organisons votre livraison !
              </p>
              <button
                onClick={() => { setStep('cart'); onClose(); }}
                style={{
                  backgroundColor: brandColor,
                  color: 'white',
                  border: 'none',
                  padding: '12px 24px',
                  borderRadius: '10px',
                  fontWeight: 600,
                  fontSize: '14px',
                  cursor: 'pointer'
                }}
              >
                Continuer mes achats
              </button>
            </div>
          ) : items.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 10px', color: '#6B7280' }}>
              <ShoppingBag size={48} style={{ opacity: 0.3, marginBottom: '12px' }} />
              <h4 style={{ margin: '0 0 6px 0', fontSize: '16px', color: '#374151' }}>Votre panier est vide</h4>
              <p style={{ margin: 0, fontSize: '13px' }}>Ajoutez des articles depuis le catalogue pour passer commande.</p>
            </div>
          ) : step === 'cart' ? (
            /* LISTE DES ARTICLES DANS LE PANIER */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {items.map(item => (
                <div
                  key={item.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '12px',
                    backgroundColor: '#F9FAFB',
                    borderRadius: '12px',
                    border: '1px solid #E5E7EB'
                  }}
                >
                  {/* Photo produit */}
                  <div
                    style={{
                      width: '60px',
                      height: '60px',
                      borderRadius: '8px',
                      backgroundColor: 'white',
                      border: '1px solid #E5E7EB',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      overflow: 'hidden',
                      flexShrink: 0
                    }}
                  >
                    {item.imageUrl ? (
                      <img src={item.imageUrl} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                    ) : (
                      <span style={{ fontSize: '20px' }}>📦</span>
                    )}
                  </div>

                  {/* Infos & Prix */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h4 style={{ margin: '0 0 2px 0', fontSize: '14px', fontWeight: 600, color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {item.name}
                    </h4>
                    {item.reference && (
                      <div style={{ fontSize: '11px', color: '#9CA3AF', marginBottom: '4px' }}>
                        Réf: {item.reference}
                      </div>
                    )}
                    <div style={{ fontSize: '13px', fontWeight: 700, color: brandColor }}>
                      {formatFCFA(item.sellingPrice)}
                    </div>
                  </div>

                  {/* Contrôles de Quantité */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <button
                      onClick={() => onUpdateQuantity(item.id, -1)}
                      style={{
                        width: '28px',
                        height: '28px',
                        borderRadius: '6px',
                        border: '1px solid #D1D5DB',
                        background: 'white',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer'
                      }}
                    >
                      <Minus size={13} color="#374151" />
                    </button>
                    <span style={{ fontSize: '14px', fontWeight: 700, minWidth: '20px', textAlign: 'center' }}>
                      {item.quantity}
                    </span>
                    <button
                      onClick={() => onUpdateQuantity(item.id, 1)}
                      style={{
                        width: '28px',
                        height: '28px',
                        borderRadius: '6px',
                        border: '1px solid #D1D5DB',
                        background: 'white',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer'
                      }}
                    >
                      <Plus size={13} color="#374151" />
                    </button>
                    <button
                      onClick={() => onRemoveItem(item.id)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#EF4444',
                        cursor: 'pointer',
                        padding: '4px',
                        marginLeft: '4px'
                      }}
                      title="Supprimer"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}

              <button
                onClick={onClearCart}
                style={{
                  alignSelf: 'flex-start',
                  background: 'none',
                  border: 'none',
                  color: '#9CA3AF',
                  fontSize: '12px',
                  cursor: 'pointer',
                  padding: '4px 0',
                  textDecoration: 'underline'
                }}
              >
                Vider le panier
              </button>
            </div>
          ) : (
            /* FORMULAIRE DE COORDONNÉES CLIENT */
            <form id="checkout-form" onSubmit={handleCheckoutSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ backgroundColor: '#F0FDFA', border: '1px solid #CCFBF1', borderRadius: '10px', padding: '12px 14px', fontSize: '13px', color: '#0F766E', display: 'flex', gap: '8px' }}>
                <Send size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
                <span>Renseignez vos coordonnées ci-dessous pour générer votre commande WhatsApp.</span>
              </div>

              {error && (
                <div style={{ backgroundColor: '#FEF2F2', border: '1px solid #FEE2E2', borderRadius: '10px', padding: '10px 14px', fontSize: '13px', color: '#DC2626', display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <AlertCircle size={16} />
                  <span>{error}</span>
                </div>
              )}

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>
                  <User size={14} style={{ display: 'inline', marginRight: '6px', verticalAlign: 'middle' }} />
                  Nom & Prénoms *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Jean Dupont"
                  value={customer.fullName}
                  onChange={e => setCustomer({ ...customer, fullName: e.target.value })}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #D1D5DB', fontSize: '14px', outline: 'none' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>
                  <Phone size={14} style={{ display: 'inline', marginRight: '6px', verticalAlign: 'middle' }} />
                  Numéro WhatsApp *
                </label>
                <input
                  type="tel"
                  required
                  placeholder="Ex: +225 07 00 00 00 00"
                  value={customer.phone}
                  onChange={e => setCustomer({ ...customer, phone: e.target.value })}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #D1D5DB', fontSize: '14px', outline: 'none' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>
                  <MapPin size={14} style={{ display: 'inline', marginRight: '6px', verticalAlign: 'middle' }} />
                  Lieu / Adresse de livraison *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Abidjan, Cocody Angré 8ème tranche"
                  value={customer.address}
                  onChange={e => setCustomer({ ...customer, address: e.target.value })}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #D1D5DB', fontSize: '14px', outline: 'none' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>
                  <FileText size={14} style={{ display: 'inline', marginRight: '6px', verticalAlign: 'middle' }} />
                  Instructions particulières (optionnel)
                </label>
                <textarea
                  placeholder="Ex: Merci d'appeler avant de venir..."
                  value={customer.notes}
                  onChange={e => setCustomer({ ...customer, notes: e.target.value })}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #D1D5DB', fontSize: '14px', outline: 'none', minHeight: '60px', resize: 'vertical' }}
                />
              </div>
            </form>
          )}
        </div>

        {/* PIED DE PAGE & ACTIONS */}
        {items.length > 0 && step !== 'success' && (
          <div
            style={{
              padding: '16px 20px',
              borderTop: '1px solid #E5E7EB',
              backgroundColor: '#FAFAFA'
            }}
          >
            {/* Total */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <span style={{ fontSize: '14px', color: '#6B7280', fontWeight: 500 }}>Total de la commande</span>
              <span style={{ fontSize: '20px', fontWeight: 800, color: brandColor }}>
                {formatFCFA(totalAmount)}
              </span>
            </div>

            {step === 'cart' ? (
              <button
                onClick={() => setStep('checkout')}
                style={{
                  width: '100%',
                  backgroundColor: brandColor,
                  color: 'white',
                  border: 'none',
                  padding: '14px',
                  borderRadius: '12px',
                  fontWeight: 700,
                  fontSize: '15px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)'
                }}
              >
                <span>Passer la commande</span>
                <Send size={16} />
              </button>
            ) : (
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setStep('cart')}
                  style={{
                    backgroundColor: '#E5E7EB',
                    color: '#374151',
                    border: 'none',
                    padding: '14px',
                    borderRadius: '12px',
                    fontWeight: 600,
                    fontSize: '14px',
                    cursor: 'pointer'
                  }}
                >
                  Retour
                </button>
                <button
                  type="submit"
                  form="checkout-form"
                  style={{
                    flex: 1,
                    backgroundColor: '#25D366', // Couleur WhatsApp officielle
                    color: 'white',
                    border: 'none',
                    padding: '14px',
                    borderRadius: '12px',
                    fontWeight: 700,
                    fontSize: '15px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    boxShadow: '0 4px 12px rgba(37, 211, 102, 0.3)'
                  }}
                >
                  <Send size={18} />
                  <span>Envoyer sur WhatsApp</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
