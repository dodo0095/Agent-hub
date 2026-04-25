#!/usr/bin/env node
/**
 * Cross-platform statusLine handler for AgentHub.
 *
 * Claude Code pipes a JSON status object to this script's stdin on each turn.
 * We extract cost/token data and write it to the file specified by
 * the AGENTHUB_USAGE_FILE environment variable.
 *
 * Usage (in Claude Code settings):
 *   { "statusLine": { "type": "command", "command": "node /path/to/session-statusline.js" } }
 */

const fs = require('fs');

let input = '';
process.stdin.setEncoding('utf-8');
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  // Accept usage file path from CLI arg (primary) or env var (fallback).
  // CLI arg is preferred because env var inheritance via Claude Code's statusLine
  // subprocess is not guaranteed on all platforms (especially Windows ConPTY).
  const usageFile = process.argv[2] || process.env.AGENTHUB_USAGE_FILE;
  if (!usageFile) process.exit(0);

  try {
    const data = JSON.parse(input);

    const costUsd = data.cost?.total_cost_usd ?? 0;
    const inputTokens = data.context_window?.total_input_tokens ?? 0;
    const outputTokens = data.context_window?.total_output_tokens ?? 0;
    const usedPct = data.context_window?.used_percentage ?? 0;

    const payload = JSON.stringify({ costUsd, inputTokens, outputTokens, usedPct });
    fs.writeFileSync(usageFile, payload, 'utf-8');
  } catch {
    // Partial or invalid JSON — ignore silently
  }

  // Output a minimal status line so Claude Code displays something
  try {
    const data = JSON.parse(input);
    const model = data.model?.display_name ?? 'unknown';
    const ctx = data.context_window?.used_percentage ?? 0;
    const inp = data.context_window?.total_input_tokens ?? 0;
    const out = data.context_window?.total_output_tokens ?? 0;
    const cost = data.cost?.total_cost_usd ?? 0;

    const fmtTok = (n) => {
      if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
      if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k';
      return String(n);
    };

    process.stdout.write(`${model}  ctx: ${ctx}%  tok: ${fmtTok(inp + out)}  $${cost.toFixed(4)}\n`);
  } catch {
    // ignore
  }
});
