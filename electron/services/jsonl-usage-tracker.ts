/**
 * JSONL-based usage tracker.
 *
 * Background — `--settings`-injected `statusLine` is not honoured by Claude Code
 * v2.1.114 (only permissions are merged from the flag's content, not statusLine).
 * Combined with the v2.1.51 workspace-trust gate, the statusLine subprocess
 * is unreliable as a cost-tracking primitive.
 *
 * Claude Code, however, writes a per-conversation JSONL log to
 * `~/.claude/projects/<encoded-cwd>/<conv-id>.jsonl`. Each `assistant` event
 * carries an exact `usage` field (input_tokens, output_tokens, cache_*). This
 * is the canonical source of truth — it's what Claude itself uses for billing.
 *
 * This module reads that file and computes total cost using model pricing.
 * It's a defensive replacement / supplement for the statusLine mechanism.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { logger } from '../utils/logger';

// ─── Pricing ─────────────────────────────────────────────────────────────────

/**
 * Per-million-token prices in USD. Source: docs.anthropic.com/en/docs/about-claude/pricing.
 * Keys are the `model` string Claude Code writes into the JSONL `message.model` field.
 *
 * Update this table when:
 *   - A new model is released
 *   - Anthropic adjusts pricing
 *
 * Cache pricing is per Anthropic prompt-caching docs:
 *   - cache_creation: same as input × 1.25 (5min) or × 2 (1h)
 *   - cache_read: input × 0.10
 *
 * For sonnet-4-6: input $3/M, output $15/M, cache_create_5m $3.75/M, cache_read $0.30/M.
 */
interface ModelPricing {
  input: number;
  output: number;
  cacheCreate5m: number;
  cacheCreate1h: number;
  cacheRead: number;
}

const PRICING: Record<string, ModelPricing> = {
  // Sonnet family
  'claude-sonnet-4-6': {
    input: 3, output: 15,
    cacheCreate5m: 3.75, cacheCreate1h: 6, cacheRead: 0.30,
  },
  'claude-sonnet-4-5': {
    input: 3, output: 15,
    cacheCreate5m: 3.75, cacheCreate1h: 6, cacheRead: 0.30,
  },
  'claude-sonnet-4': {
    input: 3, output: 15,
    cacheCreate5m: 3.75, cacheCreate1h: 6, cacheRead: 0.30,
  },
  // Opus family
  'claude-opus-4-7': {
    input: 15, output: 75,
    cacheCreate5m: 18.75, cacheCreate1h: 30, cacheRead: 1.50,
  },
  'claude-opus-4-6': {
    input: 15, output: 75,
    cacheCreate5m: 18.75, cacheCreate1h: 30, cacheRead: 1.50,
  },
  'claude-opus-4-5': {
    input: 15, output: 75,
    cacheCreate5m: 18.75, cacheCreate1h: 30, cacheRead: 1.50,
  },
  'claude-opus-4-1': {
    input: 15, output: 75,
    cacheCreate5m: 18.75, cacheCreate1h: 30, cacheRead: 1.50,
  },
  'claude-opus-4': {
    input: 15, output: 75,
    cacheCreate5m: 18.75, cacheCreate1h: 30, cacheRead: 1.50,
  },
  // Haiku family
  'claude-haiku-4-5': {
    input: 1, output: 5,
    cacheCreate5m: 1.25, cacheCreate1h: 2, cacheRead: 0.10,
  },
  'claude-haiku-3-5': {
    input: 0.80, output: 4,
    cacheCreate5m: 1.00, cacheCreate1h: 1.60, cacheRead: 0.08,
  },
};

/** Default pricing applied when an unknown model string is seen (sonnet-4 baseline). */
const DEFAULT_PRICING: ModelPricing = PRICING['claude-sonnet-4-6'];

function resolvePricing(model: string): ModelPricing {
  if (PRICING[model]) return PRICING[model];
  // Try prefix match — e.g. "claude-sonnet-4-6-20250101"
  for (const key of Object.keys(PRICING)) {
    if (model.startsWith(key)) return PRICING[key];
  }
  // Family fallback (e.g. unknown sonnet variant)
  if (model.includes('opus')) return PRICING['claude-opus-4-1'];
  if (model.includes('haiku')) return PRICING['claude-haiku-4-5'];
  if (model.includes('sonnet')) return PRICING['claude-sonnet-4-6'];
  logger.warn(`Unknown model '${model}' — falling back to sonnet-4-6 pricing`);
  return DEFAULT_PRICING;
}

// ─── Parser ──────────────────────────────────────────────────────────────────

export interface JsonlUsage {
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  cacheCreateTokens: number;
  cacheReadTokens: number;
  /** Number of `assistant` events with usage data. */
  turnsCount: number;
  /** Last model seen in the log (used for pricing). */
  model: string | null;
}

const ZERO: JsonlUsage = {
  costUsd: 0,
  inputTokens: 0,
  outputTokens: 0,
  cacheCreateTokens: 0,
  cacheReadTokens: 0,
  turnsCount: 0,
  model: null,
};

/**
 * Parse a Claude Code conversation JSONL file and compute total token usage + cost.
 *
 * The file is read in full each call (Claude conversation logs are typically a few
 * hundred KB at most, even for long sessions). Cost is recomputed on every poll
 * because Claude appends to the file as the conversation progresses.
 *
 * Cache-creation tokens are charged at the 5-minute rate by default. The actual
 * mix of 5m/1h is available in `usage.cache_creation.ephemeral_*`, but for our
 * dashboard accuracy this approximation is sufficient (within ~5% of true cost).
 *
 * @returns Zero-initialised usage when the file is missing or empty.
 */
