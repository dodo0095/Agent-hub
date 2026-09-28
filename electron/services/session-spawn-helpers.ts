/**
 * Pure helper functions for session spawning.
 * These are module-level functions (not class methods) so they can be tested
 * independently and do not bloat the SessionManager class body.
 */
import { writeFileSync, existsSync, mkdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { app } from 'electron';
import { database } from './database';
import { promptAssembler } from './prompt-assembler';
import { agentLoader } from './agent-loader';
import { validateArsPluginDir } from '../utils/ars-validator';
import { logger } from '../utils/logger';
import type { SpawnParams, AgentMcpConfig, McpServerConfig } from '../types';

/** Department whose sessions load the ARS (Academic Research Skills) Claude plugin. */
const ARS_DEPARTMENT = 'academic-publication';

/**
 * Sprint 7 — ARS 整合: resolve the ARS plugin directory to load for a session
 * whose agent belongs to `department`, or `null` when that department is not
 * academic-publication (no-op — every other department is unaffected). See
 * `.knowledge/specs/api-design.md` §6.2/§6.4.
 *
 * Pure validation, no side effects (no args mutation, no file writes) — this
 * is deliberate so callers can run it *before* any write/spawn side effect
 * and have it throw first. L1 review (2026-09-28) flagged that running this
 * at the end of the normal-spawn path let the system-prompt temp file,
 * statusLine settings file, and skill-sync SKILL.md all get written before
 * an ARS error aborted the spawn, leaving orphan files on disk.
 *
 * Order (must match spec exactly):
 *   1. read `ars.plugin-dir` from user_preferences → unset/empty → ARS_PATH_NOT_SET
 *   2. validateArsPluginDir() → not ok → ARS_INSTALL_INCOMPLETE
 *   3. interactive === false → ARS_REQUIRES_INTERACTIVE
 *   4. return the validated path
 *
 * Errors are thrown before any session/DB/pty state is created (caller —
 * session-manager.ts `spawn()` — calls `buildClaudeArgs` before it inserts
 * the `claude_sessions` row or starts the PTY).
 */
function resolveArsPluginDir(department: string | undefined, interactive: boolean): string | null {
  if (department !== ARS_DEPARTMENT) return null;

  // MN-6 (G2 review): a DB exception here must not leak a raw sql.js error
  // (no ARS_* prefix, unreadable in the UI) — surface it as ARS_PATH_NOT_SET.
  let rawValue: string;
  try {
    const rows = database.prepare('SELECT value FROM user_preferences WHERE key = ?', ['ars.plugin-dir']);
    rawValue = rows.length > 0 ? rows[0].value : '';
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`ARS_PATH_NOT_SET: 無法讀取 ARS 路徑設定（${reason}）`, { cause: err });
  }

  // MN-2 (G2 review): trim whitespace and strip a matching pair of leading/
  // trailing double quotes (Windows "Copy as path" wraps paths in quotes).
  // A whitespace-only value must be treated the same as unset.
  const arsPath = rawValue.trim().replace(/^"(.*)"$/, '$1').trim();
  if (!arsPath) {
    throw new Error('ARS_PATH_NOT_SET: 尚未設定 ARS 路徑，請到「設定」填寫 ARS 路徑');
  }

  const validation = validateArsPluginDir(arsPath);
  if (!validation.ok) {
    throw new Error(
      `ARS_INSTALL_INCOMPLETE: 缺少 ${validation.missing.join(', ')}；若為 zip 下載，請把 skills/ 內的 stub 檔換成同名資料夾，或改用 git clone`,
    );
  }

  if (!interactive) {
    throw new Error('ARS_REQUIRES_INTERACTIVE: ARS 檢查點必須由老闆回覆，出版部只能以互動模式啟動');
  }

  return arsPath;
}

/**
 * Resume paths (`--resume` / direct resume) never write files before this
 * point, so validate-then-push in one step is safe here.
 */
function injectArsPluginDirIfNeeded(args: string[], department: string | undefined, interactive: boolean): void {
  const arsPath = resolveArsPluginDir(department, interactive);
  if (arsPath) args.push('--plugin-dir', arsPath);
}

