const fs = require('fs');
const path = require('path');

function write(filePath, content) {
  const fullPath = path.join(__dirname, filePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content.trim() + '\n');
}

// 1. Errors
write('electron/errors/SecurityErrors.ts',
  "export class SecurityError extends Error {\n" +
  "  constructor(message: string) {\n" +
  "    super(message);\n" +
  "    this.name = this.constructor.name;\n" +
  "  }\n" +
  "}\n" +
  "export class InvalidPermissionError extends SecurityError {}\n" +
  "export class InvalidTokenError extends SecurityError {}\n" +
  "export class EncryptionError extends SecurityError {}\n" +
  "export class SecurityViolationError extends SecurityError {}\n" +
  "export class InvalidEnvironmentError extends SecurityError {}\n"
);

// 2. Services
write('electron/security/PermissionManager.ts',
  "export class PermissionManager {\n" +
  "  static hasPermission(module: string, action: string): boolean {\n" +
  "    // Squelette: par défaut, on autorise tout pour le MVP, \n" +
  "    // mais l'architecture est prête.\n" +
  "    return true;\n" +
  "  }\n" +
  "}\n"
);

write('electron/security/EncryptionService.ts',
  "import crypto from 'crypto';\n\n" +
  "export class EncryptionService {\n" +
  "  private static key = crypto.randomBytes(32); // Clé éphémère simulée\n\n" +
  "  static encrypt(text: string): string {\n" +
  "    const iv = crypto.randomBytes(16);\n" +
  "    const cipher = crypto.createCipheriv('aes-256-cbc', this.key, iv);\n" +
  "    let encrypted = cipher.update(text);\n" +
  "    encrypted = Buffer.concat([encrypted, cipher.final()]);\n" +
  "    return iv.toString('hex') + ':' + encrypted.toString('hex');\n" +
  "  }\n\n" +
  "  static decrypt(text: string): string {\n" +
  "    try {\n" +
  "      const parts = text.split(':');\n" +
  "      const iv = Buffer.from(parts.shift() || '', 'hex');\n" +
  "      const encrypted = Buffer.from(parts.join(':'), 'hex');\n" +
  "      const decipher = crypto.createDecipheriv('aes-256-cbc', this.key, iv);\n" +
  "      let decrypted = decipher.update(encrypted);\n" +
  "      decrypted = Buffer.concat([decrypted, decipher.final()]);\n" +
  "      return decrypted.toString();\n" +
  "    } catch (e) {\n" +
  "      throw new Error('Decryption failed');\n" +
  "    }\n" +
  "  }\n" +
  "}\n"
);

write('electron/security/SecureStorage.ts',
  "import { EncryptionService } from './EncryptionService.js';\n\n" +
  "export class SecureStorage {\n" +
  "  private static store = new Map<string, string>();\n\n" +
  "  static set(key: string, value: string) {\n" +
  "    this.store.set(key, EncryptionService.encrypt(value));\n" +
  "  }\n\n" +
  "  static get(key: string): string | null {\n" +
  "    const val = this.store.get(key);\n" +
  "    if (!val) return null;\n" +
  "    try { return EncryptionService.decrypt(val); } catch(e) { return null; }\n" +
  "  }\n" +
  "}\n"
);

write('electron/security/SessionManager.ts',
  "export class SessionManager {\n" +
  "  private static active = false;\n" +
  "  static startSession() { this.active = true; }\n" +
  "  static endSession() { this.active = false; }\n" +
  "  static isActive() { return this.active; }\n" +
  "}\n"
);

write('electron/security/TokenManager.ts', "export class TokenManager {}");
write('electron/security/CSPManager.ts', "export class CSPManager {}");
write('electron/security/IPCSecurity.ts', "export class IPCSecurity {}");
write('electron/security/FileSecurity.ts', "export class FileSecurity {}");
write('electron/security/ProcessSecurity.ts', "export class ProcessSecurity {}");
write('electron/security/EnvironmentValidator.ts', 
  "export class EnvironmentValidator {\n" +
  "  static validate() {\n" +
  "    return {\n" +
  "      nodeIntegration: false,\n" +
  "      contextIsolation: true,\n" +
  "      sandbox: true\n" +
  "    };\n" +
  "  }\n" +
  "}\n"
);
write('electron/security/IntegrityChecker.ts', "export class IntegrityChecker {}");
write('electron/security/SecretProvider.ts', "export class SecretProvider {}");

write('electron/security/SecurityManager.ts',
  "import { EnvironmentValidator } from './EnvironmentValidator.js';\n" +
  "import { SecureStorage } from './SecureStorage.js';\n" +
  "import { SessionManager } from './SessionManager.js';\n\n" +
  "export class SecurityManager {\n" +
  "  static getStatus() {\n" +
  "    return {\n" +
  "      environment: EnvironmentValidator.validate(),\n" +
  "      sessionActive: SessionManager.isActive(),\n" +
  "      secureStorageReady: true\n" +
  "    };\n" +
  "  }\n" +
  "}\n"
);

write('electron/security/index.ts',
  "export * from './SecurityManager.js';\n" +
  "export * from './PermissionManager.js';\n" +
  "export * from './EncryptionService.js';\n" +
  "export * from './SecureStorage.js';\n" +
  "export * from './SessionManager.js';\n" +
  "export * from './EnvironmentValidator.js';\n"
);

// 3. IPC
write('electron/ipc/security/security.channels.ts',
  "export const SECURITY_CHANNELS = {\n" +
  "  GET_STATUS: 'security:getStatus',\n" +
  "  CHECK_PERMISSION: 'security:checkPermission'\n" +
  "} as const;\n"
);

write('electron/ipc/security/security.handlers.ts',
  "import { ipcMain } from 'electron';\n" +
  "import { SECURITY_CHANNELS } from './security.channels.js';\n" +
  "import { SecurityManager, PermissionManager } from '../../security/index.js';\n\n" +
  "export function registerSecurityHandlers(): void {\n" +
  "  ipcMain.handle(SECURITY_CHANNELS.GET_STATUS, () => SecurityManager.getStatus());\n" +
  "  ipcMain.handle(SECURITY_CHANNELS.CHECK_PERMISSION, (_, module, action) => PermissionManager.hasPermission(module, action));\n" +
  "}\n"
);

console.log('Fichiers Phase 14 générés.');
