// @vitest-environment node
import { existsSync, mkdtempSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import {
  parseJsonlUsage,
  getJsonlFirstTimestamp,
  findJsonlByStartTime,
} from '../../electron/services/jsonl-usage-tracker';

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'jsonl-usage-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function writeJsonl(events: unknown[]): string {
  const path = join(tmpDir, 'conv.jsonl');
  writeFileSync(path, events.map((e) => JSON.stringify(e)).join('\n'), 'utf-8');
  return path;
}

describe('parseJsonlUsage', () => {
  it('returns zeros when the file does not exist', () => {
    const usage = parseJsonlUsage(join(tmpDir, 'nope.jsonl'));
    expect(usage.costUsd).toBe(0);
    expect(usage.inputTokens).toBe(0);
    expect(usage.outputTokens).toBe(0);
    expect(usage.turnsCount).toBe(0);
    expect(usage.model).toBeNull();
  });

  it('returns zeros for an empty file', () => {
    const path = join(tmpDir, 'empty.jsonl');
    writeFileSync(path, '', 'utf-8');
    const usage = parseJsonlUsage(path);
    expect(usage.costUsd).toBe(0);
    expect(usage.turnsCount).toBe(0);
  });

  it('skips events without a usage block', () => {
    const path = writeJsonl([
      { type: 'human', message: 'hello' },
      { type: 'system', operation: 'startup' },
    ]);
    const usage = parseJsonlUsage(path);
    expect(usage.turnsCount).toBe(0);
    expect(usage.costUsd).toBe(0);
  });

  it('aggregates usage across multiple assistant events with sonnet pricing', () => {
    // sonnet-4-6 pricing: input=$3/M, output=$15/M, cache_create_5m=$3.75/M, cache_read=$0.30/M
    const path = writeJsonl([
      {
        type: 'assistant',
        message: {
          model: 'claude-sonnet-4-6',
          usage: {
            input_tokens: 1000,
            output_tokens: 500,
            cache_creation_input_tokens: 2000,
            cache_read_input_tokens: 4000,
            cache_creation: { ephemeral_5m_input_tokens: 2000, ephemeral_1h_input_tokens: 0 },
          },
        },
      },
      {
        type: 'assistant',
        message: {
          model: 'claude-sonnet-4-6',
          usage: {
            input_tokens: 500,
            output_tokens: 300,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 6000,
          },
        },
      },
    ]);
    const usage = parseJsonlUsage(path);
    expect(usage.inputTokens).toBe(1500);
    expect(usage.outputTokens).toBe(800);
    expect(usage.cacheCreateTokens).toBe(2000);
    expect(usage.cacheReadTokens).toBe(10_000);
    expect(usage.turnsCount).toBe(2);
    expect(usage.model).toBe('claude-sonnet-4-6');

    // Expected cost:
    //   input:        1500 × $3 / 1M     = $0.0045
    //   output:        800 × $15 / 1M    = $0.0120
    //   cache_5m:     2000 × $3.75 / 1M  = $0.0075
    //   cache_read: 10_000 × $0.30 / 1M  = $0.0030
    //   total                            = $0.0270
    expect(usage.costUsd).toBeCloseTo(0.027, 4);
  });

  it('prefers ephemeral_5m / ephemeral_1h breakdown when present', () => {
    const path = writeJsonl([
      {
        type: 'assistant',
        message: {
          model: 'claude-sonnet-4-6',
          usage: {
            input_tokens: 0,
            output_tokens: 0,
            cache_creation_input_tokens: 1000, // legacy total
            cache_read_input_tokens: 0,
            cache_creation: {
              ephemeral_5m_input_tokens: 800,
              ephemeral_1h_input_tokens: 200,
            },
          },
        },
      },
    ]);
    const usage = parseJsonlUsage(path);
    // 5m at $3.75/M + 1h at $6/M
    //   = (800 × 3.75 + 200 × 6) / 1M = (3000 + 1200) / 1M = 0.0042
    expect(usage.costUsd).toBeCloseTo(0.0042, 4);
    expect(usage.cacheCreateTokens).toBe(1000);
  });

  it('applies opus pricing when the model is opus-family', () => {
    const path = writeJsonl([
      {
        type: 'assistant',
        message: {
          model: 'claude-opus-4-1',
          usage: { input_tokens: 1000, output_tokens: 1000 },
        },
      },
    ]);
    const usage = parseJsonlUsage(path);
    // opus: input $15/M, output $75/M
    //   = (1000 × 15 + 1000 × 75) / 1M = 0.090
    expect(usage.costUsd).toBeCloseTo(0.09, 4);
    expect(usage.model).toBe('claude-opus-4-1');
  });

  it('prices each turn at its own model when models switch mid-session', () => {
    const path = writeJsonl([
      {
        type: 'assistant',
        message: {
          model: 'claude-sonnet-4-6',
          usage: { input_tokens: 1000, output_tokens: 0 },
        },
      },
      {
        type: 'assistant',
        message: {
          model: 'claude-opus-4-1',
          usage: { input_tokens: 1000, output_tokens: 0 },
        },
      },
    ]);
    const usage = parseJsonlUsage(path);
    // sonnet 1000×$3 + opus 1000×$15 = 0.003 + 0.015 = 0.018
    expect(usage.costUsd).toBeCloseTo(0.018, 4);
  });

  it('falls back to sonnet pricing for unknown models', () => {
    const path = writeJsonl([
      {
        type: 'assistant',
        message: {
          model: 'claude-sonnet-99-experimental',
          usage: { input_tokens: 1000, output_tokens: 0 },
        },
      },
    ]);
    const usage = parseJsonlUsage(path);
    // Prefix match → sonnet pricing
    expect(usage.costUsd).toBeCloseTo(0.003, 4);
  });

  it('skips malformed JSONL lines without throwing', () => {
    const path = join(tmpDir, 'bad.jsonl');
    writeFileSync(
      path,
      [
        '{ this is not json',
        JSON.stringify({
          type: 'assistant',
          message: {
            model: 'claude-sonnet-4-6',
            usage: { input_tokens: 100, output_tokens: 0 },
          },
        }),
        '',
        'also not json',
      ].join('\n'),
      'utf-8',
    );
    const usage = parseJsonlUsage(path);
    expect(usage.inputTokens).toBe(100);
    expect(usage.turnsCount).toBe(1);
  });

  // Live calibration: when a real Claude conversation log exists from the
  // boss's test session, parse it and confirm the parser produces a sane
  // cost. This session's cache is entirely 1h-ephemeral (priced $6/M not
  // $3.75/M), so we expect ~$1.07. Skipped silently when the file isn't
  // present (CI / fresh clones).
  it('parses the real test session 6a16e88b JSONL on disk (when available)', () => {
    const real =
      'C:/Users/Bandai/.claude/projects/C--Users-Bandai-Desktop-AgentHub-Agent-hub/6a16e88b-5f6e-4433-a31f-47375e872d0d.jsonl';
    if (!existsSync(real)) return;
    const usage = parseJsonlUsage(real);
    // 67 input + 6586 output + 118029 cc_1h + 883289 cr  →
    //   (67×3 + 6586×15 + 118029×6 + 883289×0.30) / 1M = $1.0722
    expect(usage.costUsd).toBeGreaterThan(1.05);
    expect(usage.costUsd).toBeLessThan(1.10);
    expect(usage.outputTokens).toBeGreaterThan(6000);
    expect(usage.turnsCount).toBeGreaterThan(30);
    expect(usage.model).toMatch(/sonnet/);
  });

  it('matches the test session 90a7c740 expected cost (~$0.81)', () => {
    // Real-world calibration: the boss ran a test session that consumed
    //   input=67, output=6586, cache_create=118029, cache_read=883289
    // Expected cost (sonnet-4-6, all cache as 5m for simplicity):
    //   (67×3 + 6586×15 + 118029×3.75 + 883289×0.30) / 1M
    //   = (201 + 98790 + 442608.75 + 264986.7) / 1M
    //   = $0.8066
    const path = writeJsonl([
      {
        type: 'assistant',
        message: {
          model: 'claude-sonnet-4-6',
          usage: {
            input_tokens: 67,
            output_tokens: 6586,
            cache_creation_input_tokens: 118029,
            cache_read_input_tokens: 883289,
          },
        },
      },
    ]);
    const usage = parseJsonlUsage(path);
    expect(usage.costUsd).toBeCloseTo(0.8066, 2);
    expect(usage.outputTokens).toBe(6586);
  });
});

