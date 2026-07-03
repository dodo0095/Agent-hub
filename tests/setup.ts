import { vi } from 'vitest';

// Mock electron module
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/tmp/maestro-test'),
    isQuitting: false,
    quit: vi.fn(),
    on: vi.fn(),
    whenReady: vi.fn(() => Promise.resolve()),
  },
  BrowserWindow: vi.fn(),
  ipcMain: {
    handle: vi.fn(),
    on: vi.fn(),
  },
  ipcRenderer: {
    invoke: vi.fn(),
    send: vi.fn(),
    on: vi.fn(),
  },
  globalShortcut: {
    register: vi.fn(() => true),
    unregisterAll: vi.fn(),
  },
  Tray: vi.fn(),
  Menu: {
    buildFromTemplate: vi.fn(),
  },
  nativeImage: {
    createFromPath: vi.fn(() => ({ isEmpty: () => true })),
    createEmpty: vi.fn(),
  },
  contextBridge: {
    exposeInMainWorld: vi.fn(),
  },
  shell: {
    openExternal: vi.fn(),
  },
}));

// Mock node-pty
vi.mock('node-pty', () => ({
  spawn: vi.fn(() => ({
    onData: vi.fn(),
    onExit: vi.fn(),
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(),
    pid: 12345,
  })),
}));

// Mock sql.js with in-memory database
const mockDb = {
  run: vi.fn(),
  exec: vi.fn(() => []),
  prepare: vi.fn(() => ({
    bind: vi.fn(),
    step: vi.fn(() => false),
    getAsObject: vi.fn(() => ({})),
    free: vi.fn(),
    get: vi.fn(() => []),
  })),
  close: vi.fn(),
};

vi.mock('sql.js', () => ({
  default: vi.fn(() =>
    Promise.resolve({
      Database: vi.fn(() => mockDb),
    }),
  ),
}));

// Mock window.maestro for renderer tests
const mockMaestro = {
  system: { getHealth: vi.fn() },
  sessions: {
    spawn: vi.fn(),
    stop: vi.fn(),
    list: vi.fn(() => []),
    getActive: vi.fn(() => []),
    previewPrompt: vi.fn(() => ''),
  },
  agents: {
    list: vi.fn(() => []),
    get: vi.fn(),
    getDepartments: vi.fn(() => []),
  },
  tasks: {
    create: vi.fn(),
    list: vi.fn(() => []),
    get: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    transition: vi.fn(),
    addDependency: vi.fn(),
    getReady: vi.fn(() => []),
  },
  sprints: {
    create: vi.fn(),
    list: vi.fn(() => []),
    get: vi.fn(),
    start: vi.fn(),
    enterReview: vi.fn(),
    complete: vi.fn(),
    getStatus: vi.fn(),
  },
  projects: {
    create: vi.fn(),
    list: vi.fn(() => []),
    get: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    getBudget: vi.fn(),
  },
  knowledge: {
    listTree: vi.fn(() => []),
    readFile: vi.fn(),
    search: vi.fn(() => []),
  },
  gates: {
    create: vi.fn(),
    list: vi.fn(() => []),
    get: vi.fn(),
    submit: vi.fn(),
    review: vi.fn(),
    getChecklists: vi.fn(() => []),
  },
  costs: {
    getOverview: vi.fn(),
    getBreakdown: vi.fn(),
    getBudget: vi.fn(),
    setBudget: vi.fn(),
  },
  objections: {
    list: vi.fn(() => []),
    resolve: vi.fn(),
  },
  settings: {
    get: vi.fn(),
    update: vi.fn(),
    getAll: vi.fn(() => ({})),
  },
  audit: {
    query: vi.fn(() => []),
  },
  git: {
    getStatus: vi.fn(),
    getDiff: vi.fn(() => []),
    getFileDiff: vi.fn(() => ({ original: '', modified: '' })),
    getLog: vi.fn(() => []),
    getBranches: vi.fn(() => ({ current: '', all: [] })),
    createWorktree: vi.fn(),
    removeWorktree: vi.fn(),
    listWorktrees: vi.fn(() => []),
  },
  pty: {
    input: vi.fn(),
    resize: vi.fn(),
  },
  on: {
    sessionEvent: vi.fn(),
    sessionStatus: vi.fn(),
    ptyData: vi.fn(),
    notification: vi.fn(),
    agentsReloaded: vi.fn(),
  },
};

// PM-012 C 類根因：舊寫法把 happy-dom 的 window 整顆替換成 { maestro }，
// 導致 window.Event / window.performance 等原生介面消失，
// @vue/test-utils 的 trigger()（SupportedEventInterface）與 vue-i18n dev mode（performance.now）全炸。
// 正確做法：只「掛上」mock，不替換 window。
if (typeof window === 'undefined') {
  // node 環境的 service 測試（@vitest-environment node）沒有 window，建最小替身
  Object.defineProperty(globalThis, 'window', { value: {}, writable: true });
}
(window as unknown as { maestro: typeof mockMaestro }).maestro = mockMaestro;
