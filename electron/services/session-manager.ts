import * as pty from 'node-pty';
import { randomUUID } from 'crypto';
import { writeFileSync, unlinkSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import { agentLoader } from './agent-loader';
import { gitManager } from './git-manager';
import { EventParser, type ParsedEvent } from './event-parser';
import { eventBus } from './event-bus';
import { database } from './database';
import { logger } from '../utils/logger';
import { hookManager } from './hook-manager';
import { getSessionLogsDir, getClaudeConversationsDir } from '../utils/paths';
import {
  stripAnsiAndControl,
  stripTerminalOutput,
  ptyWriteAndSubmit,
  spawnPty,
  resizePtyProcess,
  killPtyProcess,
} from './pty-manager';
import {
  parseInteractiveTokenUsage,
  applyParsedEventUsage,
  applyResultEventUsage,
  persistSessionCost,
} from './session-cost-tracker';
import { parseJsonlUsage, findJsonlByStartTime } from './jsonl-usage-tracker';
import { scanResumableSessions } from './session-conversation-scanner';
import {
  buildClaudeArgs,
  ensureWorkspaceTrust,
  lookupResumeInfo,
  resolveSpawnCwd,
} from './session-spawn-helpers';
import { DelegationManager } from './session-delegation';
import { messageBroker } from './message-broker';
import type {
  SpawnParams,
  SpawnResult,
  ActiveSession,
  SessionStatus,
  SessionEvent,
  DelegationRequest,
  SendDelegationParams,
  ResumableSession,
} from '../types';

interface CompletionCallback {
  resolve: (output: string) => void;
  reject: (error: Error) => void;
}

interface ManagedSession {
  sessionId: string;
  ptyId: string;
  agentId: string;
  agentName: string;
  task: string;
  taskId: string | null;
  model: string;
  projectId: string | null;
  status: SessionStatus;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  toolCallsCount: number;
  turnsCount: number;
  startedAt: string;
  ptyProcess: pty.IPty;
  eventParser: EventParser;
  tmpFile: string | null;
  interactive: boolean;
  completionCallbacks: CompletionCallback[];
  outputBuffer: string;
  /** Track last checkpoint position in outputBuffer */
  lastCheckpointLen: number;
  /** Timer for waiting on summary response during graceful stop */
  summaryTimer: ReturnType<typeof setInterval> | null;
  /** Working directory used for this session's PTY */
  workDir: string;
  /** Timer for detecting interactive idle state (no PTY output for N seconds) */
  idleTimer: ReturnType<typeof setTimeout> | null;
  /** Queued messages to send when session becomes idle */
  pendingMessages: string[];
}

/** How long (ms) to wait after last PTY output before considering interactive session idle */
const INTERACTIVE_IDLE_MS = 3000;

class SessionManager {
  private sessions = new Map<string, ManagedSession>();
  private delegationMgr = new DelegationManager();
  private claudePath: string | null = null;
  private lastSummaryAt = new Map<string, number>();
  private readonly MIN_SUMMARY_INTERVAL = 15 * 60 * 1000; // 15 minutes

  /**
   * Register MessageBroker callbacks so it can find sessions and auto-spawn.
   * Must be called after detectClaude().
   */
  setupMessageBroker(): void {
    messageBroker.registerCallbacks({
      findActiveSessionByAgent: (agentId, projectId) => this.findActiveByAgent(agentId, projectId),
      spawnSession: (agentId, task, projectId) => {
        const result = this.spawn({ agentId, task, projectId, interactive: true });
        return result.sessionId;
      },
      getSession: (sessionId) => {
        const s = this.sessions.get(sessionId);
        if (!s) return undefined;
        return {
          sessionId: s.sessionId,
          agentId: s.agentId,
          status: s.status,
          interactive: s.interactive,
          ptyProcess: s.ptyProcess,
          pendingMessages: s.pendingMessages,
          projectId: s.projectId,
        };
      },
    });
  }

  /**
   * Find an active session for a given agent (optionally scoped to a project).
   */
  findActiveByAgent(agentId: string, projectId?: string | null): ManagedSession | undefined {
    for (const session of this.sessions.values()) {
      if (session.agentId !== agentId) continue;
      if (['completed', 'failed', 'stopped'].includes(session.status)) continue;
      if (projectId && session.projectId && session.projectId !== projectId) continue;
      return session;
    }
    return undefined;
  }

  /**
   * Listen for gate review events to update awaiting_approval sessions.
   */
  setupGateListener(): void {
    eventBus.on('gate:reviewed', ({ decision, sprintId }: { decision: string; sprintId: string | null }) => {
      if (!sprintId) return;
      for (const [sessionId, session] of this.sessions) {
        if (session.status !== 'awaiting_approval') continue;
        // Find sessions linked to tasks in this sprint
        if (!session.taskId) continue;
        try {
          const rows = database.prepare(
            'SELECT sprint_id FROM tasks WHERE id = ?',
            [session.taskId],
          );
          if (rows.length > 0 && rows[0].sprint_id === sprintId) {
            const newStatus = decision === 'approved' ? 'running' : 'failed';
            logger.info(`Gate reviewed (${decision}): session ${sessionId} → ${newStatus}`);
            this.updateStatus(sessionId, newStatus as any);
          }
        } catch (err) {
          logger.warn('Failed to check task sprint for gate review', err);
        }
      }
    });
  }

  detectClaude(): void {
    // Allow E2E tests to inject a mock CLI via environment variable
    if (process.env.MOCK_CLAUDE_CLI) {
      this.claudePath = process.env.MOCK_CLAUDE_CLI;
      logger.info(`Using mock Claude CLI: ${this.claudePath}`);
      return;
    }

    // Ensure common user-local bin paths are in PATH before detection
    const extraPaths = ['/Users/apple/.local/bin', '/usr/local/bin'];
    const currentPath = process.env.PATH || '';
    for (const p of extraPaths) {
      if (!currentPath.split(':').includes(p)) {
        process.env.PATH = `${p}:${currentPath}`;
      }
    }

    try {
      const isWindows = process.platform === 'win32';
      const cmd = isWindows ? 'where claude' : 'which claude';
      const result = execSync(cmd, { encoding: 'utf-8', timeout: 5000 }).trim();
      const lines = result.split('\n').map((l) => l.trim()).filter(Boolean);
      // Prefer .cmd on Windows (required for cmd.exe /c execution)
      const cmdPath = isWindows ? lines.find((l) => l.endsWith('.cmd')) : undefined;
      this.claudePath = cmdPath || lines[0] || null;
      if (this.claudePath) {
        logger.info(`Claude CLI found at: ${this.claudePath}`);
      }
    } catch {
      logger.warn('Claude CLI not found in PATH. Session spawning will fail.');
    }
  }

  getClaudePath(): string | null {
    return this.claudePath;
  }

  isClaudeAvailable(): boolean {
    return this.claudePath !== null;
  }

  /**
   * Spawn a new Claude Code session via node-pty.
   */
  spawn(params: SpawnParams): SpawnResult {
    if (!this.claudePath) {
      throw new Error('Claude CLI is not available. Please install Claude Code CLI.');
    }

    const isResume = !!params.resumeSessionId;
    const isDirectResume = !!params.resumeConversationId;

    const agent = (isResume || isDirectResume) ? null : agentLoader.getById(params.agentId);
    if (!isResume && !isDirectResume && !agent) {
      throw new Error(`Agent not found: ${params.agentId}`);
    }

    const sessionId = randomUUID();
    const ptyId = `pty-${sessionId.slice(0, 8)}`;
    const model = params.model || agent?.model || 'sonnet';
    const maxTurns = params.maxTurns || 10;
    const interactive = params.interactive ?? true;
    const now = new Date().toISOString();

    // Build CLI args + optional temp prompt file
    const { args, tmpFile } = buildClaudeArgs(params, sessionId, model, maxTurns, interactive, isResume, isDirectResume);

    logger.info(`Spawning session ${sessionId} for agent ${params.agentId}`, { model, maxTurns, isResume });

    // Look up original session metadata for resume (needed for workDir resolution)
    const resumeInfo = lookupResumeInfo(isResume, params.resumeSessionId);

    // Resolve working directory
    const spawnCwd = resolveSpawnCwd(params, isResume, isDirectResume, resumeInfo);
    logger.info(`Session ${sessionId} working directory: ${spawnCwd}`);

    // Auto-accept workspace trust so Claude Code's statusLine command can run
    // (required since v2.1.51, otherwise cost/token tracking is silently disabled).
    // See `ensureWorkspaceTrust` for full rationale.
    ensureWorkspaceTrust(spawnCwd);

    hookManager.tryInjectHooks(spawnCwd);
    hookManager.watchHookLogs(spawnCwd);

    // Spawn PTY
    const spawnEnv = { ...process.env } as Record<string, string>;
    delete spawnEnv.CLAUDECODE;

    // Set up usage file for interactive token tracking via statusline
    const usageDir = join(process.cwd(), '.maestro-usage');
    if (!existsSync(usageDir)) mkdirSync(usageDir, { recursive: true });
    const usageFile = join(usageDir, `${sessionId}.json`);
    spawnEnv.AGENTHUB_USAGE_FILE = usageFile;
    // Ensure user-local bin paths are available in the PTY shell
    const extraPtyPaths = ['/Users/apple/.local/bin', '/usr/local/bin'];
    const ptyPath = spawnEnv.PATH || '';
    const ptyPathParts = ptyPath.split(':');
    for (const p of extraPtyPaths) {
      if (!ptyPathParts.includes(p)) ptyPathParts.unshift(p);
    }
    spawnEnv.PATH = ptyPathParts.join(':');
    const ptyProcess = spawnPty({
      claudePath: this.claudePath!,
      mockClaudeCliPath: process.env.MOCK_CLAUDE_CLI,
      args,
      cwd: spawnCwd,
      env: spawnEnv,
    });

    const eventParser = new EventParser();

    const agentId = isDirectResume ? (params.agentId || '(resumed)')
      : isResume ? (resumeInfo.agent_id || params.agentId) : params.agentId;
    const agentName = isDirectResume ? (params.agentId || '(resumed)')
      : isResume ? (resumeInfo.agent_id || params.agentId) : (agent?.name || params.agentId);
    const taskText = isDirectResume ? (params.task || '(resumed)')
      : isResume ? (resumeInfo.task || '(resumed)') : params.task;

    // Auto-bind taskId: if not provided, find an assigned task for this agent in this project
    let resolvedTaskId = isResume ? (resumeInfo.task_id || null) : (params.taskId || null);
    const resolvedProjectId = isResume ? (resumeInfo.project_id || null) : (params.projectId || null);
    if (!resolvedTaskId && resolvedProjectId && !isResume && !isDirectResume) {
      try {
        const rows = database.prepare(
          `SELECT id FROM tasks WHERE project_id = ? AND assigned_to = ? AND status IN ('assigned', 'created') ORDER BY priority = 'critical' DESC, priority = 'high' DESC, created_at ASC LIMIT 1`,
          [resolvedProjectId, agentId],
        );
        if (rows.length > 0) {
          resolvedTaskId = (rows[0] as any).id;
          logger.info(`Auto-bind: task ${resolvedTaskId} → session ${sessionId} (agent ${agentId})`);
        }
      } catch (err) {
        logger.warn('Auto-bind task lookup failed (non-fatal)', err);
      }
    }

    const session: ManagedSession = {
      sessionId, ptyId, agentId, agentName, task: taskText,
      taskId: resolvedTaskId,
      model, projectId: resolvedProjectId,
      status: 'starting', costUsd: 0, inputTokens: 0, outputTokens: 0,
      toolCallsCount: 0, turnsCount: 0, startedAt: now,
      ptyProcess, eventParser, tmpFile, interactive,
      completionCallbacks: [], outputBuffer: '', lastCheckpointLen: 0,
      summaryTimer: null, workDir: spawnCwd, idleTimer: null, pendingMessages: [],
    };

    this.sessions.set(sessionId, session);

    // Persist to DB
    try {
      const parentId = isDirectResume ? null : isResume ? params.resumeSessionId! : (params.parentSessionId || null);
      database.run(
        `INSERT INTO claude_sessions (id, agent_id, task, task_id, project_id, model, status, started_at, parent_session_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [sessionId, agentId, taskText, session.taskId, session.projectId, model, 'starting', now, parentId],
      );
    } catch (err) {
      logger.error('Failed to insert session into DB', err);
    }

    // 9B: Session 啟動 → Task auto in_progress
    if (session.taskId) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { taskManager } = require('./task-manager') as {
          taskManager: { transition: (p: { taskId: string; toStatus: string }) => unknown };
        };
        taskManager.transition({ taskId: session.taskId, toStatus: 'in_progress' });
        logger.info(`Task ${session.taskId} auto → in_progress (session ${sessionId})`);
      } catch (err) {
        logger.warn('Auto-transition task to in_progress failed (non-fatal)', err);
      }
    }

    this.tryAutoBranch(sessionId, spawnCwd, agentId, session.taskId);
    this.wirePtyHandlers(session, ptyProcess, eventParser, ptyId, interactive);
    this.updateStatus(sessionId, interactive ? 'running' : 'starting');

    // Poll usage file for interactive token tracking (statusline writes JSON)
    if (interactive) {
      this.startUsagePolling(sessionId, usageFile);
    }

    // Send initial task into interactive TUI after it has initialized
    if (!isResume && interactive && params.task.trim()) {
      setTimeout(() => {
        try { ptyWriteAndSubmit(ptyProcess, params.task.trim()); }
        catch (err) { logger.warn('Failed to write initial task to PTY', err); }
      }, 2000);
    }

    // Determine the Claude conversation ID up-front when possible:
    //  - Direct resume: caller supplied it
    //  - Resume by sessionId: look it up from claude_sessions
    // For new spawns we still have to poll, since Claude generates the conv-id
    // when it writes the JSONL.
    let knownConvId: string | null = null;
    if (isDirectResume && params.resumeConversationId) {
      knownConvId = params.resumeConversationId;
    } else if (isResume && params.resumeSessionId) {
      try {
        const rows = database.prepare(
          'SELECT claude_conversation_id FROM claude_sessions WHERE id = ?',
          [params.resumeSessionId],
        );
        if (rows.length > 0 && (rows[0] as { claude_conversation_id?: string }).claude_conversation_id) {
          knownConvId = (rows[0] as { claude_conversation_id: string }).claude_conversation_id;
        }
      } catch (err) { logger.warn('Failed to look up claude_conversation_id for resume', err); }
    }

    this.captureClaudeConversationId(sessionId, knownConvId);
    return { sessionId, ptyId };
  }

  private wirePtyHandlers(
    session: ManagedSession,
    ptyProcess: pty.IPty,
    eventParser: EventParser,
    ptyId: string,
    interactive: boolean,
  ): void {
    const { sessionId } = session;
    const MAX_OUTPUT_BUFFER = 1024 * 1024; // 1MB

    ptyProcess.onData((data: string) => {
      if (session.outputBuffer.length < MAX_OUTPUT_BUFFER) {
        session.outputBuffer += data;
        if (session.outputBuffer.length > MAX_OUTPUT_BUFFER) {
          session.outputBuffer = session.outputBuffer.slice(-MAX_OUTPUT_BUFFER);
        }
      }

      eventBus.emitPtyData({ ptyId, data });
      if (!interactive) eventParser.feed(data);

      if (interactive) {
        const usageUpdated = parseInteractiveTokenUsage(session, data);
        if (usageUpdated) {
          eventBus.emitSessionEvent({
            sessionId,
            type: 'system',
            subtype: 'usage_update',
            costUsd: session.costUsd,
            inputTokens: session.inputTokens,
            outputTokens: session.outputTokens,
            durationMs: Date.now() - new Date(session.startedAt).getTime(),
            timestamp: new Date().toISOString(),
          });
        }

        if (session.status !== 'summarizing') {
          if (session.idleTimer) clearTimeout(session.idleTimer);
          if (session.status === 'waiting_input') this.updateStatus(sessionId, 'running');
          session.idleTimer = setTimeout(() => {
            const s = this.sessions.get(sessionId);
            if (s && s.interactive && !['completed', 'failed', 'stopped', 'summarizing', 'waiting_input'].includes(s.status)) {
              this.updateStatus(sessionId, 'waiting_input');
            }
          }, INTERACTIVE_IDLE_MS);
        }
      }

      if (session.interactive && data.includes('ontext') && data.includes('compact')) {
        this.saveCompactSnapshot(sessionId);
      }
    });

    if (!interactive) {
      eventParser.on('event', (parsed: ParsedEvent) => {
        this.handleParsedEvent(sessionId, parsed);
      });
    }

    ptyProcess.onExit(({ exitCode }) => {
      logger.info(`Session ${sessionId} exited with code ${exitCode}`);
      if (!interactive) eventParser.flush();
      const finalStatus: SessionStatus = exitCode === 0 ? 'completed' : 'failed';
      this.finalizeSession(sessionId, finalStatus, exitCode !== 0 ? `Exit code: ${exitCode}` : null);
    });
  }

  /**
   * Stop a running session.
   * When force=false (default), enters 'summarizing' state and asks Agent for a summary.
   * When force=true or already summarizing, kills immediately.
   */
  stop(sessionId: string, force = false): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    // Force stop: skip summary
    if (force || session.status === 'summarizing') {
      logger.info(`Force stopping session ${sessionId}`);
      if (session.summaryTimer) {
        clearInterval(session.summaryTimer);
        session.summaryTimer = null;
      }
      killPtyProcess(session.ptyProcess);
      this.finalizeSession(sessionId, 'stopped');
      return;
    }

    // Graceful stop: directly kill without requesting summary
    // (user can use /resume to review session history)
    logger.info(`Graceful stopping session ${sessionId}`);
    killPtyProcess(session.ptyProcess);
    this.finalizeSession(sessionId, 'stopped');
  }

  /**
   * Send input to PTY.
   */
  writeInput(ptyId: string, data: string): void {
    const session = this.findByPtyId(ptyId);
    if (session) {
      session.ptyProcess.write(data);
    }
  }

  /**
   * Assign a new task to an active session by injecting a message into its PTY.
   */
  assignTask(sessionId: string, taskId: string, taskTitle: string, taskDescription: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);
    if (['completed', 'failed', 'stopped'].includes(session.status)) {
      throw new Error(`Session ${sessionId} is not active (status: ${session.status})`);
    }

    // Update in-memory + DB
    session.taskId = taskId;
    database.run('UPDATE claude_sessions SET task_id = ? WHERE id = ?', [taskId, sessionId]);

    // Inject task instruction into PTY
    const message = [
      '',
      '---',
      `接下來請處理新任務：${taskTitle}`,
      '',
      taskDescription,
      '',
    ].join('\n');
    ptyWriteAndSubmit(session.ptyProcess, message);

    logger.info(`Task ${taskId} assigned to session ${sessionId}`);
    eventBus.emitSessionStatus({ sessionId, status: session.status, agentId: session.agentId });
  }

  /**
   * Send a delegation: inject instruction into target session and track for report delivery.
   */
  sendDelegation(params: SendDelegationParams): DelegationRequest {
    const source = this.sessions.get(params.sourceSessionId);
    const target = this.sessions.get(params.targetSessionId);
    if (!source) throw new Error(`Source session not found: ${params.sourceSessionId}`);
    if (!target) throw new Error(`Target session not found: ${params.targetSessionId}`);
    if (['completed', 'failed', 'stopped'].includes(target.status)) {
      throw new Error(`Target session ${params.targetSessionId} is not active`);
    }
    return this.delegationMgr.send(params, source, target);
  }

  /**
   * Get all active delegations.
   */
  listDelegations(): DelegationRequest[] {
    return this.delegationMgr.list();
  }

  /**
   * Resize PTY.
   */
  resizePty(ptyId: string, cols: number, rows: number): void {
    const session = this.findByPtyId(ptyId);
    if (session) {
      resizePtyProcess(session.ptyProcess, cols, rows);
    }
  }

  /**
   * Get all active sessions.
   */
  getActiveSessions(): ActiveSession[] {
    return Array.from(this.sessions.values())
      .filter((s) => !['completed', 'failed', 'stopped'].includes(s.status))
      .map((s) => this.toActiveSession(s));
  }

  /**
   * Get session count (active).
   */
  getActiveCount(): number {
    return this.getActiveSessions().length;
  }

  /**
   * List all sessions (active + completed from DB).
   * Supports optional filtering by taskId or projectId.
   */
  listFromDb(filters?: { limit?: number; taskId?: string; projectId?: string }): any[] {
    const limit = filters?.limit ?? 50;
    try {
      let sql = `SELECT cs.*, t.title as task_title
       FROM claude_sessions cs
       LEFT JOIN tasks t ON cs.task_id = t.id
       WHERE 1=1`;
      const params: unknown[] = [];

      if (filters?.taskId) {
        sql += ' AND cs.task_id = ?';
        params.push(filters.taskId);
      }
      if (filters?.projectId) {
        sql += ' AND cs.project_id = ?';
        params.push(filters.projectId);
      }

      sql += ' ORDER BY cs.started_at DESC LIMIT ?';
      params.push(limit);

      return database.prepare(sql, params);
    } catch {
      return [];
    }
  }

  /**
   * Wait for a session to complete. Returns the accumulated output.
   */
  waitForCompletion(sessionId: string): Promise<string> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return Promise.reject(new Error(`Session not found: ${sessionId}`));
    }

    // If already done
    if (['completed', 'failed', 'stopped'].includes(session.status)) {
      if (session.status === 'completed') {
        return Promise.resolve(session.outputBuffer);
      }
      return Promise.reject(new Error(`Session ended with status: ${session.status}`));
    }

    return new Promise((resolve, reject) => {
      session.completionCallbacks.push({ resolve, reject });
    });
  }

  /**
   * Cleanup all sessions on app exit.
   */
  cleanup(): void {
    // Stop all hook log watchers
    hookManager.unwatchAllHookLogs();

    for (const [, session] of this.sessions) {
      killPtyProcess(session.ptyProcess);
      this.cleanupTmpFile(session);
    }
    this.sessions.clear();
    logger.info('All sessions cleaned up');
  }

  private handleParsedEvent(sessionId: string, parsed: ParsedEvent): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    if (parsed.type === 'result') {
      applyResultEventUsage(session, parsed);
    } else {
      applyParsedEventUsage(session, parsed);
    }

    const statusMap: Record<string, SessionStatus> = { assistant: 'thinking', tool_use: 'executing_tool' };
    const newStatus = statusMap[parsed.type];
    if (newStatus && newStatus !== session.status) this.updateStatus(sessionId, newStatus);

    const now = new Date().toISOString();
    const sessionEvent: SessionEvent = {
      sessionId, type: parsed.type, subtype: parsed.subtype, content: parsed.content,
      toolName: parsed.toolName, toolInput: parsed.toolInput,
      costUsd: session.costUsd, inputTokens: session.inputTokens, outputTokens: session.outputTokens,
      durationMs: Date.now() - new Date(session.startedAt).getTime(), timestamp: now,
    };
    eventBus.emitSessionEvent(sessionEvent);

    try {
      database.run(
        `INSERT INTO session_events (session_id, type, subtype, data, created_at) VALUES (?, ?, ?, ?, ?)`,
        [sessionId, parsed.type, parsed.subtype || null, parsed.content || parsed.toolName || '', now],
      );
    } catch (err) { logger.warn('Failed to insert session event', err); }
  }

  private updateStatus(sessionId: string, status: SessionStatus): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.status = status;
    eventBus.emitSessionStatus({ sessionId, status, agentId: session.agentId });
    try { database.run(`UPDATE claude_sessions SET status = ? WHERE id = ?`, [status, sessionId]); }
    catch (err) { logger.warn('Failed to update session status in DB', err); }
    if (status === 'waiting_input' || status === 'awaiting_approval') this.flushPendingMessages(sessionId);
    if (status === 'waiting_input') {
      this.delegationMgr.deliverOnIdle(sessionId, (id) => this.sessions.get(id));
      // Deliver pending broker messages for this agent
      const s = this.sessions.get(sessionId);
      if (s) messageBroker.deliverPending(s.agentId, s.projectId);
    }
  }

  /**
   * Trigger a session summary with rate limiting (min 5 min interval).
   * Returns the summary string, or null if the interval has not elapsed.
   */
  triggerSummary(sessionId: string): string | null {
    const last = this.lastSummaryAt.get(sessionId) || 0;
    if (Date.now() - last < this.MIN_SUMMARY_INTERVAL) {
      logger.info(`Summary skipped for ${sessionId}: too recent (${Date.now() - last}ms ago)`);
      return null;
    }

    const session = this.sessions.get(sessionId);
    if (!session) return null;

    this.lastSummaryAt.set(sessionId, Date.now());

    // Collect recent output as summary, prefixed with role context for survival
    const raw = session.outputBuffer.slice(-5000);
    const outputSummary = stripTerminalOutput(raw).slice(-1200) || '(無輸出)';

    // Include role context in summary so it survives context compaction
    const agent = agentLoader.getById(session.agentId);
    const rolePrefix = agent
      ? `[角色: ${agent.name} (${agent.id}) | 部門: ${agent.department} | 層級: ${agent.level}]\n\n`
      : '';
    const summary = rolePrefix + outputSummary;


    return summary;
  }

  /**
   * Get historical summaries for a session.
   */
  getSessionSummaries(sessionId: string): Array<{ content: string; createdAt: string }> {
    try {
      const rows = database.prepare(
        `SELECT content, created_at FROM memory_blocks
         WHERE session_id = ? AND block_type = 'summary'
         ORDER BY created_at DESC LIMIT 20`,
        [sessionId],
      );
      return rows.map((r: any) => ({ content: r.content, createdAt: r.created_at }));
    } catch (err) {
      logger.warn('Failed to get session summaries', err);
      return [];
    }
  }

  // ─── Usage file polling (interactive token tracking) ──────────────────────

  private usagePollers = new Map<string, ReturnType<typeof setInterval>>();

  private startUsagePolling(sessionId: string, usageFile: string): void {
    const poller = setInterval(() => {
      const session = this.sessions.get(sessionId);
      if (!session || ['completed', 'failed', 'stopped'].includes(session.status)) {
        this.stopUsagePolling(sessionId);
        return;
      }
      try {
        if (!existsSync(usageFile)) return;
        const raw = readFileSync(usageFile, 'utf-8').trim();
        if (!raw) return;
        const data = JSON.parse(raw);
        let updated = false;
        if (data.costUsd > session.costUsd) { session.costUsd = data.costUsd; updated = true; }
        if (data.inputTokens > session.inputTokens) { session.inputTokens = data.inputTokens; updated = true; }
        if (data.outputTokens > session.outputTokens) { session.outputTokens = data.outputTokens; updated = true; }
        if (updated) {
          // Emit a session event so the frontend can update cost/token display.
          // emitSessionStatus only carries `status`, not cost/token data,
          // so we use emitSessionEvent here to push the full usage snapshot.
          eventBus.emitSessionEvent({
            sessionId,
            type: 'system',
            subtype: 'usage_update',
            costUsd: session.costUsd,
            inputTokens: session.inputTokens,
            outputTokens: session.outputTokens,
            durationMs: Date.now() - new Date(session.startedAt).getTime(),
            timestamp: new Date().toISOString(),
          });
        }
      } catch {
        // File may be partially written, ignore
      }
    }, 5000); // Poll every 5 seconds

    this.usagePollers.set(sessionId, poller);
  }

  private stopUsagePolling(sessionId: string): void {
    const poller = this.usagePollers.get(sessionId);
    if (poller) {
      clearInterval(poller);
      this.usagePollers.delete(sessionId);
    }
    // Stop JSONL polling too (started by captureClaudeConversationId)
    const jsonlPoller = this.jsonlPollers.get(sessionId);
    if (jsonlPoller) {
      clearInterval(jsonlPoller);
      this.jsonlPollers.delete(sessionId);
    }
    // Clean up usage file
    try {
      const usageFile = join(process.cwd(), '.maestro-usage', `${sessionId}.json`);
      if (existsSync(usageFile)) unlinkSync(usageFile);
    } catch { /* ignore */ }
  }

  // ─── JSONL-based usage polling (canonical source of truth) ────────────────
  //
  // statusLine subprocess execution is unreliable on Windows + v2.1.114:
  //   1. v2.1.51 added workspace-trust gating — without trust, statusLine never runs.
  //   2. The `--settings <file>` flag's content is merged for permissions but the
  //      statusLine field is silently dropped (verified via --debug-file).
  //
  // Claude Code itself writes a per-conversation JSONL log to
  // ~/.claude/projects/<encoded-cwd>/<conv-id>.jsonl with exact `usage` data on
  // every assistant turn. Reading that file is the authoritative way to track
  // cost. We start this poll once captureClaudeConversationId() has identified
  // which JSONL file belongs to this session.
  //
  // Both the statusLine-file poll and this JSONL poll feed into the same
  // session.{costUsd,inputTokens,outputTokens} fields using max-wins merging,
  // so JSONL wins when statusLine is broken (the common case).

  private jsonlPollers = new Map<string, ReturnType<typeof setInterval>>();

  private startJsonlUsagePolling(sessionId: string, jsonlPath: string): void {
    // Stop any prior poller (defensive — should not happen in normal flow)
    const existing = this.jsonlPollers.get(sessionId);
    if (existing) clearInterval(existing);

    const poller = setInterval(() => {
      const session = this.sessions.get(sessionId);
      if (!session || ['completed', 'failed', 'stopped'].includes(session.status)) {
        clearInterval(poller);
        this.jsonlPollers.delete(sessionId);
        return;
      }
      try {
        const usage = parseJsonlUsage(jsonlPath);
        let updated = false;
        // Max-wins merge: JSONL data is monotonically increasing, but the
        // statusLine path may have written a different snapshot. Take the
        // larger of the two so we never regress.
        if (usage.costUsd > session.costUsd) { session.costUsd = usage.costUsd; updated = true; }
        if (usage.inputTokens > session.inputTokens) { session.inputTokens = usage.inputTokens; updated = true; }
        if (usage.outputTokens > session.outputTokens) { session.outputTokens = usage.outputTokens; updated = true; }
        if (usage.turnsCount > session.turnsCount) { session.turnsCount = usage.turnsCount; updated = true; }
        if (updated) {
          // Persist to DB on every change so cost survives crash / unclean exit.
          // persistSessionCost only fires on session end, but interactive sessions
          // can run for hours — losing in-memory cost is the main reason past
          // fixes appeared to "work in tests" but never landed in production DB.
          try {
            database.run(
              `UPDATE claude_sessions
                 SET cost_usd = ?, input_tokens = ?, output_tokens = ?, turns_count = ?
               WHERE id = ?`,
              [session.costUsd, session.inputTokens, session.outputTokens, session.turnsCount, sessionId],
            );
          } catch (err) { logger.warn(`Failed to persist incremental cost for ${sessionId}`, err); }

          eventBus.emitSessionEvent({
            sessionId,
            type: 'system',
            subtype: 'usage_update',
            costUsd: session.costUsd,
            inputTokens: session.inputTokens,
            outputTokens: session.outputTokens,
            durationMs: Date.now() - new Date(session.startedAt).getTime(),
            timestamp: new Date().toISOString(),
          });
        }
      } catch (err) {
        logger.warn(`JSONL usage poll failed for ${sessionId}`, err);
      }
    }, 5000);

    this.jsonlPollers.set(sessionId, poller);
    logger.info(`Started JSONL usage polling for session ${sessionId} (${jsonlPath})`);
  }

  private pendingFlushTimers = new Map<string, ReturnType<typeof setTimeout>>();

  private flushPendingMessages(sessionId: string): void {
    // Debounce: wait 500ms to batch consecutive messages into a single PTY write
    if (this.pendingFlushTimers.has(sessionId)) return;

    this.pendingFlushTimers.set(sessionId, setTimeout(() => {
      this.pendingFlushTimers.delete(sessionId);
      const session = this.sessions.get(sessionId);
      if (!session || session.pendingMessages.length === 0) return;

      const messages = session.pendingMessages.splice(0);
      const combined = messages.join('\n');
      logger.info(`Flushing ${messages.length} pending message(s) to session ${sessionId}`);
      try {
        ptyWriteAndSubmit(session.ptyProcess, combined);
      } catch (err) {
        logger.warn(`Failed to flush messages to session ${sessionId}`, err);
      }
    }, 500));
  }

  private async tryAutoBranch(sessionId: string, cwd: string, agentId: string, taskId: string | null): Promise<void> {
    try {
      const gitStatus = await gitManager.getStatus(cwd);
      if (!gitStatus.isRepo) return;
      const branchName = `agent/${agentId}/${taskId || new Date().toISOString().slice(0, 10)}`;

      // Try checkout first (works if branch exists), then create if it doesn't
      try {
        await gitManager.checkout(cwd, branchName);
        logger.info(`Session ${sessionId} checked out existing branch ${branchName}`);
      } catch {
        try {
          await gitManager.createBranch(cwd, branchName, true);
          logger.info(`Session ${sessionId} created auto-branch ${branchName}`);
        } catch (createErr) {
          logger.warn(`Session ${sessionId} auto-branch create failed (non-fatal)`, createErr);
        }
      }
    } catch (err) { logger.warn(`Session ${sessionId} auto-branch failed (non-fatal)`, err); }
  }

  private async tryAutoCommit(sessionId: string, cwd: string, agentId: string, taskSummary?: string): Promise<void> {
    try {
      const gitStatus = await gitManager.getStatus(cwd);
      if (!gitStatus.isRepo) return;
      if (!gitStatus.modified.length && !gitStatus.untracked.length && !gitStatus.staged.length) return;
      const message = `[Maestro] ${agentId}: ${(taskSummary || 'session completed').slice(0, 72)}`;
      await gitManager.stage(cwd);
      const result = await gitManager.commit({ cwd, message });
      logger.info(`Session ${sessionId} auto-committed ${result.hash.slice(0, 7)}: ${result.filesChanged} files`);
    } catch (err) { logger.warn(`Session ${sessionId} auto-commit failed (non-fatal)`, err); }
  }

  private finalizeSession(sessionId: string, status: SessionStatus, error?: string | null): void {
    const session = this.sessions.get(sessionId);
    if (!session || ['completed', 'failed', 'stopped'].includes(session.status)) return;

    if (session.summaryTimer) { clearInterval(session.summaryTimer); session.summaryTimer = null; }
    if (session.idleTimer) { clearTimeout(session.idleTimer); session.idleTimer = null; }
    this.stopUsagePolling(sessionId);

    session.status = status;
    const endedAt = new Date().toISOString();
    const durationMs = Date.now() - new Date(session.startedAt).getTime();

    if (status === 'completed') {
      if (session.workDir) this.tryAutoCommit(sessionId, session.workDir, session.agentId, session.task);

      // 9B: Persist session output summary for task chaining
      const outputSummary = stripTerminalOutput(session.outputBuffer.slice(-5000)).slice(-2000) || null;
      if (outputSummary) {
        try {
          database.run(
            `UPDATE claude_sessions SET result_summary = ? WHERE id = ?`,
            [outputSummary, sessionId],
          );
        } catch (err) { logger.warn('Failed to persist session result_summary (non-fatal)', err); }
      }

      // 9C: Session completed → Task auto done + persist output
      if (session.taskId) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const { taskManager } = require('./task-manager') as { taskManager: { transition: (p: { taskId: string; toStatus: string }) => unknown } };
          taskManager.transition({ taskId: session.taskId, toStatus: 'done' });

          // Persist output summary to task for downstream dependency injection
          if (outputSummary) {
            database.run(
              `UPDATE tasks SET output_summary = ? WHERE id = ? AND project_id = ?`,
              [outputSummary, session.taskId, session.projectId],
            );
          }
          logger.info(`Task ${session.taskId} auto → done (session ${sessionId})`);
        } catch (err) { logger.warn('Auto-transition task to done failed (non-fatal)', err); }
      }
    }

    try {
      database.run(
        `UPDATE claude_sessions SET status = ?, ended_at = ?, duration_ms = ?, error_message = ? WHERE id = ?`,
        [status, endedAt, durationMs, error || null, sessionId],
      );
    } catch (err) { logger.error('Failed to finalize session in DB', err); }
    persistSessionCost(sessionId, session);

    try {
      const logsDir = getSessionLogsDir();
      if (!existsSync(logsDir)) mkdirSync(logsDir, { recursive: true });
      writeFileSync(join(logsDir, `${sessionId}.log`), stripAnsiAndControl(session.outputBuffer), 'utf-8');
    } catch (err) { logger.warn('Failed to save session log', err); }

    this.delegationMgr.deliverOnComplete(sessionId, (id) => this.sessions.get(id));
    eventBus.emitSessionStatus({ sessionId, status, agentId: session.agentId, error: error || undefined });

    for (const cb of session.completionCallbacks) {
      if (status === 'completed') cb.resolve(session.outputBuffer);
      else cb.reject(new Error(`Session ended with status: ${status}${error ? ` - ${error}` : ''}`));
    }
    session.completionCallbacks = [];

    if (session.workDir) hookManager.unwatchHookLogs(session.workDir);
    this.cleanupTmpFile(session);
    setTimeout(() => { this.sessions.delete(sessionId); }, 5000);
  }

  private cleanupTmpFile(session: ManagedSession): void {
    if (session.tmpFile && existsSync(session.tmpFile)) {
      try { unlinkSync(session.tmpFile); } catch { /* ignore */ }
    }
  }

  private saveCompactSnapshot(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    try {
      const logsDir = getSessionLogsDir();
      if (!existsSync(logsDir)) mkdirSync(logsDir, { recursive: true });
      writeFileSync(join(logsDir, `${sessionId}.compact-${Date.now()}.log`), session.outputBuffer, 'utf-8');
      logger.info(`Saved compact snapshot for session ${sessionId}`);
    } catch (err) { logger.warn('Failed to save compact snapshot', err); }
  }

  /**
   * Identify the Claude Code conversation JSONL belonging to a session and
   * start usage polling against it. Three resolution paths, in order:
   *
   *   1. `knownConvId` provided (resume case) → use directly, no polling.
   *   2. New-file detection: snapshot existing JSONLs, poll for a new file.
   *      Works for fresh spawns, fails for resume (which append to existing).
   *   3. Fallback: after the new-file watch times out, scan the dir for any
   *      JSONL whose first event timestamp falls within ±120s of session start.
   *      Catches resume sessions and slow-starting new sessions.
   *
   * Total max wait: 90s (45 attempts × 2s) before giving up. The fallback runs
   * once on each tick so we converge as soon as Claude finishes warming up.
   */
  private captureClaudeConversationId(sessionId: string, knownConvId: string | null = null): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    const convDir = getClaudeConversationsDir(session.workDir || process.cwd());
    const sessionStartMs = new Date(session.startedAt).getTime();

    // Path 1: We already know the conv-id (resume case). Start tracking now.
    if (knownConvId) {
      const jsonlPath = join(convDir, `${knownConvId}.jsonl`);
      try {
        database.run('UPDATE claude_sessions SET claude_conversation_id = ? WHERE id = ?', [knownConvId, sessionId]);
      } catch (err) { logger.warn('Failed to save claude_conversation_id (resume)', err); }
      logger.info(`Reusing known Claude conversation ID ${knownConvId} for resume session ${sessionId}`);
      this.startJsonlUsagePolling(sessionId, jsonlPath);
      return;
    }

    // Path 2 + 3: For fresh spawns, snapshot then poll for new file or fallback by timestamp.
    let existingFiles: Set<string>;
    try {
      existingFiles = new Set(existsSync(convDir) ? readdirSync(convDir).filter((f) => f.endsWith('.jsonl')) : []);
    } catch { existingFiles = new Set(); }

    const MAX_ATTEMPTS = 45;       // 45 × 2s = 90s
    const FALLBACK_AFTER = 8;      // start scanning by-timestamp after 16s
    let attempts = 0;
    const timer = setInterval(() => {
      if (++attempts > MAX_ATTEMPTS || !this.sessions.has(sessionId)) {
        if (attempts > MAX_ATTEMPTS) {
          logger.warn(`captureClaudeConversationId timed out for session ${sessionId} after ${MAX_ATTEMPTS * 2}s`);
        }
        clearInterval(timer);
        return;
      }
      try {
        if (!existsSync(convDir)) return;

        // Path 2: prefer new-file detection (the cleanest signal)
        const newFiles = readdirSync(convDir).filter((f) => f.endsWith('.jsonl') && !existingFiles.has(f));
        let bestFile: string | null = null;
        if (newFiles.length > 0) {
          let bestMtime = -Infinity;
          for (const f of newFiles) {
            try {
              const st = statSync(join(convDir, f));
              if (st.mtimeMs > bestMtime) { bestMtime = st.mtimeMs; bestFile = f; }
            } catch { /* skip */ }
          }
        }

        // Path 3: fall back to timestamp matching (catches resume + slow starts)
        if (!bestFile && attempts >= FALLBACK_AFTER) {
          const match = findJsonlByStartTime(convDir, sessionStartMs, 120_000);
          if (match) {
            bestFile = match.file;
            logger.info(`Matched JSONL ${match.convId} by start-time (Δ ${match.deltaMs}ms) for session ${sessionId}`);
          }
        }

        if (bestFile) {
          const convId = bestFile.replace('.jsonl', '');
          try { database.run('UPDATE claude_sessions SET claude_conversation_id = ? WHERE id = ?', [convId, sessionId]); }
          catch (err) { logger.warn('Failed to save claude_conversation_id', err); }
          logger.info(`Captured Claude conversation ID ${convId} for session ${sessionId}`);
          clearInterval(timer);
          this.startJsonlUsagePolling(sessionId, join(convDir, bestFile));
        }
      } catch (err) { logger.warn('Error during conversation ID capture', err); }
    }, 2000);
  }

  /**
   * Get the output buffer for a PTY (used for terminal replay on remount).
   */
  getOutputBuffer(ptyId: string): string {
    const session = this.findByPtyId(ptyId);
    return session?.outputBuffer || '';
  }

  /**
   * Get the saved log file for a historical session.
   */
  getSessionLog(sessionId: string): string {
    try {
      const logPath = join(getSessionLogsDir(), `${sessionId}.log`);
      if (existsSync(logPath)) {
        return stripAnsiAndControl(readFileSync(logPath, 'utf-8'));
      }
    } catch (err) {
      logger.warn(`Failed to read session log for ${sessionId}`, err);
    }
    return '';
  }

  private findByPtyId(ptyId: string): ManagedSession | undefined {
    for (const session of this.sessions.values()) {
      if (session.ptyId === ptyId) return session;
    }
    return undefined;
  }

  private toActiveSession(s: ManagedSession): ActiveSession {
    return {
      sessionId: s.sessionId,
      agentId: s.agentId,
      agentName: s.agentName,
      task: s.task,
      taskId: s.taskId,
      projectId: s.projectId,
      model: s.model,
      status: s.status,
      costUsd: s.costUsd,
      inputTokens: s.inputTokens,
      outputTokens: s.outputTokens,
      toolCallsCount: s.toolCallsCount,
      turnsCount: s.turnsCount,
      durationMs: Date.now() - new Date(s.startedAt).getTime(),
      startedAt: s.startedAt,
      ptyId: s.ptyId,
    };
  }

  /**
   * Scan all registered project work directories for resumable Claude Code conversations.
   * Delegates to session-conversation-scanner.
   */
  scanResumableSessions(limit = 50): ResumableSession[] {
    return scanResumableSessions(limit);
  }

}

export const sessionManager = new SessionManager();
