// @vitest-environment node
//
// PM-008 端到端整合驗證（代替老闆的 GUI 實機複測）：
// 走「真正的 sessionManager.spawn() / stop()」程式碼路徑，
// worktree-manager / fs / git 全部用真的（temp git repo），
// 只 mock 外部邊界（PTY、DB、事件匯流排、Claude CLI）。
//
// 重演 PM-008 的原始事故場景：
//   PM session 開工 → tech-lead session 開工（舊版此刻會 checkout 切走 PM 的 HEAD）
//   → 兩邊各自 commit → 驗證各落自己分支、main 完全不動 → 結束 session → worktree 清乾淨

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { execFileSync } from 'child_process';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// ── 邊界 mock（與 session-manager.test.ts 同款，但 fs / child_process / worktree-manager 用真的）──

vi.mock('node-pty', () => ({
  spawn: vi.fn(() => ({
    pid: 12345, onData: vi.fn(), onExit: vi.fn(), write: vi.fn(), resize: vi.fn(), kill: vi.fn(),
  })),
}));

vi.mock('../../electron/services/database', () => ({
  database: { run: vi.fn(), prepare: vi.fn(() => []), get: vi.fn() },
}));

vi.mock('../../electron/services/event-bus', () => ({
  eventBus: {
    on: vi.fn(), emit: vi.fn(), emitSessionEvent: vi.fn(), emitSessionEnded: vi.fn(),
    emitSessionCostUpdate: vi.fn(), emitSessionStatus: vi.fn(), emitPtyData: vi.fn(),
  },
}));

vi.mock('../../electron/services/agent-loader', () => ({
  agentLoader: {
    getById: vi.fn((id: string) => ({ id, name: id, model: 'sonnet' })),
    getAgent: vi.fn(() => null), listAgents: vi.fn(() => []),
  },
}));

vi.mock('../../electron/services/git-manager', () => ({
  gitManager: { getStatus: vi.fn().mockResolvedValue({ isRepo: false }) }, // tryAutoCommit 走不到
}));

vi.mock('../../electron/services/event-parser', () => ({
  EventParser: class { feed = vi.fn(() => []); flush = vi.fn(); reset = vi.fn(); on = vi.fn(); },
}));

vi.mock('../../electron/services/hook-manager', () => ({
  hookManager: {
    tryInjectHooks: vi.fn(), watchHookLogs: vi.fn(), unwatchHookLogs: vi.fn(),
    unwatchAllHookLogs: vi.fn(), injectHooksForProject: vi.fn(), listHooks: vi.fn(() => []),
  },
}));

vi.mock('../../electron/services/message-broker', () => ({
  messageBroker: { send: vi.fn(), startInboxPoller: vi.fn(), stopInboxPoller: vi.fn() },
}));

vi.mock('../../electron/services/session-delegation', () => ({
  DelegationManager: class {
    send = vi.fn(); list = vi.fn(() => []);
    deliverOnIdle = vi.fn(); deliverOnComplete = vi.fn();
  },
}));

vi.mock('../../electron/services/session-cost-tracker', () => ({
  parseInteractiveTokenUsage: vi.fn(() => null),
  applyParsedEventUsage: vi.fn(),
  applyResultEventUsage: vi.fn(),
  persistSessionCost: vi.fn(),
}));

vi.mock('../../electron/services/jsonl-usage-tracker', () => ({
  parseJsonlUsage: vi.fn(() => ({ costUsd: 0, inputTokens: 0, outputTokens: 0, turnsCount: 0 })),
  findJsonlByStartTime: vi.fn(() => null),
}));

vi.mock('../../electron/services/session-conversation-scanner', () => ({
  scanResumableSessions: vi.fn(() => []),
}));

vi.mock('../../electron/services/pty-manager', () => ({
  spawnPty: vi.fn(() => ({
    pid: 12345, onData: vi.fn(), onExit: vi.fn(), write: vi.fn(), resize: vi.fn(), kill: vi.fn(),
  })),
  killPtyProcess: vi.fn(),
  resizePtyProcess: vi.fn(),
  ptyWriteAndSubmit: vi.fn(),
  stripAnsiAndControl: vi.fn((s: string) => s),
  stripTerminalOutput: vi.fn((s: string) => s),
}));

// spawn-helpers：resolveSpawnCwd 回 temp repo；ensureWorkspaceTrust 不碰真的 ~/.claude.json
let REPO_DIR = '';
vi.mock('../../electron/services/session-spawn-helpers', () => ({
  buildClaudeArgs: vi.fn(() => ({ args: [], tmpFile: null })),
  ensureWorkspaceTrust: vi.fn(),
  lookupResumeInfo: vi.fn(() => ({})),
  resolveSpawnCwd: vi.fn(() => REPO_DIR),
}));