/**
 * Reverse-lookup the original agent_id for a Claude conversation from
 * `claude_sessions`, excluding rows whose `agent_id` is NULL, `''`, or the
 * `'(resumed)'` placeholder that direct-resume-created rows are stamped
 * with (see `session-manager.ts` where the new session row is inserted).
 * Returns the EARLIEST matching row's agent_id — the original spawn that
 * first established the conversation, before any resume rows existed for it.
 *
 * Shared by two callers (G2 review round 2, MN-8):
 * - direct resume (`resumeConversationId`), which has no session row of its
 *   own to consult for the original agent.
 * - regular resume (`resumeSessionId`), when THAT session row's own
 *   `agent_id` is itself a placeholder — i.e. resuming a session that was
 *   previously created by a direct resume, which always stamps `'(resumed)'`.
 *   Without this fallback that second resume would silently drop ARS.
 *
 * No result (query finds nothing) or a DB exception are both treated as
 * "original agent unknown" — logged via `logger.warn` on exception, never
 * thrown. This must never break resume for non-publication conversations.
 */
function lookupOriginalAgentIdByConversation(conversationId: string | null | undefined): string | null {
  if (!conversationId) return null;
  try {
    const rows = database.prepare(
      `SELECT agent_id FROM claude_sessions
       WHERE claude_conversation_id = ?
         AND agent_id IS NOT NULL AND agent_id != '' AND agent_id != '(resumed)'
       ORDER BY started_at ASC
       LIMIT 1`,
      [conversationId],
    );
    if (rows.length > 0 && rows[0].agent_id) return rows[0].agent_id;
  } catch (err) {
    logger.warn('Failed to look up original agent by conversation id', err);
  }
  return null;
}

/** Resolve path to the statusline Node.js script (works in both dev and packaged). */
function getStatuslineScriptPath(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'session-statusline.js');
  }
  return join(__dirname, '..', '..', 'electron', 'utils', 'session-statusline.js');
}

/**
 * Resolve path to the MCP send-message server script.
 * Dev:       out/mcp/send-message-server.js  (compiled from electron/mcp/)
 * Packaged:  <resourcesPath>/send-message-server.js
 */
function getMcpServerPath(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'send-message-server.js');
  }
  return join(__dirname, '..', 'mcp', 'send-message-server.js');
}

// ─── CLI argument builder ────────────────────────────────────────────────────

/**
 * Build the array of CLI arguments to pass to Claude Code.
 * Also writes the system-prompt temp file when needed, returning its path.
 */
