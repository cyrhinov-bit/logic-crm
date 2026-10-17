import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

const execFileAsync = promisify(execFile);

export interface MailAttachmentInput {
  filename: string;
  base64: string;
  mimeType?: string;
}

export interface ComposeMailInput {
  to?: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  subject?: string;
  body?: string;
  htmlBody?: string;
  attachments?: MailAttachmentInput[];
  /** false (défaut) = ouvre la fenêtre de composition Outlook ; true = envoyé directement. */
  send?: boolean;
}

export type MailErrorCode =
  | 'ELEVATED'
  | 'NO_PROFILE'
  | 'COM'
  | 'POWERSHELL_MISSING'
  | 'NOT_CONFIGURED'
  | 'SMTP'
  | 'SMTP_AUTH'
  | 'SMTP_CONNECTION'
  | 'SMTP_RECIPIENT'
  | 'UNKNOWN';

export interface ComposeMailResult {
  ok: boolean;
  /** 'outlook' = Outlook classique via COM ; 'mailto' = messagerie par défaut ; 'smtp' = envoi direct (IMAP/SMTP classique). */
  mode?: 'outlook' | 'mailto' | 'smtp';
  errorCode?: MailErrorCode;
  error?: string;
  /** Chemin du fichier joint enregistré sur disque (mode 'mailto'). */
  filePath?: string;
  /** true si la pièce jointe a été copiée dans le presse-papiers (mode 'mailto'). */
  copiedToClipboard?: boolean;
  /** Identifiant du message envoyé (mode 'smtp'). */
  webLink?: string;
}

/** "a@x.com" ou ["a@x.com","b@x.com"] -> "a@x.com; b@x.com" (format Outlook). */
function toOutlookList(value?: string | string[]): string {
  if (!value) return '';
  const list = Array.isArray(value) ? value : [value];
  return list.map(v => String(v || '').trim()).filter(Boolean).join('; ');
}

