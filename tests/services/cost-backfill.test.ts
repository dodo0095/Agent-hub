// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Mocks ────────────────────────────────────────────────────────────────────
//
// runCostBackfill talks to two singletons: `database` (SQL queries) and
// `eventBus` (event emission). Tests need to control both deterministically.
//
//   - `database` is replaced by an in-memory store keyed by SQL fragment so
//     the test can seed candidate rows and assert update calls.
//   - `eventBus` is replaced by a real Node EventEmitter via getter so tests
//     subscribe before the module under test loads. The `emitSessionEvent`
//     and `emit` paths are both captured.

interface DbRow {
  id: string;
  started_at: string;
  cost_usd: number;
  input_tokens: number;
  output_tokens: number;
  turns_count: number;
  claude_conversation_id: string | null;
  metadata: string | null;
}

const dbState: { rows: DbRow[]; runCalls: Array<{ sql: string; params: unknown[] }> } = {
  rows: [],
  runCalls: [],
};

vi.mock('../../electron/services/database', () => ({
  database: {
    prepare: (sql: string, params?: unknown[]) => {
      // Two queries to stub: candidate scan + metadata read-back.
      if (/FROM claude_sessions\s+WHERE cost_usd = 0/i.test(sql)) {
        const cutoff = String(params?.[0] ?? '');
        return dbState.rows
          .filter((r) => r.cost_usd === 0 && r.started_at >= cutoff)
          .map((r) => ({
            id: r.id,
            started_at: r.started_at,
            claude_conversation_id: r.claude_conversation_id,
          }));
      }
      if (/SELECT metadata FROM claude_sessions WHERE id = \?/i.test(sql)) {
        const id = String(params?.[0] ?? '');
        const row = dbState.rows.find((r) => r.id === id);
        return row ? [{ metadata: row.metadata }] : [];
      }
      return [];
    },
    run: (sql: string, params?: unknown[]) => {
      dbState.runCalls.push({ sql, params: params ?? [] });
      // Apply the cost update so subsequent queries see new state.
      if (/UPDATE claude_sessions\s+SET cost_usd = \?/i.test(sql)) {
        const [cost, inp, out, turns, conv, id] = params as [
          number,
          number,
          number,
          number,
          string,
          string,
        ];
        const row = dbState.rows.find((r) => r.id === id);
        if (row) {
          row.cost_usd = cost;
          row.input_tokens = inp;
          row.output_tokens = out;
          row.turns_count = turns;
          if (!row.claude_conversation_id) row.claude_conversation_id = conv;
        }
      } else if (/UPDATE claude_sessions SET metadata = \? WHERE id = \?/i.test(sql)) {
        const [meta, id] = params as [string, string];
        const row = dbState.rows.find((r) => r.id === id);
        if (row) row.metadata = meta;
      }
    },
  },
}));

import { EventEmitter } from 'events';
const fakeBus = new EventEmitter();
const sessionEvents: unknown[] = [];
const completeEvents: unknown[] = [];

vi.mock('../../electron/services/event-bus', () => ({
  eventBus: {
    emit: (name: string, data: unknown) => fakeBus.emit(name, data),
    on: (name: string, h: (d: unknown) => void) => fakeBus.on(name, h),
    emitSessionEvent: (e: unknown) => {
      sessionEvents.push(e);
      fakeBus.emit('session:event', e);
    },
  },
}));

vi.mock('../../electron/utils/logger', () => ({
  logger: { info: () => {}, warn: () => {}, error: () => {} },
}));

// Subscribe BEFORE importing the module under test so the bulk event is captured.
fakeBus.on('cost:backfill-complete', (data) => completeEvents.push(data));

// Dynamic import so vi.mock takes effect.
const { runCostBackfill } = await import('../../electron/services/cost-backfill');

// ─── Fixture helpers ──────────────────────────────────────────────────────────

