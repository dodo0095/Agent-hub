#!/usr/bin/env node
// Hook Type: PreToolUse (Bash) - Forbidden Commands Interceptor
// Converted from forbidden-commands.sh for Windows compatibility

const fs = require('fs');
const path = require('path');

function logHook(result, reason) {
  try { fs.mkdirSync('.claude', { recursive: true }); } catch {}
  const entry = JSON.stringify({
    hook: 'forbidden-commands', type: 'PreToolUse',
    result, reason, ts: new Date().toISOString()
  });
  fs.appendFileSync(path.join('.claude', 'hook-execution.jsonl'), entry + '\n');
}

let input = '';
process.stdin.on('data', d => input += d);
process.stdin.on('end', () => {
  let data;
  try { data = JSON.parse(input); } catch { process.exit(0); }

  if (data.tool_name !== 'Bash') process.exit(0);
  const cmd = data.tool_input?.command || '';

  // Block kill-port / taskkill / Stop-Process targeting node
  if (/kill-port|taskkill.*node|Stop-Process.*node/i.test(cmd)) {
    logHook('blocked', 'kill-port/taskkill/Stop-Process targeting node');
    console.log(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: '禁止: kill-port/taskkill/Stop-Process 不可強制終止 node process'
      }
    }));
    process.exit(0);
  }

  // Block --no-verify
  if (/--no-verify/.test(cmd)) {
    logHook('blocked', '--no-verify flag detected');
    console.log(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: '禁止: --no-verify 會跳過 hook 檢查'
      }
    }));
    process.exit(0);
  }

  // Block force push to main/master
  if (/git\s+push\s+.*--force\s.*(main|master)/.test(cmd)) {
    logHook('blocked', 'force push to main/master');
    console.log(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: '禁止: force push 到 main/master'
      }
    }));
    process.exit(0);
  }

  logHook('passed', 'no forbidden pattern');
  process.exit(0);
});
