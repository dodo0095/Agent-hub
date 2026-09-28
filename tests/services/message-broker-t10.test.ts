// @vitest-environment node
/**
 * tests/services/message-broker-t10.test.ts
 *
 * Sprint 7.1 T10 (PM-016 follow-up, api-design §7.2): ARS_* auto-spawn
 * failure handling on both auto-spawn call sites — InboxPoller
 * (`checkInboxFile`, JSON-inbox-driven) and `tryDeliver` (internal
 * messages-table-driven). Covers:
 *   - target agent enters a 5-minute cooldown (`canAutoSpawn` false)
 *   - same target + same error code is only notified once within that window
 *   - a 'system' reply is sent to the original sender, EXCEPT when the
 *     original sender is itself 'system' (anti-loop)
 *   - an `app:notification` event is emitted with the documented shape
 *   - non-ARS_ errors are completely unaffected (existing behaviour)
 *
 * fs / database / pty-manager are mocked (SQL-aware for database, PM-012) so
 * these tests never touch a real filesystem or need `database.initialize()`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockReaddirSync = vi.fn((): string[] => []);
const mockReadFileSync = vi.fn((): string => '[]');
const mockWriteFileSync = vi.fn();
const mockExistsSync = vi.fn(() => true);
const mockMkdirSync = vi.fn();

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    readdirSync: (...a: unknown[]) => mockReaddirSync(...(a as [string])),
    readFileSync: (...a: unknown[]) => mockReadFileSync(...(a as [string])),
    writeFileSync: (...a: unknown[]) => mockWriteFileSync(...a),
    existsSync: (...a: unknown[]) => mockExistsSync(...a),
    mkdirSync: (...a: unknown[]) => mockMkdirSync(...a),
  };
});

vi.mock('os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('os')>();
  return { ...actual, homedir: () => 'C:/fake-home' };
});

// SQL-aware mock (PM-012) — content doesn't matter for these tests, just
// must not throw "Database not initialized" the way the real sql.js-backed
// service would without calling initialize().
const mockDbRun = vi.fn();
const mockDbPrepare = vi.fn((_sql: string, _params?: unknown[]): unknown[] => []);
vi.mock('../../electron/services/database', () => ({
  database: {
    run: (...a: [string, unknown[]?]) => mockDbRun(...a),
    prepare: (...a: [string, unknown[]?]) => mockDbPrepare(...a),
    get: vi.fn(),
  },
}));

vi.mock('../../electron/services/pty-manager', () => ({
  ptyWriteAndSubmit: vi.fn(),
}));

const mockLoggerInfo = vi.fn();
const mockLoggerWarn = vi.fn();
vi.mock('../../electron/utils/logger', () => ({
  logger: {
    info: (...a: unknown[]) => mockLoggerInfo(...a),
    warn: (...a: unknown[]) => mockLoggerWarn(...a),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { messageBroker, type BrokerCallbacks, type BrokerSessionView } from '../../electron/services/message-broker';
import { eventBus } from '../../electron/services/event-bus';
import type { MessageRecord } from '../../electron/types';

// ─── Test helpers ───────────────────────────────────────────────────────────

function makeCallbacks(overrides: Partial<BrokerCallbacks> = {}): BrokerCallbacks {
  // The 'system' reply (sent via handleArsAutoSpawnFailure) targets the
  // ORIGINAL sender ('research-director' in these tests) — give THAT agent
  // an already-active session so send()'s internal tryDeliver() call just
  // delivers normally, instead of also trying (and failing) to auto-spawn
  // them. Only 'publication-operator' — the agent under test — has no
  // active session, forcing the auto-spawn path we're actually testing.
  const researchDirectorSession: BrokerSessionView = {
    sessionId: 'session-research-director',
    agentId: 'research-director',
    status: 'running',
    interactive: false,
    ptyProcess: { write: vi.fn() },
    pendingMessages: [],
    projectId: null,
  };
  return {
    findActiveSessionByAgent: (agentId: string) =>
      agentId === 'publication-operator' ? undefined : researchDirectorSession,
    spawnSession: vi.fn(() => {
      throw new Error('ARS_PATH_NOT_SET: 尚未設定 ARS 路徑，請到「設定」填寫 ARS 路徑');
    }),
    getSession: (): BrokerSessionView | undefined => undefined,
    ...overrides,
  };
}

function makeMessage(overrides: Partial<MessageRecord> = {}): MessageRecord {
  return {
    id: 'msg-1',
    fromAgent: 'research-director',
    toAgent: 'publication-operator',
    content: '請開始新論文',
    status: 'pending',
    projectId: 'proj-1',
    sessionId: null,
    replyTo: null,
    createdAt: new Date().toISOString(),
    deliveredAt: null,
    readAt: null,
    ...overrides,
  };
}

/**
 * Find the `database.run` call that persisted a NEW message (the `system`
 * reply), as opposed to the `markDelivered` UPDATE that follows once that
 * reply is itself delivered to an active session. Returns its bound params.
 */
