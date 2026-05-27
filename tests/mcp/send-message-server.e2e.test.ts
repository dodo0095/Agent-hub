/**
 * tests/mcp/send-message-server.e2e.test.ts
 *
 * Process-boundary E2E for the MCP send-message server.
 *
 * Why a separate E2E from send-message-server.test.ts:
 *   The unit suite calls handleSendMessage() directly — it never exercises
 *   the JSON-RPC stdin/stdout path that Claude CLI uses in production.
 *   This file spawns the compiled `out/mcp/send-message-server.js` as a
 *   real child process, sends JSON-RPC requests over stdin, and reads
 *   responses from stdout — exactly the way Claude CLI invokes it.
 *
 * Coverage (Sprint 5 T10 acceptance criteria):
 *   ✓ Rate limit triggers at config.rateLimit + 1
 *   ✓ RATE_LIMITED error message includes the configured limit
 *   ✓ Inbox file ends up with exactly `rateLimit` messages (the blocked
 *     one is NOT written to disk)
 *   ✓ Rate limit counter is per-process (a fresh spawn resets the count)
 *
 * Requires `npm run build:mcp` to have produced out/mcp/send-message-server.js
 * before this test runs. The compiled .js path is what Claude CLI actually
 * launches in production, so we test that exact artifact rather than the .ts
 * source via tsx.
 */
import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const SERVER_JS = resolve(__dirname, '..', '..', 'out', 'mcp', 'send-message-server.js');

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number;
  result?: { content?: Array<{ type: string; text: string }> };
  error?: { code: number; message: string };
}

interface ToolResultPayload {
  status?: string;
  error?: string;
  message?: string;
  /** Server returns snake_case fields per .knowledge/api-design.md. */
  message_id?: string;
  to?: string;
  queued_at?: string;
}

/**
 * Spawn the MCP server and provide a request/response helper.
 *
 * Each line written to stdout is parsed as a JSON-RPC response. We keep a
 * buffer in case responses arrive across chunk boundaries (newline-delimited
 * JSON is the protocol).
 */
class McpClient {
  private proc: ChildProcessWithoutNullStreams;
  private stdoutBuf = '';
  private stderrBuf = '';
  private pending = new Map<number, (resp: JsonRpcResponse) => void>();
  private nextId = 1;

  constructor(configPath: string) {
    this.proc = spawn(process.execPath, [SERVER_JS, configPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.proc.stdout.setEncoding('utf-8');
    this.proc.stderr.setEncoding('utf-8');
    this.proc.stdout.on('data', (chunk: string) => {
      this.stdoutBuf += chunk;
      let nl: number;
      while ((nl = this.stdoutBuf.indexOf('\n')) >= 0) {
        const line = this.stdoutBuf.slice(0, nl).trim();
        this.stdoutBuf = this.stdoutBuf.slice(nl + 1);
        if (!line) continue;
        try {
          const resp = JSON.parse(line) as JsonRpcResponse;
          const cb = this.pending.get(resp.id);
          if (cb) {
            this.pending.delete(resp.id);
            cb(resp);
          }
        } catch {
          // Ignore malformed lines — protocol says one JSON per line, but we
          // stay defensive in case the server ever logs to stdout.
        }
      }
    });
    this.proc.stderr.on('data', (chunk: string) => {
      this.stderrBuf += chunk;
    });
  }

  /**
   * Send a tools/call for send_message and return the parsed payload.
   * Resolves once the matching response (by id) arrives on stdout.
   */
  async sendMessage(to: string, content: string, timeoutMs = 3000): Promise<ToolResultPayload> {
    const id = this.nextId++;
    const req = {
      jsonrpc: '2.0',
      id,
      method: 'tools/call',
      params: { name: 'send_message', arguments: { to, content } },
    };
    const resp = await new Promise<JsonRpcResponse>((resolveResp, rejectResp) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        rejectResp(new Error(`MCP response timeout (id=${id}). stderr so far: ${this.stderrBuf}`));
      }, timeoutMs);
      this.pending.set(id, (r) => {
        clearTimeout(timer);
        resolveResp(r);
      });
      this.proc.stdin.write(JSON.stringify(req) + '\n');
    });

    // The tool wraps the payload in MCP content[0].text — unwrap for caller.
    const text = resp.result?.content?.[0]?.text;
    if (typeof text !== 'string') {
      throw new Error(`Malformed tool result: ${JSON.stringify(resp)}`);
    }
    return JSON.parse(text) as ToolResultPayload;
  }

  /** Capture stderr for debugging assertions. */
  get stderr(): string {
    return this.stderrBuf;
  }

  /** Cleanly shut the server down. Safe to call multiple times. */
  async close(): Promise<void> {
    if (this.proc.killed) return;
    const exited = new Promise<void>((res) => this.proc.once('close', () => res()));
    try {
      this.proc.stdin.end();
    } catch {
      // stdin might already be closed; force kill below.
    }
    // Give the process up to 500ms to exit gracefully, then SIGKILL.
    await Promise.race([
      exited,
      new Promise<void>((res) =>
        setTimeout(() => {
          if (!this.proc.killed) this.proc.kill('SIGKILL');
          res();
        }, 500),
      ),
    ]);
  }
}

