#!/usr/bin/env node
// Hook Type: PreToolUse (Bash) - Pre-Deploy Typecheck & Build Gate
//
// 2026-07-03 重寫（PM-009 正式修復）：
// 1. 舊 regex /deploy|publish|release/i 把「字串裡有 deploy」當成「正在部署」，
//    連 `grep deploy log.jsonl`、`sed -i pre-deploy.md` 都被攔。
//    新版只匹配「部署動詞 + 明確部署指令」。
// 2. 舊版用裸 `npm` 呼叫，hook 環境 PATH 沒有 npm → execSync throw →
//    被誤判為 typecheck/build 失敗 → deny 無辜指令。改用完整路徑。
// 3. isDeployCommand 抽出可單測，測試見 tests/hooks/g5-deploy-regex.test.ts。

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PROJECT_ROOT = 'C:/Users/Bandai/Desktop/ALL PROJECT/Agent-hub';

// 真正的部署指令 pattern：動詞開頭（或前面是分隔符），不是路徑/檔名/grep 參數
const DEPLOY_PATTERNS = [
  /(?:^|[;&|]\s*)(?:npm|pnpm|yarn)\s+(?:run\s+)?deploy\b/,
  /(?:^|[;&|]\s*)(?:npm|pnpm)\s+publish\b/,
  /(?:^|[;&|]\s*)vercel\s+(?:--prod\b|deploy\b)/,
  /(?:^|[;&|]\s*)docker\s+push\b/,
  /(?:^|[;&|]\s*)gh\s+release\s+create\b/,
  /(?:^|[;&|]\s*)firebase\s+deploy\b/,
  /(?:^|[;&|]\s*)netlify\s+deploy\b/,
  /electron-builder\b.*--publish\b/
];

function isDeployCommand(cmd) {
  return DEPLOY_PATTERNS.some(re => re.test(cmd));
}

function logHook(result, reason) {
  const logDir = path.join(PROJECT_ROOT, '.claude');
  try { fs.mkdirSync(logDir, { recursive: true }); } catch {}
  const entry = JSON.stringify({
    hook: 'g5-pre-deploy', type: 'PreToolUse',
    result, reason, ts: new Date().toISOString(),
    // 煙霧測試合成紀錄打標（見 stop-validator.js 同款註解）
    ...(process.env.AGENTHUB_HOOK_TEST === '1' ? { synthetic: true } : {})
  });
  try { fs.appendFileSync(path.join(logDir, 'hook-execution.jsonl'), entry + '\n'); } catch {}
}

function main() {
  let input = '';
  process.stdin.on('data', d => input += d);
  process.stdin.on('end', () => {
    let data;
    try { data = JSON.parse(input); } catch { process.exit(0); }

    if (data.tool_name !== 'Bash') process.exit(0);
    const cmd = data.tool_input?.command || '';

    if (!isDeployCommand(cmd)) {
      logHook('passed', 'non-deploy command');
      process.exit(0);
    }

    // Windows hook 環境 PATH 沒有 npm，用完整路徑（同 stop-validator）
    const NODE = process.execPath;
    const NPM = path.join(path.dirname(NODE), 'node_modules', 'npm', 'bin', 'npm-cli.js');

    const failures = [];
    try {
      process.stderr.write('G5 Pre-Deploy: running typecheck...\n');
      execSync(`"${NODE}" "${NPM}" run typecheck`, { cwd: PROJECT_ROOT, stdio: 'inherit' });
    } catch { failures.push('typecheck'); }

    try {
      process.stderr.write('G5 Pre-Deploy: running build...\n');
      execSync(`"${NODE}" "${NPM}" run build`, { cwd: PROJECT_ROOT, stdio: 'inherit' });
    } catch { failures.push('build'); }

    if (failures.length > 0) {
      logHook('blocked', `deploy blocked: ${failures.join(', ')} failed`);
      console.log(JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason: `G5 Pre-Deploy: ${failures.join(' + ')} 失敗，禁止部署`
        }
      }));
      process.exit(0);
    }

    logHook('passed', 'pre-deploy checks passed');
    process.exit(0);
  });
}

if (require.main === module) main();
module.exports = { isDeployCommand, DEPLOY_PATTERNS };
