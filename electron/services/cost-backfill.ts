/**
 * Cost backfill service — runs at app startup to recover missed cost data.
 *
 * Why this exists:
 *   `session-manager.ts` polls Claude Code's per-conversation JSONL log every
 *   5 seconds while a session is alive (see startJsonlUsagePolling). If
 *   AgentHub was closed mid-session — or never running when a CLI-spawned
 *   session ran — those rows end up with cost_usd = 0 in the DB even though
 *   the JSONL on disk has the real numbers.
 *
 * Strategy (mirrors scripts/backfill-cost.cjs but as an in-process service):
 *   1. Scan ~/.claude/projects/<encoded-cwd>/*.jsonl, parse each, build an
 *      index keyed by first-event timestamp + total cost.
 *   2. Query DB for sessions where cost_usd = 0 within `sinceDays`.
 *   3. Greedy match: for each JSONL (by firstTs), claim the closest unmatched
 *      session whose started_at is within ±`windowMs` of JSONL.firstTs. This
 *      attributes a conversation's full cost to its earliest session row, so
 *      "resume" continuations stay at $0 (correct: the parent carries the
 *      conversation's cost).
 *   4. UPDATE matched rows; emit `usage_update` per session so the renderer
 *      live-updates, then a single `cost:backfill-complete` bulk event so the
 *      UI can toast "$X.XX recovered across N sessions".
 *
 * Differences vs the CLI script:
 *   - No DB backup (database service has WAL + scheduleSave; main DB is fine).
 *   - No process.exit — throws on fatal errors so the caller can decide.
 *   - Defaults to last 7 days, not 2026-04-18 cutoff (avoid full scan on every boot).
 *   - Talks to the live `database` service so writes are picked up by the
 *     existing scheduleSave debounce, not to a raw file handle.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { homedir } from 'os';
import { basename, join } from 'path';
import { database } from './database';
import { eventBus } from './event-bus';
import { resolvePricing } from './pricing';
import { logger } from '../utils/logger';

export interface BackfillOptions {
  /** Only consider sessions whose started_at is within the last N days. Default 7. */
  sinceDays?: number;
  /** Match window in milliseconds for JSONL.firstTs ↔ session.started_at. Default 120s. */
  windowMs?: number;
  /** Override the JSONL projects root. Default: ~/.claude/projects. Tests use this to point at a temp dir. */
  projectsRoot?: string;
}

export interface BackfillResult {
  /** Total JSONL files scanned across ~/.claude/projects/. */
  scanned: number;
  /** DB rows where cost_usd = 0 within the cutoff. */
  candidates: number;
  /** JSONLs successfully matched to a candidate session. */
  matched: number;
  /** Rows actually written to DB (matched - write failures). */
  written: number;
  /** Sum of cost_usd for all written rows. */
  totalUsdRecovered: number;
  /** Wall-clock duration in ms. */
  durationMs: number;
}

interface ParsedJsonl {
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  turns: number;
  model: string | null;
  firstTs: number | null;
}

interface JsonlIndexEntry extends ParsedJsonl {
  path: string;
  convId: string;
  /** Non-null guarantee: indexed entries always have a usable firstTs. */
  firstTs: number;
}

interface CandidateSession {
  id: string;
  startedAt: string;
  startedMs: number;
  claudeConversationId: string | null;
}

/**
 * Parse one JSONL file. Returns null when the file cannot be read.
 *
 * Mirrors `parseJsonlUsage` in jsonl-usage-tracker.ts but additionally captures
 * the first event's timestamp (used for time-window matching) without requiring
 * a second pass over the file.
 */
