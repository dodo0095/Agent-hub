/**
 * Backfill historical cost into claude_sessions from Claude Code JSONL logs.
 *
 * Strategy:
 *   1. Scan every JSONL under ~/.claude/projects/*\/ — build an index of
 *      (path, convId, firstTimestampMs, parsed usage).
 *   2. Query DB for sessions where cost_usd = 0 AND started_at >= 2026-04-18.
 *   3. Greedy match: for each JSONL (by firstTs ascending), claim the closest
 *      unmatched session whose started_at is within ±120s of JSONL.firstTs.
 *   4. UPDATE DB row with cost_usd / input_tokens / output_tokens / turns_count
 *      / claude_conversation_id. Each JSONL's full cost is attributed to ONE
 *      session (the closest), so resume continuations stay at 0 — that's
 *      correct (the original parent session carries the conversation's cost).
 *
 * Safety:
 *   - Backups DB to ~/.config-backup/AgentHub/maestro-{ts}.db.bak before write
 *   - Dry-run mode by default; pass --apply to actually write
 *
 * Usage:
 *   node scripts/backfill-cost.cjs            # dry run (default)
 *   node scripts/backfill-cost.cjs --apply    # apply changes
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const initSqlJs = require('sql.js');

const APPLY = process.argv.includes('--apply');
const SINCE = '2026-04-18';
const WINDOW_MS = 120_000;

// ─── Pricing (mirror jsonl-usage-tracker.ts) ─────────────────────────────────

const PRICING = {
  'claude-sonnet-4-6': { in: 3, out: 15, cc5: 3.75, cc1: 6, cr: 0.30 },
  'claude-sonnet-4-5': { in: 3, out: 15, cc5: 3.75, cc1: 6, cr: 0.30 },
  'claude-sonnet-4':   { in: 3, out: 15, cc5: 3.75, cc1: 6, cr: 0.30 },
  'claude-opus-4-7':   { in: 15, out: 75, cc5: 18.75, cc1: 30, cr: 1.50 },
  'claude-opus-4-6':   { in: 15, out: 75, cc5: 18.75, cc1: 30, cr: 1.50 },
  'claude-opus-4-5':   { in: 15, out: 75, cc5: 18.75, cc1: 30, cr: 1.50 },
  'claude-opus-4-1':   { in: 15, out: 75, cc5: 18.75, cc1: 30, cr: 1.50 },
  'claude-opus-4':     { in: 15, out: 75, cc5: 18.75, cc1: 30, cr: 1.50 },
  'claude-haiku-4-5':  { in: 1, out: 5, cc5: 1.25, cc1: 2, cr: 0.10 },
  'claude-haiku-3-5':  { in: 0.80, out: 4, cc5: 1.00, cc1: 1.60, cr: 0.08 },
};
const DEFAULT = PRICING['claude-sonnet-4-6'];
function priceOf(m) {
  if (PRICING[m]) return PRICING[m];
  for (const k of Object.keys(PRICING)) if (m.startsWith(k)) return PRICING[k];
  if (m.includes('opus')) return PRICING['claude-opus-4-1'];
  if (m.includes('haiku')) return PRICING['claude-haiku-4-5'];
  return DEFAULT;
}

// ─── JSONL parser (mirror jsonl-usage-tracker.ts) ────────────────────────────

function parseJsonl(file) {
  let raw;
  try { raw = fs.readFileSync(file, 'utf-8'); } catch { return null; }
  const perModel = new Map();
  let turns = 0, model = null, firstTs = null;
  for (const line of raw.split('\n')) {
    if (!line) continue;
    let evt;
    try { evt = JSON.parse(line); } catch { continue; }
    if (!firstTs && evt.timestamp) {
      const t = Date.parse(evt.timestamp);
      if (!Number.isNaN(t)) firstTs = t;
    }
    const msg = evt.message;
    if (!msg || !msg.usage) continue;
    const u = msg.usage;
    const m = msg.model || 'claude-sonnet-4-6';
    model = m; turns++;
    const inp = u.input_tokens || 0;
    const out = u.output_tokens || 0;
    const cc = u.cache_creation_input_tokens || 0;
    const cr = u.cache_read_input_tokens || 0;
    const cc5 = u.cache_creation?.ephemeral_5m_input_tokens ?? cc;
    const cc1 = u.cache_creation?.ephemeral_1h_input_tokens ?? 0;
    const a = perModel.get(m) || { in: 0, out: 0, cc5: 0, cc1: 0, cr: 0 };
    a.in += inp; a.out += out; a.cc5 += cc5; a.cc1 += cc1; a.cr += cr;
    perModel.set(m, a);
  }
  let cost = 0, totalIn = 0, totalOut = 0;
  for (const [m, a] of perModel) {
    const p = priceOf(m);
    cost += (a.in*p.in + a.out*p.out + a.cc5*p.cc5 + a.cc1*p.cc1 + a.cr*p.cr) / 1_000_000;
    totalIn += a.in; totalOut += a.out;
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

// ─── Scan JSONL index ────────────────────────────────────────────────────────

function buildJsonlIndex() {
  const projectsRoot = path.join(os.homedir(), '.claude', 'projects');
  if (!fs.existsSync(projectsRoot)) return [];
  const dirs = fs.readdirSync(projectsRoot)
    .map(d => path.join(projectsRoot, d))
    .filter(p => fs.statSync(p).isDirectory());

  const index = [];
  for (const dir of dirs) {
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.jsonl'));
    for (const f of files) {
      const full = path.join(dir, f);
      const parsed = parseJsonl(full);
      if (!parsed || parsed.firstTs === null || parsed.costUsd === 0) continue;
      index.push({
        path: full,
        convId: f.replace('.jsonl', ''),
        projectDir: path.basename(dir),
        ...parsed,
      });
    }
  }
  return index.sort((a, b) => a.firstTs - b.firstTs);
}

// ─── Main ────────────────────────────────────────────────────────────────────

(async () => {
  console.log(`Mode: ${APPLY ? 'APPLY (will write)' : 'DRY RUN'}`);
  console.log(`Cutoff: started_at >= ${SINCE}`);
  console.log(`Match window: ±${WINDOW_MS / 1000}s\n`);

  // Backup DB before writing
  const dbPath = path.join(os.homedir(), 'AppData', 'Roaming', 'maestro-v2', 'maestro.db');
  if (!fs.existsSync(dbPath)) { console.error(`DB not found: ${dbPath}`); process.exit(1); }

  if (APPLY) {
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = path.join(os.homedir(), '.config-backup', 'AgentHub');
    fs.mkdirSync(backupDir, { recursive: true });
    const backup = path.join(backupDir, `maestro-${ts}.db.bak`);
    fs.copyFileSync(dbPath, backup);
    console.log(`DB backup: ${backup}\n`);
  }

  // Build JSONL index
  console.log('Building JSONL index...');
  const t0 = Date.now();
  const index = buildJsonlIndex();
  console.log(`  ${index.length} JSONLs with non-zero cost (took ${Date.now() - t0}ms)`);
  const totalJsonlCost = index.reduce((s, j) => s + j.costUsd, 0);
  console.log(`  Total cost across all JSONLs: $${totalJsonlCost.toFixed(2)}\n`);

  // Load DB
  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync(dbPath));

  // Find sessions needing backfill
  const r = db.exec(`
    SELECT id, agent_id, project_id, started_at, parent_session_id, claude_conversation_id, model, status
    FROM claude_sessions
    WHERE cost_usd = 0
      AND started_at >= '${SINCE}'
    ORDER BY started_at
  `);
  const sessions = (r[0]?.values || []).map(row => ({
    id: row[0], agent_id: row[1], project_id: row[2], started_at: row[3],
    parent_session_id: row[4], claude_conversation_id: row[5], model: row[6], status: row[7],
    startedMs: Date.parse(row[3]),
  }));
  console.log(`Sessions needing backfill: ${sessions.length}\n`);

  // Greedy match: for each JSONL by firstTs, claim closest unmatched session
  const usedSessions = new Set();
  const matches = []; // { session, jsonl, deltaMs }
  const usedJsonls = new Set();

  for (const j of index) {
    let best = null;
    for (const s of sessions) {
      if (usedSessions.has(s.id)) continue;
      const delta = Math.abs(s.startedMs - j.firstTs);
      if (delta > WINDOW_MS) continue;
      if (!best || delta < best.delta) best = { session: s, delta };
    }
    if (best) {
      usedSessions.add(best.session.id);
      usedJsonls.add(j.convId);
      matches.push({ session: best.session, jsonl: j, deltaMs: best.delta });
    }
  }

  // Report
  console.log(`Matched: ${matches.length} / ${sessions.length} sessions`);
  console.log(`Unmatched JSONLs (likely direct CLI use, not AgentHub): ${index.length - usedJsonls.size}`);
  const totalRecovered = matches.reduce((s, m) => s + m.jsonl.costUsd, 0);
  console.log(`Cost being written back: $${totalRecovered.toFixed(2)}\n`);

  console.log('Top 20 matches:');
  console.log('session_id (8) | started_at         | conv_id (8) | Δms   | cost     | agent');
  console.log('-'.repeat(100));
  for (const m of matches.slice().sort((a, b) => b.jsonl.costUsd - a.jsonl.costUsd).slice(0, 20)) {
    console.log(
      `${m.session.id.slice(0, 8)} | ${m.session.started_at.slice(0, 19)} | ${m.jsonl.convId.slice(0, 8)} | ` +
      `${String(m.deltaMs).padStart(5)} | $${m.jsonl.costUsd.toFixed(4).padStart(8)} | ${m.session.agent_id}`,
    );
  }
  console.log('');

  // Apply
  if (!APPLY) {
    console.log('Dry run — no changes made. Re-run with --apply to write.');
    process.exit(0);
  }

  let written = 0;
  for (const m of matches) {
    try {
      db.run(
        `UPDATE claude_sessions
            SET cost_usd = ?, input_tokens = ?, output_tokens = ?, turns_count = ?,
                claude_conversation_id = COALESCE(claude_conversation_id, ?),
                metadata = COALESCE(metadata, '{}')
          WHERE id = ?`,
        [m.jsonl.costUsd, m.jsonl.inputTokens, m.jsonl.outputTokens, m.jsonl.turns, m.jsonl.convId, m.session.id],
      );
      // Also stamp metadata that this row was backfilled
      const existingMetaRow = db.exec(`SELECT metadata FROM claude_sessions WHERE id = '${m.session.id}'`);
      let meta = {};
      try { meta = JSON.parse(existingMetaRow[0]?.values[0]?.[0] || '{}'); } catch { /* keep empty */ }
      meta.cost_backfilled_at = new Date().toISOString();
      meta.cost_backfilled_from = path.basename(m.jsonl.path);
      meta.cost_backfilled_delta_ms = m.deltaMs;
      db.run(
        `UPDATE claude_sessions SET metadata = ? WHERE id = ?`,
        [JSON.stringify(meta), m.session.id],
      );
      written++;
    } catch (err) {
      console.error(`Failed to write session ${m.session.id}: ${err.message}`);
    }
  }

  // Persist DB
  const data = Buffer.from(db.export());
  fs.writeFileSync(dbPath, data);
  console.log(`\nApplied: ${written} rows updated. Total cost recovered: $${totalRecovered.toFixed(2)}`);
})();
