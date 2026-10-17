import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Client REST minimal vers la base Supabase (PostgREST + RPC), sans dépendance
 * externe (fetch natif Node 18+). Utilisé UNIQUEMENT par le moteur de synchro
 * du main-process pour les opérations qu'on lui confie explicitement.
 * Le token d'auth (session du renderer) n'est conservé qu'en mémoire.
 */

export interface SupabaseRestConfig {
  url: string;
  anonKey: string;
}

const CONFIG_FILE = 'supabase-sync-config.json';
const REQUEST_TIMEOUT_MS = 25000;

class SupabaseRestClient {
  private url: string | null = null;
  private anonKey: string | null = null;
  private authToken: string | null = null;

  constructor() {
    // Restaure url/clé persistées (jamais le token).
    try {
      const file = path.join(app.getPath('userData'), CONFIG_FILE);
      if (fs.existsSync(file)) {
        const saved = JSON.parse(fs.readFileSync(file, 'utf-8'));
        if (typeof saved?.url === 'string' && typeof saved?.anonKey === 'string') {
          this.url = saved.url;
          this.anonKey = saved.anonKey;
        }
      }
    } catch {
      /* pas de config : configure() exigé */
    }
    // Repli : variables d'environnement du main-process (dev).
    if (!this.url && process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY) {
      this.url = process.env.SUPABASE_URL;
      this.anonKey = process.env.SUPABASE_ANON_KEY;
    }
    if (!this.url && process.env.VITE_SUPABASE_URL && process.env.VITE_SUPABASE_ANON_KEY) {
      this.url = process.env.VITE_SUPABASE_URL;
      this.anonKey = process.env.VITE_SUPABASE_ANON_KEY;
    }
  }

  configure(url: string, anonKey: string): void {
    if (typeof url !== 'string' || !/^https:\/\/.+/.test(url)) {
      throw new Error('URL Supabase invalide (https attendue).');
    }
    if (typeof anonKey !== 'string' || anonKey.length < 20) {
      throw new Error('Clé anon Supabase invalide.');
    }
    this.url = url.replace(/\/+$/, '');
    this.anonKey = anonKey;
    try {
      const file = path.join(app.getPath('userData'), CONFIG_FILE);
      fs.writeFileSync(file, JSON.stringify({ url: this.url, anonKey: this.anonKey }), 'utf-8');
    } catch (err: any) {
      throw new Error('Persistance config impossible : ' + String(err?.message || err));
    }
  }

  setAuthToken(token: string | null): void {
    this.authToken = typeof token === 'string' && token.length > 0 ? token : null;
  }

  isConfigured(): boolean {
    return !!this.url && !!this.anonKey;
  }

  isAuthenticated(): boolean {
    return this.isConfigured() && !!this.authToken;
  }

  private async request(pathname: string, init: RequestInit, authRequired: boolean): Promise<any> {
    if (!this.url || !this.anonKey) {
      throw new Error('Base non configurée : appelez sync:configure d\'abord.');
    }
    if (authRequired && !this.authToken) {
      throw new Error('Non authentifié : token de session manquant (sync:setAuthToken).');
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(`${this.url}${pathname}`, {
        ...init,
        signal: controller.signal,
        headers: {
          apikey: this.anonKey,
          Authorization: `Bearer ${this.authToken || this.anonKey}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
          ...(init.headers as Record<string, string>),
        },
      });
      const text = await res.text();
      let body: any = null;
      try {
        body = text ? JSON.parse(text) : null;
      } catch {
        body = text;
      }
      if (!res.ok) {
        const msg = (body && (body.message || body.hint)) || `HTTP ${res.status}`;
        const err: any = new Error(`Supabase: ${msg}`);
        err.status = res.status;
        err.code = body?.code;
        throw err;
      }
      return body;
    } catch (err: any) {
      if (err?.name === 'AbortError') throw new Error('Délai réseau dépassé (Supabase injoignable).');
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  rpc(fn: string, args: Record<string, any>): Promise<any> {
    if (!/^[a-z_][a-z0-9_]*$/i.test(fn)) throw new Error('Nom de fonction RPC invalide.');
    return this.request(`/rest/v1/rpc/${fn}`, { method: 'POST', body: JSON.stringify(args || {}) }, true);
  }

  upsert(table: string, rows: any[], onConflict?: string): Promise<any> {
    this.assertTable(table);
    if (!Array.isArray(rows) || rows.length === 0) throw new Error('Upsert sans lignes.');
    const qs = onConflict ? `?on_conflict=${encodeURIComponent(onConflict)}` : '';
    return this.request(`/rest/v1/${table}${qs}`, {
      method: 'POST',
      body: JSON.stringify(rows),
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    }, true);
  }

  del(table: string, id: string): Promise<any> {
    this.assertTable(table);
    if (typeof id !== 'string' || id.length === 0 || id.length > 128) throw new Error('ID invalide.');
    return this.request(`/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' }, true);
  }

  ping(): Promise<{ ok: boolean; latencyMs: number }> {
    const started = Date.now();
    return this.request('/rest/v1/', { method: 'GET' }, false).then(() => ({
      ok: true,
      latencyMs: Date.now() - started,
    }));
  }

  private assertTable(table: string): void {
    if (!/^[a-z_][a-z0-9_]*$/i.test(table) || table.length > 64) {
      throw new Error('Nom de table invalide.');
    }
  }
}

export const supabaseRest = new SupabaseRestClient();
