import { database } from './database';
import { logger } from '../utils/logger';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SessionUsage {
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  toolCallsCount: number;
  turnsCount: number;
}

// ─── Interactive token / cost parsing ────────────────────────────────────────

/**
 * Parse token usage from Claude Code TUI output in interactive mode.
 *
 * Claude Code displays usage info in its status line, e.g.:
 *   ">"  with token counts, or after each response showing total usage.
 * We look for patterns like "12.3k total tokens" or "input: 800 output: 400"
 * and update the provided usage object in-place, taking the maximum seen value
 * (Claude Code shows cumulative totals, so we always prefer the latest/largest).
 *
 * @returns true if any field was updated
 */
export function parseInteractiveTokenUsage(usage: SessionUsage, data: string): boolean {
  let updated = false;

  // Pattern 1: Claude Code cost line — "$0.05 total cost" or "cost: $0.123"
  const costMatch = data.match(/\$(\d+\.?\d*)\s*(?:total\s*)?cost/i);
  if (costMatch) {
    const cost = parseFloat(costMatch[1]);
    if (cost > usage.costUsd) {
      usage.costUsd = cost;
      updated = true;
    }
  }

  // Pattern 2: Token count from Claude Code status — e.g. "12.3k tokens"
  // Claude Code shows cumulative totals; we take the latest (largest) value.
  const tokenMatches = data.matchAll(/(\d+(?:\.\d+)?)\s*(k|m)?\s*total\s*tokens/gi);
  for (const m of tokenMatches) {
    let count = parseFloat(m[1]);
    const unit = (m[2] || '').toLowerCase();
    if (unit === 'k') count *= 1000;
    else if (unit === 'm') count *= 1000000;
    const total = Math.round(count);
    // Assume roughly 30/70 input/output split if we only get total
    if (total > usage.inputTokens + usage.outputTokens) {
      usage.inputTokens = Math.round(total * 0.3);
      usage.outputTokens = total - usage.inputTokens;
      updated = true;
    }
  }

  // Pattern 3: Explicit input/output breakdown — "input: 1234 output: 5678"
  const ioMatch = data.match(/input[:\s]+(\d+(?:\.\d+)?k?)[\s,]*output[:\s]+(\d+(?:\.\d+)?k?)/i);
  if (ioMatch) {
    const parseTokenCount = (s: string): number => {
      const lower = s.toLowerCase();
      if (lower.endsWith('k')) return parseFloat(lower) * 1000;
      return parseInt(lower, 10);
    };
    const inp = parseTokenCount(ioMatch[1]);
    const out = parseTokenCount(ioMatch[2]);
    if (inp > usage.inputTokens) { usage.inputTokens = Math.round(inp); updated = true; }
    if (out > usage.outputTokens) { usage.outputTokens = Math.round(out); updated = true; }
  }

  // Pattern 4: Our own statusLine format — "tok: 6.7k  $0.0523"
  // Matches output from session-statusline.js: "{model}  ctx: X%  tok: X[k|m]  $X.XXXX"
  // This is a fallback in case the file-based mechanism (AGENTHUB_USAGE_FILE) fails.
  const slMatch = data.match(/tok:\s*(\d+(?:\.\d+)?)\s*(k|m)?\s+\$(\d+\.\d+)/i);
  if (slMatch) {
    let total = parseFloat(slMatch[1]);
    const unit = (slMatch[2] || '').toLowerCase();
    if (unit === 'k') total *= 1000;
    else if (unit === 'm') total *= 1000000;
    total = Math.round(total);
    const cost = parseFloat(slMatch[3]);
    if (total > usage.inputTokens + usage.outputTokens) {
      // Split estimate: 30% input / 70% output (same heuristic as Pattern 2)
      usage.inputTokens = Math.round(total * 0.3);
      usage.outputTokens = total - usage.inputTokens;
      updated = true;
    }
    if (cost > usage.costUsd) {
      usage.costUsd = cost;
      updated = true;
    }
  }

  return updated;
}

// ─── Parsed-event cost accumulation ──────────────────────────────────────────

export interface ParsedEventUsage {
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  type: string;
}

/**
 * Apply token/cost data from a stream-json parsed event to a usage object.
 * Returns true if any cost/token field changed.
 */
export function applyParsedEventUsage(usage: SessionUsage, parsed: ParsedEventUsage): boolean {
  let updated = false;

  if (parsed.inputTokens) { usage.inputTokens += parsed.inputTokens; updated = true; }
  if (parsed.outputTokens) { usage.outputTokens += parsed.outputTokens; updated = true; }
  if (parsed.costUsd) { usage.costUsd += parsed.costUsd; updated = true; }
  if (parsed.type === 'tool_use') { usage.toolCallsCount++; updated = true; }
  if (parsed.type === 'assistant') { usage.turnsCount++; updated = true; }

  return updated;
}

/**
 * Override (not accumulate) cost/token fields when a 'result' event arrives,
 * since it carries the final authoritative totals.
 */
export function applyResultEventUsage(usage: SessionUsage, parsed: ParsedEventUsage): void {
  if (parsed.costUsd) usage.costUsd = parsed.costUsd;
  if (parsed.inputTokens) usage.inputTokens = parsed.inputTokens;
  if (parsed.outputTokens) usage.outputTokens = parsed.outputTokens;
}

// ─── DB persistence ───────────────────────────────────────────────────────────

/**
 * Persist final cost/token usage to the database when a session ends.
 */
export function persistSessionCost(sessionId: string, usage: SessionUsage): void {
  try {
    database.run(
      `UPDATE claude_sessions
       SET input_tokens = ?, output_tokens = ?, cost_usd = ?,
           tool_calls_count = ?, turns_count = ?
       WHERE id = ?`,
      [
        usage.inputTokens,
        usage.outputTokens,
        usage.costUsd,
        usage.toolCallsCount,
        usage.turnsCount,
        sessionId,
      ],
    );
  } catch (err) {
    logger.warn('Failed to persist session cost to DB', err);
  }
}
