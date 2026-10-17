/**
 * Helper to format and generate WhatsApp orders from the Public Catalog
 */

export interface CartItem {
  id: string;
  reference: string;
  name: string;
  sellingPrice: number;
  quantity: number;
  imageUrl?: string;
  family?: string;
  unit?: string;
}

export interface CustomerOrderInfo {
  fullName: string;
  phone: string;
  address: string;
  city?: string;
  notes?: string;
}

export function cleanPhoneNumber(phone?: string): string {
  if (!phone) return '';
  // Supprime tous les caractères non numériques sauf le premier + s'il existe
  let clean = phone.replace(/[^0-9]/g, '');
  // Si le numéro commence par 00, remplacer par indicatif
  if (clean.startsWith('00')) {
    clean = clean.substring(2);
  }
  return clean;
}

export function formatFCFA(amount: number): string {
  return Math.round(amount || 0).toLocaleString('fr-FR') + ' FCFA';
}

export function generateWhatsAppOrderMessage(
  customer: CustomerOrderInfo,
  items: CartItem[],
  totalAmount: number,
  companyName: string = 'Hinov Group'
): string {
  const dateStr = new Date().toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  let message = `*🛍️ NOUVELLE COMMANDE - ${companyName.toUpperCase()}*\n`;
  message += `📅 *Date :* ${dateStr}\n`;
  message += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  message += `👤 *Client :* ${customer.fullName.trim()}\n`;
  message += `📱 *Contact :* ${customer.phone.trim()}\n`;
  message += `📍 *Lieu de livraison :* ${customer.address.trim()}${customer.city ? ` (${customer.city.trim()})` : ''}\n`;
  if (customer.notes && customer.notes.trim()) {
    message += `📝 *Notes :* ${customer.notes.trim()}\n`;
  }
  message += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  message += `📦 *DÉTAIL DU PANIER (${items.reduce((sum, item) => sum + item.quantity, 0)} article${items.length > 1 ? 's' : ''}) :*\n\n`;

  items.forEach((item, index) => {
    const lineTotal = item.quantity * item.sellingPrice;
    message += `${index + 1}. *${item.name.trim()}* ${item.reference ? `(Réf: ${item.reference})` : ''}\n`;
    message += `   ▫️ ${item.quantity} × ${formatFCFA(item.sellingPrice)} = *${formatFCFA(lineTotal)}*\n\n`;
  });

  message += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  message += `💰 *TOTAL À PAYER : ${formatFCFA(totalAmount)}*\n`;
  message += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  message += `_Commande transmise depuis le Catalogue Public ${companyName}_`;

  return message;
}

export function openWhatsAppOrder(
  whatsappPhone: string,
  customer: CustomerOrderInfo,
  items: CartItem[],
  companyName: string = 'Hinov Group'
): { success: boolean; error?: string } {
  const cleanPhone = cleanPhoneNumber(whatsappPhone);
  if (!cleanPhone) {
    return {
      success: false,
      error: "Le numéro WhatsApp de réception des commandes n'a pas été configuré par l'administrateur."
    };
  }

  const totalAmount = items.reduce((sum, i) => sum + i.quantity * i.sellingPrice, 0);
  const message = generateWhatsAppOrderMessage(customer, items, totalAmount, companyName);
  const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;

  // Ouvrir dans un nouvel onglet ou l'application WhatsApp
  window.open(url, '_blank', 'noopener,noreferrer');
  return { success: true };
}

