#!/usr/bin/env node
// Hook Type: Stop - Incremental Quality Gate
//
// 制度設計（2026-07-03 重寫，見 postmortem PM-013）：
// 舊版每次 Stop 都跑全套 npm test + lint，因 PM-012 的 31 個預存失敗，
// 歷史紀錄 blocked 175 次 / passed 0 次 —— 「永遠響的警報」只會教 agent 忽略紅燈。
//
// 新版原則：
// 1. 警報只在「這個 session 可能弄壞了東西」時才響 —— 無未提交變更就直接放行。
// 2. 只跑快且目前基準線為綠的檢查（lint errors + typecheck）。
//    全套測試歸屬 G2/G3 gate（/review、CI），不歸 Stop hook —— PM-012 修復
//    （31 個預存失敗清零）之前，把全套測試放這裡 = 永遠紅。
// 3. 純文件變更（.md / .tasks / proposal / docs）不觸發 typecheck。
// 4. 每次結果都記 log，供 /harness-audit 的「警報有效性」分析。

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PROJECT_ROOT = 'C:/Users/Bandai/Desktop/ALL PROJECT/Agent-hub';
const LOG_FILE = path.join(PROJECT_ROOT, '.claude', 'hook-execution.jsonl');
const MAX_LOG_BYTES = 1024 * 1024; // 1MB，超過就輪替

function rotateLogIfNeeded() {
  try {
    const st = fs.statSync(LOG_FILE);
    if (st.size > MAX_LOG_BYTES) {
      fs.renameSync(LOG_FILE, LOG_FILE + '.1'); // 保留一代舊檔
    }
  } catch {}
}

function logHook(result, reason) {
  try { fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true }); } catch {}
  rotateLogIfNeeded();
  const entry = JSON.stringify({
    hook: 'stop-validator', type: 'Stop',
    result, reason, ts: new Date().toISOString(),
    // 煙霧測試（AGENTHUB_HOOK_TEST=1）的合成紀錄打標，避免污染 /harness-audit 警報統計
    ...(process.env.AGENTHUB_HOOK_TEST === '1' ? { synthetic: true } : {})
  });
  try { fs.appendFileSync(LOG_FILE, entry + '\n'); } catch {}
}

// Windows Git Bash 環境 hook 內 PATH 沒有 npm，必須用完整路徑（PM-013）
const NODE = process.execPath;
const NPM = path.join(path.dirname(NODE), 'node_modules', 'npm', 'bin', 'npm-cli.js');

function run(cmd) {
  execSync(cmd, { cwd: PROJECT_ROOT, stdio: 'pipe', timeout: 110000 });
}

function getChangedFiles() {
  try {
    const out = execSync('git status --porcelain', {
      cwd: PROJECT_ROOT, encoding: 'utf8', timeout: 15000
    });
    return out.split('\n').filter(Boolean).map(l => l.slice(3).trim());
  } catch {
    return null; // git 不可用 → 保守：視為有變更
  }
}

const DOC_ONLY = /^(\.tasks\/|proposal\/|docs\/|\.knowledge\/|\.claude\/|README)|\.(md|txt|docx|png|jpg)$/i;

let input = '';
process.stdin.on('data', d => input += d);
process.stdin.on('end', () => {
  let data;
  try { data = JSON.parse(input); } catch { data = {}; }

  // 已在 stop hook loop 中，避免遞迴
  if (data.stop_hook_active === true) process.exit(0);

  const changed = getChangedFiles();

  // 情況 1: working tree 乾淨 → 這個 session 沒留下未提交變更，放行
  if (changed && changed.length === 0) {
    logHook('passed', 'clean working tree, nothing to validate');
    process.exit(0);
  }

  // 情況 2: 只動了文件/任務/知識檔 → 不需要 lint/typecheck，放行
  const codeChanged = !changed || changed.some(f => !DOC_ONLY.test(f));
  if (!codeChanged) {
    logHook('passed', 'doc-only changes, code checks skipped');
    process.exit(0);
  }

  // 情況 3: 有程式碼變更 → 跑快速檢查（基準線為綠的項目）
  const failures = [];

  try {
    process.stderr.write('stop-validator: lint...\n');
    run(`"${NODE}" "${NPM}" run lint`);
  } catch { failures.push('lint'); }

  try {
    process.stderr.write('stop-validator: typecheck...\n');
    run(`"${NODE}" "${NPM}" run typecheck`);
  } catch { failures.push('typecheck'); }

  if (failures.length > 0) {
    logHook('blocked', `failed: ${failures.join(', ')}`);
    console.log(JSON.stringify({
      decision: 'block',
      reason: `Stop Validator: ${failures.join(' + ')} 失敗（基準線原本是綠的，代表本 session 的變更弄壞了它）。` +
        `請執行 npm run ${failures[0]} 查看錯誤並修復後再結束。若確認是預存問題，用 /pitfall-record 記錄。`
    }));
    process.exit(0);
  }

  logHook('passed', 'lint + typecheck green with code changes');
  process.exit(0);
});
