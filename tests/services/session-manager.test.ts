// @vitest-environment node

vi.mock('node-pty', () => ({
  spawn: vi.fn(() => ({
    pid: 12345,
    onData: vi.fn(),
    onExit: vi.fn(),
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(),
  })),
}));

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    existsSync: vi.fn(() => false),
    readFileSync: vi.fn(() => ''),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    unlinkSync: vi.fn(),
    readdirSync: vi.fn(() => []),
    statSync: vi.fn(() => ({ mtimeMs: 0, mtime: new Date(0), size: 0 })),
    openSync: vi.fn(() => 1),
    readSync: vi.fn(() => 0),
    closeSync: vi.fn(),
  };
});

vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>();
  return {
    ...actual,
    execSync: vi.fn(() => ''),
  };
});

vi.mock('../../electron/services/database', () => ({
  database: {
    run: vi.fn(),
    prepare: vi.fn(() => []),
    get: vi.fn(),
  },
}));

vi.mock('../../electron/services/event-bus', () => ({
  eventBus: {
    on: vi.fn(),
    emit: vi.fn(),
    emitSessionEvent: vi.fn(),
    emitSessionEnded: vi.fn(),
    emitSessionCostUpdate: vi.fn(),
    emitSessionStatus: vi.fn(),
    emitPtyData: vi.fn(),
  },
}));

vi.mock('../../electron/services/agent-loader', () => ({
  agentLoader: {
    getAgent: vi.fn(() => null),
    getById: vi.fn(() => null),
    listAgents: vi.fn(() => []),
  },
}));

vi.mock('../../electron/services/prompt-assembler', () => ({
  promptAssembler: {
    assemble: vi.fn(() => 'mock system prompt'),
  },
}));

vi.mock('../../electron/services/git-manager', () => ({
  gitManager: {
    getStatus: vi.fn().mockResolvedValue({ isRepo: false }),
    createBranch: vi.fn().mockResolvedValue(undefined),
    checkout: vi.fn().mockResolvedValue(undefined),
    getBranches: vi.fn().mockResolvedValue({ all: [] }),
  },
}));

// vitest 4 對 `new mockFn()` 走 Reflect.construct，arrow function 實作不可建構（PM-012 A 類根因）
// EventParser 在 session-manager.ts 以 `new EventParser()` 使用，mock 必須是真的 class
vi.mock('../../electron/services/event-parser', () => ({
  EventParser: class {
    feed = vi.fn(() => []);
    flush = vi.fn();
    reset = vi.fn();
    on = vi.fn();
  },
}));

vi.mock('../../electron/services/hook-manager', () => ({
  hookManager: {
    tryInjectHooks: vi.fn(),
    watchHookLogs: vi.fn(),
    unwatchHookLogs: vi.fn(),
    unwatchAllHookLogs: vi.fn(),
    injectHooksForProject: vi.fn(),
    listHooks: vi.fn(() => []),
  },
}));

vi.mock('../../electron/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../electron/utils/paths', () => ({
  getSessionLogsDir: vi.fn(() => '/tmp/logs'),
  getClaudeConversationsDir: vi.fn(() => '/tmp/conversations'),
}));

import { sessionManager } from '../../electron/services/session-manager';
import * as pty from 'node-pty';
import * as fs from 'fs';
import { database } from '../../electron/services/database';
import { agentLoader } from '../../electron/services/agent-loader';
import { hookManager } from '../../electron/services/hook-manager';
import { execSync } from 'child_process';

const mockPty = pty as { spawn: ReturnType<typeof vi.fn> };
const mockFs = fs as unknown as {
  existsSync: ReturnType<typeof vi.fn>;
  readFileSync: ReturnType<typeof vi.fn>;
  writeFileSync: ReturnType<typeof vi.fn>;
  mkdirSync: ReturnType<typeof vi.fn>;
  readdirSync: ReturnType<typeof vi.fn>;
  statSync: ReturnType<typeof vi.fn>;
  openSync: ReturnType<typeof vi.fn>;
  readSync: ReturnType<typeof vi.fn>;
  closeSync: ReturnType<typeof vi.fn>;
};
const mockDb = database as {
  run: ReturnType<typeof vi.fn>;
  prepare: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
};
const mockAgentLoader = agentLoader as {
  getById: ReturnType<typeof vi.fn>;
};
const mockExecSync = execSync as ReturnType<typeof vi.fn>;

// Helper: build a minimal valid agent stub
const makeAgent = (overrides: Record<string, unknown> = {}) => ({
  id: 'test-agent',
  name: 'Test Agent',
  model: 'sonnet',
  department: 'engineering',
  level: 'senior',
  ...overrides,
});

