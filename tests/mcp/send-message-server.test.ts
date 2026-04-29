/**
 * tests/mcp/send-message-server.test.ts
 *
 * Unit tests for MCP server core logic (handleSendMessage / handleListInbox).
 * Runs in plain Node.js — NO Electron, NO stdin/stdout required.
 * Each test uses an isolated temp directory to avoid inbox pollution.
 */

import { mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';

import {
  handleSendMessage,
  handleListInbox,
  resetRateLimiter,
  MAX_CONTENT_LENGTH,
  type AgentMcpConfig,
  type InboxMessage,
} from '../../electron/mcp/send-message-server';

// ─── Test helpers ─────────────────────────────────────────────────────────────

function makeTempDir(): string {
  const dir = join(tmpdir(), `mcp-test-${randomUUID()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function makeConfig(inboxDir: string, overrides: Partial<AgentMcpConfig> = {}): AgentMcpConfig {
  return {
    agentId: 'backend-architect',
    allowedTargets: ['product-manager', 'tech-lead'],
    inboxDir,
    projectId: null,
    rateLimit: 20,
    ...overrides,
  };
}

function readInbox(inboxDir: string, agentId: string): InboxMessage[] {
  const file = join(inboxDir, `${agentId}.json`);
  if (!existsSync(file)) return [];
  return JSON.parse(readFileSync(file, 'utf-8')) as InboxMessage[];
}

function parseResult(result: { content: Array<{ type: string; text: string }> }): unknown {
  return JSON.parse(result.content[0].text);
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

const tempDirs: string[] = [];

beforeEach(() => {
  resetRateLimiter();
});

afterEach(() => {
  // Clean up all temp dirs created in this test
  for (const dir of tempDirs.splice(0)) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* best-effort */
    }
  }
});

function tempDir(): string {
  const d = makeTempDir();
  tempDirs.push(d);
  return d;
}

// ─── TC-1: 白名單內發送 ───────────────────────────────────────────────────────

describe('SendMessage MCP Server', () => {
  it('TC-1: send_message 白名單內 → inbox JSON 有新記錄，格式正確', () => {
    const dir = tempDir();
    const config = makeConfig(dir);

    const result = handleSendMessage(config, {
      to: 'product-manager',
      content: '請協助審查 API 設計',
    });

    const payload = parseResult(result) as Record<string, unknown>;
    expect(payload.status).toBe('pending');
    expect(payload.to).toBe('product-manager');
    expect(typeof payload.message_id).toBe('string');
    expect(typeof payload.queued_at).toBe('string');

    const messages = readInbox(dir, 'product-manager');
    expect(messages).toHaveLength(1);
    expect(messages[0].from).toBe('backend-architect');
    expect(messages[0].text).toBe('請協助審查 API 設計');
    expect(messages[0].read).toBe(false);
    expect(messages[0].summary).toBe('請協助審查 API 設計');
    expect(messages[0].messageId).toBe(payload.message_id as string);
  });

  // ─── TC-2: 越權發送 ──────────────────────────────────────────────────────────

  it('TC-2: send_message 越權 → UNAUTHORIZED，inbox 不變', () => {
    const dir = tempDir();
    const config = makeConfig(dir); // allowedTargets: ['product-manager', 'tech-lead']

    const result = handleSendMessage(config, {
      to: 'boss',
      content: '越權訊息',
    });

    const payload = parseResult(result) as Record<string, unknown>;
    expect(payload.error).toBe('UNAUTHORIZED');
    expect((payload.message as string)).toContain('boss');

    // Inbox should not have been touched
    const messages = readInbox(dir, 'boss');
    expect(messages).toHaveLength(0);
  });

  // ─── TC-3: Rate limit ─────────────────────────────────────────────────────

  it('TC-3: 連發 21 條 → 前 20 條 pending，第 21 條 RATE_LIMITED', () => {
    const dir = tempDir();
    const config = makeConfig(dir, { rateLimit: 20 });

    const results: unknown[] = [];
    for (let i = 0; i < 21; i++) {
      const r = parseResult(
        handleSendMessage(config, { to: 'product-manager', content: `訊息 ${i + 1}` }),
      ) as Record<string, unknown>;
      results.push(r);
    }

    // First 20 should succeed
    for (let i = 0; i < 20; i++) {
      expect((results[i] as Record<string, unknown>).status).toBe('pending');
    }

    // 21st should be rate-limited
    expect((results[20] as Record<string, unknown>).error).toBe('RATE_LIMITED');

    // Inbox should have exactly 20 messages
    const messages = readInbox(dir, 'product-manager');
    expect(messages).toHaveLength(20);
  });

  // ─── TC-4: list_inbox 只回傳未讀 ─────────────────────────────────────────

  it('TC-4: list_inbox → 只回傳 read: false 的訊息', () => {
    const dir = tempDir();
    const agentId = 'backend-architect';
    const config = makeConfig(dir, { agentId });

    // Pre-write inbox with 2 unread + 1 read
    const inbox: InboxMessage[] = [
      {
        from: 'product-manager',
        text: '訊息 A',
        summary: '訊息 A',
        timestamp: new Date().toISOString(),
        read: false,
        project: null,
        messageId: randomUUID(),
      },
      {
        from: 'tech-lead',
        text: '訊息 B（已讀）',
        summary: '訊息 B（已讀）',
        timestamp: new Date().toISOString(),
        read: true,
        project: null,
        messageId: randomUUID(),
      },
      {
        from: 'product-manager',
        text: '訊息 C',
        summary: '訊息 C',
        timestamp: new Date().toISOString(),
        read: false,
        project: null,
        messageId: randomUUID(),
      },
    ];
    writeFileSync(join(dir, `${agentId}.json`), JSON.stringify(inbox));

    const result = parseResult(handleListInbox(config, {})) as { messages: InboxMessage[] };
    expect(result.messages).toHaveLength(2);
    expect(result.messages.every((m) => !m.read)).toBe(true);
  });

  // ─── TC-5: list_inbox include_read ────────────────────────────────────────

  it('TC-5: list_inbox include_read: true → 含已讀訊息', () => {
    const dir = tempDir();
    const agentId = 'backend-architect';
    const config = makeConfig(dir, { agentId });

    const inbox: InboxMessage[] = [
      {
        from: 'product-manager',
        text: '訊息 A',
        summary: '訊息 A',
        timestamp: new Date().toISOString(),
        read: false,
        project: null,
        messageId: randomUUID(),
      },
      {
        from: 'tech-lead',
        text: '訊息 B（已讀）',
        summary: '訊息 B（已讀）',
        timestamp: new Date().toISOString(),
        read: true,
        project: null,
        messageId: randomUUID(),
      },
      {
        from: 'product-manager',
        text: '訊息 C',
        summary: '訊息 C',
        timestamp: new Date().toISOString(),
        read: false,
        project: null,
        messageId: randomUUID(),
      },
    ];
    writeFileSync(join(dir, `${agentId}.json`), JSON.stringify(inbox));

    const result = parseResult(
      handleListInbox(config, { include_read: true }),
    ) as { messages: InboxMessage[] };
    expect(result.messages).toHaveLength(3);
  });

  // ─── TC-6: content 超長截斷 ───────────────────────────────────────────────

  it('TC-6: content > 50000 字 → 截斷至 MAX_CONTENT_LENGTH', () => {
    const dir = tempDir();
    const config = makeConfig(dir);

    const oversized = 'A'.repeat(MAX_CONTENT_LENGTH + 1000);

    const result = parseResult(
      handleSendMessage(config, { to: 'product-manager', content: oversized }),
    ) as Record<string, unknown>;
    expect(result.status).toBe('pending');

    const messages = readInbox(dir, 'product-manager');
    expect(messages).toHaveLength(1);
    expect(messages[0].text.length).toBe(MAX_CONTENT_LENGTH);
  });

  // ─── TC-7: list_inbox 檔案不存在時回傳空陣列 ─────────────────────────────

  it('TC-7: list_inbox 收件匣不存在 → 回傳 { messages: [] }，不拋錯', () => {
    const dir = tempDir();
    const config = makeConfig(dir, { agentId: 'no-messages-agent' });

    const result = parseResult(handleListInbox(config, {})) as { messages: unknown[] };
    expect(result.messages).toEqual([]);
  });

  // ─── TC-8: 多條訊息 append 不覆蓋 ────────────────────────────────────────

  it('TC-8: 多次 send_message → inbox JSON 累積（不覆蓋）', () => {
    const dir = tempDir();
    const config = makeConfig(dir);

    handleSendMessage(config, { to: 'tech-lead', content: '第一條' });
    handleSendMessage(config, { to: 'tech-lead', content: '第二條' });
    handleSendMessage(config, { to: 'tech-lead', content: '第三條' });

    const messages = readInbox(dir, 'tech-lead');
    expect(messages).toHaveLength(3);
    expect(messages[0].text).toBe('第一條');
    expect(messages[2].text).toBe('第三條');
  });
});
