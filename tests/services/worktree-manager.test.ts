// @vitest-environment node
//
// PM-008 驗收核心測試：per-session git worktree 隔離。
// 特意用「真實 git repo（temp 目錄）」而非 mock —— 被驗證的就是 git 本身的行為：
// 兩個 session 並行時各自 commit 落在自己的分支、主 repo HEAD 完全不被動。

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { execFileSync } from 'child_process';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

vi.mock('../../electron/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  setupSessionWorktree,
  cleanupSessionWorktree,
  sanitizeBranchComponent,
  computeWorktreePath,
} from '../../electron/services/worktree-manager';

function git(cwd: string, args: string[]): string {
  return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' }).trim();
}

let tmpRoot: string;
let repoDir: string;

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'agenthub-wt-test-'));
  repoDir = join(tmpRoot, 'proj');
  execFileSync('git', ['init', repoDir], { encoding: 'utf8' });
  git(repoDir, ['config', 'user.email', 'test@test.local']);
  git(repoDir, ['config', 'user.name', 'Test']);
  git(repoDir, ['checkout', '-b', 'main']);
  writeFileSync(join(repoDir, 'a.txt'), 'hello\n');
  git(repoDir, ['add', '.']);
  git(repoDir, ['commit', '-m', 'init']);
});

afterEach(() => {
  try { rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* Windows file lock 容忍 */ }
  delete process.env.AGENTHUB_NO_WORKTREE;
});

describe('sanitizeBranchComponent', () => {
  it('保留合法字元、替換非法字元', () => {
    expect(sanitizeBranchComponent('tech-lead')).toBe('tech-lead');
    expect(sanitizeBranchComponent('T12')).toBe('T12');
    expect(sanitizeBranchComponent('任務 一')).toBe('x'); // 全非法 → fallback
    expect(sanitizeBranchComponent('fix bug#1')).toBe('fix-bug-1');
  });
});

describe('setupSessionWorktree', () => {
  it('非 git 目錄回傳 null（fallback 共享目錄）', () => {
    const notRepo = join(tmpRoot, 'plain');
    expect(
      setupSessionWorktree({ repoDir: notRepo, sessionId: 'aaaabbbb-x', agentId: 'pm', taskId: null }),
    ).toBeNull();
  });

  it('AGENTHUB_NO_WORKTREE=1 時停用', () => {
    process.env.AGENTHUB_NO_WORKTREE = '1';
    expect(
      setupSessionWorktree({ repoDir, sessionId: 'aaaabbbb-x', agentId: 'pm', taskId: null }),
    ).toBeNull();
  });

  it('建立 worktree：路徑在兄弟目錄、分支名含 agent 與 task', () => {
    const wt = setupSessionWorktree({ repoDir, sessionId: '11112222-abcd', agentId: 'tech-lead', taskId: 'T5' });
    expect(wt).not.toBeNull();
    expect(wt!.branch).toBe('agent/tech-lead/T5');
    expect(wt!.worktreePath).toBe(computeWorktreePath(repoDir, '11112222-abcd'));
    expect(existsSync(join(wt!.worktreePath, 'a.txt'))).toBe(true);
    // worktree 的 HEAD 在自己的分支
    expect(git(wt!.worktreePath, ['branch', '--show-current'])).toBe('agent/tech-lead/T5');
    // 主 repo HEAD 完全不受影響
    expect(git(repoDir, ['branch', '--show-current'])).toBe('main');
  });

  it('同名分支被別的 worktree 佔用時，自動加 session 後綴', () => {
    const a = setupSessionWorktree({ repoDir, sessionId: 'aaaa1111-x', agentId: 'pm', taskId: 'T1' });
    const b = setupSessionWorktree({ repoDir, sessionId: 'bbbb2222-x', agentId: 'pm', taskId: 'T1' });
    expect(a!.branch).toBe('agent/pm/T1');
    expect(b!.branch).toBe('agent/pm/T1-sbbbb2222');
    expect(a!.worktreePath).not.toBe(b!.worktreePath);
  });

  it('【PM-008 驗收】兩個 session 並行 commit，各落自己的分支，main HEAD 不動', () => {
    const s1 = setupSessionWorktree({ repoDir, sessionId: 'sess0001-x', agentId: 'pm', taskId: 'T1' })!;
    const s2 = setupSessionWorktree({ repoDir, sessionId: 'sess0002-x', agentId: 'tech-lead', taskId: 'T2' })!;

    // 模擬 PM-008 的 race 場景：session1 commit 期間 session2 也在動
    writeFileSync(join(s1.worktreePath, 'pm-work.txt'), 'pm did this\n');
    git(s1.worktreePath, ['add', '.']);
    writeFileSync(join(s2.worktreePath, 'tl-work.txt'), 'tech-lead did this\n');
    git(s2.worktreePath, ['add', '.']);
    git(s1.worktreePath, ['commit', '-m', 'pm commit']);
    git(s2.worktreePath, ['commit', '-m', 'tl commit']);

    // 各自的 commit 落在各自的分支（舊 bug：會互相落錯）
    expect(git(repoDir, ['log', 'agent/pm/T1', '--oneline', '-1'])).toContain('pm commit');
    expect(git(repoDir, ['log', 'agent/tech-lead/T2', '--oneline', '-1'])).toContain('tl commit');
    // main 一個 commit 都沒多、HEAD 沒被切走
    expect(git(repoDir, ['branch', '--show-current'])).toBe('main');
    expect(git(repoDir, ['log', 'main', '--oneline'])).not.toContain('pm commit');
    expect(git(repoDir, ['log', 'main', '--oneline'])).not.toContain('tl commit');
    // reflog 上 main repo 沒有任何 checkout 紀錄（舊 bug 的鐵證就是 reflog 裡的 checkout）
    expect(git(repoDir, ['reflog'])).not.toContain('checkout: moving from main');
  });
});

