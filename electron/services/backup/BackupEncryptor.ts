export class BackupEncryptor {
  static async encrypt(data: Buffer, _key: string): Promise<Buffer> {
    return data;
  }
}