describe('MCP send-message-server E2E (process boundary)', () => {
  let workDir: string;
  let inboxDir: string;
  let client: McpClient | null = null;

  beforeAll(() => {
    if (!existsSync(SERVER_JS)) {
      throw new Error(
        `Built MCP server not found at ${SERVER_JS}. Run \`npm run build:mcp\` first.`,
      );
    }
  });

  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), 'mcp-e2e-'));
    inboxDir = join(workDir, 'inboxes');
    mkdirSync(inboxDir, { recursive: true });
  });

  afterEach(async () => {
    if (client) {
      await client.close();
      client = null;
    }
    try {
      rmSync(workDir, { recursive: true, force: true });
    } catch {
      // Windows sometimes holds onto temp dirs — tolerate.
    }
  });

  function writeConfig(overrides: Partial<{
    agentId: string;
    allowedTargets: string[];
    rateLimit: number;
    projectId: string | null;
  }> = {}): string {
    const cfg = {
      agentId: 'backend-architect',
      allowedTargets: ['product-manager', 'tech-lead'],
      inboxDir,
      projectId: null,
      rateLimit: 3,
      ...overrides,
    };
    const path = join(workDir, 'config.json');
    writeFileSync(path, JSON.stringify(cfg), 'utf-8');
    return path;
  }

  it('blocks the (rateLimit+1)-th message and writes only rateLimit messages to inbox', async () => {
    // Set a low limit so the test stays fast and obvious. 4 sends total: the
    // 4th should be denied. Mirrors the production behaviour for limit=20 +
    // 21 sends, just on a smaller scale.
    const configPath = writeConfig({ rateLimit: 3 });
    client = new McpClient(configPath);

    const results: ToolResultPayload[] = [];
    for (let i = 0; i < 4; i++) {
      results.push(await client.sendMessage('product-manager', `訊息 ${i + 1}`));
    }

    // First 3 should be accepted (status: 'pending', no error key).
    // Server returns snake_case (message_id, queued_at) per API design.
    for (let i = 0; i < 3; i++) {
      expect(results[i].status, `msg ${i + 1} should be pending`).toBe('pending');
      expect(results[i].error, `msg ${i + 1} should have no error`).toBeUndefined();
      expect(results[i].message_id).toMatch(/[0-9a-f-]{36}/);
    }

    // 4th should be RATE_LIMITED with a message that names the limit.
    expect(results[3].error).toBe('RATE_LIMITED');
    expect(results[3].message).toContain('Rate limit exceeded');
    expect(results[3].message).toContain('max 3');
    expect(results[3].status).toBeUndefined();
    expect(results[3].message_id).toBeUndefined();

    // Inbox file on disk should contain exactly 3 messages — the blocked one
    // must not leak through. The file is keyed by recipient agent id.
    const inboxPath = join(inboxDir, 'product-manager.json');
    expect(existsSync(inboxPath)).toBe(true);
    const inbox = JSON.parse(readFileSync(inboxPath, 'utf-8')) as unknown[];
    expect(inbox).toHaveLength(3);
  });

  it('rate-limit counter is per-process — a fresh spawn resets the count', async () => {
    const configPath = writeConfig({ rateLimit: 2 });

    // Session A: exhaust the limit (2 ok + 1 denied).
    client = new McpClient(configPath);
    const a1 = await client.sendMessage('product-manager', 'A-1');
    const a2 = await client.sendMessage('product-manager', 'A-2');
    const a3 = await client.sendMessage('product-manager', 'A-3');
    expect(a1.status).toBe('pending');
    expect(a2.status).toBe('pending');
    expect(a3.error).toBe('RATE_LIMITED');
    await client.close();

    // Session B: spawn anew with the same config — counter should start fresh.
    // This validates the in-memory Map<agentId, timestamps[]> dies with the
    // process, which is the design (no Sprint 5 spec demanded persistence).
    client = new McpClient(configPath);
    const b1 = await client.sendMessage('product-manager', 'B-1');
    const b2 = await client.sendMessage('product-manager', 'B-2');
    const b3 = await client.sendMessage('product-manager', 'B-3');
    expect(b1.status, 'fresh spawn should allow first message').toBe('pending');
    expect(b2.status, 'fresh spawn should allow second message').toBe('pending');
    expect(b3.error, 'fresh spawn should still cap at rateLimit').toBe('RATE_LIMITED');

    // Inbox accumulates across both sessions — confirms file persistence is
    // separate from in-memory rate limit state.
    const inboxPath = join(inboxDir, 'product-manager.json');
    const inbox = JSON.parse(readFileSync(inboxPath, 'utf-8')) as unknown[];
    expect(inbox).toHaveLength(4); // 2 from A + 2 from B
  });
});