describe('cleanupSessionWorktree', () => {
  it('乾淨的 worktree 直接移除', () => {
    const wt = setupSessionWorktree({ repoDir, sessionId: 'clean001-x', agentId: 'pm', taskId: null })!;
    expect(cleanupSessionWorktree(repoDir, wt.worktreePath)).toBe('removed');
    expect(existsSync(wt.worktreePath)).toBe(false);
  });

  it('有未提交變更的 worktree 保留不刪（半成品不可銷毀）', () => {
    const wt = setupSessionWorktree({ repoDir, sessionId: 'dirty001-x', agentId: 'pm', taskId: null })!;
    writeFileSync(join(wt.worktreePath, 'wip.txt'), 'half done\n');
    expect(cleanupSessionWorktree(repoDir, wt.worktreePath)).toBe('kept-dirty');
    expect(existsSync(join(wt.worktreePath, 'wip.txt'))).toBe(true);
  });

  it('已 commit 的變更在移除 worktree 後仍留在分支上', () => {
    const wt = setupSessionWorktree({ repoDir, sessionId: 'done0001-x', agentId: 'pm', taskId: 'T9' })!;
    writeFileSync(join(wt.worktreePath, 'done.txt'), 'committed\n');
    git(wt.worktreePath, ['add', '.']);
    git(wt.worktreePath, ['commit', '-m', 'work done']);
    expect(cleanupSessionWorktree(repoDir, wt.worktreePath)).toBe('removed');
    // 分支與 commit 都還在主 repo
    expect(git(repoDir, ['log', 'agent/pm/T9', '--oneline', '-1'])).toContain('work done');
  });

  it('目錄不存在回 not-found 並 prune', () => {
    expect(cleanupSessionWorktree(repoDir, join(tmpRoot, 'ghost'))).toBe('not-found');
  });

  it('防呆：worktreePath === repoDir 時跳過，不會誤刪專案本體', () => {
    expect(cleanupSessionWorktree(repoDir, repoDir)).toBe('skipped');
    expect(existsSync(join(repoDir, 'a.txt'))).toBe(true);
  });
});
