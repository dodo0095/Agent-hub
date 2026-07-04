/**
 * Worktree Manager — PM-008 修復（方案 B，老闆 2026-04-29 選定）
 *
 * 問題背景：多個 session 共享同一個 working tree，spawn 時的 tryAutoBranch()
 * 會 `git checkout` 切走其他 session 正在用的 HEAD，導致 commit 落錯分支。
 *
 * 方案：每個 session 一個獨立 git worktree（`git worktree add`），
 * 各 session 的 HEAD / index / 未提交變更完全隔離，根治 race condition。
 *
 * 設計原則：
 * - 所有失敗都非致命：worktree 建不起來就 fallback 回專案根目錄（等同舊行為，只是少了隔離）
 * - 用 execFileSync 傳參陣列，不組字串（路徑含空格如 "ALL PROJECT" 不需要引號地獄）
 * - 清理時**絕不銷毀未提交的工作**：dirty worktree 一律保留並記 log
 * - 已知取捨：worktree 只含 git 追蹤的檔案，node_modules / .env 不會存在，
 *   agent 需要時得自行 npm install（見 architecture.md「Session Worktree 隔離」）
 * - 逃生口：AGENTHUB_NO_WORKTREE=1 可整體停用，回到共享 working tree 行為
 */

import { execFileSync } from 'child_process';
import { existsSync, mkdirSync } from 'fs';
import { join, dirname, basename } from 'path';
import { logger } from '../utils/logger';

export interface WorktreeSetup {
  /** session 專屬 worktree 的絕對路徑（PTY cwd 用這個） */
  worktreePath: string;
  /** worktree 綁定的分支名 */
  branch: string;
}

export type WorktreeCleanupResult = 'removed' | 'kept-dirty' | 'not-found' | 'failed' | 'skipped';

function git(cwd: string, args: string[]): string {
  return execFileSync('git', ['-C', cwd, ...args], {
    encoding: 'utf8',
    timeout: 30000,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function isGitRepo(dir: string): boolean {
  try {
    return git(dir, ['rev-parse', '--is-inside-work-tree']) === 'true';
  } catch {
    return false;
  }
}

function branchExists(repoDir: string, branch: string): boolean {
  try {
    git(repoDir, ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`]);
    return true;
  } catch {
    return false;
  }
}

/** 分支名只允許安全字元，其他一律轉為 '-'（agentId / taskId 可能含中文或空格） */
export function sanitizeBranchComponent(raw: string): string {
  const cleaned = raw.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return cleaned || 'x';
}

/** worktree 集中放在專案的**兄弟**目錄下，避免污染 repo 本身（untracked noise / 遞迴風險） */
export function computeWorktreePath(repoDir: string, sessionId: string): string {
  const sid8 = sessionId.slice(0, 8);
  return join(dirname(repoDir), '.agenthub-worktrees', basename(repoDir), sid8);
}

export interface SetupWorktreeOptions {
  repoDir: string;
  sessionId: string;
  agentId: string;
  taskId: string | null;
}

/**
 * 為 session 建立獨立 worktree。
 * 回傳 null = 不用 worktree（非 git repo / 停用 / 建立失敗），呼叫端 fallback 回 repoDir。
 */
export function setupSessionWorktree(opts: SetupWorktreeOptions): WorktreeSetup | null {
  const { repoDir, sessionId, agentId, taskId } = opts;

  if (process.env.AGENTHUB_NO_WORKTREE === '1') {
    logger.info('Worktree isolation disabled via AGENTHUB_NO_WORKTREE=1');
    return null;
  }
  if (!isGitRepo(repoDir)) return null;

  const sid8 = sessionId.slice(0, 8);
  const baseBranch = `agent/${sanitizeBranchComponent(agentId)}/${sanitizeBranchComponent(taskId || new Date().toISOString().slice(0, 10))}`;
  const worktreePath = computeWorktreePath(repoDir, sessionId);

  try {
    mkdirSync(dirname(worktreePath), { recursive: true });

    // 清掉殘留的 stale worktree 註冊（目錄已刪但 git 還記得）
    try { git(repoDir, ['worktree', 'prune']); } catch { /* non-fatal */ }

    // 策略：
    // 1. 分支不存在 → 建新分支掛 worktree
    // 2. 分支存在且沒被其他 worktree 佔用 → 直接掛
    // 3. 分支存在且被佔用（另一個 session 同名分支）→ 加 session 後綴建唯一分支
    if (!branchExists(repoDir, baseBranch)) {
      git(repoDir, ['worktree', 'add', '-b', baseBranch, worktreePath]);
      logger.info(`Session ${sessionId} worktree created: ${worktreePath} (new branch ${baseBranch})`);
      return { worktreePath, branch: baseBranch };
    }

    try {
      git(repoDir, ['worktree', 'add', worktreePath, baseBranch]);
      logger.info(`Session ${sessionId} worktree created: ${worktreePath} (existing branch ${baseBranch})`);
      return { worktreePath, branch: baseBranch };
    } catch {
      const uniqueBranch = `${baseBranch}-s${sid8}`;
      git(repoDir, ['worktree', 'add', '-b', uniqueBranch, worktreePath]);
      logger.info(`Session ${sessionId} worktree created: ${worktreePath} (branch ${baseBranch} busy → ${uniqueBranch})`);
      return { worktreePath, branch: uniqueBranch };
    }
  } catch (err) {
    logger.warn(`Session ${sessionId} worktree setup failed, falling back to shared working tree (non-fatal)`, err);
    return null;
  }
}

/**
 * Session 結束時清理 worktree。
 * 鐵律：有未提交變更的 worktree 一律保留（agent 的半成品不可銷毀），只記 log 讓老闆決定。
 * 已提交的變更不受影響 —— commit 在分支上，worktree 移除後分支仍在主 repo。
 */
export function cleanupSessionWorktree(repoDir: string, worktreePath: string): WorktreeCleanupResult {
  // 防呆：絕不把專案根目錄本身當 worktree 移除
  if (!worktreePath || worktreePath === repoDir) return 'skipped';

  try {
    if (!existsSync(worktreePath)) {
      try { git(repoDir, ['worktree', 'prune']); } catch { /* non-fatal */ }
      return 'not-found';
    }

    const dirty = git(worktreePath, ['status', '--porcelain']);
    if (dirty) {
      logger.warn(`Worktree ${worktreePath} has uncommitted changes — kept for manual review`);
      return 'kept-dirty';
    }

    git(repoDir, ['worktree', 'remove', worktreePath]);
    logger.info(`Worktree removed: ${worktreePath}`);
    return 'removed';
  } catch (err) {
    logger.warn(`Worktree cleanup failed for ${worktreePath} (non-fatal)`, err);
    return 'failed';
  }
}
