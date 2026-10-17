import { app, dialog } from 'electron';

export class ErrorManager {
  static init(): void {
    const isDev = Boolean(!app?.isPackaged && process.env.NODE_ENV === 'development');

    process.on('uncaughtException', (error) => {
      console.error('Uncaught Exception:', error);
      if (isDev) {
        dialog.showErrorBox('Uncaught Exception', error.message || 'Unknown error');
      }
      // Logique future de journalisation
    });

    process.on('unhandledRejection', (reason) => {
      console.error('Unhandled Rejection:', reason);
      if (isDev) {
        const message = reason instanceof Error ? reason.message : String(reason);
        dialog.showErrorBox('Unhandled Rejection', message);
      }
      // Logique future de journalisation
    });
  }
}
