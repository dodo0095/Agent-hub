/**
 * MessageBroker — Cross-session bi-directional messaging between agents.
 *
 * Core responsibilities:
 *   1. Persist messages to SQLite (messages table)
 *   2. Route messages to target agent's active session (PTY injection)
 *   3. Auto-spawn a session if target agent has no active session
 *   4. Queue messages when target session is busy, deliver on idle
 *   5. Emit events so the UI can display messages in real-time
 *
 * Anti-loop: rate-limited auto-spawn (max 3 per agent per minute).
 */

import { randomUUID } from 'crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { database } from './database';
import { eventBus } from './event-bus';
import { logger } from '../utils/logger';
import { ptyWriteAndSubmit } from './pty-manager';
import type { MessageRecord, SendMessageParams, MessageFilters, MessageStatus, AppNotification } from '../types';

/** Minimal session view needed by the broker (avoids circular dep with SessionManager). */
export interface BrokerSessionView {
  sessionId: string;
  agentId: string;
  status: string;
  interactive: boolean;
  ptyProcess: { write: (data: string) => void };
  pendingMessages: string[];
  projectId: string | null;
}

/** Callback interface — SessionManager registers these at init time. */
export interface BrokerCallbacks {
  findActiveSessionByAgent: (agentId: string, projectId?: string | null) => BrokerSessionView | undefined;
  spawnSession: (agentId: string, task: string, projectId?: string | null) => string; // returns sessionId
  getSession: (sessionId: string) => BrokerSessionView | undefined;
}

// Auto-spawn rate limit
const SPAWN_COOLDOWN_MS = 60_000; // 1 minute window
const MAX_SPAWNS_PER_WINDOW = 3;

// Sprint 7.1 T10 (PM-016 follow-up, api-design §7.2): ARS_* auto-spawn
// failures are config errors — retrying every poll/deliver cycle can't fix
// them, so the target agent gets a 5-minute cooldown instead of hammering
// spawnSession forever.
const ARS_FAILURE_COOLDOWN_MS = 5 * 60_000;

class MessageBroker {
  private callbacks: BrokerCallbacks | null = null;
  private spawnHistory: Map<string, number[]> = new Map(); // agentId → timestamps
  /** agentId → { code, until } — set on an ARS_* auto-spawn failure, cleared once `until` passes. */
  private arsFailureCooldown: Map<string, { code: string; until: number }> = new Map();

  /**
   * Register callbacks from SessionManager (called once at startup).
   * This breaks the circular dependency: MessageBroker doesn't import SessionManager.
   */
  registerCallbacks(cb: BrokerCallbacks): void {
    this.callbacks = cb;
    logger.info('MessageBroker: callbacks registered');

    // Start watching JSON inbox for incoming messages from Claude Code Teams
    this.startInboxWatcher();
  }

  // ─── JSON Inbox Polling (Claude Code Teams → PTY injection) ────────────────

  private inboxPoller: ReturnType<typeof setInterval> | null = null;
  private lastDelivered = new Map<string, Set<string>>(); // agentId → set of delivered timestamps

  /**
   * Poll ~/.claude/teams/default/inboxes/ every 3s for new unread messages.
   * When found, inject into the target agent's active PTY session.
   * Uses polling instead of fs.watch for macOS reliability.
   */
  private startInboxWatcher(): void {
    const inboxDir = join(homedir(), '.claude', 'teams', 'default', 'inboxes');
    if (!existsSync(inboxDir)) {
      mkdirSync(inboxDir, { recursive: true });
    }

    // Initialize: mark all existing unread messages as "already seen"
    this.initInboxState(inboxDir);

    this.inboxPoller = setInterval(() => this.pollInboxDir(inboxDir), 3000);
    logger.info('MessageBroker: inbox polling started (3s interval)');
  }

  private initInboxState(inboxDir: string): void {
    try {
      for (const file of readdirSync(inboxDir)) {
        if (!file.endsWith('.json')) continue;
        const agentId = file.replace('.json', '');
        try {
          const entries = JSON.parse(readFileSync(join(inboxDir, file), 'utf-8'));
          if (!Array.isArray(entries)) continue;
          const seen = new Set<string>();
          for (const msg of entries) {
            seen.add(msg.timestamp || '');
          }
          this.lastDelivered.set(agentId, seen);
        } catch { /* ignore malformed files */ }
      }
    } catch { /* ignore */ }
  }

  private pollInboxDir(inboxDir: string): void {
    if (!this.callbacks) return;

    try {
      for (const file of readdirSync(inboxDir)) {
        if (!file.endsWith('.json')) continue;
        this.checkInboxFile(inboxDir, file);
      }
    } catch { /* ignore */ }
  }

