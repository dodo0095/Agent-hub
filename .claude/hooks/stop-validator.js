#!/usr/bin/env node
// Hook Type: Stop - Test & Lint Validator
// Converted from stop-validator.sh for Windows compatibility

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PROJECT_ROOT = 'C:/Users/Bandai/Desktop/ALL PROJECT/Agent-hub';

function logHook(result, reason) {
  const logDir = path.join(PROJECT_ROOT, '.claude');
  try { fs.mkdirSync(logDir, { recursive: true }); } catch {}
  const entry = JSON.stringify({
    hook: 'stop-validator', type: 'Stop',
    result, reason, ts: new Date().toISOString()
  });
  fs.appendFileSync(path.join(logDir, 'hook-execution.jsonl'), entry + '\n');
}

function findTestFiles(dir, depth = 0) {
  if (depth > 4) return [];
  let results = [];
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
        results = results.concat(findTestFiles(full, depth + 1));
      } else if (/\.(test|spec)\.(ts|js)$/.test(entry.name)) {
        results.push(full);
        if (results.length >= 5) return results;
      }
    }
  } catch {}
  return results;
}

let input = '';
process.stdin.on('data', d => input += d);
process.stdin.on('end', () => {
  let data;
  try { data = JSON.parse(input); } catch { data = {}; }

  // If already in stop hook loop, exit to avoid recursion
  if (data.stop_hook_active === true) process.exit(0);

  // G3: Check test file existence
  const testFiles = findTestFiles(PROJECT_ROOT);
  if (testFiles.length === 0) {
    process.stderr.write('⚠️ G3 Warning: No test files found in project\n');
  }

  let testOk = true;
  let lintOk = true;

  // Use full node path for Windows Git Bash compatibility (node not in PATH)
  const NODE = process.execPath;
  const NPM  = path.join(path.dirname(NODE), 'node_modules', 'npm', 'bin', 'npm-cli.js');

  try {
    process.stderr.write('🧪 Running tests...\n');
    execSync(`"${NODE}" "${NPM}" test`, { cwd: PROJECT_ROOT, stdio: 'inherit' });
  } catch { testOk = false; }

  try {
    process.stderr.write('🔍 Running lint...\n');
    execSync(`"${NODE}" "${NPM}" run lint`, { cwd: PROJECT_ROOT, stdio: 'inherit' });
  } catch { lintOk = false; }

  if (!testOk || !lintOk) {
    logHook('blocked', 'tests or lint failed');
    console.log(JSON.stringify({
      continue: false,
      stopReason: 'Stop Validator: tests or lint failed. Fix issues before ending session.'
    }));
    process.exit(0);
  }

  logHook('passed', 'all checks passed');
  console.log(JSON.stringify({ continue: true }));
  process.exit(0);
});
