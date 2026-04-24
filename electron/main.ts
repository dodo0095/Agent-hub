import { app, BrowserWindow, shell, Menu, MenuItem, powerMonitor } from 'electron';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { registerAllHandlers } from './ipc';
import { database } from './services/database';
import { agentLoader } from './services/agent-loader';
import { sessionManager } from './services/session-manager';
import { eventBus } from './services/event-bus';
import { fileWatcher } from './services/file-watcher';
import { projectSync } from './services/project-sync';
import { hookManager } from './services/hook-manager';
import { skillManager } from './services/skill-manager';
import { logger } from './utils/logger';
import { IpcChannels } from './types';
import { trayService } from './services/tray-service';
import { loadEnv } from './utils/env';
import { initI18n, t, setLocale } from './utils/i18n';

// Load .env before anything else
loadEnv();

// Ensure consistent app name (affects userData path) regardless of launch method
// v2 uses 'maestro-v2' to isolate from v1's database at %APPDATA%/maestro/
app.name = 'maestro-v2';

// Fix GPU cache errors on Windows with non-ASCII userdata paths
// The Chromium disk_cache fails when %APPDATA% contains CJK characters
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
app.commandLine.appendSwitch('disk-cache-size', '0');

// Recover from GPU process crash after sleep/wake
app.commandLine.appendSwitch('disable-gpu-compositing');

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    show: false,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#0a0b10',
      symbolColor: '#8b8da3',
      height: 32,
    },
    backgroundColor: '#0f1117',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show();
  });

  // Auto-reload on renderer crash (GPU crash after sleep, etc.)
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    logger.warn(`Renderer process gone: ${details.reason}`);
    if (details.reason !== 'clean-exit' && mainWindow && !mainWindow.isDestroyed()) {
      logger.info('Reloading renderer to recover from crash...');
      setTimeout(() => mainWindow?.reload(), 500);
    }
  });

  // Minimize to tray instead of closing
  mainWindow.on('close', (event) => {
    if (!(app as any).isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: 'deny' };
  });

  // Disable devTools in production
  if (!process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.webContents.on('devtools-opened', () => {
      if (app.isPackaged) {
        mainWindow?.webContents.closeDevTools();
      }
    });
  }

  // Enable right-click context menu (copy / paste / select all)
  mainWindow.webContents.on('context-menu', (_event, params) => {
    const menu = new Menu();

    if (params.isEditable) {
      menu.append(new MenuItem({ label: t('electron.menu.cut'), role: 'cut' }));
      menu.append(new MenuItem({ label: t('electron.menu.copy'), role: 'copy' }));
      menu.append(new MenuItem({ label: t('electron.menu.paste'), role: 'paste' }));
    } else if (params.selectionText) {
      menu.append(new MenuItem({ label: t('electron.menu.copy'), role: 'copy' }));
    }

    menu.append(new MenuItem({ type: 'separator' }));
    menu.append(new MenuItem({ label: t('electron.menu.selectAll'), role: 'selectAll' }));

    if (menu.items.length > 0) {
      menu.popup();
    }
  });

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

/** Safe send: skip if window is destroyed (prevents crash on app quit) */
function safeSend(channel: string, data: unknown): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data);
  }
}

function setupEventForwarding(): void {
  // Forward eventBus events to renderer via webContents
  eventBus.onSessionEvent((event) => safeSend(IpcChannels.SESSION_EVENT, event));
  eventBus.onSessionStatus((change) => safeSend(IpcChannels.SESSION_STATUS, change));
  eventBus.onPtyData((data) => safeSend(IpcChannels.PTY_DATA, data));
  eventBus.on('agents:reloaded', (data) => safeSend(IpcChannels.AGENTS_RELOADED, data));
  eventBus.on('delegation:report', (data) => safeSend(IpcChannels.DELEGATION_REPORT, data));
  eventBus.on('message:created', (data) => safeSend(IpcChannels.MESSAGE_CREATED, data));
  eventBus.on('message:delivered', (data) => safeSend(IpcChannels.MESSAGE_DELIVERED, data));
  eventBus.on('message:read', (data) => safeSend(IpcChannels.MESSAGE_READ, data));
  eventBus.on('task:updated', (data) => safeSend(IpcChannels.TASK_UPDATED, data));
  eventBus.on('gate:reviewed', (data) => safeSend('gate:status-changed', data));
  eventBus.onFileSynced((data) => safeSend(IpcChannels.PROJECT_SYNC_STATUS, data));
}

