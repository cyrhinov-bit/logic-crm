import crypto from 'crypto';

export class EncryptionService {
  private static key = crypto.randomBytes(32); // Clé éphémère simulée

  static encrypt(text: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', this.key, iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
  }

  static decrypt(text: string): string {
    try {
      const parts = text.split(':');
      const iv = Buffer.from(parts.shift() || '', 'hex');
      const encrypted = Buffer.from(parts.join(':'), 'hex');
      const decipher = crypto.createDecipheriv('aes-256-cbc', this.key, iv);
      let decrypted = decipher.update(encrypted);
      decrypted = Buffer.concat([decrypted, decipher.final()]);
      return decrypted.toString();
    } catch {
      throw new Error('Decryption failed');
    }
  }
}
