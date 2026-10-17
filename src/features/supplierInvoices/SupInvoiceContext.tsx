// Store + synchro PROPRES au module (indépendant d'AppContext et de sync.ts).
// Stratégie : cache-first localforage (base `hinov-sup` dédiée), puis lecture
// Supabase en arrière-plan ; écritures optimistes locales + upsert cloud
// best-effort (le local fait foi hors-ligne, convergence au prochain chargement).
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import localforage from 'localforage';
import { v4 as uuidv4 } from 'uuid';
import { supabase } from '../../lib/supabase';
import type { SupSupplier, SupInvoice, SupPayment, SupInvoiceStatus } from './types';

const store = (storeName: string) =>
  localforage.createInstance({
    name: 'hinov-sup',
    storeName,
    driver: [localforage.INDEXEDDB, localforage.WEBSQL, localforage.LOCALSTORAGE],
  });

const dbSuppliers = store('supSuppliers');
const dbInvoices = store('supInvoices');
const dbPayments = store('supPayments');

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

// ── Mappers snake_case (Supabase) ↔ camelCase (app) ───────────────────────────
const mapSupplierFromRow = (r: any): SupSupplier => ({
  id: r.id,
  name: r.name,
  contact: r.contact || undefined,
  phone: r.phone || undefined,
  email: r.email || undefined,
  nif: r.nif || undefined,
  address: r.address || undefined,
  notes: r.notes || undefined,
  createdBy: r.created_by || undefined,
  createdByName: r.created_by_name || undefined,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const mapSupplierToRow = (s: SupSupplier) => ({
  id: s.id,
  name: s.name,
  contact: s.contact || null,
  phone: s.phone || null,
  email: s.email || null,
  nif: s.nif || null,
  address: s.address || null,
  notes: s.notes || null,
  created_by: s.createdBy || null,
  created_by_name: s.createdByName || null,
  updated_at: new Date().toISOString(),
});

const mapInvoiceFromRow = (r: any): SupInvoice => ({
  id: r.id,
  supplierId: r.supplier_id || undefined,
  supplierName: r.supplier_name || '',
  invoiceNumber: r.invoice_number || '',
  issueDate: r.issue_date,
  dueDate: r.due_date || undefined,
  amountHt: num(r.amount_ht),
  vatAmount: num(r.vat_amount),
  amountTtc: num(r.amount_ttc),
  status: r.status,
  paymentMethod: r.payment_method || undefined,
  description: r.description || undefined,
  attachmentName: r.attachment_name || undefined,
  attachmentMime: r.attachment_mime || undefined,
  attachmentData: r.attachment_data || undefined,
  createdBy: r.created_by || undefined,
  createdByName: r.created_by_name || undefined,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const mapInvoiceToRow = (i: SupInvoice) => ({
  id: i.id,
  supplier_id: i.supplierId || null,
  supplier_name: i.supplierName,
  invoice_number: i.invoiceNumber,
  issue_date: i.issueDate,
  due_date: i.dueDate || null,
  amount_ht: i.amountHt,
  vat_amount: i.vatAmount,
  amount_ttc: i.amountTtc,
  status: i.status,
  payment_method: i.paymentMethod || null,
  description: i.description || null,
  attachment_name: i.attachmentName || null,
  attachment_mime: i.attachmentMime || null,
  attachment_data: i.attachmentData || null,
  created_by: i.createdBy || null,
  created_by_name: i.createdByName || null,
  updated_at: new Date().toISOString(),
});

const mapPaymentFromRow = (r: any): SupPayment => ({
  id: r.id,
  invoiceId: r.invoice_id,
  paymentDate: r.payment_date,
  amount: num(r.amount),
  method: r.method || undefined,
  reference: r.reference || undefined,
  notes: r.notes || undefined,
  createdBy: r.created_by || undefined,
  createdByName: r.created_by_name || undefined,
  createdAt: r.created_at,
});

const mapPaymentToRow = (p: SupPayment) => ({
  id: p.id,
  invoice_id: p.invoiceId,
  payment_date: p.paymentDate,
  amount: p.amount,
  method: p.method || null,
  reference: p.reference || null,
  notes: p.notes || null,
  created_by: p.createdBy || null,
  created_by_name: p.createdByName || null,
});

const mergeById = <T extends { id: string; updatedAt?: string; createdAt?: string }>(
  local: T[],
  remote: T[],
): T[] => {
  const map = new Map<string, T>(local.map((x) => [x.id, x]));
  for (const r of remote) {
    const l = map.get(r.id);
    if (!l) {
      map.set(r.id, r);
      continue;
    }
    const lt = l.updatedAt || l.createdAt || '';
    const rt = r.updatedAt || r.createdAt || '';
    map.set(r.id, rt >= lt ? { ...l, ...r } : l);
  }
  return Array.from(map.values());
};

interface SupInvoiceContextValue {
  suppliers: SupSupplier[];
  invoices: SupInvoice[];
  payments: SupPayment[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  saveSupplier: (s: SupSupplier) => Promise<void>;
  deleteSupplier: (id: string) => Promise<void>;
  saveInvoice: (i: SupInvoice) => Promise<void>;
  deleteInvoice: (id: string) => Promise<void>;
  addPayment: (p: SupPayment) => Promise<void>;
  deletePayment: (id: string) => Promise<void>;
  paidForInvoice: (invoiceId: string) => number;
}

const SupInvoiceContext = createContext<SupInvoiceContextValue | undefined>(undefined);

export function SupInvoiceProvider({ children }: { children: ReactNode }) {
  const [suppliers, setSuppliers] = useState<SupSupplier[]>([]);
  const [invoices, setInvoices] = useState<SupInvoice[]>([]);
  const [payments, setPayments] = useState<SupPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    let cs: SupSupplier[] | null = null;
    try {
      const [s, i, p] = await Promise.all([
        dbSuppliers.getItem<SupSupplier[]>('data').catch(() => null),
        dbInvoices.getItem<SupInvoice[]>('data').catch(() => null),
        dbPayments.getItem<SupPayment[]>('data').catch(() => null),
      ]);
      cs = s;
      if (s) setSuppliers(s);
      if (i) setInvoices(i);
      if (p) setPayments(p);
    } catch {
      /* cache illisible : on continue vers le cloud */
    }
    try {
      const [rs, ri, rp] = await Promise.all([
        supabase.from('sup_suppliers').select('*'),
        supabase.from('sup_invoices').select('*'),
        supabase.from('sup_payments').select('*'),
      ]);
      if (rs.error) throw new Error(rs.error.message);
      if (ri.error) throw new Error(ri.error.message);
      if (rp.error) throw new Error(rp.error.message);
      const remoteSuppliers = ((rs.data || []) as any[]).map(mapSupplierFromRow);
      const remoteInvoices = ((ri.data || []) as any[]).map(mapInvoiceFromRow);
      const remotePayments = ((rp.data || []) as any[]).map(mapPaymentFromRow);
      setSuppliers((prev) => {
        const merged = mergeById(prev, remoteSuppliers);
        void dbSuppliers.setItem('data', merged).catch(() => {});
        return merged;
      });
      setInvoices((prev) => {
        const merged = mergeById(prev, remoteInvoices);
        void dbInvoices.setItem('data', merged).catch(() => {});
        return merged;
      });
      setPayments((prev) => {
        const merged = mergeById(prev, remotePayments);
        void dbPayments.setItem('data', merged).catch(() => {});
        return merged;
      });
    } catch (e: any) {
      // Cloud inaccessible (hors-ligne, session expirée, RLS…) : le cache
      // local reste affiché. Bandeau seulement si rien en cache.
      const msg = e?.message || 'accès cloud impossible';
      console.warn('[sup-factures] chargement cloud impossible :', msg);
      if (!cs || cs.length === 0) {
        setError(`Données locales uniquement (${msg}). Vérifiez la connexion puis cliquez sur Actualiser.`);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const saveSupplier = useCallback(
    async (s: SupSupplier) => {
      const row: SupSupplier = {
        ...s,
        id: s.id || uuidv4(),
        name: s.name.trim(),
        updatedAt: new Date().toISOString(),
      };
      const next = (() => {
        let out = suppliers;
        return out.some((x) => x.id === row.id)
          ? out.map((x) => (x.id === row.id ? row : x))
          : [...out, row];
      })();
      setSuppliers(next);
      await dbSuppliers.setItem('data', next).catch(() => {});
      try {
        const { error } = await supabase.from('sup_suppliers').upsert(mapSupplierToRow(row), { onConflict: 'id' });
        if (error) console.warn('[sup-fournisseurs] cloud différé :', error.message);
      } catch (e) {
        console.warn('[sup-fournisseurs] hors-ligne, sera convergé au prochain chargement.');
      }
    },
    [suppliers],
  );

  const deleteSupplier = useCallback(
    async (id: string) => {
      // Indépendance : on ne supprime jamais les factures ; elles gardent
      // supplierName en snapshot et supplierId repasse à vide.
      const nextSup = suppliers.filter((x) => x.id !== id);
      setSuppliers(nextSup);
      await dbSuppliers.setItem('data', nextSup).catch(() => {});
      const nextInv = invoices.map((i) => (i.supplierId === id ? { ...i, supplierId: undefined } : i));
      setInvoices(nextInv);
      await dbInvoices.setItem('data', nextInv).catch(() => {});
      try {
        await supabase.from('sup_suppliers').delete().eq('id', id);
        for (const inv of nextInv.filter((i) => i.supplierId === undefined && invoices.some((o) => o.id === i.id && o.supplierId === id))) {
          await supabase.from('sup_invoices').update({ supplier_id: null }).eq('id', inv.id);
        }
      } catch {
        console.warn('[sup-fournisseurs] suppression cloud différée.');
      }
    },
    [suppliers, invoices],
  );

  const saveInvoice = useCallback(
    async (i: SupInvoice) => {
      const row: SupInvoice = {
        ...i,
        id: i.id || uuidv4(),
        supplierName: i.supplierName.trim(),
        invoiceNumber: i.invoiceNumber.trim(),
        updatedAt: new Date().toISOString(),
      };
      const next = invoices.some((x) => x.id === row.id)
        ? invoices.map((x) => (x.id === row.id ? row : x))
        : [...invoices, row];
      setInvoices(next);
      await dbInvoices.setItem('data', next).catch(() => {});
      try {
        const { error } = await supabase.from('sup_invoices').upsert(mapInvoiceToRow(row), { onConflict: 'id' });
        if (error) console.warn('[sup-factures] cloud différé :', error.message);
      } catch {
        console.warn('[sup-factures] hors-ligne, sera convergé au prochain chargement.');
      }
    },
    [invoices],
  );

  const deleteInvoice = useCallback(
    async (id: string) => {
      const nextInv = invoices.filter((x) => x.id !== id);
      setInvoices(nextInv);
      await dbInvoices.setItem('data', nextInv).catch(() => {});
      const nextPay = payments.filter((p) => p.invoiceId !== id);
      setPayments(nextPay);
      await dbPayments.setItem('data', nextPay).catch(() => {});
      try {
        await supabase.from('sup_invoices').delete().eq('id', id);
      } catch {
        console.warn('[sup-factures] suppression cloud différée.');
      }
    },
    [invoices, payments],
  );

  const addPayment = useCallback(
    async (p: SupPayment) => {
      const row: SupPayment = { ...p, id: p.id || uuidv4() };
      const inv = invoices.find((x) => x.id === row.invoiceId);
      // Bascule auto du statut : PARTIELLEMENT_PAYÉE / PAYÉE
      if (inv) {
        const totalPaid = payments.filter((x) => x.invoiceId === row.invoiceId).reduce((s, x) => s + x.amount, 0) + row.amount;
        const nextStatus: SupInvoiceStatus =
          totalPaid >= (inv.amountTtc || 0) && (inv.amountTtc || 0) > 0
            ? 'PAYÉE'
            : totalPaid > 0
              ? 'PARTIELLEMENT_PAYÉE'
              : inv.status;
        if (nextStatus !== inv.status) {
          const updated = { ...inv, status: nextStatus, updatedAt: new Date().toISOString() };
          const nextInv = invoices.map((x) => (x.id === updated.id ? updated : x));
          setInvoices(nextInv);
          void dbInvoices.setItem('data', nextInv).catch(() => {});
          try {
            await supabase.from('sup_invoices').update({ status: nextStatus }).eq('id', updated.id);
          } catch {
            /* convergé plus tard */
          }
        }
      }
      const next = [...payments, row];
      setPayments(next);
      await dbPayments.setItem('data', next).catch(() => {});
      try {
        const { error } = await supabase.from('sup_payments').upsert(mapPaymentToRow(row), { onConflict: 'id' });
        if (error) console.warn('[sup-paiements] cloud différé :', error.message);
      } catch {
        console.warn('[sup-paiements] hors-ligne, sera convergé au prochain chargement.');
      }
    },
    [invoices, payments],
  );

  const deletePayment = useCallback(
    async (id: string) => {
      const target = payments.find((p) => p.id === id);
      const next = payments.filter((p) => p.id !== id);
      setPayments(next);
      await dbPayments.setItem('data', next).catch(() => {});
      // Recalcule le statut de la facture concernée
      if (target) {
        const inv = invoices.find((x) => x.id === target.invoiceId);
        if (inv && (inv.status === 'PAYÉE' || inv.status === 'PARTIELLEMENT_PAYÉE')) {
          const totalPaid = next.filter((x) => x.invoiceId === target.invoiceId).reduce((s, x) => s + x.amount, 0);
          const nextStatus: SupInvoiceStatus = totalPaid <= 0 ? 'VALIDÉE' : totalPaid < (inv.amountTtc || 0) ? 'PARTIELLEMENT_PAYÉE' : 'PAYÉE';
          if (nextStatus !== inv.status) {
            const updated = { ...inv, status: nextStatus, updatedAt: new Date().toISOString() };
            const nextInv = invoices.map((x) => (x.id === updated.id ? updated : x));
            setInvoices(nextInv);
            void dbInvoices.setItem('data', nextInv).catch(() => {});
            try {
              await supabase.from('sup_invoices').update({ status: nextStatus }).eq('id', updated.id);
            } catch {
              /* convergé plus tard */
            }
          }
        }
      }
      try {
        await supabase.from('sup_payments').delete().eq('id', id);
      } catch {
        console.warn('[sup-paiements] suppression cloud différée.');
      }
    },
    [invoices, payments],
  );

  const paidForInvoice = useCallback(
    (invoiceId: string) => payments.filter((p) => p.invoiceId === invoiceId).reduce((s, p) => s + (Number(p.amount) || 0), 0),
    [payments],
  );

  return (
    <SupInvoiceContext.Provider
      value={{ suppliers, invoices, payments, loading, error, refresh, saveSupplier, deleteSupplier, saveInvoice, deleteInvoice, addPayment, deletePayment, paidForInvoice }}
    >
      {children}
    </SupInvoiceContext.Provider>
  );
}

export function useSupInvoices(): SupInvoiceContextValue {
  const ctx = useContext(SupInvoiceContext);
  if (!ctx) throw new Error('useSupInvoices doit être utilisé dans <SupInvoiceProvider>');
  return ctx;
}