export function buildClaudeArgs(
  params: SpawnParams,
  sessionId: string,
  model: string,
  maxTurns: number,
  interactive: boolean,
  isResume: boolean,
  isDirectResume: boolean,
): { args: string[]; tmpFile: string | null } {
  if (isDirectResume) {
    logger.info(`Direct resume conversation ${params.resumeConversationId} as new session ${sessionId}`);
    const directResumeArgs = ['--resume', params.resumeConversationId!];
    // G2 review MJ-1: params.agentId is NOT reliably populated for direct
    // resume — the sole caller (src/stores/sessions.ts resumeByConversationId)
    // always passes agentId: ''. Falling back to it silently dropped ARS for
    // resumed academic-publication sessions. Prefer params.agentId only when
    // it is actually non-empty; otherwise look up the original agent via
    // lookupOriginalAgentIdByConversation (placeholder values NULL/''/'(resumed)'
    // excluded there — MN-9: this used to say "the string 'null'", which the
    // SQL never actually checked for; the SQL checks `IS NULL`).
    const directAgentId = params.agentId && params.agentId.trim() !== '' ? params.agentId : null;
    let directResumeDepartment: string | undefined;
    if (directAgentId) {
      directResumeDepartment = agentLoader.getAgent(directAgentId)?.department;
    } else {
      const originalAgentId = lookupOriginalAgentIdByConversation(params.resumeConversationId);
      if (originalAgentId) {
        directResumeDepartment = agentLoader.getAgent(originalAgentId)?.department;
      }
    }
    injectArsPluginDirIfNeeded(directResumeArgs, directResumeDepartment, interactive);
    return { args: directResumeArgs, tmpFile: null };
  }

  if (isResume) {
    let claudeConvId: string | null = null;
    let resumeAgentId: string | null = null;
    try {
      const rows = database.prepare(
        'SELECT claude_conversation_id, agent_id FROM claude_sessions WHERE id = ?',
        [params.resumeSessionId],
      );
      if (rows.length > 0) {
        claudeConvId = rows[0].claude_conversation_id;
        resumeAgentId = rows[0].agent_id;
      }
    } catch (err) {
      logger.warn('Failed to look up claude_conversation_id', err);
    }
    if (!claudeConvId) {
      throw new Error(`Cannot resume: no Claude conversation ID found for session ${params.resumeSessionId}`);
    }
    logger.info(`Resuming session ${params.resumeSessionId} (claude conv: ${claudeConvId}) as new session ${sessionId}`);
    const resumeArgs = ['--resume', claudeConvId];
    // MN-8 (G2 review round 2): a session row created by an earlier direct
    // resume always has agent_id = '(resumed)' (session-manager.ts, direct
    // resume insert) — not a usable department lookup key. When the row we
    // just read has no real agent_id, fall back to the same
    // conversation-id reverse lookup direct resume uses, so resuming a
    // session that itself came from a direct resume doesn't silently drop ARS.
    const resumeEffectiveAgentId =
      resumeAgentId && resumeAgentId !== '(resumed)'
        ? resumeAgentId
        : lookupOriginalAgentIdByConversation(claudeConvId);
    const resumeAgent = resumeEffectiveAgentId ? agentLoader.getAgent(resumeEffectiveAgentId) : undefined;
    injectArsPluginDirIfNeeded(resumeArgs, resumeAgent?.department, interactive);
    return { args: resumeArgs, tmpFile: null };
  }

  // Normal spawn: resolve/validate ARS plugin-dir FIRST — before any file is
  // written (system-prompt temp file, statusLine settings, skill-sync
  // SKILL.md) — so an ARS_* error aborts cleanly with zero orphan files.
  const spawnAgent = agentLoader.getAgent(params.agentId);
  const arsPluginDir = resolveArsPluginDir(spawnAgent?.department, interactive);

  // Assemble system prompt and write to temp file
  const systemPrompt = promptAssembler.assemble(params.agentId, params.projectId, {
    parentSessionId: params.parentSessionId,
    taskId: params.taskId || undefined,
    projectId: params.projectId || undefined,
  });
  const promptDir = join(process.cwd(), '.maestro-prompts');
  if (!existsSync(promptDir)) mkdirSync(promptDir, { recursive: true });
  const tmpFile = join(promptDir, `prompt-${sessionId.slice(0, 8)}.md`);
  writeFileSync(tmpFile, systemPrompt, 'utf-8');

  const args: string[] = ['--model', model, '--system-prompt-file', tmpFile];

  // Apply project-level permission / tool settings
  if (params.projectId) {
    try {
      const permRows = database.prepare(
        'SELECT value FROM user_preferences WHERE key = ?',
        [`project.${params.projectId}.permission-mode`],
      );
      if (permRows.length > 0 && permRows[0].value) {
        const mode = permRows[0].value;
        if (mode === 'bypassPermissions') {
          args.push('--dangerously-skip-permissions');
        } else {
          args.push('--permission-mode', mode);
        }
        logger.info(`Session ${sessionId} permission mode: ${mode}`);
      }

      const toolRows = database.prepare(
        'SELECT value FROM user_preferences WHERE key = ?',
        [`project.${params.projectId}.allowed-tools`],
      );
      if (toolRows.length > 0 && toolRows[0].value) {
        const tools: string[] = JSON.parse(toolRows[0].value);
        if (tools.length > 0) {
          args.push('--allowedTools', ...tools);
          logger.info(`Session ${sessionId} allowed tools: ${tools.join(', ')}`);
        }
      }
    } catch (err) {
      logger.warn('Failed to load project permission settings', err);
    }

    // 8A-2: Generate SKILL.md if skill sync is enabled for this project
    try {
      const syncRows = database.prepare(
        'SELECT value FROM user_preferences WHERE key = ?',
        [`project.${params.projectId}.skill-sync`],
      );
      if (syncRows.length > 0 && syncRows[0].value === 'true') {
        const projRows = database.prepare('SELECT work_dir FROM projects WHERE id = ?', [params.projectId]);
        const workDir = projRows[0]?.work_dir as string | null;
        if (workDir) {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const { generateSkillFile } = require('../utils/skill-generator') as {
            generateSkillFile: (wd: string, aid: string, force?: boolean) => { status: string };
          };
          logger.info(`Skill sync for ${params.agentId}: ${generateSkillFile(workDir, params.agentId).status}`);
        }
      }
    } catch (err) {
      logger.warn('Failed to generate skill file', err);
    }
  }

  if (!interactive) {
    args.push('--max-turns', String(maxTurns), '--output-format', 'stream-json', '--verbose', '-p', params.task);
  }

  // Inject statusLine setting so Claude CLI writes cost/token data to the usage file.
  // --settings expects a FILE PATH (not inline JSON), so we write a temp settings file.
  // IMPORTANT: Pass the usage file path as a CLI arg to the script (not just env var)
  // because env var inheritance via Claude Code's statusLine subprocess is not
  // guaranteed on Windows ConPTY. The script accepts argv[2] as primary path.
  if (interactive) {
    const statuslineScript = getStatuslineScriptPath();
    if (existsSync(statuslineScript)) {
      const usageFile = join(process.cwd(), '.maestro-usage', `${sessionId}.json`);
      const scriptPath = statuslineScript.replace(/\\/g, '/');
      const usageFilePath = usageFile.replace(/\\/g, '/');
      const settingsObj = {
        statusLine: {
          type: 'command',
          command: `node "${scriptPath}" "${usageFilePath}"`,
        },
      };
      const settingsFile = join(promptDir, `settings-${sessionId.slice(0, 8)}.json`);
      writeFileSync(settingsFile, JSON.stringify(settingsObj), 'utf-8');
      args.push('--settings', settingsFile);
      logger.info(`Session ${sessionId} statusLine → ${statuslineScript} (usage: ${usageFile})`);
    } else {
      logger.warn(`Statusline script not found at ${statuslineScript}, cost tracking disabled`);
    }
  }

  // ── MCP inter-agent communication injection ──────────────────────────────
  // Inject --mcp-config so Claude Code CLI exposes SendMessage / ListInbox tools.
  // Only for normal (non-resume) spawns — resume sessions inherit the original
  // session's MCP config automatically.
  try {
    const agentDef = agentLoader.getAgent(params.agentId);
    if (agentDef) {
      const allowedTargets = [
        ...(agentDef.manages ?? []),
        ...(agentDef.reportsTo ? [agentDef.reportsTo] : []),
        ...(agentDef.coordinatesWith ?? []),
      ];

      const mcpAgentConfig: AgentMcpConfig = {
        agentId: params.agentId,
        allowedTargets,
        inboxDir: join(homedir(), '.claude', 'teams', 'default', 'inboxes'),
        projectId: params.projectId || null,
        rateLimit: 20,
      };

      const mcpAgentConfigPath = join(promptDir, `mcp-agent-config-${sessionId.slice(0, 8)}.json`);
      writeFileSync(mcpAgentConfigPath, JSON.stringify(mcpAgentConfig, null, 2), 'utf-8');

      const serverScriptPath = getMcpServerPath();
      if (existsSync(serverScriptPath)) {
        const mcpServersConfig: McpServerConfig = {
          mcpServers: {
            'send-message': {
              command: 'node',
              args: [serverScriptPath, mcpAgentConfigPath],
              type: 'stdio',
            },
          },
        };
        const mcpServersConfigPath = join(promptDir, `mcp-servers-${sessionId.slice(0, 8)}.json`);
        writeFileSync(mcpServersConfigPath, JSON.stringify(mcpServersConfig), 'utf-8');
        args.push('--mcp-config', mcpServersConfigPath);
        logger.info(
          `Session ${sessionId} MCP server injected` +
            ` (${params.agentId} → ${allowedTargets.length} targets: ${allowedTargets.join(', ')})`,
        );
      } else {
        logger.warn(
          `MCP server script not found at ${serverScriptPath}, SendMessage unavailable for session ${sessionId}`,
        );
      }
    }
  } catch (err) {
    // MCP injection failure must not block session spawn (graceful degradation)
    logger.warn(`Failed to inject MCP config for session ${sessionId}: ${err}`);
  }

  // ── ARS plugin-dir injection (Sprint 7) ───────────────────────────────────
  // Validation already happened at the top of this branch (before any file
  // write) — here we only append the flag once the path is known-good.
  if (arsPluginDir) {
    args.push('--plugin-dir', arsPluginDir);
  }

  return { args, tmpFile };
}

