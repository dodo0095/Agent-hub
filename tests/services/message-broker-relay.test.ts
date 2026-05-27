/**
 * tests/services/message-broker-relay.test.ts
 *
 * Integration test for Sprint 5 T8: 4-layer message relay through MessageBroker.
 *
 * What this covers:
 *   For each hop in boss → product-manager → tech-lead → backend-architect,
 *   write the inbox JSON (simulating the upstream MCP server having written
 *   it), then drive the broker's inbox polling logic, and assert:
 *     • the downstream session's pendingMessages queue received the formatted
 *       message body ("--- [來自 X 的訊息] ---")
 *     • the inbox file is rewritten with read:true so the same msg never
 *       re-delivers
 *     • the broker resolves the right active session (project-aware fallback)
 *
 * Why we drive pollInboxDir manually instead of waiting for setInterval:
 *   `registerCallbacks()` starts a 3-second setInterval against the hardcoded
 *   ~/.claude/teams/default/inboxes/ — neither tolerable in tests (slow) nor
 *   safe (would touch the developer's real inbox). Instead we set the
 *   callbacks property directly and invoke the private poll method with a
 *   chosen temp directory. The same code paths execute as in production.
 *
 * Why this is not the entire T8 verification:
 *   Real Claude CLI ↔ MCP tool call, real PTY ConPTY behaviour, and four
 *   simultaneous Claude sessions are explicitly out of scope (dev-plan §7
 *   marks T8 as human-verified). This test gives us a deterministic safety
 *   net for the AgentHub-side relay logic; the manual SOP (in T8 task file)
 *   covers the parts that need a real Claude CLI.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Database / electron / node-pty are mocked globally by tests/setup.ts.
// We additionally need to suppress logger noise — logger is just a console
// wrapper so no explicit mock needed, but we silence info logs to keep
// test output focused on assertions.
vi.mock('../../electron/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import {
  messageBroker,
  type BrokerCallbacks,
  type BrokerSessionView,
} from '../../electron/services/message-broker';

// ─── Test helpers ─────────────────────────────────────────────────────────────

/**
 * Build a minimal BrokerSessionView. Defaults to non-interactive so the
 * broker routes via pendingMessages (synchronous, no setTimeout), making
 * assertions deterministic. Interactive sessions trigger ptyWriteAndSubmit
 * which has a 500ms setTimeout for the Enter keypress — orthogonal to the
 * routing logic we're testing here.
 */
function makeSession(agentId: string, overrides: Partial<BrokerSessionView> = {}): BrokerSessionView {
  return {
    sessionId: `session-${agentId}`,
    agentId,
    status: 'running',
    interactive: false,
    ptyProcess: { write: vi.fn() },
    pendingMessages: [],
    projectId: null,
    ...overrides,
  };
}

interface InboxEntry {
  from: string;
  text: string;
  summary?: string;
  timestamp: string;
  read: boolean;
  project: string | null;
  messageId: string;
}

function writeInboxEntry(inboxDir: string, recipient: string, entry: InboxEntry): void {
  const path = join(inboxDir, `${recipient}.json`);
  let entries: InboxEntry[] = [];
  if (existsSync(path)) {
    try {
      entries = JSON.parse(readFileSync(path, 'utf-8')) as InboxEntry[];
    } catch {
      entries = [];
    }
  }
  entries.push(entry);
  writeFileSync(path, JSON.stringify(entries, null, 2), 'utf-8');
}