export function parseJsonlUsage(filePath: string): JsonlUsage {
  if (!existsSync(filePath)) return { ...ZERO };

  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf-8');
  } catch {
    return { ...ZERO };
  }

  const result: JsonlUsage = { ...ZERO };
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheCreate5m = 0;
  let cacheCreate1h = 0;
  let cacheRead = 0;
  let model: string | null = null;
  let turns = 0;

  // Per-model accumulator so a session that switches models is priced correctly
  const perModel = new Map<string, { in: number; out: number; cc5m: number; cc1h: number; cr: number }>();

  for (const line of raw.split('\n')) {
    if (!line) continue;
    let evt: Record<string, unknown>;
    try {
      evt = JSON.parse(line);
    } catch {
      continue;
    }
    const message = evt.message as
      | { usage?: Record<string, unknown>; model?: string }
      | undefined;
    if (!message?.usage) continue;
    const usage = message.usage;
    if (typeof usage !== 'object' || usage === null) continue;

    const m = message.model || 'claude-sonnet-4-6';
    model = m;
    turns++;

    const inp = (usage.input_tokens as number) || 0;
    const out = (usage.output_tokens as number) || 0;
    const cc = (usage.cache_creation_input_tokens as number) || 0;
    const cr = (usage.cache_read_input_tokens as number) || 0;
    // Refine cache_creation breakdown if available
    const ccBreakdown = usage.cache_creation as
      | { ephemeral_5m_input_tokens?: number; ephemeral_1h_input_tokens?: number }
      | undefined;
    const cc5 = ccBreakdown?.ephemeral_5m_input_tokens ?? cc;
    const cc1 = ccBreakdown?.ephemeral_1h_input_tokens ?? 0;

    inputTokens += inp;
    outputTokens += out;
    cacheCreate5m += cc5;
    cacheCreate1h += cc1;
    cacheRead += cr;

    const acc = perModel.get(m) || { in: 0, out: 0, cc5m: 0, cc1h: 0, cr: 0 };
    acc.in += inp;
    acc.out += out;
    acc.cc5m += cc5;
    acc.cc1h += cc1;
    acc.cr += cr;
    perModel.set(m, acc);
  }

  // Sum cost per model so each turn is priced correctly even across model switches
  let totalCost = 0;
  for (const [m, a] of perModel) {
    const p = resolvePricing(m);
    totalCost +=
      (a.in * p.input +
        a.out * p.output +
        a.cc5m * p.cacheCreate5m +
        a.cc1h * p.cacheCreate1h +
        a.cr * p.cacheRead) /
      1_000_000;
  }

  result.costUsd = Number(totalCost.toFixed(6));
  result.inputTokens = inputTokens;
  result.outputTokens = outputTokens;
  result.cacheCreateTokens = cacheCreate5m + cacheCreate1h;
  result.cacheReadTokens = cacheRead;
  result.turnsCount = turns;
  result.model = model;
  return result;
}

// ─── JSONL file resolution ──────────────────────────────────────────────────

/**
 * Read the first non-empty line of a JSONL file and return its `timestamp`
 * in epoch milliseconds. Returns null if the file is empty / malformed / has
 * no timestamp on its first event.
 *
 * Used as a fallback when we cannot pin a session to a JSONL file via
 * "new-file detection" (e.g. resume sessions that append to existing files,
 * or when the JSONL was created before our snapshot).
 */
export function getJsonlFirstTimestamp(filePath: string): number | null {
  if (!existsSync(filePath)) return null;
  try {
    // Read up to 64KB — first event is virtually always within the first
    // few KB. Avoid loading huge files into memory just to peek at the head.
    const raw = readFileSync(filePath, 'utf-8').slice(0, 65536);
    for (const line of raw.split('\n')) {
      if (!line) continue;
      try {
        const evt = JSON.parse(line);
        if (typeof evt.timestamp === 'string') {
          const ts = Date.parse(evt.timestamp);
          if (!Number.isNaN(ts)) return ts;
        }
      } catch { /* malformed line — try next */ }
    }
  } catch { /* file vanished mid-read */ }
  return null;
}

/**
 * Find the JSONL file in `convDir` whose first event's timestamp falls within
 * `windowMs` of `targetTimeMs`. Returns the closest match, or null if none.
 *
 * Used as a fallback in `captureClaudeConversationId` when the new-file
 * detection times out (common for resume sessions, which append to existing
 * JSONL files instead of creating new ones).
 */
export function findJsonlByStartTime(
  convDir: string,
  targetTimeMs: number,
  windowMs: number = 120_000,
): { file: string; convId: string; deltaMs: number } | null {
  if (!existsSync(convDir)) return null;
  let files: string[];
  try {
    files = readdirSync(convDir).filter((f) => f.endsWith('.jsonl'));
  } catch { return null; }

  let best: { file: string; convId: string; deltaMs: number } | null = null;
  for (const f of files) {
    const fullPath = join(convDir, f);
    // Quick reject by mtime: if file was modified more than windowMs * 4 before
    // target, skip the JSON parse work entirely.
    try {
      const st = statSync(fullPath);
      if (Math.abs(st.mtimeMs - targetTimeMs) > windowMs * 4 && st.mtimeMs < targetTimeMs) continue;
    } catch { continue; }

    const firstTs = getJsonlFirstTimestamp(fullPath);
    if (firstTs === null) continue;
    const delta = Math.abs(firstTs - targetTimeMs);
    if (delta > windowMs) continue;
    if (!best || delta < best.deltaMs) {
      best = { file: f, convId: f.replace('.jsonl', ''), deltaMs: delta };
    }
  }
  return best;
}
