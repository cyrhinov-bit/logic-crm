import { app, BrowserWindow, screen } from 'electron';
import fs from 'fs';
import path from 'path';

export interface WindowState {
  x?: number;
  y?: number;
  width: number;
  height: number;
  isMaximized: boolean;
}

export class WindowStateService {
  private static readonly FILENAME = 'window-state.json';
  private static saveTimeout: NodeJS.Timeout | null = null;

  private static getFilePath(): string {
    return path.join(app.getPath('userData'), this.FILENAME);
  }

  static loadState(defaultWidth: number, defaultHeight: number): WindowState {
    const filePath = this.getFilePath();
    try {
      if (fs.existsSync(filePath)) {
        const data = fs.readFileSync(filePath, 'utf-8');
        const state = JSON.parse(data) as WindowState;
        
        // Vérifier si la position sauvegardée est toujours visible sur un écran actif
        if (state.x !== undefined && state.y !== undefined) {
          const isVisible = screen.getAllDisplays().some(display => {
            const bounds = display.bounds;
            return (
              state.x! >= bounds.x &&
              state.y! >= bounds.y &&
              state.x! + state.width <= bounds.x + bounds.width &&
              state.y! + state.height <= bounds.y + bounds.height
            );
          });

          if (!isVisible) {
            delete state.x;
            delete state.y;
          }
        }
        
        return state;
      }
    } catch (e) {
      console.error('Erreur lors de la lecture de l\'état de la fenêtre', e);
    }

    return {
      width: defaultWidth,
      height: defaultHeight,
      isMaximized: false,
    };
  }

  private static saveState(state: WindowState): void {
    const filePath = this.getFilePath();
    try {
      fs.writeFileSync(filePath, JSON.stringify(state));
    } catch (e) {
      console.error('Erreur lors de la sauvegarde de l\'état de la fenêtre', e);
    }
  }

  static manage(window: BrowserWindow): void {
    const updateState = () => {
      if (this.saveTimeout) {
        clearTimeout(this.saveTimeout);
      }
      this.saveTimeout = setTimeout(() => {
        const bounds = window.getBounds();
        this.saveState({
          x: bounds.x,
          y: bounds.y,
          width: bounds.width,
          height: bounds.height,
          isMaximized: window.isMaximized(),
        });
      }, 500);
    };

    window.on('resize', updateState);
    window.on('move', updateState);
    window.on('maximize', updateState);
    window.on('unmaximize', updateState);
  }
}
