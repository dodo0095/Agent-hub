import { ipcMain, clipboard } from 'electron';
import { IpcChannels } from '../types';
import { logger } from '../utils/logger';

/**
 * Clipboard handlers backed by Electron's native `clipboard` module.
 *
 * The renderer's `navigator.clipboard` API is gated behind permissions that
 * are denied by default in Electron (no `setPermissionRequestHandler`), so
 * `readText()` silently rejects and paste never fires. Routing through the
 * main process avoids that entirely and works regardless of focus/secure-context.
 */
export function registerClipboardHandlers(): void {
  ipcMain.handle(IpcChannels.CLIPBOARD_READ, () => {
    try {
      return clipboard.readText();
    } catch (err) {
      logger.error('Failed to read clipboard', err);
      return '';
    }
  });

  ipcMain.handle(IpcChannels.CLIPBOARD_WRITE, (_event, text: string) => {
    try {
      clipboard.writeText(typeof text === 'string' ? text : String(text));
      return { success: true };
    } catch (err) {
      logger.error('Failed to write clipboard', err);
      return { success: false };
    }
  });
}
