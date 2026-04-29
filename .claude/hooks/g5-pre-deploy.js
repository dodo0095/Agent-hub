#!/usr/bin/env node
// Hook Type: PreToolUse (Bash) - Pre-Deploy Typecheck & Build Gate
// Converted from g5-pre-deploy.sh for Windows compatibility

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PROJECT_ROOT = 'C:/Users/Bandai/Desktop/ALL PROJECT/Agent-hub';

function logHook(result, reason) {
  const logDir = path.join(PROJECT_ROOT, '.claude');
  try { fs.mkdirSync(logDir, { recursive: true }); } catch {}
  const entry = JSON.stringify({
    hook: 'g5-pre-deploy', type: 'PreToolUse',
    result, reason, ts: new Date().toISOString()
  });
  fs.appendFileSync(path.join(logDir, 'hook-execution.jsonl'), entry + '\n');
}

let input = '';
process.stdin.on('data', d => input += d);
process.stdin.on('end', () => {
  let data;
  try { data = JSON.parse(input); } catch { process.exit(0); }

  if (data.tool_name !== 'Bash') process.exit(0);
  const cmd = data.tool_input?.command || '';

  if (!/deploy|publish|release|npm publish|docker push/i.test(cmd)) {
    logHook('passed', 'non-deploy command');
    process.exit(0);
  }

  let typecheckOk = true;
  let buildOk = true;

  try {
    process.stderr.write('G5 Pre-Deploy: running typecheck...\n');
    execSync('npm run typecheck', { cwd: PROJECT_ROOT, stdio: 'inherit' });
  } catch { typecheckOk = false; }

  try {
    process.stderr.write('G5 Pre-Deploy: running build...\n');
    execSync('npm run build', { cwd: PROJECT_ROOT, stdio: 'inherit' });
  } catch { buildOk = false; }

  if (!typecheckOk || !buildOk) {
    logHook('blocked', 'typecheck or build failed');
    console.log(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: 'G5 Pre-Deploy: typecheck 或 build 失敗，禁止部署'
      }
    }));
    process.exit(0);
  }

  logHook('passed', 'pre-deploy checks passed');
  process.exit(0);
});