  private checkInboxFile(inboxDir: string, filename: string): void {
    if (!this.callbacks) return;

    try {
      const filePath = join(inboxDir, filename);
      const entries = JSON.parse(readFileSync(filePath, 'utf-8'));
      if (!Array.isArray(entries)) return;

      const agentId = filename.replace('.json', '');
      const seen = this.lastDelivered.get(agentId) || new Set<string>();
      let dirty = false;

      for (const msg of entries) {
        if (msg.read) continue;
        const key = msg.timestamp || '';
        if (seen.has(key)) continue;

        // New unread message found
        seen.add(key);
        dirty = true;

        logger.info(`InboxPoller: new message for ${agentId} from ${msg.from}`);

        // Find active session — try with project first, then without
        let session = this.callbacks.findActiveSessionByAgent(agentId, msg.project || null);
        if (!session) {
          session = this.callbacks.findActiveSessionByAgent(agentId);
        }

        const content = msg.text || msg.message || '(空訊息)';
        const formatted = [
          '',
          `--- [來自 ${msg.from} 的訊息] ---`,
          '',
          content,
          '',
        ].join('\n');

        if (session) {
          // Active session exists — inject or queue
          try {
            if (session.interactive && session.status === 'waiting_input') {
              ptyWriteAndSubmit(session.ptyProcess as any, formatted);
            } else {
              session.pendingMessages.push(formatted);
            }
          } catch (err) {
            logger.warn(`InboxPoller: PTY injection failed for ${agentId}`, err);
            session.pendingMessages.push(formatted);
          }
          msg.read = true;
        } else if (this.canAutoSpawn(agentId)) {
          // No active session — auto-spawn one
          try {
            const task = `收到來自 ${msg.from} 的訊息，請查看並回覆。`;
            const sessionId = this.callbacks.spawnSession(agentId, task, msg.project || null);
            this.recordSpawn(agentId);

            const spawned = this.callbacks.getSession(sessionId);
            if (spawned) {
              spawned.pendingMessages.push(formatted);
            }
            msg.read = true;
            logger.info(`InboxPoller: auto-spawned session ${sessionId} for ${agentId}`);
          } catch (err) {
            const errMessage = err instanceof Error ? err.message : String(err);
            if (errMessage.startsWith('ARS_')) {
              this.handleArsAutoSpawnFailure(agentId, msg.from, msg.project || null, content, err);
              // Keep the message unread/unprocessed so it's retried once the
              // cooldown clears (mirrors the rate-limit branch below).
              seen.delete(key);
              dirty = false;
            } else {
              // T10: non-ARS auto-spawn failures keep the exact pre-T10
              // behaviour — just log and move on, next poll retries as before.
              logger.warn(`InboxPoller: auto-spawn failed for ${agentId}`, err);
            }
          }
        } else {
          // Rate limit reached, message stays unread for next poll
          seen.delete(key);
          dirty = false;
        }
      }

      this.lastDelivered.set(agentId, seen);

      // Write back if we marked any as read
      if (dirty) {
        writeFileSync(filePath, JSON.stringify(entries, null, 2), 'utf-8');
      }
    } catch { /* ignore read/parse errors */ }
  }

  // ─── Send ──────────────────────────────────────────────────────────────────

  /**
   * Send a message from one agent to another.
   * Persists to DB, then attempts immediate delivery.
   */
  /** Max message content size (50KB) to prevent PTY buffer overflow. */
  private static readonly MAX_CONTENT_LENGTH = 50_000;

  send(params: SendMessageParams): MessageRecord {
    // M3: Truncate oversized content
    if (params.content.length > MessageBroker.MAX_CONTENT_LENGTH) {
      logger.warn(`MessageBroker: content truncated from ${params.content.length} to ${MessageBroker.MAX_CONTENT_LENGTH} chars`);
      params.content = params.content.slice(0, MessageBroker.MAX_CONTENT_LENGTH) + '\n\n[... 訊息過長，已截斷]';
    }

    const id = randomUUID();
    const now = new Date().toISOString();

    // Persist
    database.run(
      `INSERT INTO messages (id, from_agent, to_agent, content, status, project_id, reply_to, created_at)
       VALUES (?, ?, ?, ?, 'pending', ?, ?, ?)`,
      [id, params.fromAgent, params.toAgent, params.content, params.projectId || null, params.replyTo || null, now],
    );

    const message: MessageRecord = {
      id,
      fromAgent: params.fromAgent,
      toAgent: params.toAgent,
      content: params.content,
      status: 'pending',
      projectId: params.projectId || null,
      sessionId: null,
      replyTo: params.replyTo || null,
      createdAt: now,
      deliveredAt: null,
      readAt: null,
    };

    logger.info(`Message ${id}: ${params.fromAgent} → ${params.toAgent} (${params.content.slice(0, 60)}...)`);

    // Emit for UI
    eventBus.emit('message:created', message);

    // Sync to Claude Code Teams JSON inbox
    this.syncToJsonInbox(message);

    // Attempt delivery
    this.tryDeliver(message);

    return message;
  }