app.whenReady().then(async () => {
  logger.info('Starklab AgentHub starting...');

  // Initialize database (async for sql.js WASM loading)
  await database.initialize();
  logger.info('Database initialized');

  // Load language setting from user_preferences and initialize i18n
  initI18n();
  try {
    const langResult = database.prepare('SELECT value FROM user_preferences WHERE key = ?', ['language']);
    if (langResult.length > 0) {
      const lang = (langResult[0] as { value: string }).value;
      if (lang === 'zh-TW' || lang === 'en') setLocale(lang);
    }
  } catch { /* ignore */ }

  // Application menu with Edit role (enables Ctrl+C/V/X/A keyboard shortcuts)
  const appMenu = Menu.buildFromTemplate([
    {
      label: 'Starklab AgentHub',
      submenu: [
        { label: t('electron.menu.about'), role: 'about' },
        { type: 'separator' },
        { label: t('electron.menu.quit'), role: 'quit' },
      ],
    },
    {
      label: t('electron.menu.edit'),
      submenu: [
        { label: t('electron.menu.undo'), role: 'undo', accelerator: 'CmdOrCtrl+Z' },
        { label: t('electron.menu.redo'), role: 'redo', accelerator: 'CmdOrCtrl+Shift+Z' },
        { type: 'separator' },
        { label: t('electron.menu.cut'), role: 'cut', accelerator: 'CmdOrCtrl+X' },
        { label: t('electron.menu.copy'), role: 'copy', accelerator: 'CmdOrCtrl+C' },
        { label: t('electron.menu.paste'), role: 'paste', accelerator: 'CmdOrCtrl+V' },
        { label: t('electron.menu.selectAll'), role: 'selectAll', accelerator: 'CmdOrCtrl+A' },
      ],
    },
    {
      label: t('electron.menu.view'),
      submenu: [
        { label: t('electron.menu.reload'), role: 'reload' },
        { label: t('electron.menu.devtools'), role: 'toggleDevTools' },
        { type: 'separator' },
        { label: t('electron.menu.zoomIn'), role: 'zoomIn' },
        { label: t('electron.menu.zoomOut'), role: 'zoomOut' },
        { label: t('electron.menu.resetZoom'), role: 'resetZoom' },
      ],
    },
  ]);
  Menu.setApplicationMenu(appMenu);

  // Bootstrap: ensure AgentHub's own .claude/ has hooks and skills
  try {
    const appDir = process.cwd();

    // Bootstrap hooks: inject if settings.json missing or has no hooks configured
    const settingsPath = join(appDir, '.claude', 'settings.json');
    let needHooks = true;
    if (existsSync(settingsPath)) {
      try {
        const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
        needHooks = !settings.hooks || Object.keys(settings.hooks).length === 0;
      } catch {
        needHooks = true;
      }
    }
    if (needHooks) {
      hookManager.tryInjectHooks(appDir);
      logger.info('Bootstrap: hooks injected for AgentHub');
    }

    // Bootstrap skills: deploy if .claude/commands/ missing or empty
    const commandsDir = join(appDir, '.claude', 'commands');
    const needSkills =
      !existsSync(commandsDir) ||
      readdirSync(commandsDir).filter((f) => f.endsWith('.md')).length === 0;
    if (needSkills) {
      const allSkills = skillManager.list();
      const systemSkillNames = allSkills
        .filter((s) => s.source === 'system' && s.scope === 'global')
        .map((s) => s.name);
      for (const name of systemSkillNames) {
        skillManager.deploy(name, [appDir]);
      }
      logger.info(`Bootstrap: deployed ${systemSkillNames.length} system skills for AgentHub`);
    }
  } catch (err) {
    logger.warn('Bootstrap: failed to initialize hooks/skills', err);
  }

  // Load agent definitions
  agentLoader.load();
  logger.info(`Agent loader: ${agentLoader.getCount()} agents loaded`);

  // Detect Claude CLI
  sessionManager.detectClaude();

  // Setup cross-session messaging (must be after detectClaude)
  sessionManager.setupMessageBroker();
  logger.info('MessageBroker initialized');

  // Register IPC handlers
  registerAllHandlers();
  logger.info('IPC handlers registered');

  // Create window
  createWindow();

  // Setup event forwarding after window is created
  setupEventForwarding();

  // Initialize tray service
  if (mainWindow) {
    trayService.initialize(mainWindow);
  }

  // Start file watcher
  fileWatcher.start();

  // Auto-start project sync for all projects that have a work directory
  try {
    const projects = database.prepare(
      `SELECT id, work_dir FROM projects WHERE work_dir IS NOT NULL AND status IN (?, ?)`,
      ['planning', 'active'],
    );
    logger.info(`Project sync: found ${projects.length} projects with work_dir`);
    for (const p of projects as any[]) {
      logger.info(`Project sync: project ${p.id} work_dir=${p.work_dir}`);
      if (p.work_dir) {
        projectSync.startWatch(p.id as string, p.work_dir as string);
        // Run fullSync to capture files that existed before watcher started
        projectSync.fullSync(p.id as string, p.work_dir as string).catch((err) => {
          logger.warn(`Initial fullSync failed for project ${p.id}`, err);
        });
      }
    }
    logger.info(`Project sync started for ${projects.length} projects`);
  } catch (err) {
    logger.warn('Failed to auto-start project sync', err);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });

  // Recover from black screen after sleep/wake
  powerMonitor.on('resume', () => {
    logger.info('System resumed from sleep, checking renderer health');
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.once('render-process-gone', (_event, details) => {
        logger.warn(`Renderer process gone: ${details.reason}, reloading...`);
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.reload();
        }
      });
    }
  });
});

// Ensure quitting flag for tray behavior
app.on('before-quit', () => {
  (app as any).isQuitting = true;
});

app.on('window-all-closed', () => {
  trayService.destroy();
  fileWatcher.stop();
  projectSync.stopAll();
  sessionManager.cleanup();
  database.close();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
