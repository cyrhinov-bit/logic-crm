import { app, Menu, MenuItemConstructorOptions } from 'electron';

export class MenuManager {
  static init(): void {
    const isDev = !app.isPackaged && process.env.NODE_ENV === 'development';

    const template: MenuItemConstructorOptions[] = [
      {
        label: 'Fichier',
        submenu: [
          { role: 'quit', label: 'Quitter' }
        ]
      },
      {
        label: 'Édition',
        submenu: [
          { role: 'undo', label: 'Annuler' },
          { role: 'redo', label: 'Rétablir' },
          { type: 'separator' },
          { role: 'cut', label: 'Couper' },
          { role: 'copy', label: 'Copier' },
          { role: 'paste', label: 'Coller' }
        ]
      },
      {
        label: 'Affichage',
        submenu: [
          { role: 'reload', label: 'Recharger' },
          { role: 'forceReload', label: 'Forcer le rechargement' },
          { role: 'togglefullscreen', label: 'Plein écran' }
        ]
      }
    ];

    if (isDev) {
      const viewMenu = template.find(m => m.label === 'Affichage');
      if (viewMenu && Array.isArray(viewMenu.submenu)) {
        viewMenu.submenu.push({ type: 'separator' });
        viewMenu.submenu.push({ role: 'toggleDevTools', label: 'Outils de développement' });
      }
    }

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
  }
}