  // ─── Delivery ──────────────────────────────────────────────────────────────

  /**
   * Try to deliver a message to the target agent's active session.
   */
  private tryDeliver(message: MessageRecord): void {
    if (!this.callbacks) {
      logger.warn('MessageBroker: no callbacks registered, cannot deliver');
      return;
    }

    // Find target agent's active session
    let session = this.callbacks.findActiveSessionByAgent(message.toAgent, message.projectId);

    if (!session) {
      // Auto-spawn if allowed by rate limit
      if (this.canAutoSpawn(message.toAgent)) {
        logger.info(`MessageBroker: auto-spawning session for ${message.toAgent}`);
        try {
          const summary = `收到來自 ${message.fromAgent} 的訊息，請查看並回覆。`;
          const sessionId = this.callbacks.spawnSession(message.toAgent, summary, message.projectId);
          this.recordSpawn(message.toAgent);

          // Queue message for delivery after session starts
          const targetSession = this.callbacks.getSession(sessionId);
          if (targetSession) {
            const formatted = this.formatMessageForPty(message);
            targetSession.pendingMessages.push(formatted);
            this.markDelivered(message.id, sessionId);
            logger.info(`Message ${message.id}: queued for auto-spawned session ${sessionId}`);
          }
          return;
        } catch (err) {
          const errMessage = err instanceof Error ? err.message : String(err);
          if (errMessage.startsWith('ARS_')) {
            this.handleArsAutoSpawnFailure(message.toAgent, message.fromAgent, message.projectId, message.content, err);
          } else {
            // T10: non-ARS auto-spawn failures keep the exact pre-T10 behaviour.
            logger.warn(`MessageBroker: auto-spawn failed for ${message.toAgent}`, err);
          }
          return; // Message stays pending (markDelivered was never called), retried on next deliverPending call
        }
      } else {
        logger.info(`Message ${message.id}: no active session for ${message.toAgent}, rate limit reached — stays pending`);
        return;
      }
    }

    // Session exists — deliver or queue
    const formatted = this.formatMessageForPty(message);
    const isIdle = session.interactive && ['running', 'waiting_input'].includes(session.status);

    if (isIdle) {
      try {
        ptyWriteAndSubmit(session.ptyProcess as any, formatted);
      } catch (err) {
        logger.warn(`MessageBroker: PTY write failed for session ${session.sessionId}`, err);
        session.pendingMessages.push(formatted);
      }
      this.markDelivered(message.id, session.sessionId);
      logger.info(`Message ${message.id}: delivered to ${message.toAgent} (session ${session.sessionId})`);
    } else {
      session.pendingMessages.push(formatted);
      this.markDelivered(message.id, session.sessionId);
      logger.info(`Message ${message.id}: queued in session ${session.sessionId} (busy)`);
    }
  }

  /**
   * Deliver all pending messages for a specific agent.
   * Called by SessionManager when a session becomes idle.
   */
  deliverPending(agentId: string, projectId?: string | null): void {
    const pending = this.listByFilters({ toAgent: agentId, status: 'pending', limit: 10 });
    for (const msg of pending) {
      // If projectId filter is set, only deliver same-project messages
      if (projectId && msg.projectId && msg.projectId !== projectId) continue;
      this.tryDeliver(msg);
    }
  }

  // ─── Format ────────────────────────────────────────────────────────────────

  private formatMessageForPty(message: MessageRecord): string {
    const lines = [
      '',
      `--- [來自 ${message.fromAgent} 的訊息] ---`,
      '',
      message.content,
      '',
      `（訊息 ID: ${message.id}）`,
      `若需回覆，請使用: SendMessage(to: '${message.fromAgent}', content: '你的回覆')`,
      '',
    ];
    return lines.join('\n');
  }

  // ─── Status updates ────────────────────────────────────────────────────────

  private markDelivered(messageId: string, sessionId: string): void {
    const now = new Date().toISOString();
    database.run(
      `UPDATE messages SET status = 'delivered', session_id = ?, delivered_at = ? WHERE id = ?`,
      [sessionId, now, messageId],
    );
    eventBus.emit('message:delivered', { messageId, sessionId });
  }

