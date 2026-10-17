import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { syncEmitter } from './SyncEvents.js';

export type SyncOpStatus = 'PENDING' | 'FAILED' | 'DONE';

export interface MainSyncOp {
  id: string;
  kind: string;
  payload?: any;
  status: SyncOpStatus;
  attempts: number;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
}

const QUEUE_FILE = 'main-sync-queue.json';
const MAX_STORED_DONE = 50;

/**
 * File d'opérations du main-process, persistée (anti-perte au redémarrage).
 * Rien n'est marqué DONE sans succès serveur confirmé.
 */
export class SyncQueue {
  private static queue: MainSyncOp[] | null = null;

  private static file(): string {
    return path.join(app.getPath('userData'), QUEUE_FILE);
  }

  private static load(): MainSyncOp[] {
    if (this.queue) return this.queue;
    try {
      const f = this.file();
      if (fs.existsSync(f)) {
        const parsed = JSON.parse(fs.readFileSync(f, 'utf-8'));
        this.queue = Array.isArray(parsed) ? parsed : [];
      } else {
        this.queue = [];
      }
    } catch {
      this.queue = [];
    }
    return this.queue;
  }

  private static save(): void {
    try {
      // Borne : on conserve les DONE récents pour l'historique, jamais plus.
      const done = this.queue!.filter(o => o.status === 'DONE').slice(-MAX_STORED_DONE);
      const rest = this.queue!.filter(o => o.status !== 'DONE');
      this.queue = [...rest, ...done];
      fs.writeFileSync(this.file(), JSON.stringify(this.queue), 'utf-8');
    } catch (err) {
      syncEmitter.emit('queueError', { message: String((err as any)?.message || err) });
    }
  }

  /** Compatibilité ascendante avec l'ancien stub (opérations {…} sans kind). */
  static addOperation(operation: any): MainSyncOp {
    const queue = this.load();
    const op: MainSyncOp = {
      id: (operation && typeof operation.id === 'string' && operation.id) || randomUUID(),
      kind: (operation && typeof operation.kind === 'string' && operation.kind) || (operation && operation.type) || 'UNKNOWN',
      payload: operation?.payload ?? operation?.data ?? null,
      status: 'PENDING',
      attempts: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    queue.push(op);
    this.save();
    syncEmitter.emit('queueUpdated', { size: this.getPending().length });
    return op;
  }

  static getPending(): MainSyncOp[] {
    return this.load().filter(op => op.status === 'PENDING' || op.status === 'FAILED');
  }

  static getFailed(): MainSyncOp[] {
    return this.load().filter(op => op.status === 'FAILED');
  }

  static markDone(id: string): void {
    const op = this.load().find(o => o.id === id);
    if (op) {
      op.status = 'DONE';
      op.lastError = undefined;
      op.updatedAt = new Date().toISOString();
      this.save();
    }
    syncEmitter.emit('queueUpdated', { size: this.getPending().length });
  }

  static markFailed(id: string, message: string): void {
    const op = this.load().find(o => o.id === id);
    if (op) {
      op.status = 'FAILED';
      op.attempts += 1;
      op.lastError = String(message).slice(0, 500);
      op.updatedAt = new Date().toISOString();
      this.save();
    }
    syncEmitter.emit('queueUpdated', { size: this.getPending().length });
  }

  static clearDone(): void {
    this.queue = this.load().filter(o => o.status !== 'DONE');
    this.save();
  }
}
