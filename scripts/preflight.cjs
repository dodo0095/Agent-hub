#!/usr/bin/env node
// preflight — 完成證據產生器
//
// 制度定位（2026-07-04，Fable 5 制度建設 session）：
// PM-011 的教訓是「該驗什麼」本身是判斷力，而判斷力會在弱模型 session 中流失。
// 本腳本把可機械化的驗證全部自動跑完，輸出一塊可直接貼進任務檔「## 完成證據」的
// markdown。宣告任何任務完成（/task-done）前必跑。
//
// 檢查項（依 decision-tables.md 表 1）：
//   1. 工作目錄正確（dev clone，不是 verify clone）
//   2. git 分支 + 與 main 的關係（production 修復必須以 main 為 base）
//   3. 變更檔案分類（純文件 / 程式碼 / hooks / IPC 四方）
//   4. lint + typecheck（僅程式碼變更時）
//   5. build 新鮮度（out/ 時間戳 vs electron/ 原始碼，PM-011 的沉默殺手）
//   6. 無法機械化的項目 → 明確提醒（DB query 證據、targeted tests）
//
// 用法：node scripts/preflight.cjs [--allow-stale-build] [--skip-checks]
// 退出碼：0 = 可宣告完成（機械化部分）；1 = 有硬性失敗

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const ARGS = process.argv.slice(2);
const ALLOW_STALE = ARGS.includes('--allow-stale-build');
const SKIP_CHECKS = ARGS.includes('--skip-checks');

const NODE = process.execPath;
const NPM = path.join(path.dirname(NODE), 'node_modules', 'npm', 'bin', 'npm-cli.js');

const results = [];   // { name, status: 'pass'|'fail'|'warn'|'info', detail }
const failures = [];

function record(name, status, detail) {
  results.push({ name, status, detail });
  if (status === 'fail') failures.push(name);
}

function sh(cmd, timeout = 15000) {
  return execSync(cmd, { cwd: PROJECT_ROOT, encoding: 'utf8', timeout }).trim();
}

function runNpm(script, timeout = 180000) {
  execSync(`"${NODE}" "${NPM}" run ${script}`, { cwd: PROJECT_ROOT, stdio: 'pipe', timeout });
}

// ---------- 1. 工作目錄 ----------
function checkCwd() {
  const norm = PROJECT_ROOT.replace(/\\/g, '/').toLowerCase();
  if (norm.includes('desktop/agenthub/agent-hub')) {
    record('工作目錄', 'fail', `在 verify-only clone（${PROJECT_ROOT}）— 禁止在此工作`);
  } else {
    record('工作目錄', 'pass', PROJECT_ROOT);
  }
}

// ---------- 2. git 分支 ----------
function checkGit() {
  let branch = '(unknown)';
  try {
    branch = sh('git branch --show-current') || '(detached HEAD)';
    record('分支', 'info', branch);
  } catch {
    record('分支', 'warn', 'git 不可用');
    return { changed: null };
  }
  try {
    const behind = parseInt(sh('git rev-list --count HEAD..main'), 10);
    if (behind > 0) {
      record('與 main 關係', 'warn',
        `落後 main ${behind} commits — production 修復必須以 main 為 base（PM-011），一般任務請評估是否先同步`);
    } else {
      record('與 main 關係', 'pass', '已含 main 全部 commits');
    }
  } catch {
    record('與 main 關係', 'info', '無法比對（main 不存在或 shallow clone）');
  }
  let changed = null;
  try {
    // 不可對整段輸出 trim：porcelain 第一行的前導狀態空格會被吃掉，slice 就切歪
    const out = execSync('git status --porcelain', { cwd: PROJECT_ROOT, encoding: 'utf8', timeout: 15000 });
    changed = out.split('\n').filter(Boolean)
      .map(l => l.replace(/^..\s+/, '').trim().replace(/^"|"$/g, ''));
  } catch {}
  return { changed };
}

// ---------- 3. 變更分類 ----------
const DOC_ONLY = /^(\.tasks\/|proposal\/|docs\/|\.knowledge\/|README)|\.(md|txt|docx|png|jpg)$/i;
const IPC_QUAD = ['electron/ipc.ts', 'electron/preload.ts', 'src/composables/useIpc.ts', 'src/env.d.ts'];

function classify(changed) {
  if (changed === null) {
    record('變更清單', 'warn', 'git 不可用，無法分類 — 以下檢查全跑');
    return { code: true, hooks: true, electron: true, list: [] };
  }
  if (changed.length === 0) {
    record('變更清單', 'info', 'working tree 乾淨（驗證已 commit 的工作時，證據應含該 commit hash）');
  } else {
    record('變更清單', 'info', `${changed.length} 檔：${changed.slice(0, 8).join(', ')}${changed.length > 8 ? ' …' : ''}`);
  }
  const code = changed.some(f => !DOC_ONLY.test(f));
  const hooks = changed.some(f => f.startsWith('.claude/hooks/'));
  const electron = changed.some(f => f.startsWith('electron/'));
  const ipcTouched = changed.filter(f => IPC_QUAD.some(q => f.endsWith(q) || q.endsWith(f)));
  if (ipcTouched.length > 0 && ipcTouched.length < 2) {
    record('IPC 四方同步', 'warn',
      `只動了 ${ipcTouched.join(', ')} — 新增/修改通道需四方同步：ipc.ts / preload.ts / useIpc.ts / env.d.ts`);
  }
  return { code, hooks, electron, list: changed };
}