  markRead(messageId: string): void {
    const now = new Date().toISOString();
    database.run(
      `UPDATE messages SET status = 'read', read_at = ? WHERE id = ?`,
      [now, messageId],
    );
    eventBus.emit('message:read', { messageId });
  }

  // ─── JSON Inbox Sync (bridge to Claude Code Teams) ─────────────────────────

  /**
   * Write message to Claude Code Teams JSON inbox so native CLI agents can see it.
   * Path: ~/.claude/teams/default/inboxes/{toAgent}.json
   */
  private syncToJsonInbox(message: MessageRecord): void {
    try {
      const inboxDir = join(homedir(), '.claude', 'teams', 'default', 'inboxes');
      if (!existsSync(inboxDir)) {
        mkdirSync(inboxDir, { recursive: true });
      }

      const inboxPath = join(inboxDir, `${message.toAgent}.json`);
      let entries: unknown[] = [];
      if (existsSync(inboxPath)) {
        try {
          entries = JSON.parse(readFileSync(inboxPath, 'utf-8'));
        } catch {
          entries = [];
        }
      }

      entries.push({
        from: message.fromAgent,
        text: message.content,
        summary: message.content.slice(0, 80),
        timestamp: message.createdAt,
        read: false,
        project: message.projectId || null,
        messageId: message.id,
      });

      writeFileSync(inboxPath, JSON.stringify(entries, null, 2), 'utf-8');
    } catch (err) {
      logger.warn('MessageBroker: failed to sync to JSON inbox', err);
    }
  }

  // ─── Rate limiting ─────────────────────────────────────────────────────────

  private canAutoSpawn(agentId: string): boolean {
    // T10: an ARS_* auto-spawn failure cools this agent down for 5 minutes —
    // both auto-spawn call sites (InboxPoller, tryDeliver) gate on this
    // method, so this single check blocks further attempts from either path.
    const cooldown = this.arsFailureCooldown.get(agentId);
    if (cooldown) {
      if (cooldown.until > Date.now()) return false;
      // MN-D (G2 review round 2): actually delete the expired entry instead
      // of leaving it in the map forever (comment previously claimed it was
      // "cleared once `until` passes" but nothing did that).
      this.arsFailureCooldown.delete(agentId);
    }

    const now = Date.now();
    const history = this.spawnHistory.get(agentId) || [];
    // Prune old entries
    const recent = history.filter((ts) => now - ts < SPAWN_COOLDOWN_MS);
    this.spawnHistory.set(agentId, recent);
    return recent.length < MAX_SPAWNS_PER_WINDOW;
  }

  private recordSpawn(agentId: string): void {
    const history = this.spawnHistory.get(agentId) || [];
    history.push(Date.now());
    this.spawnHistory.set(agentId, history);
  }

  // ─── Auto-spawn failure reporting (Sprint 7.1 T10, api-design §7.2) ────────