describe('getJsonlFirstTimestamp', () => {
  it('returns null for missing files', () => {
    expect(getJsonlFirstTimestamp(join(tmpDir, 'nope.jsonl'))).toBeNull();
  });

  it('returns null when no event has a timestamp', () => {
    const path = writeJsonl([{ type: 'user', message: { content: 'hi' } }]);
    expect(getJsonlFirstTimestamp(path)).toBeNull();
  });

  it('reads the first event timestamp as epoch ms', () => {
    const iso = '2026-05-08T05:30:00.000Z';
    const path = writeJsonl([
      { timestamp: iso, type: 'user' },
      { timestamp: '2026-05-08T05:31:00.000Z', type: 'assistant' },
    ]);
    expect(getJsonlFirstTimestamp(path)).toBe(Date.parse(iso));
  });

  it('skips malformed lines and falls through to a valid one', () => {
    const path = join(tmpDir, 'mixed.jsonl');
    const iso = '2026-05-08T06:00:00.000Z';
    writeFileSync(path, `{not-json}\n${JSON.stringify({ timestamp: iso })}\n`, 'utf-8');
    expect(getJsonlFirstTimestamp(path)).toBe(Date.parse(iso));
  });
});

describe('findJsonlByStartTime', () => {
  function writeNamed(filename: string, events: unknown[]): string {
    const path = join(tmpDir, filename);
    writeFileSync(path, events.map((e) => JSON.stringify(e)).join('\n'), 'utf-8');
    return path;
  }

  it('returns null for missing dir', () => {
    expect(findJsonlByStartTime(join(tmpDir, 'nope'), Date.now())).toBeNull();
  });

  it('matches a JSONL whose first timestamp is within the window', () => {
    // Use "now" for the target so the mtime quick-reject (which compares mtime
    // to target) doesn't filter out our just-written test files.
    const now = Date.now();
    const targetIso = new Date(now).toISOString();
    const innerIso = new Date(now + 30_000).toISOString();
    writeNamed('aaaa-1111-2222-3333.jsonl', [
      { timestamp: innerIso, type: 'user' },
    ]);
    const match = findJsonlByStartTime(tmpDir, Date.parse(targetIso), 60_000);
    expect(match).not.toBeNull();
    expect(match!.convId).toBe('aaaa-1111-2222-3333');
    expect(match!.deltaMs).toBeLessThanOrEqual(30_000);
  });

  it('rejects files outside the window', () => {
    const now = Date.now();
    writeNamed('too-old.jsonl', [
      // First-event timestamp is 2 hours before target — clearly outside window
      { timestamp: new Date(now - 2 * 60 * 60 * 1000).toISOString(), type: 'user' },
    ]);
    expect(findJsonlByStartTime(tmpDir, now, 60_000)).toBeNull();
  });

  it('picks the closest match when multiple candidates qualify', () => {
    const now = Date.now();
    writeNamed('further.jsonl', [{ timestamp: new Date(now - 60_000).toISOString() }]); // 60s before
    writeNamed('closer.jsonl',  [{ timestamp: new Date(now + 10_000).toISOString() }]); // 10s after
    const match = findJsonlByStartTime(tmpDir, now, 120_000);
    expect(match).not.toBeNull();
    expect(match!.convId).toBe('closer');
  });
});
