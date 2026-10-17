import { app, shell } from 'electron';
import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import type { ComposeMailInput, ComposeMailResult } from './OutlookMailService.js';

const execFileAsync = promisify(execFile);

/** ["a@x.com","b@x.com"] -> "a@x.com,b@x.com" (liste d'adresses pour mailto). */
function toMailtoList(value?: string | string[]): string {
  if (!value) return '';
  const list = Array.isArray(value) ? value : [value];
  return list.map(v => String(v || '').trim()).filter(Boolean).join(',');
}

function sanitizeFileName(name: string): string {
  const base = (name || 'piece-jointe.pdf').replace(/[\\/:*?"<>|\r\n]/g, '_').trim();
  return base || 'piece-jointe.pdf';
}

/** Construit l'URL mailto (destinataires + objet + corps encodés). */
function buildMailtoUrl(input: ComposeMailInput): string {
  const params: string[] = [];
  if (input.subject) params.push(`subject=${encodeURIComponent(input.subject)}`);
  if (input.cc) params.push(`cc=${encodeURIComponent(toMailtoList(input.cc))}`);
  if (input.bcc) params.push(`bcc=${encodeURIComponent(toMailtoList(input.bcc))}`);
  if (input.body) params.push(`body=${encodeURIComponent(input.body)}`);
  const to = toMailtoList(input.to);
  return `mailto:${to}${params.length ? `?${params.join('&')}` : ''}`;
}

/** Copie un fichier dans le presse-papiers Windows (collage direct dans un e-mail). */
async function copyFileToClipboard(filePath: string): Promise<boolean> {
  try {
    const safe = filePath.replace(/'/g, "''");
    await execFileAsync('powershell.exe', [
      '-NoProfile',
      '-STA',
      '-ExecutionPolicy', 'Bypass',
      '-Command', `Set-Clipboard -LiteralPath '${safe}'`
    ], { windowsHide: true, timeout: 20000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Ouvre l'application de messagerie PAR DÉFAUT (nouvel Outlook, Thunderbird, …) via un lien mailto.
 * Contrairement au mode COM, ce mode ne peut pas joindre le fichier automatiquement : on enregistre
 * donc le PDF sur disque et on le copie dans le presse-papiers pour un collage immédiat (Ctrl+V).
 */
export class DefaultMailService {
  static async openDefault(input: ComposeMailInput): Promise<ComposeMailResult> {
    try {
      // 1. Enregistre les pièces jointes dans Documents/Logic CRM/Devis (fichier stable, requis pour le presse-papiers).
      const savedPaths: string[] = [];
      if (input.attachments?.length) {
        const dir = path.join(app.getPath('documents'), 'Logic CRM', 'Devis');
        await fs.mkdir(dir, { recursive: true });
        for (let i = 0; i < input.attachments.length; i++) {
          const att = input.attachments[i];
          if (!att?.base64) continue;
          const filePath = path.join(dir, sanitizeFileName(att.filename || `piece-jointe-${i + 1}`));
          await fs.writeFile(filePath, Buffer.from(att.base64, 'base64'));
          savedPaths.push(filePath);
        }
      }

      // 2. Ouvre l'application de messagerie par défaut avec les champs pré-remplis.
      const url = buildMailtoUrl(input);
      await shell.openExternal(url);

      // 3. Best-effort : copie le PDF dans le presse-papiers pour un collage direct.
      let copiedToClipboard = false;
      if (savedPaths[0]) {
        copiedToClipboard = await copyFileToClipboard(savedPaths[0]);
      }

      return { ok: true, mode: 'mailto', filePath: savedPaths[0], copiedToClipboard };
    } catch (err: any) {
      return {
        ok: false,
        mode: 'mailto',
        error: err?.message || "Impossible d'ouvrir l'application de messagerie."
      };
    }
  }
}
