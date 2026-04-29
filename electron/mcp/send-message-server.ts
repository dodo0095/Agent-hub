#!/usr/bin/env node
/**
 * send-message-server.ts
 * MCP stdio server for inter-agent communication in AgentHub.
 *
 * ⚠️  NO ELECTRON IMPORTS ALLOWED — this script is spawned as a child process
 *     by Claude Code CLI (not by Electron). It runs in plain Node.js.
 *
 * Usage:
 *   node send-message-server.js <agentConfigPath>
 *
 * Protocol: JSON-RPC 2.0 over stdio (newline-delimited JSON).
 * Tools exposed: send_message, list_inbox
 *
 * Exports:
 *   handleSendMessage / handleListInbox / resetRateLimiter  — for unit testing
 *   MCP_TOOL_NAMES                                          — for prompt-sync tests
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { createInterface } from 'readline';
import { randomUUID } from 'crypto';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AgentMcpConfig {
  agentId: string;
  allowedTargets: string[];
  inboxDir: string;
  projectId: string | null;
  rateLimit: number;
}

export interface InboxMessage {
  from: string;
  text: string;
  summary: string;
  timestamp: string;
  read: boolean;
  project: string | null;
  messageId: string;
}

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const MAX_CONTENT_LENGTH = 50_000;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour

const MCP_PROTOCOL_VERSION = '2024-11-05';

/** Canonical list of tool names this MCP server exposes (used for prompt-sync tests). */
export const MCP_TOOL_NAMES: string[] = ['send_message', 'list_inbox'];

// ─── Rate Limiter ─────────────────────────────────────────────────────────────

/** In-memory rate limit tracker. Resets on process restart (i.e., session end). */
const rateLimitMap = new Map<string, number[]>();

/**
 * Returns true if the agent is within rate limit, records the timestamp on success.
 * Returns false if limit exceeded (does NOT record).
 */
export function consumeRateLimit(agentId: string, limit: number): boolean {
  const now = Date.now();
  const timestamps = rateLimitMap.get(agentId) ?? [];
  const recent = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (recent.length >= limit) {
    rateLimitMap.set(agentId, recent);
    return false;
  }
  recent.push(now);
  rateLimitMap.set(agentId, recent);
  return true;
}

/** Reset rate limiter state — for use in unit tests only. */
export function resetRateLimiter(): void {
  rateLimitMap.clear();
}

// ─── JSON-RPC helpers ─────────────────────────────────────────────────────────