function sanitizeFileName(name: string): string {
  const base = (name || 'piece-jointe.pdf').replace(/[\\/:*?"<>|\r\n]/g, '_').trim();
  return base || 'piece-jointe.pdf';
}

// Script PowerShell volontairement en ASCII (aucun accent) pour éviter tout problème d'encodage.
// Les données (dont le corps HTML accentué) transitent par un fichier JSON UTF-8.
// Il effectue deux contrôles préalables très utiles :
//   1) l'application ne doit pas s'exécuter en mode élevé (Outlook refuse l'élévation) ;
//   2) un profil Outlook CLASSIQUE doit exister (l'automatisation COM ne cible pas le "nouvel Outlook").
const PS_SCRIPT = `param([string]$MailJsonPath)
$ErrorActionPreference = 'Stop'

function Write-Ok {
  [Console]::Out.Write('{"ok":true,"mode":"outlook"}')
}
function Write-Err([string]$Code, [string]$Msg) {
  $o = @{ ok = $false; errorCode = $Code }
  if ($Msg) { $o.error = $Msg }
  [Console]::Out.Write((ConvertTo-Json -Compress $o))
}

# --- 1. Controle d'elevation ---
$isElevated = $false
try {
  $id = [Security.Principal.WindowsIdentity]::GetCurrent()
  $pr = New-Object Security.Principal.WindowsPrincipal($id)
  $isElevated = $pr.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
} catch { }
if ($isElevated) { Write-Err 'ELEVATED' ''; exit 1 }

# --- 2. Controle d'existence d'un profil Outlook classique ---
$hasProfile = $false
foreach ($ver in @('16.0','15.0','14.0','12.0')) {
  $p = "HKCU:\\Software\\Microsoft\\Office\\$ver\\Outlook\\Profiles"
  if (Test-Path $p) {
    $children = @(Get-ChildItem -LiteralPath $p -ErrorAction SilentlyContinue)
    if ($children.Count -gt 0) { $hasProfile = $true; break }
  }
}
if (-not $hasProfile) { Write-Err 'NO_PROFILE' ''; exit 2 }

# --- 3. Composition du message via Outlook ---
try {
  $json = Get-Content -LiteralPath $MailJsonPath -Raw -Encoding UTF8 | ConvertFrom-Json
  $outlook = $null
  try { $outlook = [Runtime.InteropServices.Marshal]::GetActiveObject('Outlook.Application') } catch { }
  if ($null -eq $outlook) { $outlook = New-Object -ComObject Outlook.Application }
  $mail = $outlook.CreateItem(0)
  if ($json.to) { $mail.To = $json.to }
  if ($json.cc) { $mail.CC = $json.cc }
  if ($json.bcc) { $mail.BCC = $json.bcc }
  if ($json.subject) { $mail.Subject = $json.subject }
  if ($json.htmlBody) { $mail.HTMLBody = $json.htmlBody } elseif ($json.body) { $mail.Body = $json.body }
  foreach ($att in @($json.attachments)) {
    if ($att -and (Test-Path -LiteralPath $att)) { [void]$mail.Attachments.Add($att) }
  }
  if ($json.send -eq $true) { $mail.Send() } else { $mail.Display() }
  Write-Ok
} catch {
  Write-Err 'COM' $_.Exception.Message
  exit 3
}
`;

const TEMP_PREFIX = 'hinov-mail-';

const CODE_MESSAGES: Record<MailErrorCode, string> = {
  ELEVATED:
    "L'application est lancée en mode administrateur (« Exécuter en tant qu'administrateur »). " +
    "Outlook ne peut pas fonctionner en mode élevé. Fermez l'application, relancez-la NORMALEMENT " +
    "(sans « Exécuter en tant qu'administrateur ») puis réessayez.",
  NO_PROFILE:
    "Aucun profil Outlook CLASSIQUE n'est configuré sur ce compte Windows. L'envoi automatique utilise " +
    "l'Outlook classique (le logiciel de bureau) et NON le « nouvel Outlook » — leurs comptes sont séparés. " +
    "Ouvrez une fois l'Outlook classique (menu Démarrer → cherchez « Outlook ») et configurez-y votre compte, " +
    "puis réessayez. Alternative : envoyez le devis par une autre méthode (le PDF reste téléchargeable).",
  COM: "Outlook a renvoyé une erreur lors de la création du message.",
  POWERSHELL_MISSING: "PowerShell est introuvable sur ce système. Contactez l'administrateur.",
  NOT_CONFIGURED: "L'envoi par e-mail n'est pas configuré. Renseignez-le dans Paramètres.",
  SMTP: "Erreur lors de l'envoi de l'e-mail.",
  SMTP_AUTH: "Identifiants de messagerie refusés. Vérifiez l'adresse et le mot de passe.",
  SMTP_CONNECTION: "Impossible de joindre le serveur de messagerie.",
  SMTP_RECIPIENT: "Adresse du destinataire invalide ou refusée.",
  UNKNOWN: "Erreur lors de l'ouverture d'Outlook.",
};

export class OutlookMailService {
  /** Nettoie les dossiers temporaires d'envois précédents (> 24 h). */
  private static async cleanupOldTempDirs(): Promise<void> {
    try {
      const entries = await fs.readdir(os.tmpdir(), { withFileTypes: true });
      const now = Date.now();
      await Promise.all(entries
        .filter(e => e.isDirectory() && e.name.startsWith(TEMP_PREFIX))
        .map(async e => {
          const dir = path.join(os.tmpdir(), e.name);
          try {
            const stat = await fs.stat(dir);
            if (now - stat.mtimeMs > 24 * 60 * 60 * 1000) {
              await fs.rm(dir, { recursive: true, force: true });
            }
          } catch { /* ignore */ }
        }));
    } catch { /* ignore */ }
  }

  static async compose(input: ComposeMailInput): Promise<ComposeMailResult> {
    if (process.platform !== 'win32') {
      return { ok: false, errorCode: 'UNKNOWN', error: "L'envoi via Outlook n'est disponible que sous Windows." };
    }

    await OutlookMailService.cleanupOldTempDirs();

    // Dossier temporaire dédié : Outlook garde une référence au fichier jusqu'à l'envoi,
    // on ne supprime donc pas immédiatement (nettoyage différé via cleanupOldTempDirs).
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), TEMP_PREFIX));

    try {
      const attachmentPaths: string[] = [];
      for (let i = 0; i < (input.attachments?.length || 0); i++) {
        const att = input.attachments![i];
        if (!att?.base64) continue;
        const filePath = path.join(tmpDir, sanitizeFileName(att.filename || `piece-jointe-${i + 1}`));
        await fs.writeFile(filePath, Buffer.from(att.base64, 'base64'));
        attachmentPaths.push(filePath);
      }

      const payload = {
        to: toOutlookList(input.to),
        cc: toOutlookList(input.cc),
        bcc: toOutlookList(input.bcc),
        subject: input.subject || '',
        body: input.body || '',
        htmlBody: input.htmlBody || '',
        attachments: attachmentPaths,
        send: input.send === true
      };

      const jsonPath = path.join(tmpDir, 'mail.json');
      await fs.writeFile(jsonPath, JSON.stringify(payload), 'utf-8');

      const scriptPath = path.join(tmpDir, 'send-outlook.ps1');
      await fs.writeFile(scriptPath, PS_SCRIPT, 'utf-8');

      const { stdout } = await execFileAsync('powershell.exe', [
        '-NoProfile',
        '-ExecutionPolicy', 'Bypass',
        '-File', scriptPath,
        jsonPath
      ], { windowsHide: true, timeout: 120000, maxBuffer: 4 * 1024 * 1024 });

      return OutlookMailService.parseOutput(stdout) ?? { ok: true, mode: 'outlook' };
    } catch (err: any) {
      // Le script renvoie parfois son JSON sur stdout tout en sortant en erreur.
      const raw = err?.stdout ? String(err.stdout) : '';
      const parsed = OutlookMailService.parseOutput(raw, true);
      if (parsed) return parsed;

      const stderr = String(err?.stderr || '');
      const message = stderr || err?.message || String(err);
      if (/ENOENT|not recognized|introuvable|is not recognized/i.test(message) && /powershell/i.test(message)) {
        return { ok: false, errorCode: 'POWERSHELL_MISSING', error: CODE_MESSAGES.POWERSHELL_MISSING };
      }
      return { ok: false, errorCode: 'UNKNOWN', error: OutlookMailService.friendlyError(message) };
    }
  }

  private static parseOutput(raw: string, tolerant = false): ComposeMailResult | null {
    const text = (raw || '').trim();
    const start = text.indexOf('{');
    if (start < 0) {
      return tolerant ? null : { ok: true, mode: 'outlook' };
    }
    try {
      const parsed = JSON.parse(text.slice(start));
      if (parsed.ok) return { ok: true, mode: 'outlook' };

      const code = (parsed.errorCode || 'COM') as MailErrorCode;
      const base = CODE_MESSAGES[code] || CODE_MESSAGES.UNKNOWN;
      const detail = parsed.error ? ` (${parsed.error})` : '';
      return { ok: false, errorCode: code, error: `${base}${detail}` };
    } catch {
      return tolerant ? null : { ok: true, mode: 'outlook' };
    }
  }

  static friendlyError(message: string): string {
    const m = String(message || '');
    if (/CLSID|ActiveX|COM class factory|80040154|Retrieving the COM class factory|n'est pas enregistr/i.test(m)) {
      return "Outlook n'a pas été détecté sur cet ordinateur. Installez Microsoft Outlook (version bureau) puis réessayez.";
    }
    if (/80080005|CO_E_SERVER_EXEC_FAILURE|server execution failed|RPC server/i.test(m)) {
      return "Impossible de démarrer Outlook. Ouvrez Microsoft Outlook manuellement, puis réessayez.";
    }
    if (/Accès refusé|access is denied|0x80070005/i.test(m)) {
      return "Outlook a refusé l'accès (accès programmatique). Autorisez l'accès du programme dans Outlook (Options > Centre de gestion de la confidentialité) puis réessayez.";
    }
    if (/named pipe|Le fichier spécifié est introuvable|The system cannot find the file/i.test(m)) {
      return "PowerShell est introuvable sur ce système. Contactez l'administrateur.";
    }
    return m || "Erreur lors de l'ouverture d'Outlook.";
  }
}