function parseJsonl(file: string): ParsedJsonl | null {
  let raw: string;
  try {
    raw = readFileSync(file, 'utf-8');
  } catch {
    return null;
  }
  const perModel = new Map<string, { in: number; out: number; cc5m: number; cc1h: number; cr: number }>();
  let turns = 0;
  let model: string | null = null;
  let firstTs: number | null = null;
  for (const line of raw.split('\n')) {
    if (!line) continue;
    let evt: Record<string, unknown>;
    try {
      evt = JSON.parse(line);
    } catch {
      continue;
    }
    if (firstTs === null && typeof evt.timestamp === 'string') {
      const t = Date.parse(evt.timestamp);
      if (!Number.isNaN(t)) firstTs = t;
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
    const ccBreakdown = usage.cache_creation as
      | { ephemeral_5m_input_tokens?: number; ephemeral_1h_input_tokens?: number }
      | undefined;
    const cc5 = ccBreakdown?.ephemeral_5m_input_tokens ?? cc;
    const cc1 = ccBreakdown?.ephemeral_1h_input_tokens ?? 0;
    const acc = perModel.get(m) || { in: 0, out: 0, cc5m: 0, cc1h: 0, cr: 0 };
    acc.in += inp;
    acc.out += out;
    acc.cc5m += cc5;
    acc.cc1h += cc1;
    acc.cr += cr;
    perModel.set(m, acc);
  }
  let cost = 0;
  let totalIn = 0;
  let totalOut = 0;
  for (const [m, a] of perModel) {
    const p = resolvePricing(m);
    cost += (a.in * p.input + a.out * p.output + a.cc5m * p.cacheCreate5m + a.cc1h * p.cacheCreate1h + a.cr * p.cacheRead) / 1_000_000;
    totalIn += a.in;
    totalOut += a.out;
  }
  return {
    costUsd: Number(cost.toFixed(6)),
    inputTokens: totalIn,
    outputTokens: totalOut,
    turns,
    model,
    firstTs,
  };
}

/**
 * Walk ~/.claude/projects/<encoded-cwd>/*.jsonl and build an index sorted by
 * first-event timestamp ascending. Files with no usage data or unreadable
 * timestamps are skipped (they can't participate in time-window matching).
 *
 * Returns `[index, scannedCount]` so the caller can report totals.
 */
function buildJsonlIndex(projectsRoot: string): { index: JsonlIndexEntry[]; scanned: number } {
  if (!existsSync(projectsRoot)) return { index: [], scanned: 0 };
  let dirs: string[];
  try {
    dirs = readdirSync(projectsRoot)
      .map((d) => join(projectsRoot, d))
      .filter((p) => {
        try { return statSync(p).isDirectory(); } catch { return false; }
      });
  } catch {
    return { index: [], scanned: 0 };
  }

  const index: JsonlIndexEntry[] = [];
  let scanned = 0;
  for (const dir of dirs) {
    let files: string[];
    try {
      files = readdirSync(dir).filter((f) => f.endsWith('.jsonl'));
    } catch {
      continue;
    }
    for (const f of files) {
      scanned++;
      const full = join(dir, f);
      const parsed = parseJsonl(full);
      if (!parsed || parsed.firstTs === null || parsed.costUsd === 0) continue;
      index.push({
        path: full,
        convId: f.replace('.jsonl', ''),
        ...parsed,
        firstTs: parsed.firstTs,
      });
    }
  }
  index.sort((a, b) => a.firstTs - b.firstTs);
  return { index, scanned };
}

/**
 * Run the backfill. Safe to call multiple times — idempotent because each
 * pass only updates rows where cost_usd = 0. If you call it concurrently with
 * realtime polling, max-wins semantics in the polling layer will absorb any
 * race (the larger value sticks).
 */
export async function runCostBackfill(options: BackfillOptions = {}): Promise<BackfillResult> {
  const sinceDays = options.sinceDays ?? 7;
  const windowMs = options.windowMs ?? 120_000;
  const projectsRoot = options.projectsRoot ?? join(homedir(), '.claude', 'projects');
  const startMs = Date.now();

  const result: BackfillResult = {
    scanned: 0,
    candidates: 0,
    matched: 0,
    written: 0,
    totalUsdRecovered: 0,
    durationMs: 0,
  };

  // Build JSONL index up front. If no JSONLs exist (fresh install), bail early.
  const { index, scanned } = buildJsonlIndex(projectsRoot);
  result.scanned = scanned;
  if (index.length === 0) {
    result.durationMs = Date.now() - startMs;
    eventBus.emit('cost:backfill-complete', result);
    return result;
  }

  // Find candidate sessions: cost_usd = 0 within the cutoff. Use a date-only
  // string ('YYYY-MM-DD') so it matches the started_at TEXT format Claude uses.
  const cutoffIso = new Date(startMs - sinceDays * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  let rows: Array<Record<string, unknown>>;
  try {
    rows = database.prepare(
      `SELECT id, started_at, claude_conversation_id
         FROM claude_sessions
        WHERE cost_usd = 0
          AND started_at >= ?
        ORDER BY started_at`,
      [cutoffIso],
    );
  } catch (err) {
    logger.warn('Cost backfill: failed to query candidate sessions', err);
    result.durationMs = Date.now() - startMs;
    eventBus.emit('cost:backfill-complete', result);
    return result;
  }

  const candidates: CandidateSession[] = rows
    .map((r) => {
      const startedAt = String(r.started_at ?? '');
      const startedMs = Date.parse(startedAt);
      return {
        id: String(r.id ?? ''),
        startedAt,
        startedMs,
        claudeConversationId: r.claude_conversation_id == null ? null : String(r.claude_conversation_id),
      };
    })
    .filter((s) => s.id && !Number.isNaN(s.startedMs));
  result.candidates = candidates.length;

  if (candidates.length === 0) {
    result.durationMs = Date.now() - startMs;
    eventBus.emit('cost:backfill-complete', result);
    return result;
  }

  // Greedy match: for each JSONL (already sorted by firstTs), claim the
  // closest unmatched candidate within the time window.
  const usedSessions = new Set<string>();
  const matches: Array<{ session: CandidateSession; jsonl: JsonlIndexEntry; deltaMs: number }> = [];
  for (const j of index) {
    let best: { session: CandidateSession; delta: number } | null = null;
    for (const s of candidates) {
      if (usedSessions.has(s.id)) continue;
      const delta = Math.abs(s.startedMs - j.firstTs);
      if (delta > windowMs) continue;
      if (!best || delta < best.delta) best = { session: s, delta };
    }
    if (best) {
      usedSessions.add(best.session.id);
      matches.push({ session: best.session, jsonl: j, deltaMs: best.delta });
    }
  }
  result.matched = matches.length;

  // Write each match. Failures on a single row don't abort the rest.
  for (const m of matches) {
    try {
      database.run(
        `UPDATE claude_sessions
            SET cost_usd = ?, input_tokens = ?, output_tokens = ?, turns_count = ?,
                claude_conversation_id = COALESCE(claude_conversation_id, ?)
          WHERE id = ?`,
        [
          m.jsonl.costUsd,
          m.jsonl.inputTokens,
          m.jsonl.outputTokens,
          m.jsonl.turns,
          m.jsonl.convId,
          m.session.id,
        ],
      );

      // Stamp metadata so downstream queries can tell this row was backfilled
      // (and from which JSONL). Read-modify-write because metadata is a JSON
      // blob that may already contain unrelated keys we must preserve.
      try {
        const metaRows = database.prepare(
          `SELECT metadata FROM claude_sessions WHERE id = ?`,
          [m.session.id],
        );
        let meta: Record<string, unknown> = {};
        const rawMeta = metaRows[0]?.metadata;
        if (typeof rawMeta === 'string' && rawMeta.length > 0) {
          try {
            const parsed = JSON.parse(rawMeta);
            if (parsed && typeof parsed === 'object') meta = parsed as Record<string, unknown>;
          } catch { /* keep empty meta on parse failure */ }
        }
        meta.cost_backfilled_at = new Date().toISOString();
        meta.cost_backfilled_from = basename(m.jsonl.path);
        meta.cost_backfilled_delta_ms = m.deltaMs;
        database.run(
          `UPDATE claude_sessions SET metadata = ? WHERE id = ?`,
          [JSON.stringify(meta), m.session.id],
        );
      } catch (metaErr) {
        // Metadata stamping is best-effort — never block the cost write.
        logger.warn(`Cost backfill: metadata stamp failed for ${m.session.id}`, metaErr);
      }

      result.written++;
      result.totalUsdRecovered += m.jsonl.costUsd;

      // Emit the same usage_update shape that realtime polling emits, so the
      // renderer's existing subscriber updates the row in place.
      eventBus.emitSessionEvent({
        sessionId: m.session.id,
        type: 'system',
        subtype: 'usage_update',
        costUsd: m.jsonl.costUsd,
        inputTokens: m.jsonl.inputTokens,
        outputTokens: m.jsonl.outputTokens,
        durationMs: 0,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      logger.warn(`Cost backfill: write failed for session ${m.session.id}`, err);
    }
  }

  result.durationMs = Date.now() - startMs;
  // Single bulk event for toast/notification at the end.
  eventBus.emit('cost:backfill-complete', result);
  return result;
}