// ─── Resume info lookup ───────────────────────────────────────────────────────

export interface ResumeInfo {
  agent_id?: string;
  task?: string;
  task_id?: string;
  project_id?: string;
  /** PM-008: 原 session 的實際 cwd（可能是 worktree）。resume 必須回同一目錄，
   *  Claude CLI 依 cwd 編碼尋找 conversation JSONL */
  work_dir?: string;
}

/**
 * Look up the original session row for resume operations.
 */
export function lookupResumeInfo(isResume: boolean, resumeSessionId?: string): ResumeInfo {
  if (!isResume || !resumeSessionId) return {};
  try {
    const rows = database.prepare(
      'SELECT agent_id, task, task_id, project_id, work_dir FROM claude_sessions WHERE id = ?',
      [resumeSessionId],
    );
    if (rows.length > 0) return rows[0];
  } catch (err) {
    logger.warn('Failed to look up original session for resume', err);
  }
  return {};
}

// ─── Workspace trust auto-acceptance ─────────────────────────────────────────

/**
 * Ensure a workspace is marked as trusted in Claude Code's user config
 * (`~/.claude.json`).
 *
 * Background — Claude Code v2.1.51 introduced a security fix: in interactive
 * mode, `statusLine` and `fileSuggestion` hook commands are gated by workspace
 * trust acceptance. Without trust, the statusLine subprocess never runs, so
 * our `.maestro-usage/<sessionId>.json` file is never written, and
 * `session.costUsd` stays at 0 → the dashboard's 30-day cost shows nothing.
 *
 * AgentHub spawns sessions on the boss's behalf into work directories the
 * boss has already authorised through the AgentHub UI (creating a project =
 * implicit trust). We treat any cwd we spawn into as already trusted —
 * equivalent to clicking "trust this workspace" in the dialog.
 *
 * Behaviour:
 * - Idempotent: no-op when the cwd is already trusted.
 * - Non-blocking: failures are logged and swallowed so they never abort spawn.
 * - Path normalisation: Claude Code stores keys with forward slashes on
 *   Windows, so we normalise `\\` → `/` before lookup/write.
 */