function readInbox(inboxDir: string, recipient: string): InboxEntry[] {
  const path = join(inboxDir, `${recipient}.json`);
  if (!existsSync(path)) return [];
  return JSON.parse(readFileSync(path, 'utf-8')) as InboxEntry[];
}

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('MessageBroker — 4-layer inbox relay (Sprint 5 T8)', () => {
  let inboxDir: string;
  let sessions: Record<string, BrokerSessionView>;
  let callbacks: BrokerCallbacks;

  beforeEach(() => {
    inboxDir = mkdtempSync(join(tmpdir(), 'broker-relay-'));
    sessions = {
      boss: makeSession('boss'),
      'product-manager': makeSession('product-manager'),
      'tech-lead': makeSession('tech-lead'),
      'backend-architect': makeSession('backend-architect'),
    };
    callbacks = {
      findActiveSessionByAgent: (agentId: string) => sessions[agentId],
      spawnSession: vi.fn(() => 'spawn-not-expected'),
      getSession: (sessionId: string) =>
        Object.values(sessions).find((s) => s.sessionId === sessionId),
    };
    // Plug callbacks into the singleton without invoking startInboxWatcher()
    // (which would start a real 3s setInterval against ~/.claude/...).
    // The lastDelivered map carries state between tests too, so clear it.
    /* eslint-disable @typescript-eslint/no-explicit-any */
    (messageBroker as any).callbacks = callbacks;
    (messageBroker as any).lastDelivered = new Map();
    (messageBroker as any).spawnHistory = new Map();
    /* eslint-enable @typescript-eslint/no-explicit-any */
  });

  afterEach(() => {
    // Detach the singleton from the test's callbacks so a stray timer can't
    // route into our mocks after teardown (defence in depth — we never start
    // the interval, but other tests may share the singleton).
    /* eslint-disable @typescript-eslint/no-explicit-any */
    (messageBroker as any).callbacks = null;
    (messageBroker as any).lastDelivered = new Map();
    /* eslint-enable @typescript-eslint/no-explicit-any */
    try {
      rmSync(inboxDir, { recursive: true, force: true });
    } catch {
      // Windows sometimes locks the temp dir; tolerate.
    }
  });

  /** Drive the otherwise-setInterval-driven private poller against our temp dir. */
  function pollOnce(): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (messageBroker as any).pollInboxDir(inboxDir);
  }

  it('relays each hop in boss → PM → tech-lead → backend-architect', () => {
    // ── Hop 1: boss writes to product-manager.json ─────────────────────────
    const msg1: InboxEntry = {
      from: 'boss',
      text: 'Sprint 5 E2E：請轉達給 tech-lead',
      timestamp: new Date(Date.now() + 1).toISOString(), // unique ts per hop
      read: false,
      project: null,
      messageId: 'msg-1',
    };
    writeInboxEntry(inboxDir, 'product-manager', msg1);
    pollOnce();

    expect(sessions['product-manager'].pendingMessages).toHaveLength(1);
    const delivered1 = sessions['product-manager'].pendingMessages[0];
    expect(delivered1).toContain('--- [來自 boss 的訊息] ---');
    expect(delivered1).toContain('Sprint 5 E2E：請轉達給 tech-lead');
    // The other three sessions must NOT have received anything from this hop.
    expect(sessions['tech-lead'].pendingMessages).toHaveLength(0);
    expect(sessions['backend-architect'].pendingMessages).toHaveLength(0);
    expect(sessions['boss'].pendingMessages).toHaveLength(0);
    // Inbox file is rewritten with read:true so the next poll skips it.
    const pmInbox = readInbox(inboxDir, 'product-manager');
    expect(pmInbox[0].read).toBe(true);

    // ── Hop 2: product-manager → tech-lead ─────────────────────────────────
    const msg2: InboxEntry = {
      from: 'product-manager',
      text: '轉達老闆訊息：E2E 接力測試，請繼續轉給 backend-architect',
      timestamp: new Date(Date.now() + 2).toISOString(),
      read: false,
      project: null,
      messageId: 'msg-2',
    };
    writeInboxEntry(inboxDir, 'tech-lead', msg2);
    pollOnce();

    expect(sessions['tech-lead'].pendingMessages).toHaveLength(1);
    expect(sessions['tech-lead'].pendingMessages[0]).toContain('--- [來自 product-manager 的訊息] ---');
    expect(sessions['tech-lead'].pendingMessages[0]).toContain('轉達老闆訊息');
    expect(readInbox(inboxDir, 'tech-lead')[0].read).toBe(true);

    // ── Hop 3: tech-lead → backend-architect ───────────────────────────────
    const msg3: InboxEntry = {
      from: 'tech-lead',
      text: 'E2E 接力最後一層',
      timestamp: new Date(Date.now() + 3).toISOString(),
      read: false,
      project: null,
      messageId: 'msg-3',
    };
    writeInboxEntry(inboxDir, 'backend-architect', msg3);
    pollOnce();

    expect(sessions['backend-architect'].pendingMessages).toHaveLength(1);
    expect(sessions['backend-architect'].pendingMessages[0]).toContain('--- [來自 tech-lead 的訊息] ---');
    expect(sessions['backend-architect'].pendingMessages[0]).toContain('E2E 接力最後一層');
    expect(readInbox(inboxDir, 'backend-architect')[0].read).toBe(true);

    // ── Aggregate assertion: full chain delivered exactly once each ────────
    expect(sessions['product-manager'].pendingMessages).toHaveLength(1);
    expect(sessions['tech-lead'].pendingMessages).toHaveLength(1);
    expect(sessions['backend-architect'].pendingMessages).toHaveLength(1);
    expect(sessions['boss'].pendingMessages).toHaveLength(0);
  });

  it('does not re-deliver an already-read message on a second poll', () => {
    // Idempotency check: even if the inbox file keeps a read=true record,
    // a re-poll must NOT re-inject. The broker uses an in-memory
    // lastDelivered set keyed by timestamp + on-disk read flag as
    // belt-and-braces against double delivery.
    const msg: InboxEntry = {
      from: 'boss',
      text: '冪等測試',
      timestamp: new Date().toISOString(),
      read: false,
      project: null,
      messageId: 'msg-once',
    };
    writeInboxEntry(inboxDir, 'product-manager', msg);

    pollOnce();
    expect(sessions['product-manager'].pendingMessages).toHaveLength(1);

    pollOnce();
    pollOnce();
    expect(sessions['product-manager'].pendingMessages).toHaveLength(1);
  });

  it('routes messages by recipient — never delivers to the wrong agent', () => {
    // Cross-talk guard: two hops in the same poll cycle must each land
    // in the right inbox.
    writeInboxEntry(inboxDir, 'tech-lead', {
      from: 'product-manager',
      text: '只給 tech-lead',
      timestamp: new Date(Date.now() + 1).toISOString(),
      read: false,
      project: null,
      messageId: 'msg-tl',
    });
    writeInboxEntry(inboxDir, 'backend-architect', {
      from: 'tech-lead',
      text: '只給 backend-architect',
      timestamp: new Date(Date.now() + 2).toISOString(),
      read: false,
      project: null,
      messageId: 'msg-ba',
    });

    pollOnce();

    expect(sessions['tech-lead'].pendingMessages).toHaveLength(1);
    expect(sessions['tech-lead'].pendingMessages[0]).toContain('只給 tech-lead');
    expect(sessions['backend-architect'].pendingMessages).toHaveLength(1);
    expect(sessions['backend-architect'].pendingMessages[0]).toContain('只給 backend-architect');
    expect(sessions['product-manager'].pendingMessages).toHaveLength(0);
    expect(sessions['boss'].pendingMessages).toHaveLength(0);
  });

  it('handles an inbox file for an unknown agent without crashing other deliveries', () => {
    // Robustness: an inbox file for an agent we don't have an active session
    // for must not block the rest of the poll cycle. (The broker will try
    // auto-spawn, which our mock callbacks accept but don't actually spawn —
    // see spawnSession returning 'spawn-not-expected' so getSession returns
    // undefined and the message is left unread for the next poll.)
    const unknownMsg: InboxEntry = {
      from: 'boss',
      text: '給不認識的 agent',
      timestamp: new Date(Date.now() + 1).toISOString(),
      read: false,
      project: null,
      messageId: 'msg-unknown',
    };
    writeInboxEntry(inboxDir, 'mystery-agent', unknownMsg);

    const goodMsg: InboxEntry = {
      from: 'boss',
      text: '給 PM 的正常訊息',
      timestamp: new Date(Date.now() + 2).toISOString(),
      read: false,
      project: null,
      messageId: 'msg-good',
    };
    writeInboxEntry(inboxDir, 'product-manager', goodMsg);

    expect(() => pollOnce()).not.toThrow();

    // Known recipient still got their message — broker did not abort early.
    expect(sessions['product-manager'].pendingMessages).toHaveLength(1);
    expect(sessions['product-manager'].pendingMessages[0]).toContain('給 PM 的正常訊息');
  });
});