let tmpRoot: string;

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'cost-backfill-'));
  dbState.rows = [];
  dbState.runCalls = [];
  sessionEvents.length = 0;
  completeEvents.length = 0;
});

afterEach(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
});

function writeJsonlInProject(projectDir: string, convId: string, events: unknown[]): string {
  const dir = join(tmpRoot, projectDir);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${convId}.jsonl`);
  writeFileSync(path, events.map((e) => JSON.stringify(e)).join('\n'), 'utf-8');
  return path;
}

function seedSession(row: Partial<DbRow> & { id: string; started_at: string }): void {
  dbState.rows.push({
    cost_usd: 0,
    input_tokens: 0,
    output_tokens: 0,
    turns_count: 0,
    claude_conversation_id: null,
    metadata: null,
    ...row,
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('runCostBackfill', () => {
  it('returns zero counts when no JSONLs exist', async () => {
    const result = await runCostBackfill({ projectsRoot: tmpRoot, sinceDays: 7 });
    expect(result.scanned).toBe(0);
    expect(result.matched).toBe(0);
    expect(result.written).toBe(0);
    expect(result.totalUsdRecovered).toBe(0);
    expect(completeEvents).toHaveLength(1);
  });

  it('returns zero counts when DB has no candidate sessions', async () => {
    writeJsonlInProject('proj-a', 'conv-1', [
      { timestamp: new Date().toISOString(), type: 'user' },
      {
        type: 'assistant',
        message: {
          model: 'claude-sonnet-4-6',
          usage: { input_tokens: 1000, output_tokens: 1000 },
        },
      },
    ]);
    const result = await runCostBackfill({ projectsRoot: tmpRoot, sinceDays: 7 });
    expect(result.scanned).toBe(1);
    expect(result.candidates).toBe(0);
    expect(result.matched).toBe(0);
    expect(completeEvents).toHaveLength(1);
  });

  it('matches a JSONL to a candidate session within the time window and writes cost', async () => {
    const now = Date.now();
    const sessionStartIso = new Date(now).toISOString();
    const jsonlStartIso = new Date(now + 30_000).toISOString(); // 30s after session start

    writeJsonlInProject('proj-a', 'conv-aaa', [
      { timestamp: jsonlStartIso, type: 'user' },
      {
        type: 'assistant',
        message: {
          model: 'claude-sonnet-4-6',
          // Cost: (1000×3 + 1000×15) / 1M = $0.018
          usage: { input_tokens: 1000, output_tokens: 1000 },
        },
      },
    ]);

    seedSession({ id: 'sess-1', started_at: sessionStartIso });

    const result = await runCostBackfill({
      projectsRoot: tmpRoot,
      sinceDays: 7,
      windowMs: 120_000,
    });

    expect(result.candidates).toBe(1);
    expect(result.matched).toBe(1);
    expect(result.written).toBe(1);
    expect(result.totalUsdRecovered).toBeCloseTo(0.018, 4);

    // DB row got updated
    expect(dbState.rows[0]?.cost_usd).toBeCloseTo(0.018, 4);
    expect(dbState.rows[0]?.input_tokens).toBe(1000);
    expect(dbState.rows[0]?.claude_conversation_id).toBe('conv-aaa');

    // Per-row usage_update event fired (drives renderer live-update)
    expect(sessionEvents).toHaveLength(1);
    expect((sessionEvents[0] as { sessionId: string }).sessionId).toBe('sess-1');
    expect((sessionEvents[0] as { subtype: string }).subtype).toBe('usage_update');

    // Bulk completion event fired exactly once
    expect(completeEvents).toHaveLength(1);
    expect((completeEvents[0] as { written: number }).written).toBe(1);
  });

  it('does not match candidates outside the time window', async () => {
    const now = Date.now();
    const sessionStartIso = new Date(now).toISOString();
    // JSONL starts 5 minutes after session — outside 120s default window
    const jsonlStartIso = new Date(now + 5 * 60_000).toISOString();

    writeJsonlInProject('proj-a', 'conv-far', [
      { timestamp: jsonlStartIso, type: 'user' },
      {
        type: 'assistant',
        message: {
          model: 'claude-sonnet-4-6',
          usage: { input_tokens: 1000, output_tokens: 0 },
        },
      },
    ]);
    seedSession({ id: 'sess-far', started_at: sessionStartIso });

    const result = await runCostBackfill({ projectsRoot: tmpRoot, sinceDays: 7 });
    expect(result.candidates).toBe(1);
    expect(result.matched).toBe(0);
    expect(result.written).toBe(0);
    expect(sessionEvents).toHaveLength(0);
  });

  it('attributes a JSONL to its single closest session (greedy)', async () => {
    const now = Date.now();
    const jsonlIso = new Date(now).toISOString();

    writeJsonlInProject('proj-a', 'conv-shared', [
      { timestamp: jsonlIso, type: 'user' },
      {
        type: 'assistant',
        message: {
          model: 'claude-sonnet-4-6',
          usage: { input_tokens: 1000, output_tokens: 1000 },
        },
      },
    ]);
    // Two candidates within window — only the closest gets the cost
    seedSession({ id: 'sess-far',   started_at: new Date(now - 60_000).toISOString() });
    seedSession({ id: 'sess-close', started_at: new Date(now + 5_000).toISOString() });

    const result = await runCostBackfill({ projectsRoot: tmpRoot, sinceDays: 7 });
    expect(result.matched).toBe(1);
    expect(result.written).toBe(1);
    const updated = dbState.rows.find((r) => r.cost_usd > 0);
    expect(updated?.id).toBe('sess-close');
  });

  it('aggregates totalUsdRecovered across multiple matched sessions', async () => {
    const now = Date.now();

    writeJsonlInProject('proj-a', 'conv-1', [
      { timestamp: new Date(now).toISOString() },
      {
        type: 'assistant',
        message: {
          model: 'claude-sonnet-4-6',
          usage: { input_tokens: 1000, output_tokens: 1000 }, // $0.018
        },
      },
    ]);
    writeJsonlInProject('proj-b', 'conv-2', [
      { timestamp: new Date(now + 30 * 60_000).toISOString() }, // 30 min later
      {
        type: 'assistant',
        message: {
          model: 'claude-sonnet-4-6',
          usage: { input_tokens: 2000, output_tokens: 2000 }, // $0.036
        },
      },
    ]);

    seedSession({ id: 'sess-1', started_at: new Date(now).toISOString() });
    seedSession({ id: 'sess-2', started_at: new Date(now + 30 * 60_000).toISOString() });

    const result = await runCostBackfill({ projectsRoot: tmpRoot, sinceDays: 7 });
    expect(result.matched).toBe(2);
    expect(result.written).toBe(2);
    expect(result.totalUsdRecovered).toBeCloseTo(0.054, 4);
    expect(sessionEvents).toHaveLength(2);
  });

  it('stamps backfill metadata into the session row', async () => {
    const now = Date.now();
    writeJsonlInProject('proj-a', 'conv-meta', [
      { timestamp: new Date(now).toISOString() },
      {
        type: 'assistant',
        message: {
          model: 'claude-sonnet-4-6',
          usage: { input_tokens: 1000, output_tokens: 0 },
        },
      },
    ]);
    seedSession({ id: 'sess-meta', started_at: new Date(now).toISOString() });

    await runCostBackfill({ projectsRoot: tmpRoot, sinceDays: 7 });

    const row = dbState.rows.find((r) => r.id === 'sess-meta');
    expect(row?.metadata).not.toBeNull();
    const meta = JSON.parse(row!.metadata!);
    expect(meta.cost_backfilled_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(meta.cost_backfilled_from).toBe('conv-meta.jsonl');
    expect(typeof meta.cost_backfilled_delta_ms).toBe('number');
  });
});
