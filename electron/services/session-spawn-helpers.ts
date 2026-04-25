/**
 * Pure helper functions for session spawning.
 * These are module-level functions (not class methods) so they can be tested
 * independently and do not bloat the SessionManager class body.
 */
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { app } from 'electron';
import { database } from './database';
import { promptAssembler } from './prompt-assembler';
import { logger } from '../utils/logger';
import type { SpawnParams } from '../types';

/** Resolve path to the statusline Node.js script (works in both dev and packaged). */
function getStatuslineScriptPath(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'session-statusline.js');
  }
  return join(__dirname, '..', '..', 'electron', 'utils', 'session-statusline.js');
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
    return { args: ['--resume', params.resumeConversationId!], tmpFile: null };
  }

  if (isResume) {
    let claudeConvId: string | null = null;
    try {
      const rows = database.prepare(
        'SELECT claude_conversation_id FROM claude_sessions WHERE id = ?',
        [params.resumeSessionId],
      );
      if (rows.length > 0) claudeConvId = rows[0].claude_conversation_id;
    } catch (err) {
      logger.warn('Failed to look up claude_conversation_id', err);
    }
    if (!claudeConvId) {
      throw new Error(`Cannot resume: no Claude conversation ID found for session ${params.resumeSessionId}`);
    }
    logger.info(`Resuming session ${params.resumeSessionId} (claude conv: ${claudeConvId}) as new session ${sessionId}`);
    return { args: ['--resume', claudeConvId], tmpFile: null };
  }

  // Normal spawn: assemble system prompt and write to temp file
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

  return { args, tmpFile };
}

// ─── Resume info lookup ───────────────────────────────────────────────────────

export interface ResumeInfo {
  agent_id?: string;
  task?: string;
  task_id?: string;
  project_id?: string;
}

/**
 * Look up the original session row for resume operations.
 */
export function lookupResumeInfo(isResume: boolean, resumeSessionId?: string): ResumeInfo {
  if (!isResume || !resumeSessionId) return {};
  try {
    const rows = database.prepare(
      'SELECT agent_id, task, task_id, project_id FROM claude_sessions WHERE id = ?',
      [resumeSessionId],
    );
    if (rows.length > 0) return rows[0];
  } catch (err) {
    logger.warn('Failed to look up original session for resume', err);
  }
  return {};
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