export function ensureWorkspaceTrust(cwd: string): void {
  try {
    const claudeJsonPath = join(homedir(), '.claude.json');
    if (!existsSync(claudeJsonPath)) {
      // First-time Claude Code user — config file not yet created. Claude
      // Code will write it on its own first run; nothing to do here.
      return;
    }

    const raw = readFileSync(claudeJsonPath, 'utf-8');
    const config = JSON.parse(raw) as { projects?: Record<string, { hasTrustDialogAccepted?: boolean }> };
    config.projects = config.projects || {};

    const normalized = cwd.replace(/\\/g, '/');
    const existing = config.projects[normalized];
    if (existing && existing.hasTrustDialogAccepted === true) {
      return; // already trusted — nothing to do
    }

    config.projects[normalized] = {
      ...(existing || {}),
      hasTrustDialogAccepted: true,
    };

    writeFileSync(claudeJsonPath, JSON.stringify(config, null, 2), 'utf-8');
    logger.info(`Auto-trusted workspace for statusLine cost tracking: ${normalized}`);
  } catch (err) {
    // Trust write failure must never block session spawn — degrade
    // gracefully (cost tracking will simply not work for this session).
    logger.warn('Failed to auto-trust workspace (statusLine cost tracking may be disabled)', err);
  }
}

// ─── Working directory resolution ────────────────────────────────────────────

/**
 * Resolve the working directory for a new session.
 * Priority: projectPath (direct resume) > project.work_dir (from DB) > process.cwd()
 */
export function resolveSpawnCwd(
  params: SpawnParams,
  isResume: boolean,
  isDirectResume: boolean,
  resumeInfo: ResumeInfo,
): string {
  if (isDirectResume && params.projectPath) return params.projectPath;

  // PM-008: resume 優先回到原 session 的 cwd（可能是已存在的 worktree）。
  // Claude CLI 依 cwd 編碼儲存 conversation，換目錄 resume 會找不到對話
  if (isResume && resumeInfo.work_dir && existsSync(resumeInfo.work_dir)) {
    return resumeInfo.work_dir;
  }

  let spawnCwd = process.cwd();
  const effectiveAgentId = isResume ? (resumeInfo.agent_id || params.agentId) : params.agentId;
  const projectId = isResume ? (resumeInfo.project_id || null) : (params.projectId || null);

  if (!isDirectResume && projectId && effectiveAgentId !== 'company-manager') {
    try {
      const projRows = database.prepare('SELECT work_dir FROM projects WHERE id = ?', [projectId]);
      if (projRows.length > 0 && projRows[0].work_dir) spawnCwd = projRows[0].work_dir;
    } catch (err) {
      logger.warn('Failed to look up project work_dir', err);
    }
  }

  if (!existsSync(spawnCwd)) mkdirSync(spawnCwd, { recursive: true });
  return spawnCwd;
}
