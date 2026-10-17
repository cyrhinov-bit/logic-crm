import { ipcMain } from 'electron';
import { FS_CHANNELS } from './filesystem.channels.js';
import { FileSystemService, TempFileService, PathService } from '../../services/filesystem/index.js';
import { FileSystemError } from '../../errors/FileSystemErrors.js';

export function registerFileSystemHandlers(): void {
  // Wrapper global pour serializer l'erreur
  const handle = (channel: string, handler: (...args: any[]) => Promise<any> | any) => {
    ipcMain.handle(channel, async (_, ...args) => {
      try {
        return await handler(...args);
      } catch (err: any) {
        if (err instanceof FileSystemError) {
          throw new Error(JSON.stringify({ name: err.name, message: err.message }));
        }
        throw err;
      }
    });
  };

  handle(FS_CHANNELS.GET_PATHS, () => PathService.getBasePaths());
  handle(FS_CHANNELS.READ_FILE, (base, rel) => FileSystemService.readFile(base, rel));
  handle(FS_CHANNELS.WRITE_FILE, (base, rel, content) => FileSystemService.writeFile(base, rel, content));
  handle(FS_CHANNELS.DELETE_FILE, (base, rel) => FileSystemService.deleteFile(base, rel));
  handle(FS_CHANNELS.EXISTS, (base, rel) => FileSystemService.exists(base, rel));
  handle(FS_CHANNELS.LIST_DIR, (base, rel) => FileSystemService.listDir(base, rel));
  handle(FS_CHANNELS.CREATE_TEMP_FILE, (prefix, content) => TempFileService.createTempFile(prefix, content));
  handle(FS_CHANNELS.READ_BINARY_FILE, (base, rel) => FileSystemService.readBinaryFile(base, rel));
  handle(FS_CHANNELS.WRITE_BINARY_FILE, (base, rel, content) => FileSystemService.writeBinaryFile(base, rel, content));
}
