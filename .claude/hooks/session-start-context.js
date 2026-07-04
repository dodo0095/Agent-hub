#!/usr/bin/env node
// Hook Type: SessionStart - 教訓注入器
//
// 制度設計（2026-07-04，Fable 5 制度建設 session）：
// 弱模型不會主動去讀 postmortem-log.md 和 decision-tables.md——「記得去讀」本身就是
// 一種判斷力。這個 hook 把兩份文件的精華段在每個 session 開始時注入 context，
// 讓「看到教訓」從自覺變成機械保證。
//
// 原則：
// 1. 永不 block（SessionStart 注入失敗只能靜默退出，不能擋 session）。
// 2. 單一真相來源：內容動態抽自兩份 .knowledge/ 文件的標記段，
//    postmortem 快速參考表：<!-- QUICKREF:START --> ... <!-- QUICKREF:END -->
//    決策表核心摘要：      <!-- INJECT:START -->   ... <!-- INJECT:END -->
//    文件更新後 hook 不需要跟著改，不會漂移。
// 3. 注入量有上限（MAX_INJECT_CHARS）：超過就截斷並警告，防止文件膨脹
//    悄悄吃掉所有 session 的 context 預算。
// 4. 每次結果記 hook-execution.jsonl，供 /harness-audit 原則 7 分析。

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = 'C:/Users/Bandai/Desktop/ALL PROJECT/Agent-hub';
const LOG_FILE = path.join(PROJECT_ROOT, '.claude', 'hook-execution.jsonl');
const MAX_LOG_BYTES = 1024 * 1024;
const MAX_INJECT_CHARS = 6000;

const QUICKREF_FILE = path.join(PROJECT_ROOT, '.knowledge', 'postmortem-log.md');
const DECISION_FILE = path.join(PROJECT_ROOT, '.knowledge', 'decision-tables.md');

function rotateLogIfNeeded() {
  try {
    const st = fs.statSync(LOG_FILE);
    if (st.size > MAX_LOG_BYTES) fs.renameSync(LOG_FILE, LOG_FILE + '.1');
  } catch {}
}

function logHook(result, reason) {
  try { fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true }); } catch {}
  rotateLogIfNeeded();
  const entry = JSON.stringify({
    hook: 'session-start-context', type: 'SessionStart',
    result, reason, ts: new Date().toISOString()
  });
  try { fs.appendFileSync(LOG_FILE, entry + '\n'); } catch {}
}

/** 抽出 startMarker 與 endMarker 之間的內容；找不到回傳 null。 */
function extractBetween(content, startMarker, endMarker) {
  if (typeof content !== 'string') return null;
  const s = content.indexOf(startMarker);
  if (s === -1) return null;
  const from = s + startMarker.length;
  const e = content.indexOf(endMarker, from);
  if (e === -1) return null;
  const out = content.slice(from, e).trim();
  return out.length > 0 ? out : null;
}

/**
 * 組出要注入的 additionalContext。
 * @param {{quickref: string|null, decision: string|null}} parts
 * @returns {string|null} 無可注入內容時回傳 null
 */
function buildAdditionalContext(parts) {
  const sections = [];
  if (parts.decision) {
    sections.push('## 決策表核心摘要（.knowledge/decision-tables.md，需要判斷時查全文）\n\n' + parts.decision);
  }
  if (parts.quickref) {
    sections.push('## 踩坑快速參考（.knowledge/postmortem-log.md，詳細案情查全文）\n\n' + parts.quickref);
  }
  if (sections.length === 0) return null;

  let ctx =
    '# 專案制度注入（SessionStart hook 自動提供，非用戶訊息）\n\n' +
    sections.join('\n\n') +
    '\n\n> 開場自檢：1) pwd 必須在 ALL PROJECT\\Agent-hub；2) git branch --show-current 確認分支；' +
    '3) 宣告完成前跑 node scripts/preflight.cjs 取得證據。';

  if (ctx.length > MAX_INJECT_CHARS) {
    ctx = ctx.slice(0, MAX_INJECT_CHARS) +
      '\n\n> ⚠️ 注入內容超過 ' + MAX_INJECT_CHARS + ' 字元被截斷——標記段膨脹了，請精簡（decision-tables.md 表 7）。';
  }
  return ctx;
}

function readFileSafe(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch { return null; }
}

function main() {
  const quickref = extractBetween(readFileSafe(QUICKREF_FILE), '<!-- QUICKREF:START -->', '<!-- QUICKREF:END -->');
  const decision = extractBetween(readFileSafe(DECISION_FILE), '<!-- INJECT:START -->', '<!-- INJECT:END -->');
  const ctx = buildAdditionalContext({ quickref, decision });

  if (!ctx) {
    logHook('passed', 'no injectable content found (markers missing?)');
    process.exit(0);
  }

  logHook('passed', `injected ${ctx.length} chars (quickref=${!!quickref}, decision=${!!decision})`);
  console.log(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext: ctx
    }
  }));
  process.exit(0);
}

// 供 tests/hooks/session-start-context.test.ts 使用（制度：hook 邏輯必須可測）
module.exports = { extractBetween, buildAdditionalContext, MAX_INJECT_CHARS };

if (require.main === module) {
  // SessionStart 的 stdin payload（source 等）目前不影響注入行為，直接執行
  main();
}