  /**
   * Handle an auto-spawn failure whose error message is an `ARS_*` code —
   * a configuration problem (missing/incomplete ARS install, non-interactive
   * spawn attempt) that retrying will never fix on its own. Shared by both
   * auto-spawn call sites (InboxPoller, `tryDeliver`):
   *
   * 1. Puts `targetAgent` into a 5-minute cooldown (`canAutoSpawn` above
   *    checks this) so the same failure doesn't get retried every poll.
   * 2. Dedup: only sends the "tell the boss" reply + UI notification once
   *    per target agent + error code within that cooldown window. In
   *    practice `canAutoSpawn` already prevents a second `spawnSession`
   *    attempt (and therefore a second call to this method) for the same
   *    agent while its cooldown is active, but this check is kept as an
   *    explicit belt-and-suspenders guard matching the spec wording, and to
   *    protect against a future async `spawnSession` implementation.
   * 3. Emits `app:notification` for the UI toast (main.ts forwards it to
   *    the renderer over the existing `notification` IPC channel).
   * 4. Replies to the ORIGINAL sender (`fromAgent`) as `'system'` — unless
   *    `fromAgent` is itself `'system'`, which would create a reply loop
   *    (a system notification about a system notification's own auto-spawn
   *    failure, forever).
   *
   * MN-E (G2 review round 2): the reply is sent AFTER the notification is
   * emitted, and is wrapped in its own try/catch that only `logger.warn`s.
   * Order and isolation both matter here: this whole method runs inside the
   * catch block of the ORIGINAL SendMessage/delivery attempt (InboxPoller or
   * tryDeliver) — if `send()` for the reply were to throw (e.g. the DB
   * insert fails) and we didn't catch it, that exception would propagate
   * out to whatever originally called `tryDeliver`/`checkInboxFile`, making
   * an unrelated failure (the reply) look like the ORIGINAL SendMessage call
   * itself failed, even though the original message was already persisted
   * successfully. Emitting the notification first (before the reply, which
   * is the more failure-prone step) also guarantees the UI toast still gets
   * sent even if the reply fails.
   */
  private handleArsAutoSpawnFailure(
    targetAgent: string,
    fromAgent: string,
    projectId: string | null,
    originalContent: string,
    err: unknown,
  ): void {
    const message = err instanceof Error ? err.message : String(err);
    const code = message.split(':')[0].trim();
    const now = Date.now();

    const existing = this.arsFailureCooldown.get(targetAgent);
    const alreadyNotified = !!existing && existing.code === code && existing.until > now;

    this.arsFailureCooldown.set(targetAgent, { code, until: now + ARS_FAILURE_COOLDOWN_MS });

    logger.warn(
      `MessageBroker: auto-spawn failed for ${targetAgent} (${code}) — cooling down ${ARS_FAILURE_COOLDOWN_MS / 60_000}min`,
      err,
    );

    if (alreadyNotified) return;

    // MN-E: emit the UI notification FIRST — it must go out even if the
    // reply below fails.
    const notification: AppNotification = {
      level: 'error',
      code,
      message,
      source: 'message-broker',
      agentId: targetAgent,
    };
    eventBus.emit('app:notification', notification);

    // Anti-loop: never reply to a message that already came from 'system'.
    if (fromAgent !== 'system') {
      // MN-E: never let a failure while sending THIS reply escape to the
      // caller — it must not look like the original SendMessage failed.
      try {
        this.send({
          fromAgent: 'system',
          toAgent: fromAgent,
          content:
            `無法自動啟動 ${targetAgent}：${code}\n\n` +
            `錯誤訊息：${message}\n\n` +
            `原訊息：${originalContent}\n\n` +
            '請告知老闆到「設定 → 學術出版部」處理。',
          projectId: projectId || undefined,
        });
      } catch (sendErr) {
        logger.warn(`MessageBroker: failed to send ARS failure notice to ${fromAgent}`, sendErr);
      }
    }
  }

  // ─── Query ─────────────────────────────────────────────────────────────────

  getById(id: string): MessageRecord | null {
    const rows = database.prepare('SELECT * FROM messages WHERE id = ?', [id]);
    return rows.length > 0 ? this.rowToMessage(rows[0]) : null;
  }

  listByFilters(filters: MessageFilters): MessageRecord[] {
    let sql = 'SELECT * FROM messages WHERE 1=1';
    const params: unknown[] = [];

    if (filters.agent) {
      sql += ' AND (from_agent = ? OR to_agent = ?)';
      params.push(filters.agent, filters.agent);
    }
    if (filters.toAgent) {
      sql += ' AND to_agent = ?';
      params.push(filters.toAgent);
    }
    if (filters.fromAgent) {
      sql += ' AND from_agent = ?';
      params.push(filters.fromAgent);
    }
    if (filters.projectId) {
      sql += ' AND project_id = ?';
      params.push(filters.projectId);
    }
    if (filters.status) {
      sql += ' AND status = ?';
      params.push(filters.status);
    }

    sql += ' ORDER BY created_at DESC';

    if (filters.limit) {
      sql += ' LIMIT ?';
      params.push(filters.limit);
    } else {
      sql += ' LIMIT 50';
    }

    const rows = database.prepare(sql, params);
    return rows.map((r: any) => this.rowToMessage(r));
  }

  /**
   * Get unread count for an agent.
   */
  getUnreadCount(agentId: string, projectId?: string | null): number {
    let sql = `SELECT COUNT(*) as cnt FROM messages WHERE to_agent = ? AND status IN ('pending', 'delivered')`;
    const params: unknown[] = [agentId];

    if (projectId) {
      sql += ' AND project_id = ?';
      params.push(projectId);
    }

    const rows = database.prepare(sql, params);
    return (rows[0] as any)?.cnt || 0;
  }

  // ─── Row mapping ──────────────────────────────────────────────────────────

  private rowToMessage(row: any): MessageRecord {
    return {
      id: row.id,
      fromAgent: row.from_agent,
      toAgent: row.to_agent,
      content: row.content,
      status: row.status as MessageStatus,
      projectId: row.project_id || null,
      sessionId: row.session_id || null,
      replyTo: row.reply_to || null,
      createdAt: row.created_at,
      deliveredAt: row.delivered_at || null,
      readAt: row.read_at || null,
    };
  }
}

export const messageBroker = new MessageBroker();
