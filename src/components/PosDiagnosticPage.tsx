import React, { useState, useEffect, useRef } from 'react';
import { platform } from '../platform';

export default function PosDiagnosticPage() {
  const [session, setSession] = useState<any>(null);
  const [events, setEvents] = useState<any[]>([]);
  // Le bridge n'expose pas de désabonnement : une seule souscription par montage.
  const subscribedRef = useRef(false);

  useEffect(() => {
    if (subscribedRef.current) return;
    subscribedRef.current = true;
    // S'abonner aux événements du POS
    platform.pos.onEvent((payload) => {
      setEvents(prev => [...prev, payload]);
      
      // Mettre à jour la session affichée
      if (payload.event === 'sessionOpened' || payload.event === 'sessionClosed') {
        setSession(payload.data);
      }
    });
  }, []);

  const handleOpenSale = async () => {
    try {
      const s = await platform.pos.openSale('USER_123');
      setSession(s);
    } catch(e) { alert(String(e)); }
  };

  const handleCloseSale = async () => {
    try {
      const s = await platform.pos.closeSale();
      setSession(s);
    } catch(e) { alert(String(e)); }
  };

  const handlePay = async () => {
    try {
      await platform.pos.pay(150.50, 'CASH');
    } catch(e) { alert(String(e)); }
  };

  const handleOpenDrawer = async () => {
    try {
      await platform.pos.openDrawer();
    } catch(e) { alert(String(e)); }
  };

  const handleDisplayMessage = async () => {
    try {
      await platform.pos.displayMessage("TOTAL: 150.50", "MERCI ET A BIENTOT");
    } catch(e) { alert(String(e)); }
  };

  const handlePrint = async () => {
    try {
      // Ticket de test réaliste (même format 80mm que les vrais tickets).
      const now = new Date().toISOString();
      await platform.pos.printReceipt({
        transaction: {
          transactionNumber: 'TEST-IMPRESSION',
          date: now,
          payments: [{ method: 'Espèces', amount: 150.50 }],
        },
        cart: [{ name: 'Article test', quantity: 1, unitPrice: 150.50, total: 150.50 }],
        paymentMethod: 'Espèces',
        cashAmount: 150.50,
        changeAmount: 0,
        total: 150.50,
        subtotal: 150.50,
        globalDiscount: 0,
        cashierName: 'Test',
      });
      alert("Ticket de test envoyé à l'impression.");
    } catch(e: any) { alert("Échec d'impression : " + (e?.message || e)); }
  };

  return (
    <div style={{ padding: '24px', fontFamily: 'sans-serif' }}>
      <h1>Centre de Test Moteur POS (Phase 17)</h1>
      
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginTop: '20px' }}>
        
        {/* Colonne 1 : Commandes POS */}
        <div style={{ background: '#f5f5f5', padding: '15px', borderRadius: '4px' }}>
          <h3>Commandes de Caisse</h3>
          
          <div style={{ marginBottom: '10px' }}>
            <strong>État de la session : </strong> {session ? session.status : 'Aucune'}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <button onClick={handleOpenSale} disabled={session && session.status === 'OPEN'}>Ouvrir Vente</button>
            <button onClick={handleCloseSale} disabled={!session || session.status === 'CLOSED'}>Fermer Vente</button>
            <hr/>
            <button onClick={handlePay}>Encaisser (Cash - 150.50)</button>
            <button onClick={handleOpenDrawer}>Ouvrir Tiroir-Caisse</button>
            <button onClick={handleDisplayMessage}>Test Afficheur Client</button>
            <button onClick={handlePrint}>Test Impression Ticket</button>
          </div>
        </div>

        {/* Colonne 2 : Journal d'événements */}
        <div style={{ background: '#e3f2fd', padding: '15px', borderRadius: '4px', height: '400px', overflowY: 'auto' }}>
          <h3>Bus d'Événements (Live)</h3>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {events.map((evt, idx) => (
              <li key={idx} style={{ padding: '5px', borderBottom: '1px solid #ccc', fontSize: '13px' }}>
                <strong style={{ color: '#1565c0' }}>{evt.event}</strong> : 
                <pre style={{ margin: 0, fontSize: '11px', background: '#fff', padding: '4px' }}>
                  {JSON.stringify(evt.data, null, 2)}
                </pre>
              </li>
            ))}
            {events.length === 0 && <li>En attente d'événements...</li>}
          </ul>
        </div>

      </div>
    </div>
  );
}
