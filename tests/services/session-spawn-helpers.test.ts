// @vitest-environment node

const mockExistsSync = vi.fn(() => false);
const mockReadFileSync = vi.fn(() => '');
const mockWriteFileSync = vi.fn();
// Used by electron/utils/ars-validator.ts (statSync(path, { throwIfNoEntry: false })).
const mockStatSync = vi.fn((_p: unknown, _opts?: unknown): { isFile(): boolean } | undefined => undefined);

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    existsSync: (...args: unknown[]) => mockExistsSync(...args),
    readFileSync: (...args: unknown[]) => mockReadFileSync(...args),
    writeFileSync: (...args: unknown[]) => mockWriteFileSync(...args),
    mkdirSync: vi.fn(),
    statSync: (...args: [unknown, unknown?]) => mockStatSync(...args),
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

  /**
   * Path-aware statSync: ars-validator.ts calls
   * `statSync(fullPath, { throwIfNoEntry: false })` — only paths under
   * ARS_DIR "exist" (as files), and only when `complete`.
   */
  function setupArsFs(complete: boolean) {
    mockStatSync.mockImplementation((p: unknown) => {
      if (typeof p !== 'string') return undefined;
      if (complete && p.startsWith(ARS_DIR)) {
        return { isFile: () => true };
      }
      return undefined;
    });
  }

  /** SQL-aware DB mock (PM-012): branches on query text + bound params. */
  function configureDb(opts: {
    arsPluginDir?: string | null;
    resumeSession?: { id: string; claude_conversation_id: string; agent_id: string | null };
    directResumeConv?: { convId: string; agentId: string | null };
  }) {
    mockDbPrepare.mockImplementation((sql: string, params?: unknown[]) => {
      if (/FROM user_preferences WHERE key = \?/i.test(sql)) {
        const key = params?.[0];
        if (key === 'ars.plugin-dir') {
          return opts.arsPluginDir ? [{ value: opts.arsPluginDir }] : [];
        }
        return [];
      }
      if (/FROM claude_sessions\s+WHERE id = \?/i.test(sql)) {
        const id = params?.[0];
        if (opts.resumeSession && opts.resumeSession.id === id) {
          return [{
            claude_conversation_id: opts.resumeSession.claude_conversation_id,
            agent_id: opts.resumeSession.agent_id,
          }];
        }
        return [];
      }
      if (/FROM claude_sessions\s+WHERE claude_conversation_id = \?/i.test(sql)) {
        const convId = params?.[0];
        if (opts.directResumeConv && opts.directResumeConv.convId === convId && opts.directResumeConv.agentId) {
          return [{ agent_id: opts.directResumeConv.agentId }];
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
    mockStatSync.mockReset();
    mockStatSync.mockReturnValue(undefined);
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

  it('does not add --plugin-dir on resume when the original session has agent_id null (MN-7.4)', () => {
    configureDb({
      resumeSession: { id: 'sess-orig-null', claude_conversation_id: 'conv-null-agent', agent_id: null },
    });

    const params: SpawnParams = {
      agentId: 'whatever',
      task: '',
      resumeSessionId: 'sess-orig-null',
      projectId: null,
    };
    const { args } = buildClaudeArgs(params, 'sess-resume-null-agent', 'sonnet', 10, true, true, false);

    expect(args).toEqual(['--resume', 'conv-null-agent']);
  });

  // ─── MN-8 (G2 review round 2): resume of a session that was itself ────────
  // created by an earlier direct resume. That row's agent_id is always the
  // '(resumed)' placeholder (session-manager.ts), so isResume must fall back
  // to the same conversation-id reverse lookup direct resume uses.

  it('MN-8: injects --plugin-dir when resuming a session whose agent_id is the "(resumed)" placeholder and the conversation traces back to academic-publication', () => {
    mockGetAgent.mockImplementation((id: string) =>
      id === 'publication-operator' ? { department: 'academic-publication' } : undefined,
    );
    configureDb({
      arsPluginDir: ARS_DIR,
      resumeSession: { id: 'sess-chained', claude_conversation_id: 'conv-chained-pub', agent_id: '(resumed)' },
      directResumeConv: { convId: 'conv-chained-pub', agentId: 'publication-operator' },
    });
    setupArsFs(true);

    const params: SpawnParams = {
      agentId: 'whatever',
      task: '',
      resumeSessionId: 'sess-chained',
      projectId: null,
    };
    const { args } = buildClaudeArgs(params, 'sess-resume-chained-pub', 'sonnet', 10, true, true, false);

    expect(args).toEqual(['--resume', 'conv-chained-pub', '--plugin-dir', ARS_DIR]);
  });

  it('MN-8: does not add --plugin-dir and does not throw when the "(resumed)" placeholder cannot be traced back to any agent', () => {
    configureDb({
      resumeSession: { id: 'sess-chained-unknown', claude_conversation_id: 'conv-chained-unknown', agent_id: '(resumed)' },
      // No directResumeConv configured — the reverse lookup finds nothing.
    });

    const params: SpawnParams = {
      agentId: 'whatever',
      task: '',
      resumeSessionId: 'sess-chained-unknown',
      projectId: null,
    };
    let result: ReturnType<typeof buildClaudeArgs> | undefined;
    expect(() => {
      result = buildClaudeArgs(params, 'sess-resume-chained-unknown', 'sonnet', 10, true, true, false);
    }).not.toThrow();

    expect(result!.args).toEqual(['--resume', 'conv-chained-unknown']);
  });

  // ─── MJ-1 (G2 review): direct resume must not silently drop ARS ───────────
  // The sole caller (src/stores/sessions.ts resumeByConversationId) always
  // passes agentId: '' — buildClaudeArgs must fall back to looking up the
  // original agent via claude_conversation_id instead of trusting params.agentId.

  it('MJ-1: direct resume with agentId "" injects --plugin-dir when the DB shows the original agent was academic-publication', () => {
    mockGetAgent.mockImplementation((id: string) =>
      id === 'publication-operator' ? { department: 'academic-publication' } : undefined,
    );
    configureDb({
      arsPluginDir: ARS_DIR,
      directResumeConv: { convId: 'conv-direct-pub', agentId: 'publication-operator' },
    });
    setupArsFs(true);

    const params: SpawnParams = {
      agentId: '', // exactly what src/stores/sessions.ts resumeByConversationId passes
      task: '',
      resumeConversationId: 'conv-direct-pub',
      projectPath: 'C:/some/project',
    };
    const { args } = buildClaudeArgs(params, 'sess-direct-pub', 'sonnet', 10, true, false, true);

    expect(args).toEqual(['--resume', 'conv-direct-pub', '--plugin-dir', ARS_DIR]);
  });

  it('MJ-1: direct resume with agentId "" does not inject --plugin-dir when the DB shows the original agent was engineering', () => {
    mockGetAgent.mockImplementation((id: string) =>
      id === 'backend-architect' ? { department: 'engineering' } : undefined,
    );
    configureDb({
      directResumeConv: { convId: 'conv-direct-eng', agentId: 'backend-architect' },
    });

    const params: SpawnParams = {
      agentId: '',
      task: '',
      resumeConversationId: 'conv-direct-eng',
      projectPath: 'C:/some/project',
    };
    const { args } = buildClaudeArgs(params, 'sess-direct-eng', 'sonnet', 10, true, false, true);

    expect(args).toEqual(['--resume', 'conv-direct-eng']);
  });

  it('MJ-1: direct resume with agentId "" and no matching DB row does not inject --plugin-dir and does not throw', () => {
    // No claude_sessions row for this conversation at all (e.g. a conversation
    // that was never spawned through AgentHub).
    configureDb({});

    const params: SpawnParams = {
      agentId: '',
      task: '',
      resumeConversationId: 'conv-direct-unknown',
      projectPath: 'C:/some/project',
    };
    let result: ReturnType<typeof buildClaudeArgs> | undefined;
    expect(() => {
      result = buildClaudeArgs(params, 'sess-direct-unknown', 'sonnet', 10, true, false, true);
    }).not.toThrow();

    expect(result!.args).toEqual(['--resume', 'conv-direct-unknown']);
  });

  it('MJ-1: direct resume prefers a non-empty params.agentId over the DB lookup', () => {
    mockGetAgent.mockImplementation((id: string) =>
      id === 'publication-operator' ? { department: 'academic-publication' } : undefined,
    );
    configureDb({ arsPluginDir: ARS_DIR });
    setupArsFs(true);
    // No directResumeConv configured — if the code fell through to a DB
    // lookup it would find nothing and skip --plugin-dir. Passing it here
    // proves params.agentId (when non-empty) is used directly, no DB hit.
    const params: SpawnParams = {
      agentId: 'publication-operator',
      task: '',
      resumeConversationId: 'conv-direct-explicit-agent',
      projectPath: 'C:/some/project',
    };
    const { args } = buildClaudeArgs(params, 'sess-direct-explicit', 'sonnet', 10, true, false, true);

    expect(args).toEqual(['--resume', 'conv-direct-explicit-agent', '--plugin-dir', ARS_DIR]);
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

  it('throws ARS_INSTALL_INCOMPLETE when the ARS directory is missing required files (MN-7.3: message content)', () => {
    mockGetAgent.mockImplementation((id: string) =>
      id === 'publication-operator' ? { department: 'academic-publication' } : undefined,
    );
    configureDb({ arsPluginDir: ARS_DIR });
    setupArsFs(false); // nothing under ARS_DIR "exists"

    const params: SpawnParams = { agentId: 'publication-operator', task: 'x', projectId: null };
    let thrown: Error | undefined;
    try {
      buildClaudeArgs(params, 'sess-err-incomplete', 'sonnet', 10, true, false, false);
    } catch (err) {
      thrown = err as Error;
    }

    expect(thrown?.message).toMatch(/^ARS_INSTALL_INCOMPLETE:/);
    // §6.4「訊息須包含」：缺少的檔案清單
    expect(thrown?.message).toContain('.claude-plugin/plugin.json');
    expect(thrown?.message).toContain('skills/academic-paper/SKILL.md');
    expect(thrown?.message).toContain('skills/deep-research/SKILL.md');
    // §6.4「訊息須包含」：zip 下載修法字句
    expect(thrown?.message).toContain('把 skills/ 內的 stub 檔換成同名資料夾');
    expect(thrown?.message).toContain('改用 git clone');
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

  // ─── MN-7.1/MN-7.2: contract coverage gaps flagged by G2 review ───────────

  it('MN-7.1: engineering department normal spawn never queries ars.plugin-dir', () => {
    mockGetAgent.mockImplementation((id: string) =>
      id === 'backend-architect' ? { department: 'engineering' } : undefined,
    );
    configureDb({}); // no ars.plugin-dir configured — must never even be asked for

    const params: SpawnParams = { agentId: 'backend-architect', task: 'build the api', projectId: null };
    buildClaudeArgs(params, 'sess-mn71', 'sonnet', 10, true, false, false);

    expect(mockDbPrepare).not.toHaveBeenCalledWith(expect.anything(), ['ars.plugin-dir']);
  });

  it('MN-7.2: error priority is ARS_PATH_NOT_SET before ARS_REQUIRES_INTERACTIVE (non-interactive + unset)', () => {
    mockGetAgent.mockImplementation((id: string) =>
      id === 'publication-operator' ? { department: 'academic-publication' } : undefined,
    );
    configureDb({ arsPluginDir: null }); // unset

    const params: SpawnParams = { agentId: 'publication-operator', task: 'x', projectId: null };
    // interactive = false AND ars.plugin-dir unset — spec order says path-not-set
    // must win, not requires-interactive.
    expect(() => buildClaudeArgs(params, 'sess-mn72', 'sonnet', 10, false, false, false))
      .toThrow(/^ARS_PATH_NOT_SET:/);
  });

  // ─── MN-2: ars.plugin-dir value is trimmed and unquoted ───────────────────

  it('MN-2: strips a matching pair of double quotes from ars.plugin-dir (Windows "Copy as path")', () => {
    mockGetAgent.mockImplementation((id: string) =>
      id === 'publication-operator' ? { department: 'academic-publication' } : undefined,
    );
    configureDb({ arsPluginDir: `"${ARS_DIR}"` });
    setupArsFs(true);

    const params: SpawnParams = { agentId: 'publication-operator', task: 'x', projectId: null };
    const { args } = buildClaudeArgs(params, 'sess-mn2-quotes', 'sonnet', 10, true, false, false);

    const idx = args.indexOf('--plugin-dir');
    expect(idx).toBeGreaterThan(-1);
    expect(args[idx + 1]).toBe(ARS_DIR); // quotes stripped, no literal '"' in the arg
  });

  it('MN-2: trims surrounding whitespace from ars.plugin-dir', () => {
    mockGetAgent.mockImplementation((id: string) =>
      id === 'publication-operator' ? { department: 'academic-publication' } : undefined,
    );
    configureDb({ arsPluginDir: `  ${ARS_DIR}  \n` });
    setupArsFs(true);

    const params: SpawnParams = { agentId: 'publication-operator', task: 'x', projectId: null };
    const { args } = buildClaudeArgs(params, 'sess-mn2-trim', 'sonnet', 10, true, false, false);

    const idx = args.indexOf('--plugin-dir');
    expect(idx).toBeGreaterThan(-1);
    expect(args[idx + 1]).toBe(ARS_DIR);
  });

  it('MN-2: a whitespace-only ars.plugin-dir value is treated as unset (ARS_PATH_NOT_SET)', () => {
    mockGetAgent.mockImplementation((id: string) =>
      id === 'publication-operator' ? { department: 'academic-publication' } : undefined,
    );
    configureDb({ arsPluginDir: '   ' });

    const params: SpawnParams = { agentId: 'publication-operator', task: 'x', projectId: null };
    expect(() => buildClaudeArgs(params, 'sess-mn2-blank', 'sonnet', 10, true, false, false))
      .toThrow(/^ARS_PATH_NOT_SET:/);
  });

  // ─── MN-6: DB exception reading ars.plugin-dir surfaces as ARS_PATH_NOT_SET ─

  it('MN-6: a DB exception while reading ars.plugin-dir is surfaced as ARS_PATH_NOT_SET (not a raw SQL error)', () => {
    mockGetAgent.mockImplementation((id: string) =>
      id === 'publication-operator' ? { department: 'academic-publication' } : undefined,
    );
    mockDbPrepare.mockImplementation((sql: string) => {
      if (/FROM user_preferences WHERE key = \?/i.test(sql)) {
        throw new Error('database is locked');
      }
      return [];
    });

    const params: SpawnParams = { agentId: 'publication-operator', task: 'x', projectId: null };
    let thrown: Error | undefined;
    try {
      buildClaudeArgs(params, 'sess-mn6', 'sonnet', 10, true, false, false);
    } catch (err) {
      thrown = err as Error;
    }

    expect(thrown?.message).toMatch(/^ARS_PATH_NOT_SET:/);
    expect(thrown?.message).toContain('database is locked');
  });
});

// ─── buildClaudeArgs — MCP config re-injection on resume (Sprint 7.1 T9, PM-016) ─

describe('buildClaudeArgs — MCP config injection', () => {
  /** Path-aware existsSync: only the MCP send-message server script "exists". */
  function setupMcpServerScript(exists: boolean) {
    mockExistsSync.mockImplementation((p: unknown) => {
      if (typeof p !== 'string') return false;
      return exists && p.includes('send-message-server.js');
    });
  }

  /** SQL-aware DB mock (PM-012), scoped to this describe's needs. */
  function configureDb(opts: {
    resumeSession?: { id: string; claude_conversation_id: string; agent_id: string | null };
    directResumeConv?: { convId: string; agentId: string | null };
  }) {
    mockDbPrepare.mockImplementation((sql: string, params?: unknown[]) => {
      if (/FROM claude_sessions\s+WHERE id = \?/i.test(sql)) {
        const id = params?.[0];
        if (opts.resumeSession && opts.resumeSession.id === id) {
          return [{
            claude_conversation_id: opts.resumeSession.claude_conversation_id,
            agent_id: opts.resumeSession.agent_id,
          }];
        }
        return [];
      }
      if (/FROM claude_sessions\s+WHERE claude_conversation_id = \?/i.test(sql)) {
        const convId = params?.[0];
        if (opts.directResumeConv && opts.directResumeConv.convId === convId && opts.directResumeConv.agentId) {
          return [{ agent_id: opts.directResumeConv.agentId }];
        }
        return [];
      }
      return [];
    });
  }

  /** Find the JSON body written to the mcp-agent-config-*.json temp file. */
  function findMcpAgentConfigWrite(): Record<string, unknown> | undefined {
    const call = mockWriteFileSync.mock.calls.find(([path]) => String(path).includes('mcp-agent-config'));
    return call ? JSON.parse(call[1] as string) : undefined;
  }

  const engineeringAgent = {
    department: 'engineering',
    manages: ['downstream-agent'],
    reportsTo: 'lead-agent',
    coordinatesWith: ['peer-agent'],
  };

  beforeEach(() => {
    mockExistsSync.mockReset();
    mockExistsSync.mockReturnValue(false);
    mockReadFileSync.mockReset();
    mockWriteFileSync.mockReset();
    mockStatSync.mockReset();
    mockStatSync.mockReturnValue(undefined);
    mockDbPrepare.mockReset();
    mockDbPrepare.mockImplementation(() => []);
    mockGetAgent.mockReset();
    mockGetAgent.mockImplementation(() => undefined);
    mockLoggerInfo.mockReset();
    mockLoggerWarn.mockReset();
    (promptAssembler.assemble as ReturnType<typeof vi.fn>).mockClear();
  });

  it('normal spawn still injects --mcp-config with params.agentId (no regression from the T9 refactor)', () => {
    mockGetAgent.mockImplementation((id: string) => (id === 'backend-architect' ? engineeringAgent : undefined));
    setupMcpServerScript(true);

    const params: SpawnParams = { agentId: 'backend-architect', task: 'build the api', projectId: 'proj-1' };
    const { args } = buildClaudeArgs(params, 'sess-mcp-normal', 'sonnet', 10, true, false, false);

    expect(args).toContain('--mcp-config');
    const written = findMcpAgentConfigWrite();
    expect(written?.agentId).toBe('backend-architect');
    expect(written?.allowedTargets).toEqual(['downstream-agent', 'lead-agent', 'peer-agent']);
    expect(written?.projectId).toBe('proj-1');
  });

  it('T9: isResume injects --mcp-config with agentId set to the reverse-looked-up original agent', () => {
    mockGetAgent.mockImplementation((id: string) => (id === 'backend-architect' ? engineeringAgent : undefined));
    configureDb({
      resumeSession: { id: 'sess-orig', claude_conversation_id: 'conv-mcp-resume', agent_id: 'backend-architect' },
    });
    setupMcpServerScript(true);

    const params: SpawnParams = { agentId: 'whatever', task: '', resumeSessionId: 'sess-orig', projectId: null };
    const { args } = buildClaudeArgs(params, 'sess-mcp-resume', 'sonnet', 10, true, true, false);

    expect(args[0]).toBe('--resume');
    expect(args[1]).toBe('conv-mcp-resume');
    expect(args).toContain('--mcp-config');
    const written = findMcpAgentConfigWrite();
    expect(written?.agentId).toBe('backend-architect'); // the ORIGINAL agent, not params.agentId
  });

  it('T9: isDirectResume injects --mcp-config with agentId set to the reverse-looked-up original agent', () => {
    mockGetAgent.mockImplementation((id: string) => (id === 'backend-architect' ? engineeringAgent : undefined));
    configureDb({
      directResumeConv: { convId: 'conv-mcp-direct', agentId: 'backend-architect' },
    });
    setupMcpServerScript(true);

    const params: SpawnParams = {
      agentId: '', // exactly what src/stores/sessions.ts resumeByConversationId passes
      task: '',
      resumeConversationId: 'conv-mcp-direct',
      projectPath: 'C:/some/project',
    };
    const { args } = buildClaudeArgs(params, 'sess-mcp-direct', 'sonnet', 10, true, false, true);

    expect(args).toEqual(['--resume', 'conv-mcp-direct', '--mcp-config', expect.stringContaining('mcp-servers')]);
    const written = findMcpAgentConfigWrite();
    expect(written?.agentId).toBe('backend-architect');
  });

  it('T9: isResume does not add --mcp-config when no valid agent can be resolved', () => {
    configureDb({
      resumeSession: { id: 'sess-orig-unknown', claude_conversation_id: 'conv-mcp-unknown', agent_id: null },
    });
    setupMcpServerScript(true); // script exists, but there's no agent to build a config for

    const params: SpawnParams = {
      agentId: 'whatever',
      task: '',
      resumeSessionId: 'sess-orig-unknown',
      projectId: null,
    };
    const { args } = buildClaudeArgs(params, 'sess-mcp-resume-unknown', 'sonnet', 10, true, true, false);

    expect(args).toEqual(['--resume', 'conv-mcp-unknown']);
    expect(args).not.toContain('--mcp-config');
    expect(findMcpAgentConfigWrite()).toBeUndefined();
  });

  it('T9: isDirectResume does not add --mcp-config when no valid agent can be resolved', () => {
    configureDb({}); // no matching row anywhere
    setupMcpServerScript(true);

    const params: SpawnParams = {
      agentId: '',
      task: '',
      resumeConversationId: 'conv-mcp-direct-unknown',
      projectPath: 'C:/some/project',
    };
    const { args } = buildClaudeArgs(params, 'sess-mcp-direct-unknown', 'sonnet', 10, true, false, true);

    expect(args).toEqual(['--resume', 'conv-mcp-direct-unknown']);
    expect(args).not.toContain('--mcp-config');
  });

  it('T9: a generation failure during isResume does not throw and does not block --resume', () => {
    mockGetAgent.mockImplementation((id: string) => (id === 'backend-architect' ? engineeringAgent : undefined));
    configureDb({
      resumeSession: { id: 'sess-orig-fail', claude_conversation_id: 'conv-mcp-fail', agent_id: 'backend-architect' },
    });
    mockWriteFileSync.mockImplementation(() => {
      throw new Error('EACCES: cannot write mcp-agent-config');
    });

    const params: SpawnParams = { agentId: 'whatever', task: '', resumeSessionId: 'sess-orig-fail', projectId: null };
    let result: ReturnType<typeof buildClaudeArgs> | undefined;
    expect(() => {
      result = buildClaudeArgs(params, 'sess-mcp-fail', 'sonnet', 10, true, true, false);
    }).not.toThrow();

    expect(result!.args).toEqual(['--resume', 'conv-mcp-fail']); // --resume itself must go through
    expect(mockLoggerWarn).toHaveBeenCalled();
  });

  it('T9: a generation failure during isDirectResume does not throw and does not block --resume', () => {
    mockGetAgent.mockImplementation((id: string) => (id === 'backend-architect' ? engineeringAgent : undefined));
    configureDb({ directResumeConv: { convId: 'conv-mcp-direct-fail', agentId: 'backend-architect' } });
    mockWriteFileSync.mockImplementation(() => {
      throw new Error('EACCES: cannot write mcp-agent-config');
    });

    const params: SpawnParams = {
      agentId: '',
      task: '',
      resumeConversationId: 'conv-mcp-direct-fail',
      projectPath: 'C:/some/project',
    };
    let result: ReturnType<typeof buildClaudeArgs> | undefined;
    expect(() => {
      result = buildClaudeArgs(params, 'sess-mcp-direct-fail', 'sonnet', 10, true, false, true);
    }).not.toThrow();

    expect(result!.args).toEqual(['--resume', 'conv-mcp-direct-fail']);
    expect(mockLoggerWarn).toHaveBeenCalled();
  });

  // ─── resolvedAgentId (G2 review round 2, identity mismatch) ────────────────
  // session-manager.ts uses this to record claude_sessions.agent_id instead
  // of its own '(resumed)' placeholder, so a resumed session that IS
  // communicating as agent X over MCP is also findable as agent X.

  it('resolvedAgentId: normal spawn returns params.agentId', () => {
    mockGetAgent.mockImplementation((id: string) => (id === 'backend-architect' ? engineeringAgent : undefined));

    const params: SpawnParams = { agentId: 'backend-architect', task: 'x', projectId: null };
    const { resolvedAgentId } = buildClaudeArgs(params, 'sess-resolved-normal', 'sonnet', 10, true, false, false);

    expect(resolvedAgentId).toBe('backend-architect');
  });

  it('resolvedAgentId: isResume returns the reverse-looked-up original agent', () => {
    mockGetAgent.mockImplementation((id: string) => (id === 'backend-architect' ? engineeringAgent : undefined));
    configureDb({
      resumeSession: { id: 'sess-orig', claude_conversation_id: 'conv-resolved-resume', agent_id: 'backend-architect' },
    });

    const params: SpawnParams = { agentId: 'whatever', task: '', resumeSessionId: 'sess-orig', projectId: null };
    const { resolvedAgentId } = buildClaudeArgs(params, 'sess-resolved-resume', 'sonnet', 10, true, true, false);

    expect(resolvedAgentId).toBe('backend-architect');
  });

  it('resolvedAgentId: isDirectResume returns the reverse-looked-up original agent', () => {
    mockGetAgent.mockImplementation((id: string) => (id === 'backend-architect' ? engineeringAgent : undefined));
    configureDb({ directResumeConv: { convId: 'conv-resolved-direct', agentId: 'backend-architect' } });

    const params: SpawnParams = {
      agentId: '',
      task: '',
      resumeConversationId: 'conv-resolved-direct',
      projectPath: 'C:/some/project',
    };
    const { resolvedAgentId } = buildClaudeArgs(params, 'sess-resolved-direct', 'sonnet', 10, true, false, true);

    expect(resolvedAgentId).toBe('backend-architect');
  });

  it('resolvedAgentId: null on isResume when the session row exists but no agent can be resolved', () => {
    configureDb({
      resumeSession: { id: 'sess-orig-unknown', claude_conversation_id: 'conv-resolved-unknown', agent_id: null },
    });

    const params: SpawnParams = { agentId: 'whatever', task: '', resumeSessionId: 'sess-orig-unknown', projectId: null };
    const { resolvedAgentId } = buildClaudeArgs(params, 'sess-resolved-resume-unknown', 'sonnet', 10, true, true, false);

    expect(resolvedAgentId).toBeNull();
  });

  it('resolvedAgentId: null on isDirectResume when no agent can be resolved', () => {
    configureDb({}); // no matching rows anywhere

    const params: SpawnParams = {
      agentId: '',
      task: '',
      resumeConversationId: 'conv-resolved-direct-unknown',
      projectPath: 'C:/some/project',
    };
    const { resolvedAgentId } = buildClaudeArgs(params, 'sess-resolved-direct-unknown', 'sonnet', 10, true, false, true);

    expect(resolvedAgentId).toBeNull();
  });
});
