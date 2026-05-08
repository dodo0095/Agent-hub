/**
 * One-off verification: parse Claude Code JSONL files and compute cost
 * using the same logic as electron/services/jsonl-usage-tracker.ts (port to JS).
 *
 * Run:  node scripts/verify-jsonl-cost.cjs [jsonlFile]
 * If no argument, scans the current project's JSONL dir and reports per-file cost.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const PRICING = {
  'claude-sonnet-4-6': { input: 3, output: 15, cacheCreate5m: 3.75, cacheCreate1h: 6, cacheRead: 0.30 },
  'claude-sonnet-4-5': { input: 3, output: 15, cacheCreate5m: 3.75, cacheCreate1h: 6, cacheRead: 0.30 },
  'claude-sonnet-4':   { input: 3, output: 15, cacheCreate5m: 3.75, cacheCreate1h: 6, cacheRead: 0.30 },
  'claude-opus-4-1':   { input: 15, output: 75, cacheCreate5m: 18.75, cacheCreate1h: 30, cacheRead: 1.50 },
  'claude-opus-4':     { input: 15, output: 75, cacheCreate5m: 18.75, cacheCreate1h: 30, cacheRead: 1.50 },
  'claude-haiku-4-5':  { input: 1, output: 5, cacheCreate5m: 1.25, cacheCreate1h: 2, cacheRead: 0.10 },
  'claude-haiku-3-5':  { input: 0.80, output: 4, cacheCreate5m: 1.00, cacheCreate1h: 1.60, cacheRead: 0.08 },
};
const DEFAULT = PRICING['claude-sonnet-4-6'];

function resolvePricing(model) {
  if (PRICING[model]) return PRICING[model];
  for (const k of Object.keys(PRICING)) if (model.startsWith(k)) return PRICING[k];
  if (model.includes('opus')) return PRICING['claude-opus-4-1'];
  if (model.includes('haiku')) return PRICING['claude-haiku-4-5'];
  if (model.includes('sonnet')) return PRICING['claude-sonnet-4-6'];
  return DEFAULT;
}

function parseJsonl(file) {
  if (!fs.existsSync(file)) return null;
  const raw = fs.readFileSync(file, 'utf-8');
  const perModel = new Map();
  let turns = 0, model = null, firstTs = null, lastTs = null;
  for (const line of raw.split('\n')) {
    if (!line) continue;
    let evt;
    try { evt = JSON.parse(line); } catch { continue; }
    if (evt.timestamp) {
      if (!firstTs) firstTs = evt.timestamp;
      lastTs = evt.timestamp;
    }
    const msg = evt.message;
    if (!msg || !msg.usage) continue;
    const u = msg.usage;
    const m = msg.model || 'claude-sonnet-4-6';
    model = m;
    turns++;
    const inp = u.input_tokens || 0;
    const out = u.output_tokens || 0;
    const cc = u.cache_creation_input_tokens || 0;
    const cr = u.cache_read_input_tokens || 0;
    const cc5 = u.cache_creation?.ephemeral_5m_input_tokens ?? cc;
    const cc1 = u.cache_creation?.ephemeral_1h_input_tokens ?? 0;
    const acc = perModel.get(m) || { in: 0, out: 0, cc5m: 0, cc1h: 0, cr: 0 };
    acc.in += inp; acc.out += out; acc.cc5m += cc5; acc.cc1h += cc1; acc.cr += cr;
    perModel.set(m, acc);
  }
  let cost = 0, totalIn = 0, totalOut = 0, totalCc = 0, totalCr = 0;
  for (const [m, a] of perModel) {
    const p = resolvePricing(m);
    cost += (a.in*p.input + a.out*p.output + a.cc5m*p.cacheCreate5m + a.cc1h*p.cacheCreate1h + a.cr*p.cacheRead) / 1_000_000;
    totalIn += a.in; totalOut += a.out; totalCc += a.cc5m + a.cc1h; totalCr += a.cr;
  }
  return { costUsd: Number(cost.toFixed(4)), turns, model, in: totalIn, out: totalOut, cc: totalCc, cr: totalCr, firstTs, lastTs };
}

const arg = process.argv[2];
const projDir = path.join(os.homedir(), '.claude', 'projects', 'C--Users-Bandai-Desktop-ALL-PROJECT-Agent-hub');

if (arg) {
  const r = parseJsonl(arg);
  console.log(JSON.stringify(r, null, 2));
} else {
  const files = fs.readdirSync(projDir).filter(f => f.endsWith('.jsonl'));
  const results = [];
  for (const f of files) {
    const fullPath = path.join(projDir, f);
    const stat = fs.statSync(fullPath);
    const r = parseJsonl(fullPath);
    if (!r) continue;
    results.push({ file: f.slice(0, 8), mtime: stat.mtime.toISOString().slice(0, 19), ...r });
  }
  // Sort by mtime desc
  results.sort((a, b) => b.mtime.localeCompare(a.mtime));
  let total = 0;
  console.log('file     | mtime               | turns | model                 | in/out/cc/cr (k)        | cost');
  console.log('-'.repeat(120));
  for (const r of results.slice(0, 25)) {
    total += r.costUsd;
    const tok = `${(r.in/1000).toFixed(1)}/${(r.out/1000).toFixed(1)}/${(r.cc/1000).toFixed(1)}/${(r.cr/1000).toFixed(1)}`;
    console.log(`${r.file} | ${r.mtime} | ${String(r.turns).padStart(5)} | ${(r.model || '').padEnd(21)} | ${tok.padEnd(23)} | $${r.costUsd.toFixed(4)}`);
  }
  console.log('-'.repeat(120));
  const grand = results.reduce((s, r) => s + r.costUsd, 0);
  console.log(`Top 25 sum: $${total.toFixed(4)}    All ${results.length} files sum: $${grand.toFixed(4)}`);
}