vi.mock('../../electron/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

let LOGS_DIR = '';
vi.mock('../../electron/utils/paths', () => ({
  getSessionLogsDir: vi.fn(() => LOGS_DIR),
  getClaudeConversationsDir: vi.fn(() => LOGS_DIR),
}));

import { sessionManager } from '../../electron/services/session-manager';

function git(cwd: string, args: string[]): string {
  return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' }).trim();
}

let tmpRoot: string;

beforeAll(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'pm008-e2e-'));
  REPO_DIR = join(tmpRoot, 'proj');
  LOGS_DIR = join(tmpRoot, 'logs');
  execFileSync('git', ['init', REPO_DIR]);
  git(REPO_DIR, ['config', 'user.email', 't@t.local']);
  git(REPO_DIR, ['config', 'user.name', 'T']);
  git(REPO_DIR, ['checkout', '-b', 'main']);
  writeFileSync(join(REPO_DIR, 'app.txt'), 'v1\n');
  git(REPO_DIR, ['add', '.']);
  git(REPO_DIR, ['commit', '-m', 'init']);
  // sessionManager 是 singleton；claudePath 需非 null 才能 spawn
  (sessionManager as unknown as { claudePath: string }).claudePath = 'claude-mock';
});

afterAll(() => {
  try { rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* Windows lock 容忍 */ }
});

describe('PM-008 事故場景重演（真 spawn 路徑 + 真 git）', () => {
  it('兩個 session 先後 spawn、並行 commit、結束清理 — main 全程不動', () => {
    const mainHeadBefore = git(REPO_DIR, ['rev-parse', 'HEAD']);

    // ① PM session 開工
    const pm = sessionManager.spawn({ agentId: 'product-manager', task: '寫提案', taskId: 'T1', projectId: 'proj-1' });
    // ② tech-lead session 開工（舊版 tryAutoBranch 此刻會把共享 HEAD 切走 → PM 的 commit 落錯分支）
    const tl = sessionManager.spawn({ agentId: 'tech-lead', task: '寫程式', taskId: 'T2', projectId: 'proj-1' });

    const active = sessionManager.getActiveSessions();
    const pmS = active.find((s) => s.sessionId === pm.sessionId)!;
    const tlS = active.find((s) => s.sessionId === tl.sessionId)!;

    // 各自拿到獨立 worktree 與分支
    expect(pmS.workDir).not.toBe(tlS.workDir);
    expect(pmS.workDir).not.toBe(REPO_DIR);
    expect(pmS.gitBranch).toBe('agent/product-manager/T1');
    expect(tlS.gitBranch).toBe('agent/tech-lead/T2');
    expect(git(pmS.workDir, ['branch', '--show-current'])).toBe('agent/product-manager/T1');
    expect(git(tlS.workDir, ['branch', '--show-current'])).toBe('agent/tech-lead/T2');

    // ③ 重演事故：PM 交錯 commit 兩次，中間 tech-lead 也在動（舊版第二個 commit 會落錯分支）
    writeFileSync(join(pmS.workDir, 'proposal.md'), 'draft\n');
    git(pmS.workDir, ['add', '.']);
    git(pmS.workDir, ['commit', '-m', 'pm commit 1']);
    writeFileSync(join(tlS.workDir, 'code.ts'), 'export {}\n');
    git(tlS.workDir, ['add', '.']);
    git(tlS.workDir, ['commit', '-m', 'tl commit 1']);
    writeFileSync(join(pmS.workDir, 'proposal.md'), 'final\n');
    git(pmS.workDir, ['add', '.']);
    git(pmS.workDir, ['commit', '-m', 'pm commit 2']);

    // ④ 驗證：commit 各歸各的分支
    const pmLog = git(REPO_DIR, ['log', 'agent/product-manager/T1', '--oneline']);
    const tlLog = git(REPO_DIR, ['log', 'agent/tech-lead/T2', '--oneline']);
    expect(pmLog).toContain('pm commit 1');
    expect(pmLog).toContain('pm commit 2');
    expect(pmLog).not.toContain('tl commit');
    expect(tlLog).toContain('tl commit 1');
    expect(tlLog).not.toContain('pm commit');

    // ⑤ main：HEAD 沒動、沒被切走、reflog 乾淨（舊 bug 鐵證是 reflog 裡的 checkout）
    expect(git(REPO_DIR, ['branch', '--show-current'])).toBe('main');
    expect(git(REPO_DIR, ['rev-parse', 'HEAD'])).toBe(mainHeadBefore);
    expect(git(REPO_DIR, ['reflog'])).not.toContain('checkout: moving from main');

    // ⑥ 結束兩個 session → worktree 清理（已 commit = clean = 移除），分支與 commit 保留
    const pmWorkDir = pmS.workDir;
    const tlWorkDir = tlS.workDir;
    sessionManager.stop(pm.sessionId, true);
    sessionManager.stop(tl.sessionId, true);
    expect(existsSync(pmWorkDir)).toBe(false);
    expect(existsSync(tlWorkDir)).toBe(false);
    expect(git(REPO_DIR, ['log', 'agent/product-manager/T1', '--oneline'])).toContain('pm commit 2');
    expect(git(REPO_DIR, ['log', 'agent/tech-lead/T2', '--oneline'])).toContain('tl commit 1');
    expect(git(REPO_DIR, ['worktree', 'list'])).not.toContain('agenthub-worktrees');
  });
});
