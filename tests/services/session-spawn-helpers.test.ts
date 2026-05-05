// @vitest-environment node

const mockExistsSync = vi.fn(() => false);
const mockReadFileSync = vi.fn(() => '');
const mockWriteFileSync = vi.fn();

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    existsSync: (...args: unknown[]) => mockExistsSync(...args),
    readFileSync: (...args: unknown[]) => mockReadFileSync(...args),
    writeFileSync: (...args: unknown[]) => mockWriteFileSync(...args),
    mkdirSync: vi.fn(),
  };
});

vi.mock('os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('os')>();
  return {
    ...actual,
    homedir: () => 'C:/Users/test',
  };
});

vi.mock('electron', () => ({
  app: { isPackaged: false, getAppPath: () => 'C:/app' },
}));

vi.mock('../../electron/services/database', () => ({
  database: { run: vi.fn(), prepare: vi.fn(() => []), get: vi.fn() },
}));

vi.mock('../../electron/services/prompt-assembler', () => ({
  promptAssembler: { assemble: vi.fn() },
}));

vi.mock('../../electron/services/agent-loader', () => ({
  agentLoader: { getAgent: vi.fn() },
}));

const mockLoggerInfo = vi.fn();
const mockLoggerWarn = vi.fn();
vi.mock('../../electron/utils/logger', () => ({
  logger: {
    info: (...a: unknown[]) => mockLoggerInfo(...a),
    warn: (...a: unknown[]) => mockLoggerWarn(...a),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { ensureWorkspaceTrust } from '../../electron/services/session-spawn-helpers';

describe('ensureWorkspaceTrust', () => {
  beforeEach(() => {
    mockExistsSync.mockReset();
    mockReadFileSync.mockReset();
    mockWriteFileSync.mockReset();
    mockLoggerInfo.mockReset();
    mockLoggerWarn.mockReset();
  });

  it('does nothing when ~/.claude.json does not exist', () => {
    mockExistsSync.mockReturnValue(false);
    ensureWorkspaceTrust('C:\\Users\\test\\workspace');
    expect(mockReadFileSync).not.toHaveBeenCalled();
    expect(mockWriteFileSync).not.toHaveBeenCalled();
  });

  it('marks an untrusted workspace as trusted', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify({
      projects: {
        'C:/Users/test/workspace': { hasTrustDialogAccepted: false, allowedTools: ['Bash'] },
      },
    }));

    ensureWorkspaceTrust('C:\\Users\\test\\workspace');

    expect(mockWriteFileSync).toHaveBeenCalledTimes(1);
    const written = JSON.parse(mockWriteFileSync.mock.calls[0][1] as string);
    expect(written.projects['C:/Users/test/workspace'].hasTrustDialogAccepted).toBe(true);
    // Other fields preserved
    expect(written.projects['C:/Users/test/workspace'].allowedTools).toEqual(['Bash']);
  });

  it('is idempotent — does not write when already trusted', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify({
      projects: {
        'C:/Users/test/workspace': { hasTrustDialogAccepted: true },
      },
    }));

    ensureWorkspaceTrust('C:\\Users\\test\\workspace');

    expect(mockWriteFileSync).not.toHaveBeenCalled();
  });

  it('creates a project entry when one does not exist yet', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify({ projects: {} }));

    ensureWorkspaceTrust('C:\\Users\\test\\new-project');

    expect(mockWriteFileSync).toHaveBeenCalledTimes(1);
    const written = JSON.parse(mockWriteFileSync.mock.calls[0][1] as string);
    expect(written.projects['C:/Users/test/new-project'].hasTrustDialogAccepted).toBe(true);
  });

  it('handles missing projects field on the config root', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify({ numStartups: 5 }));

    ensureWorkspaceTrust('C:\\Users\\test\\proj');

    expect(mockWriteFileSync).toHaveBeenCalledTimes(1);
    const written = JSON.parse(mockWriteFileSync.mock.calls[0][1] as string);
    expect(written.projects['C:/Users/test/proj'].hasTrustDialogAccepted).toBe(true);
    // Existing top-level fields preserved
    expect(written.numStartups).toBe(5);
  });

  it('does not throw when ~/.claude.json is malformed JSON', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue('{ this is not json');

    expect(() => ensureWorkspaceTrust('C:\\Users\\test\\proj')).not.toThrow();
    expect(mockWriteFileSync).not.toHaveBeenCalled();
    expect(mockLoggerWarn).toHaveBeenCalled();
  });

  it('does not throw when writeFileSync fails', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify({ projects: {} }));
    mockWriteFileSync.mockImplementation(() => { throw new Error('EACCES'); });

    expect(() => ensureWorkspaceTrust('C:\\Users\\test\\proj')).not.toThrow();
    expect(mockLoggerWarn).toHaveBeenCalled();
  });

  it('normalises Windows backslash paths to forward slashes', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify({ projects: {} }));

    ensureWorkspaceTrust('C:\\Users\\test\\my project\\sub');

    const written = JSON.parse(mockWriteFileSync.mock.calls[0][1] as string);
    expect(written.projects['C:/Users/test/my project/sub']).toBeDefined();
    // No backslash key created
    expect(written.projects['C:\\Users\\test\\my project\\sub']).toBeUndefined();
  });
});
