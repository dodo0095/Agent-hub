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

// SQL-aware mock (PM-012): branch on the query text / bound params instead of
// a mockReturnValueOnce queue, so call order inside the implementation is
// never baked into the test.
const mockDbPrepare = vi.fn((_sql: string, _params?: unknown[]): any[] => []);
vi.mock('../../electron/services/database', () => ({
  database: {
    run: vi.fn(),
    prepare: (sql: string, params?: unknown[]) => mockDbPrepare(sql, params),
    get: vi.fn(),
  },
}));

vi.mock('../../electron/services/prompt-assembler', () => ({
  promptAssembler: { assemble: vi.fn(() => 'system prompt') },
}));

const mockGetAgent = vi.fn((_id: string): any => undefined);
vi.mock('../../electron/services/agent-loader', () => ({
  agentLoader: { getAgent: (id: string) => mockGetAgent(id) },
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

import { join } from 'path';
import { ensureWorkspaceTrust, buildClaudeArgs } from '../../electron/services/session-spawn-helpers';
import { promptAssembler } from '../../electron/services/prompt-assembler';
import type { SpawnParams } from '../../electron/types/session';

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

// ─── buildClaudeArgs — ARS plugin-dir injection (Sprint 7 T5) ────────────────

describe('buildClaudeArgs — ARS plugin-dir injection', () => {
  const ARS_DIR = join('C:', 'fake-ars');

  /** Path-aware existsSync: only paths under ARS_DIR "exist", and only when `complete`. */
  function setupArsFs(complete: boolean) {
    mockExistsSync.mockImplementation((p: unknown) => {
      if (typeof p !== 'string') return false;
      return complete && p.startsWith(ARS_DIR);
    });
  }

  /** SQL-aware DB mock (PM-012): branches on query text + bound params. */
  function configureDb(opts: {
    arsPluginDir?: string | null;
    resumeSession?: { id: string; claude_conversation_id: string; agent_id: string };
  }) {
    mockDbPrepare.mockImplementation((sql: string, params?: unknown[]) => {
      if (/FROM user_preferences WHERE key = \?/i.test(sql)) {
        const key = params?.[0];
        if (key === 'ars.plugin-dir') {
          return opts.arsPluginDir ? [{ value: opts.arsPluginDir }] : [];
        }
        return [];
      }
      if (/FROM claude_sessions WHERE id = \?/i.test(sql)) {
        const id = params?.[0];
        if (opts.resumeSession && opts.resumeSession.id === id) {
          return [{
            claude_conversation_id: opts.resumeSession.claude_conversation_id,
            agent_id: opts.resumeSession.agent_id,
          }];
        }
        return [];
      }
      return [];
    });
  }

  beforeEach(() => {
    mockExistsSync.mockReset();
    mockExistsSync.mockReturnValue(false);
    mockReadFileSync.mockReset();
    mockWriteFileSync.mockReset();
    mockDbPrepare.mockReset();
    mockDbPrepare.mockImplementation(() => []);
    mockGetAgent.mockReset();
    mockGetAgent.mockImplementation(() => undefined);
    mockLoggerInfo.mockReset();
    mockLoggerWarn.mockReset();
    (promptAssembler.assemble as ReturnType<typeof vi.fn>).mockClear();
  });

  it('injects --plugin-dir for academic-publication department (normal spawn)', () => {
    mockGetAgent.mockImplementation((id: string) =>
      id === 'publication-operator' ? { department: 'academic-publication' } : undefined,
    );
    configureDb({ arsPluginDir: ARS_DIR });
    setupArsFs(true);

    const params: SpawnParams = { agentId: 'publication-operator', task: 'write the paper', projectId: null };
    const { args } = buildClaudeArgs(params, 'sess-normal-pub', 'sonnet', 10, true, false, false);

    const idx = args.indexOf('--plugin-dir');
    expect(idx).toBeGreaterThan(-1);
    expect(args[idx + 1]).toBe(ARS_DIR);
  });

  it('does not add --plugin-dir for a non-publication department (engineering)', () => {
    mockGetAgent.mockImplementation((id: string) =>
      id === 'backend-architect' ? { department: 'engineering' } : undefined,
    );
    // ars.plugin-dir deliberately left unconfigured — engineering must never consult it.
    configureDb({});

    const params: SpawnParams = { agentId: 'backend-architect', task: 'build the api', projectId: null };
    const { args } = buildClaudeArgs(params, 'sess-normal-eng', 'sonnet', 10, true, false, false);

    expect(args).not.toContain('--plugin-dir');
  });

  it('injects --plugin-dir on resume when the original session belonged to academic-publication', () => {
    mockGetAgent.mockImplementation((id: string) =>
      id === 'publication-operator' ? { department: 'academic-publication' } : undefined,
    );
    configureDb({
      arsPluginDir: ARS_DIR,
      resumeSession: { id: 'sess-orig', claude_conversation_id: 'conv-123', agent_id: 'publication-operator' },
    });
    setupArsFs(true);

    const params: SpawnParams = {
      agentId: 'publication-operator',
      task: '',
      resumeSessionId: 'sess-orig',
      projectId: null,
    };
    const { args } = buildClaudeArgs(params, 'sess-resume-pub', 'sonnet', 10, true, true, false);

    expect(args).toEqual(['--resume', 'conv-123', '--plugin-dir', ARS_DIR]);
  });

  it('does not add --plugin-dir on resume when the original session belonged to engineering', () => {
    mockGetAgent.mockImplementation((id: string) =>
      id === 'backend-architect' ? { department: 'engineering' } : undefined,
    );
    configureDb({
      resumeSession: { id: 'sess-orig-eng', claude_conversation_id: 'conv-999', agent_id: 'backend-architect' },
    });

    const params: SpawnParams = {
      agentId: 'backend-architect',
      task: '',
      resumeSessionId: 'sess-orig-eng',
      projectId: null,
    };
    const { args } = buildClaudeArgs(params, 'sess-resume-eng', 'sonnet', 10, true, true, false);

    expect(args).toEqual(['--resume', 'conv-999']);
  });

  it('throws ARS_PATH_NOT_SET when ars.plugin-dir is unset', () => {
    mockGetAgent.mockImplementation((id: string) =>
      id === 'publication-operator' ? { department: 'academic-publication' } : undefined,
    );
    configureDb({ arsPluginDir: null });

    const params: SpawnParams = { agentId: 'publication-operator', task: 'x', projectId: null };
    expect(() => buildClaudeArgs(params, 'sess-err-notset', 'sonnet', 10, true, false, false))
      .toThrow(/^ARS_PATH_NOT_SET:/);
  });

  it('ARS_PATH_NOT_SET aborts before any write — no system-prompt file, no promptAssembler call', () => {
    mockGetAgent.mockImplementation((id: string) =>
      id === 'publication-operator' ? { department: 'academic-publication' } : undefined,
    );
    configureDb({ arsPluginDir: null });

    const params: SpawnParams = { agentId: 'publication-operator', task: 'x', projectId: null };
    expect(() => buildClaudeArgs(params, 'sess-err-notset-nowrite', 'sonnet', 10, true, false, false))
      .toThrow(/^ARS_PATH_NOT_SET:/);

    // The whole point of moving validation to the top of the normal-spawn
    // path: assemble() and the temp-file write must never run when ARS
    // validation fails — otherwise they'd be orphan files (L1 review finding).
    expect(promptAssembler.assemble).not.toHaveBeenCalled();
    expect(mockWriteFileSync).not.toHaveBeenCalled();
  });

  it('throws ARS_INSTALL_INCOMPLETE when the ARS directory is missing required files', () => {
    mockGetAgent.mockImplementation((id: string) =>
      id === 'publication-operator' ? { department: 'academic-publication' } : undefined,
    );
    configureDb({ arsPluginDir: ARS_DIR });
    setupArsFs(false); // nothing under ARS_DIR "exists"

    const params: SpawnParams = { agentId: 'publication-operator', task: 'x', projectId: null };
    expect(() => buildClaudeArgs(params, 'sess-err-incomplete', 'sonnet', 10, true, false, false))
      .toThrow(/^ARS_INSTALL_INCOMPLETE:/);
  });

  it('throws ARS_REQUIRES_INTERACTIVE when spawning non-interactively', () => {
    mockGetAgent.mockImplementation((id: string) =>
      id === 'publication-operator' ? { department: 'academic-publication' } : undefined,
    );
    configureDb({ arsPluginDir: ARS_DIR });
    setupArsFs(true);

    const params: SpawnParams = { agentId: 'publication-operator', task: 'x', projectId: null };
    expect(() => buildClaudeArgs(params, 'sess-err-noninteractive', 'sonnet', 10, false, false, false))
      .toThrow(/^ARS_REQUIRES_INTERACTIVE:/);
  });
});