function writeLine(obj: unknown): void {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

function respond(id: string | number | null, result: unknown): void {
  writeLine({ jsonrpc: '2.0', id, result });
}

function respondError(id: string | number | null, code: number, message: string): void {
  writeLine({ jsonrpc: '2.0', id, error: { code, message } });
}

/** Wrap a value as an MCP tool result (text content block). */
function toolResult(data: unknown): { content: Array<{ type: string; text: string }> } {
  return {
    content: [{ type: 'text', text: typeof data === 'string' ? data : JSON.stringify(data) }],
  };
}

// ─── Tool implementations (exported for unit tests) ───────────────────────────

export function handleSendMessage(
  config: AgentMcpConfig,
  args: Record<string, unknown>,
): { content: Array<{ type: string; text: string }> } {
  const to = args.to as string | undefined;
  const rawContent = args.content;

  if (!to || typeof to !== 'string') {
    return toolResult({ error: 'INVALID_ARGS', message: 'Missing required argument: to' });
  }
  if (rawContent === undefined || rawContent === null) {
    return toolResult({ error: 'INVALID_ARGS', message: 'Missing required argument: content' });
  }

  // Authorization: target must be in allowedTargets
  if (!config.allowedTargets.includes(to)) {
    return toolResult({
      error: 'UNAUTHORIZED',
      message: `Agent "${config.agentId}" is not allowed to send messages to "${to}". Allowed targets: [${config.allowedTargets.join(', ')}]`,
    });
  }

  // Rate limit check
  if (!consumeRateLimit(config.agentId, config.rateLimit)) {
    return toolResult({
      error: 'RATE_LIMITED',
      message: `Rate limit exceeded: max ${config.rateLimit} messages per hour per session.`,
    });
  }

  // Truncate content if over limit
  let text = String(rawContent);
  if (text.length > MAX_CONTENT_LENGTH) {
    text = text.slice(0, MAX_CONTENT_LENGTH);
  }

  const messageId = randomUUID();
  const timestamp = new Date().toISOString();
  const inboxFile = join(config.inboxDir, `${to}.json`);

  const message: InboxMessage = {
    from: config.agentId,
    text,
    summary: text.slice(0, 80),
    timestamp,
    read: false,
    project: config.projectId,
    messageId,
  };

  // Read existing messages (treat missing / corrupt file as empty array)
  let messages: InboxMessage[] = [];
  if (existsSync(inboxFile)) {
    try {
      const raw = JSON.parse(readFileSync(inboxFile, 'utf-8')) as unknown;
      if (Array.isArray(raw)) messages = raw as InboxMessage[];
    } catch {
      messages = [];
    }
  }

  messages.push(message);
  writeFileSync(inboxFile, JSON.stringify(messages, null, 2), 'utf-8');

  return toolResult({ message_id: messageId, status: 'pending', to, queued_at: timestamp });
}

export function handleListInbox(
  config: AgentMcpConfig,
  args: Record<string, unknown>,
): { content: Array<{ type: string; text: string }> } {
  const rawLimit = args.limit;
  const includeRead = Boolean(args.include_read);
  const limit = Math.min(typeof rawLimit === 'number' ? rawLimit : 10, 50);

  const inboxFile = join(config.inboxDir, `${config.agentId}.json`);

  let messages: InboxMessage[] = [];
  if (existsSync(inboxFile)) {
    try {
      const raw = JSON.parse(readFileSync(inboxFile, 'utf-8')) as unknown;
      if (Array.isArray(raw)) messages = raw as InboxMessage[];
    } catch {
      messages = [];
    }
  }

  if (!includeRead) {
    messages = messages.filter((m) => !m.read);
  }

  // Return the most recent `limit` messages
  messages = messages.slice(-limit);

  return toolResult({ messages });
}

// ─── MCP Request router ───────────────────────────────────────────────────────

function handleRequest(config: AgentMcpConfig, req: JsonRpcRequest): void {
  // Notifications have no id — they require no response
  const hasId = 'id' in req;
  if (!hasId) return;

  const id = req.id ?? null;
  const params = req.params ?? {};

  switch (req.method) {
    case 'initialize':
      respond(id, {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: 'send-message', version: '1.0.0' },
      });
      break;

    case 'tools/list':
      respond(id, {
        tools: [
          {
            name: 'send_message',
            description:
              '發送訊息給另一個 Agent。訊息寫入對方的 JSON inbox 檔案，僅白名單內的 Agent 才可接收。',
            inputSchema: {
              type: 'object',
              properties: {
                to: { type: 'string', description: '目標 Agent ID（必須在白名單內）' },
                content: { type: 'string', description: '訊息內容（上限 50,000 字）' },
                reply_to: {
                  type: 'string',
                  description: '（選填）回覆的 message_id',
                },
              },
              required: ['to', 'content'],
            },
          },
          {
            name: 'list_inbox',
            description: '讀取自己的收件匣。預設只回傳未讀訊息，最多 50 筆。',
            inputSchema: {
              type: 'object',
              properties: {
                limit: {
                  type: 'number',
                  description: '最多回傳幾筆（預設 10，最大 50）',
                },
                include_read: {
                  type: 'boolean',
                  description: '是否包含已讀訊息（預設 false）',
                },
              },
            },
          },
        ],
      });
      break;

    case 'tools/call': {
      const toolName = params.name as string | undefined;
      const toolArgs = (params.arguments ?? {}) as Record<string, unknown>;

      if (toolName === 'send_message') {
        respond(id, handleSendMessage(config, toolArgs));
      } else if (toolName === 'list_inbox') {
        respond(id, handleListInbox(config, toolArgs));
      } else {
        respondError(id, -32601, `Unknown tool: ${String(toolName)}`);
      }
      break;
    }

    default:
      respondError(id, -32601, `Method not found: ${req.method}`);
  }
}

// ─── Bootstrap (CLI entry point) ─────────────────────────────────────────────
// Only executes when run directly as `node send-message-server.js <configPath>`.
// Skipped when imported as a module (e.g., in unit tests).

if (require.main === module) {
  const configPath = process.argv[2];
  if (!configPath) {
    process.stderr.write('Usage: node send-message-server.js <agentConfigPath>\n');
    process.exit(1);
  }

  let config: AgentMcpConfig;
  try {
    config = JSON.parse(readFileSync(configPath, 'utf-8')) as AgentMcpConfig;
  } catch (err) {
    process.stderr.write(`[send-message-server] Failed to read config "${configPath}": ${err}\n`);
    process.exit(1);
  }

  // Ensure inbox directory exists (best-effort)
  try {
    if (!existsSync(config.inboxDir)) {
      mkdirSync(config.inboxDir, { recursive: true });
    }
  } catch (err) {
    process.stderr.write(`[send-message-server] Warning: Could not create inboxDir: ${err}\n`);
  }

  // Start reading stdin line-by-line
  const rl = createInterface({ input: process.stdin, terminal: false });

  rl.on('line', (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    let req: JsonRpcRequest;
    try {
      req = JSON.parse(trimmed) as JsonRpcRequest;
    } catch {
      return;
    }

    try {
      handleRequest(config, req);
    } catch (err) {
      const id = 'id' in req ? (req.id ?? null) : null;
      respondError(id as string | number | null, -32603, `Internal error: ${err}`);
    }
  });

  rl.on('close', () => {
    process.exit(0);
  });
}