// Helper: set claudePath via detectClaude with MOCK_CLAUDE_CLI
function setMockClaudeCli(path = '/mock/claude') {
  process.env.MOCK_CLAUDE_CLI = path;
  sessionManager.detectClaude();
}

function clearMockClaudeCli() {
  delete process.env.MOCK_CLAUDE_CLI;
}

describe('SessionManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.prepare.mockReturnValue([]);
    mockDb.run.mockReturnValue(undefined);
    mockFs.existsSync.mockReturnValue(false);
    mockFs.readdirSync.mockReturnValue([]);
    // Clean up active sessions to prevent state bleed between tests
    sessionManager.cleanup();
    // Reset claudePath: point to a fake path by default via MOCK_CLAUDE_CLI
    // so tests that need "no claude" can explicitly nullify it
    clearMockClaudeCli();
    // Re-detect so the singleton resets claudePath to null (no MOCK_CLAUDE_CLI,
    // execSync is still the vi.fn() that returns '' — won't match .cmd → null)
    mockExecSync.mockReturnValueOnce('');
    sessionManager.detectClaude();
  });

  afterEach(() => {
    clearMockClaudeCli();
  });

  // -------------------------------------------------------------------------
  // detectClaude / getClaudePath / isClaudeAvailable
  // -------------------------------------------------------------------------

  describe('detectClaude', () => {
    it('sets claudePath from MOCK_CLAUDE_CLI env variable', () => {
      process.env.MOCK_CLAUDE_CLI = '/fake/claude.sh';
      sessionManager.detectClaude();
      expect(sessionManager.getClaudePath()).toBe('/fake/claude.sh');
      expect(sessionManager.isClaudeAvailable()).toBe(true);
    });

    it('uses execSync "where claude" when MOCK_CLAUDE_CLI is not set', () => {
      // MOCK_CLAUDE_CLI is already cleared by beforeEach; detectClaude was
      // called with '' in beforeEach. Now call again with a real path.
      mockExecSync.mockReturnValueOnce('C:\\tools\\claude.cmd\n');
      sessionManager.detectClaude();
      // Should prefer the .cmd path on Windows
      expect(sessionManager.getClaudePath()).toBe('C:\\tools\\claude.cmd');
    });

    it('leaves claudePath null when execSync returns empty string', () => {
      // beforeEach already called detectClaude with '' → claudePath is null
      expect(sessionManager.isClaudeAvailable()).toBe(false);
      expect(sessionManager.getClaudePath()).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // getActiveSessions / getActiveCount — initial state
  // -------------------------------------------------------------------------

  describe('getActiveSessions', () => {
    it('returns an empty array when no sessions have been spawned', () => {
      expect(sessionManager.getActiveSessions()).toEqual([]);
    });
  });

  describe('getActiveCount', () => {
    it('returns 0 when no sessions are active', () => {
      expect(sessionManager.getActiveCount()).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // spawn — error paths (no claudePath / no agent)
  // -------------------------------------------------------------------------

  describe('spawn — pre-conditions', () => {
    it('throws if Claude CLI is not available', () => {
      // beforeEach already reset claudePath to null (no MOCK_CLAUDE_CLI + empty execSync)
      expect(sessionManager.isClaudeAvailable()).toBe(false);

      expect(() =>
        sessionManager.spawn({
          agentId: 'test-agent',
          task: 'do something',
          interactive: false,
        }),
      ).toThrow('Claude CLI is not available');
    });

    it('throws when agentId is not found and not a resume', () => {
      setMockClaudeCli();
      mockAgentLoader.getById.mockReturnValueOnce(undefined);

      expect(() =>
        sessionManager.spawn({
          agentId: 'unknown-agent',
          task: 'do something',
          interactive: false,
        }),
      ).toThrow('Agent not found: unknown-agent');
    });
  });

  // -------------------------------------------------------------------------
  // spawn — happy path (non-interactive / one-shot)
  // -------------------------------------------------------------------------

  describe('spawn — successful one-shot session', () => {
    beforeEach(() => {
      setMockClaudeCli();
      mockAgentLoader.getById.mockReturnValue(makeAgent());
    });

    it('returns a sessionId and ptyId', () => {
      const result = sessionManager.spawn({
        agentId: 'test-agent',
        task: 'write tests',
        interactive: false,
      });
      expect(result).toHaveProperty('sessionId');
      expect(result).toHaveProperty('ptyId');
      expect(typeof result.sessionId).toBe('string');
      expect(result.ptyId).toMatch(/^pty-/);
    });

    it('calls pty.spawn to create a PTY process', () => {
      sessionManager.spawn({
        agentId: 'test-agent',
        task: 'write tests',
        interactive: false,
      });
      expect(mockPty.spawn).toHaveBeenCalledTimes(1);
    });

    it('inserts a record into the database', () => {
      sessionManager.spawn({
        agentId: 'test-agent',
        task: 'write tests',
        interactive: false,
      });
      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO claude_sessions'),
        expect.arrayContaining(['test-agent', 'write tests']),
      );
    });

    it('registers the session so getActiveCount returns 1', () => {
      sessionManager.spawn({
        agentId: 'test-agent',
        task: 'write tests',
        interactive: false,
      });
      expect(sessionManager.getActiveCount()).toBe(1);
    });

    it('injects hooks into the working directory', () => {
      sessionManager.spawn({
        agentId: 'test-agent',
        task: 'write tests',
        interactive: false,
      });
      expect(hookManager.tryInjectHooks).toHaveBeenCalledTimes(1);
    });

    it('starts watching hook logs for the project directory', () => {
      sessionManager.spawn({
        agentId: 'test-agent',
        task: 'write tests',
        interactive: false,
      });
      expect(hookManager.watchHookLogs).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // spawn — resume by session ID requires DB record
  // -------------------------------------------------------------------------

  describe('spawn — resume by sessionId', () => {
    beforeEach(() => {
      setMockClaudeCli();
    });

    it('throws when no claude_conversation_id is found for the original session', () => {
      mockDb.prepare.mockReturnValue([]); // no rows → no conversation ID

      expect(() =>
        sessionManager.spawn({
          agentId: 'test-agent',
          task: '',
          resumeSessionId: 'original-session-id',
          interactive: false,
        }),
      ).toThrow('Cannot resume: no Claude conversation ID found for session original-session-id');
    });

    it('succeeds when a claude_conversation_id row is found', () => {
      // First prepare call: conversation ID lookup
      mockDb.prepare
        .mockReturnValueOnce([{ claude_conversation_id: 'conv-abc123' }])
        // Second prepare: session info lookup
        .mockReturnValueOnce([{ agent_id: 'test-agent', task: 'original task', task_id: null, project_id: null }])
        .mockReturnValue([]);

      const result = sessionManager.spawn({
        agentId: 'test-agent',
        task: '',
        resumeSessionId: 'original-session-id',
        interactive: false,
      });
      expect(result).toHaveProperty('sessionId');
      expect(mockPty.spawn).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // spawn — direct resume by conversationId
  // -------------------------------------------------------------------------

  describe('spawn — direct resume by conversationId', () => {
    it('creates a session without requiring an agent record', () => {
      setMockClaudeCli();
      // agentLoader.getById should not be called for direct resume
      const result = sessionManager.spawn({
        agentId: 'any-agent',
        task: '',
        resumeConversationId: 'conv-xyz',
        interactive: true,
      });
      expect(result).toHaveProperty('sessionId');
      expect(mockAgentLoader.getById).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // stop — error and happy paths
  // -------------------------------------------------------------------------

  describe('stop', () => {
    it('throws when stopping a non-existent session', () => {
      expect(() => sessionManager.stop('nonexistent-session-id')).toThrow('Session not found');
    });

    it('kills the PTY and marks session stopped when called with force=true', () => {
      setMockClaudeCli();
      mockAgentLoader.getById.mockReturnValue(makeAgent());

      const { sessionId } = sessionManager.spawn({
        agentId: 'test-agent',
        task: 'a task',
        interactive: false,
      });

      // Get the mock PTY instance that was used
      const ptyInstance = mockPty.spawn.mock.results[0].value;

      sessionManager.stop(sessionId, true);

      expect(ptyInstance.kill).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // listDelegations — initial state
  // -------------------------------------------------------------------------

  describe('listDelegations', () => {
    it('returns an empty array initially', () => {
      expect(sessionManager.listDelegations()).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // waitForCompletion — session not found
  // -------------------------------------------------------------------------

  describe('waitForCompletion', () => {
    it('rejects immediately for a non-existent session', async () => {
      await expect(
        sessionManager.waitForCompletion('does-not-exist'),
      ).rejects.toThrow('Session not found: does-not-exist');
    });
  });

  // -------------------------------------------------------------------------
  // getOutputBuffer — unknown ptyId
  // -------------------------------------------------------------------------

  describe('getOutputBuffer', () => {
    it('returns empty string for an unknown ptyId', () => {
      expect(sessionManager.getOutputBuffer('pty-unknown')).toBe('');
    });
  });

  // -------------------------------------------------------------------------
  // getSessionLog — file not found
  // -------------------------------------------------------------------------

  describe('getSessionLog', () => {
    it('returns empty string when the log file does not exist', () => {
      mockFs.existsSync.mockReturnValue(false);
      expect(sessionManager.getSessionLog('some-session-id')).toBe('');
    });
  });

  // -------------------------------------------------------------------------
  // listFromDb — delegates to database.prepare
  // -------------------------------------------------------------------------

  describe('listFromDb', () => {
    it('returns an empty array when database.prepare returns no rows', () => {
      mockDb.prepare.mockReturnValue([]);
      expect(sessionManager.listFromDb()).toEqual([]);
    });

    it('passes the provided limit to the SQL query', () => {
      mockDb.prepare.mockReturnValue([]);
      sessionManager.listFromDb({ limit: 10 });
      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT ?'),
        expect.arrayContaining([10]),
      );
    });

    it('filters by taskId when provided', () => {
      mockDb.prepare.mockReturnValue([]);
      sessionManager.listFromDb({ taskId: 'task-42' });
      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining('task_id = ?'),
        expect.arrayContaining(['task-42']),
      );
    });

    it('filters by projectId when provided', () => {
      mockDb.prepare.mockReturnValue([]);
      sessionManager.listFromDb({ projectId: 'proj-99' });
      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining('project_id = ?'),
        expect.arrayContaining(['proj-99']),
      );
    });

    it('returns empty array on database error without throwing', () => {
      mockDb.prepare.mockImplementationOnce(() => { throw new Error('db error'); });
      expect(() => sessionManager.listFromDb()).not.toThrow();
      expect(sessionManager.listFromDb()).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // scanResumableSessions — filesystem-driven
  // -------------------------------------------------------------------------

  describe('scanResumableSessions', () => {
    it('returns an empty array when no conversation directories exist', () => {
      mockDb.prepare.mockReturnValue([]); // no projects in DB
      mockFs.existsSync.mockReturnValue(false); // no convDir
      const results = sessionManager.scanResumableSessions();
      expect(results).toEqual([]);
    });

    it('returns conversation entries when .jsonl files are found', () => {
      mockDb.prepare.mockReturnValue([]); // no projects
      mockFs.existsSync.mockReturnValue(true); // convDir exists
      mockFs.readdirSync.mockReturnValue(['abc123.jsonl']);
      mockFs.statSync.mockReturnValue({ mtimeMs: Date.now(), mtime: new Date(), size: 1024 });
      // readSync returns 0 bytes — no first message extractable
      mockFs.readSync.mockReturnValue(0);

      const results = sessionManager.scanResumableSessions();
      expect(results).toHaveLength(1);
      expect(results[0].conversationId).toBe('abc123');
      expect(results[0].firstMessage).toBe('(no message)');
    });

    it('respects the limit parameter', () => {
      mockDb.prepare.mockReturnValue([]);
      mockFs.existsSync.mockReturnValue(true);
      // Return 5 fake .jsonl files
      mockFs.readdirSync.mockReturnValue([
        'a.jsonl', 'b.jsonl', 'c.jsonl', 'd.jsonl', 'e.jsonl',
      ]);
      mockFs.statSync.mockReturnValue({ mtimeMs: Date.now(), mtime: new Date(), size: 512 });
      mockFs.readSync.mockReturnValue(0);

      const results = sessionManager.scanResumableSessions(3);
      expect(results.length).toBeLessThanOrEqual(3);
    });
  });

  // -------------------------------------------------------------------------
  // triggerSummary — rate limiting
  // -------------------------------------------------------------------------

  describe('triggerSummary', () => {
    it('returns null for a non-existent session', () => {
      expect(sessionManager.triggerSummary('ghost-session')).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // cleanup — does not throw when sessions map is empty
  // -------------------------------------------------------------------------

  describe('cleanup', () => {
    it('does not throw when called with no active sessions', () => {
      expect(() => sessionManager.cleanup()).not.toThrow();
    });

    it('clears all active sessions after cleanup', () => {
      setMockClaudeCli();
      mockAgentLoader.getById.mockReturnValue(makeAgent());

      sessionManager.spawn({ agentId: 'test-agent', task: 'task', interactive: false });
      expect(sessionManager.getActiveCount()).toBeGreaterThan(0);

      sessionManager.cleanup();
      expect(sessionManager.getActiveCount()).toBe(0);
    });
  });
});