function findInsertMessageCall(): unknown[] | undefined {
  const call = mockDbRun.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO messages'));
  return call?.[1] as unknown[] | undefined;
}

/** Reset the singleton's private mutable state between tests (shared instance). */
function resetBrokerState(callbacks: BrokerCallbacks): void {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  (messageBroker as any).callbacks = callbacks;
  (messageBroker as any).lastDelivered = new Map();
  (messageBroker as any).spawnHistory = new Map();
  (messageBroker as any).arsFailureCooldown = new Map();
  /* eslint-enable @typescript-eslint/no-explicit-any */
}

describe('MessageBroker — ARS_* auto-spawn failure handling (Sprint 7.1 T10)', () => {
  let notifications: unknown[];
  let notificationHandler: (data: unknown) => void;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-28T12:00:00.000Z'));
    mockReaddirSync.mockReset().mockReturnValue([]);
    mockReadFileSync.mockReset().mockReturnValue('[]');
    mockWriteFileSync.mockReset();
    mockExistsSync.mockReset().mockReturnValue(true);
    mockMkdirSync.mockReset();
    mockDbRun.mockReset();
    mockDbPrepare.mockReset().mockReturnValue([]);
    mockLoggerInfo.mockReset();
    mockLoggerWarn.mockReset();

    notifications = [];
    notificationHandler = (data: unknown) => notifications.push(data);
    eventBus.on('app:notification', notificationHandler);
  });

  afterEach(() => {
    eventBus.off('app:notification', notificationHandler);
    /* eslint-disable @typescript-eslint/no-explicit-any */
    (messageBroker as any).callbacks = null;
    (messageBroker as any).lastDelivered = new Map();
    (messageBroker as any).spawnHistory = new Map();
    (messageBroker as any).arsFailureCooldown = new Map();
    /* eslint-enable @typescript-eslint/no-explicit-any */
    vi.useRealTimers();
  });

  // ─── InboxPoller path (checkInboxFile) ─────────────────────────────────────

  describe('InboxPoller path', () => {
    /** Drive the private checkInboxFile method directly against a mocked inbox entry. */
    function driveInboxFile(agentId: string, entry: Record<string, unknown>): void {
      mockReadFileSync.mockImplementation((p: unknown) => {
        if (String(p).endsWith(`${agentId}.json`)) return JSON.stringify([entry]);
        return '[]';
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (messageBroker as any).checkInboxFile('C:/fake-inbox-dir', `${agentId}.json`);
    }

    it('ARS_* failure: cools the agent down, replies to the sender, emits app:notification, and leaves the message unread', () => {
      const callbacks = makeCallbacks();
      resetBrokerState(callbacks);

      driveInboxFile('publication-operator', {
        from: 'research-director',
        text: '請開始新論文',
        timestamp: '2026-09-28T11:59:00.000Z',
        read: false,
        project: 'proj-1',
        messageId: 'inbox-msg-1',
      });

      // canAutoSpawn now gates publication-operator for 5 minutes.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((messageBroker as any).canAutoSpawn('publication-operator')).toBe(false);

      // The ORIGINAL message's inbox file must NOT be written back as read
      // — checkInboxFile's write-back only fires when `dirty` is true, and
      // the ARS branch resets it to false so the message is retried once
      // the cooldown clears. (send()'s reply DOES write to the sender's own
      // inbox file via syncToJsonInbox — that's expected, unrelated I/O.)
      expect(mockWriteFileSync.mock.calls.some(([p]) => String(p).endsWith('publication-operator.json'))).toBe(false);

      // Reply sent to the ORIGINAL sender as 'system' (via send() → DB insert).
      // (A second database.run call — markDelivered's UPDATE — also fires
      // because the reply gets delivered to research-director's already-
      // active session; that's expected and not what this assertion is about.)
      const insertParams = findInsertMessageCall();
      expect(insertParams).toBeDefined();
      expect(insertParams![1]).toBe('system'); // from_agent
      expect(insertParams![2]).toBe('research-director'); // to_agent (original sender)
      expect(String(insertParams![3])).toContain('publication-operator');
      expect(String(insertParams![3])).toContain('ARS_PATH_NOT_SET');
      expect(String(insertParams![3])).toContain('設定 → 學術出版部');

      // UI notification emitted with the documented shape.
      expect(notifications).toHaveLength(1);
      expect(notifications[0]).toMatchObject({
        level: 'error',
        code: 'ARS_PATH_NOT_SET',
        source: 'message-broker',
        agentId: 'publication-operator',
      });
    });

    it('cooldown blocks a second auto-spawn attempt for the same agent (no repeat spawnSession call)', () => {
      const callbacks = makeCallbacks();
      resetBrokerState(callbacks);

      driveInboxFile('publication-operator', {
        from: 'research-director',
        text: 'msg 1',
        timestamp: '2026-09-28T11:59:00.000Z',
        read: false,
        project: 'proj-1',
        messageId: 'inbox-msg-1',
      });
      expect(callbacks.spawnSession).toHaveBeenCalledTimes(1);

      // A second, distinct unread message for the SAME agent, still within
      // the 5-minute cooldown window.
      driveInboxFile('publication-operator', {
        from: 'research-director',
        text: 'msg 2',
        timestamp: '2026-09-28T11:59:30.000Z',
        read: false,
        project: 'proj-1',
        messageId: 'inbox-msg-2',
      });

      // spawnSession must not have been attempted again — canAutoSpawn
      // short-circuited before reaching the try/catch this time.
      expect(callbacks.spawnSession).toHaveBeenCalledTimes(1);
      // ...and therefore no duplicate notification either.
      expect(notifications).toHaveLength(1);
    });

    it('cooldown expires after 5 minutes and a fresh attempt can spawn again', () => {
      const callbacks = makeCallbacks();
      resetBrokerState(callbacks);

      driveInboxFile('publication-operator', {
        from: 'research-director',
        text: 'msg 1',
        timestamp: '2026-09-28T11:59:00.000Z',
        read: false,
        project: 'proj-1',
        messageId: 'inbox-msg-1',
      });
      expect(callbacks.spawnSession).toHaveBeenCalledTimes(1);

      vi.setSystemTime(new Date('2026-09-28T12:05:01.000Z')); // > 5 min later

      driveInboxFile('publication-operator', {
        from: 'research-director',
        text: 'msg 2',
        timestamp: '2026-09-28T12:05:00.000Z',
        read: false,
        project: 'proj-1',
        messageId: 'inbox-msg-2',
      });

      expect(callbacks.spawnSession).toHaveBeenCalledTimes(2);
    });

    it('does not reply when the original sender is already "system" (anti-loop)', () => {
      const callbacks = makeCallbacks();
      resetBrokerState(callbacks);

      driveInboxFile('publication-operator', {
        from: 'system',
        text: '之前的系統通知',
        timestamp: '2026-09-28T11:59:00.000Z',
        read: false,
        project: 'proj-1',
        messageId: 'inbox-msg-system',
      });

      // No reply persisted...
      expect(mockDbRun).not.toHaveBeenCalled();
      // ...but the cooldown and UI notification still happen.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((messageBroker as any).canAutoSpawn('publication-operator')).toBe(false);
      expect(notifications).toHaveLength(1);
    });

    it('non-ARS_ auto-spawn failures are completely unaffected (existing behaviour)', () => {
      const callbacks = makeCallbacks({
        spawnSession: vi.fn(() => {
          throw new Error('ECONNREFUSED: something unrelated broke');
        }),
      });
      resetBrokerState(callbacks);

      driveInboxFile('publication-operator', {
        from: 'research-director',
        text: 'msg 1',
        timestamp: '2026-09-28T11:59:00.000Z',
        read: false,
        project: 'proj-1',
        messageId: 'inbox-msg-1',
      });

      // No cooldown, no reply, no notification — just the pre-T10 warn log.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((messageBroker as any).canAutoSpawn('publication-operator')).toBe(true);
      expect(mockDbRun).not.toHaveBeenCalled();
      expect(notifications).toHaveLength(0);
      expect(mockLoggerWarn).toHaveBeenCalled();
    });
  });

  // ─── tryDeliver path ────────────────────────────────────────────────────────

  describe('tryDeliver path', () => {
    function driveTryDeliver(message: MessageRecord): void {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (messageBroker as any).tryDeliver(message);
    }

    it('ARS_* failure: cools the agent down, replies to the sender, emits app:notification', () => {
      const callbacks = makeCallbacks();
      resetBrokerState(callbacks);

      driveTryDeliver(makeMessage());

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((messageBroker as any).canAutoSpawn('publication-operator')).toBe(false);

      const insertParams = findInsertMessageCall(); // the 'system' reply insert
      expect(insertParams).toBeDefined();
      expect(insertParams![1]).toBe('system');
      expect(insertParams![2]).toBe('research-director');
      expect(insertParams![4]).toBe('proj-1'); // project_id carried over from the original message

      expect(notifications).toHaveLength(1);
      expect(notifications[0]).toMatchObject({
        level: 'error',
        code: 'ARS_PATH_NOT_SET',
        source: 'message-broker',
        agentId: 'publication-operator',
      });
      // T12 gap: the notification's `message` must carry the detail that
      // follows the error-code prefix, not just the bare code.
      expect((notifications[0] as { message: string }).message).toContain(
        '尚未設定 ARS 路徑，請到「設定」填寫 ARS 路徑',
      );
    });

    it('cooldown expires after 5 minutes and a subsequent tryDeliver call can retry auto-spawn (T12 gap)', () => {
      const callbacks = makeCallbacks();
      resetBrokerState(callbacks);

      driveTryDeliver(makeMessage({ id: 'msg-1' }));
      expect(callbacks.spawnSession).toHaveBeenCalledTimes(1);

      vi.setSystemTime(new Date('2026-09-28T12:05:01.000Z')); // > 5 min later

      driveTryDeliver(makeMessage({ id: 'msg-2' }));
      expect(callbacks.spawnSession).toHaveBeenCalledTimes(2);
    });

    it('MN-D: canAutoSpawn deletes the expired cooldown entry instead of leaving it in the map forever', () => {
      const callbacks = makeCallbacks();
      resetBrokerState(callbacks);

      driveTryDeliver(makeMessage());
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cooldownMap: Map<string, unknown> = (messageBroker as any).arsFailureCooldown;
      expect(cooldownMap.has('publication-operator')).toBe(true);

      vi.setSystemTime(new Date('2026-09-28T12:05:01.000Z')); // > 5 min later
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (messageBroker as any).canAutoSpawn('publication-operator');

      expect(cooldownMap.has('publication-operator')).toBe(false);
    });

    it('MN-E: a failure while sending the "system" reply is caught and only warned — it must not escape to the original tryDeliver caller, and the notification still went out', () => {
      const callbacks = makeCallbacks();
      resetBrokerState(callbacks);
      mockDbRun.mockImplementation((sql: string) => {
        if (String(sql).includes('INSERT INTO messages')) {
          throw new Error('database is locked');
        }
      });

      expect(() => driveTryDeliver(makeMessage())).not.toThrow();

      // The notification must still have gone out even though the reply's
      // own persistence failed.
      expect(notifications).toHaveLength(1);
      expect(notifications[0]).toMatchObject({ code: 'ARS_PATH_NOT_SET', agentId: 'publication-operator' });
      expect(mockLoggerWarn).toHaveBeenCalled();
    });

    it('cooldown blocks a second tryDeliver auto-spawn attempt for the same agent', () => {
      const callbacks = makeCallbacks();
      resetBrokerState(callbacks);

      driveTryDeliver(makeMessage({ id: 'msg-1' }));
      expect(callbacks.spawnSession).toHaveBeenCalledTimes(1);

      driveTryDeliver(makeMessage({ id: 'msg-2' })); // same toAgent, still pending
      expect(callbacks.spawnSession).toHaveBeenCalledTimes(1);
      expect(notifications).toHaveLength(1); // deduped
    });

    it('does not reply when the original sender is already "system" (anti-loop)', () => {
      const callbacks = makeCallbacks();
      resetBrokerState(callbacks);

      driveTryDeliver(makeMessage({ fromAgent: 'system' }));

      expect(mockDbRun).not.toHaveBeenCalled();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((messageBroker as any).canAutoSpawn('publication-operator')).toBe(false);
      expect(notifications).toHaveLength(1);
    });

    it('non-ARS_ auto-spawn failures are completely unaffected (existing behaviour)', () => {
      const callbacks = makeCallbacks({
        spawnSession: vi.fn(() => {
          throw new Error('ECONNREFUSED: something unrelated broke');
        }),
      });
      resetBrokerState(callbacks);

      driveTryDeliver(makeMessage());

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((messageBroker as any).canAutoSpawn('publication-operator')).toBe(true);
      expect(mockDbRun).not.toHaveBeenCalled();
      expect(notifications).toHaveLength(0);
      expect(mockLoggerWarn).toHaveBeenCalled();
    });

    it('dedup: calling the private failure handler twice for the same target+code within the window only notifies once', () => {
      // Direct unit-level check of the dedup guard itself (belt-and-suspenders
      // — canAutoSpawn already prevents this from happening via the normal
      // auto-spawn flow, see the "cooldown blocks a second..." test above).
      resetBrokerState(makeCallbacks());
      const err = new Error('ARS_INSTALL_INCOMPLETE: 缺少 skills/deep-research/SKILL.md');

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const handler = (messageBroker as any).handleArsAutoSpawnFailure.bind(messageBroker);
      handler('publication-operator', 'research-director', 'proj-1', '第一次', err);
      handler('publication-operator', 'research-director', 'proj-1', '第二次', err);

      expect(notifications).toHaveLength(1);
      const insertCalls = mockDbRun.mock.calls.filter(([sql]) => String(sql).includes('INSERT INTO messages'));
      expect(insertCalls).toHaveLength(1); // only the first call's reply was ever persisted
    });

    it('a different error code for the same agent within the window notifies again', () => {
      resetBrokerState(makeCallbacks());
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const handler = (messageBroker as any).handleArsAutoSpawnFailure.bind(messageBroker);
      handler('publication-operator', 'research-director', 'proj-1', 'm1', new Error('ARS_PATH_NOT_SET: x'));
      handler('publication-operator', 'research-director', 'proj-1', 'm2', new Error('ARS_INSTALL_INCOMPLETE: y'));

      expect(notifications).toHaveLength(2);
      expect((notifications[0] as { code: string }).code).toBe('ARS_PATH_NOT_SET');
      expect((notifications[1] as { code: string }).code).toBe('ARS_INSTALL_INCOMPLETE');
    });

    it('MN-G: anti-loop end-to-end — the "system" reply target is ALSO offline and its own auto-spawn ALSO fails with ARS_, but no second reply is produced', () => {
      // Everyone is offline and every auto-spawn attempt fails with ARS_ —
      // this is the cascade the G2 review round-2 report walked through by
      // hand (§2): research-director (R) messages publication-operator (P);
      // P's auto-spawn fails → system replies to R; R is ALSO offline, so
      // send() → tryDeliver(system→R) ALSO tries to auto-spawn R, which
      // ALSO fails with ARS_ → handleArsAutoSpawnFailure(R, from='system')
      // — and the fromAgent === 'system' check stops it right there.
      const callbacks: BrokerCallbacks = {
        findActiveSessionByAgent: () => undefined, // nobody has an active session
        spawnSession: vi.fn(() => {
          throw new Error('ARS_PATH_NOT_SET: 尚未設定 ARS 路徑');
        }),
        getSession: (): BrokerSessionView | undefined => undefined,
      };
      resetBrokerState(callbacks);

      driveTryDeliver(makeMessage()); // research-director → publication-operator

      // Exactly ONE system reply was EVER persisted (system → research-director).
      // A second one (system → research-director's own failed auto-spawn) must
      // not exist — that's precisely what the anti-loop check prevents.
      const insertCalls = mockDbRun.mock.calls.filter(([sql]) => String(sql).includes('INSERT INTO messages'));
      expect(insertCalls).toHaveLength(1);
      expect(insertCalls[0][1][1]).toBe('system');
      expect(insertCalls[0][1][2]).toBe('research-director');

      // Two notifications: publication-operator's original failure, and
      // research-director's own (system-triggered) auto-spawn failure.
      expect(notifications).toHaveLength(2);
      expect((notifications[0] as { agentId: string }).agentId).toBe('publication-operator');
      expect((notifications[1] as { agentId: string }).agentId).toBe('research-director');

      // Both ended up cooled down; no third level of cascade was attempted.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((messageBroker as any).canAutoSpawn('publication-operator')).toBe(false);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((messageBroker as any).canAutoSpawn('research-director')).toBe(false);
      expect(callbacks.spawnSession).toHaveBeenCalledTimes(2); // P once, R once — never a 3rd
    });
  });
});
