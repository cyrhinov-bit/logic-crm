import { SyncQueue } from './SyncQueue.js';
import type { MainSyncOp } from './SyncQueue.js';
import { ConnectivityMonitor } from './ConnectivityMonitor.js';
import { syncEmitter } from './SyncEvents.js';
import { supabaseRest } from '../services/sync/supabaseRestClient.js';

/**
 * Exécuteur réel : chaque opération est envoyée à la base Supabase configurée.
 * Vocabulaire strict — tout opérateur inconnu est marqué FAILED (jamais DONE
 * silencieux) et remonté via syncFailed. Rien ne transite par le moteur du
 * renderer : seules les opérations explicitement enfilées ici sont traitées
 * (aucun risque de double écriture avec la synchro du renderer).
 */
const SUPPORTED_KINDS = ['PING', 'POS_SALE', 'TABLE_UPSERT', 'TABLE_DELETE'] as const;

function assertOpShape(op: MainSyncOp): void {
  if (!op || typeof op !== 'object') throw new Error('Opération invalide.');
  if (!SUPPORTED_KINDS.includes(op.kind as any)) {
    throw new Error(`Type d'opération non pris en charge : ${String(op.kind).slice(0, 64)}`);
  }
}

async function executeOp(op: MainSyncOp): Promise<string> {
  assertOpShape(op);
  const p = op.payload || {};
  switch (op.kind) {
    case 'PING': {
      // Preuve de connectivité sans écriture.
      const res = await supabaseRest.ping();
      return `pong (${res.latencyMs} ms)`;
    }
    case 'POS_SALE': {
      // Vente POS via la RPC durcie (atomique + idempotente côté serveur).
      const { transaction, lines, payments } = p;
      if (!transaction?.id || !transaction?.transaction_number || !Array.isArray(lines) || lines.length === 0) {
        throw new Error('POS_SALE incomplète : transaction + lignes requises.');
      }
      await supabaseRest.rpc('process_pos_transaction', {
        p_transaction: transaction,
        p_lines: lines,
        p_payments: Array.isArray(payments) ? payments : [],
        p_stock_entry: null,
        p_stock_entry_lines: null,
      });
      return `vente ${transaction.transaction_number} synchronisée`;
    }
    case 'TABLE_UPSERT': {
      const { table, rows, onConflict } = p;
      const res = await supabaseRest.upsert(table, rows, onConflict);
      const n = Array.isArray(res) ? res.length : 1;
      return `${n} ligne(s) ${table}`;
    }
    case 'TABLE_DELETE': {
      const { table, id } = p;
      await supabaseRest.del(table, id);
      return `${table}:${String(id).slice(0, 8)} supprimé`;
    }
    default:
      throw new Error(`Type d'opération non pris en charge : ${op.kind}`);
  }
}

export class SyncWorker {
  private static running = false;
  private static lastError: string | null = null;
  private static lastSyncAt: string | null = null;

  static getLastError(): string | null {
    return this.lastError;
  }

  static getLastSyncAt(): string | null {
    return this.lastSyncAt;
  }

  static async processQueue(): Promise<{ processed: number; failed: number }> {
    if (this.running) return { processed: 0, failed: 0 };
    if (!ConnectivityMonitor.isOnline) {
      throw new Error('Hors-ligne : synchronisation impossible.');
    }
    if (!supabaseRest.isConfigured()) {
      throw new Error("Base non configurée : appelez sync:configure d'abord.");
    }
    const pending = SyncQueue.getPending();
    if (pending.length === 0) return { processed: 0, failed: 0 };

    this.running = true;
    let processed = 0;
    let failed = 0;
    syncEmitter.emit('syncStarted', { operationsCount: pending.length });
    try {
      for (const op of pending) {
        try {
          const detail = await executeOp(op);
          SyncQueue.markDone(op.id);
          processed++;
          syncEmitter.emit('syncProgress', { opId: op.id, detail });
        } catch (err: any) {
          const message = String(err?.message || err);
          SyncQueue.markFailed(op.id, message);
          failed++;
          this.lastError = message;
          syncEmitter.emit('syncFailed', { opId: op.id, message });
        }
      }
      if (failed === 0) {
        this.lastSyncAt = new Date().toISOString();
        this.lastError = null;
      }
      syncEmitter.emit('syncCompleted', { successCount: processed, failedCount: failed });
      return { processed, failed };
    } finally {
      this.running = false;
    }
  }
}