// ---------- 4. lint + typecheck ----------
function checkQuality(codeChanged) {
  if (SKIP_CHECKS) { record('lint / typecheck', 'warn', '--skip-checks 跳過（證據等級降低）'); return; }
  if (!codeChanged) { record('lint / typecheck', 'info', '純文件變更，跳過'); return; }
  try { runNpm('lint'); record('lint', 'pass', '0 errors'); }
  catch { record('lint', 'fail', 'npm run lint 失敗 — 基準線是綠的，修到綠'); }
  try { runNpm('typecheck'); record('typecheck', 'pass', 'exit 0'); }
  catch { record('typecheck', 'fail', 'npm run typecheck 失敗 — 基準線是綠的，修到綠'); }
}

// ---------- 5. build 新鮮度（PM-011）----------
function newestMtime(dir, exts) {
  let newest = 0, newestFile = null;
  const walk = (d) => {
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (!exts || exts.some(x => e.name.endsWith(x))) {
        try {
          const m = fs.statSync(p).mtimeMs;
          if (m > newest) { newest = m; newestFile = p; }
        } catch {}
      }
    }
  };
  walk(dir);
  return { newest, newestFile };
}

function checkBuildFreshness(electronChanged) {
  const buildFile = path.join(PROJECT_ROOT, 'out', 'main', 'index.js');
  let buildTime = 0;
  try { buildTime = fs.statSync(buildFile).mtimeMs; } catch {
    record('build 新鮮度', electronChanged ? 'fail' : 'info',
      'out/main/index.js 不存在（尚未 build）— 若本次變更需進 app，npm run build');
    return;
  }
  const src = newestMtime(path.join(PROJECT_ROOT, 'electron'), ['.ts', '.js', '.cjs']);
  if (src.newest === 0) { record('build 新鮮度', 'info', 'electron/ 無原始碼'); return; }
  if (src.newest > buildTime) {
    const rel = path.relative(PROJECT_ROOT, src.newestFile);
    const msg = `out/ 比 electron/ 原始碼舊（最新：${rel}）— app 跑的是舊 bundle（PM-011）。需 npm run build，或在證據中註明「未重 build，生效需 build」`;
    // 只有「本次變更含 electron/」時才算硬性失敗；別人的過期不該擋純文件任務
    // （警報設計鐵律：只在「這個 session 可能弄壞了東西」時才響，見 PM-013）
    const hard = electronChanged && !ALLOW_STALE;
    record('build 新鮮度', hard ? 'fail' : 'warn',
      msg + (electronChanged && ALLOW_STALE ? '（--allow-stale-build 已放行）' : ''));
  } else {
    record('build 新鮮度', 'pass', `out/main/index.js (${new Date(buildTime).toISOString()}) 晚於全部 electron/ 原始碼`);
  }
}

// ---------- 6. 無法機械化的提醒 ----------
function reminders(cls) {
  const r = [];
  if (cls.hooks) r.push('hooks 有變更 → 必跑：npx vitest run tests/hooks/ && node scripts/smoke-test-hooks.cjs');
  if (cls.code) r.push('相關單元測試請自行跑並貼輸出：npx vitest run tests/<相關檔>');
  r.push('資料/紀錄類修復（cost、統計、log）：本腳本測不到，必附 production DB query 前後對比（PM-011）');
  return r;
}

// ---------- 主流程 ----------
const ICON = { pass: '✅', fail: '❌', warn: '⚠️', info: 'ℹ️' };

checkCwd();
const { changed } = checkGit();
const cls = classify(changed);
checkQuality(cls.code);
checkBuildFreshness(cls.electron);

const now = new Date().toISOString();
const lines = [];
lines.push('## 完成證據（preflight）');
lines.push('');
lines.push(`- 時間: ${now}`);
lines.push(`- 指令: \`node scripts/preflight.cjs${ARGS.length ? ' ' + ARGS.join(' ') : ''}\``);
lines.push('');
lines.push('| 檢查 | 結果 | 說明 |');
lines.push('|------|------|------|');
for (const r of results) lines.push(`| ${r.name} | ${ICON[r.status]} ${r.status} | ${r.detail} |`);
lines.push('');
lines.push('**尚需人工補充的證據**：');
for (const rem of reminders(cls)) lines.push(`- [ ] ${rem}`);
lines.push('');
lines.push(failures.length === 0
  ? `**preflight: PASS** — 機械化檢查全過。補上人工項目後即可 /task-done。`
  : `**preflight: FAIL（${failures.join(', ')}）** — 修復後重跑。禁止以此狀態宣告完成。`);

console.log(lines.join('\n'));
process.exit(failures.length === 0 ? 0 : 1);
