import { Tray, Menu, nativeImage, app, BrowserWindow } from 'electron';
import { join } from 'path';
import { sessionManager } from './session-manager';
import { logger } from '../utils/logger';
import { t } from '../utils/i18n';

class TrayService {
  private tray: Tray | null = null;

  initialize(mainWindow: BrowserWindow): void {
    try {
      const iconPath = join(__dirname, '../../build/icon.png');
      const icon = nativeImage.createFromPath(iconPath);
      this.tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
      this.tray.setToolTip('Starklab AgentHub - AI Studio');

      this.updateContextMenu(mainWindow);

      this.tray.on('double-click', () => {
        mainWindow.show();
        mainWindow.focus();
      });

      logger.info('Tray service initialized');
    } catch (err) {
      logger.error('Failed to initialize tray', err);
    }
  }

  private updateContextMenu(mainWindow: BrowserWindow): void {
    if (!this.tray) return;

    const activeCount = sessionManager.getActiveCount();
    const menu = Menu.buildFromTemplate([
      {
        label: 'Starklab AgentHub',
        enabled: false,
      },
      { type: 'separator' },
      {
        label: t('electron.tray.showWindow'),
        click: () => {
          mainWindow.show();
          mainWindow.focus();
        },
      },
      {
        label: t('electron.tray.sessions', { n: activeCount }),
        enabled: false,
      },
      { type: 'separator' },
      {
        label: t('electron.tray.quit'),
        click: () => {
          app.quit();
        },
      },
    ]);

    this.tray.setContextMenu(menu);
  }

  destroy(): void {
    if (this.tray) {
      this.tray.destroy();
      this.tray = null;
    }
  }
}

export const trayService = new TrayService();
