#!/usr/bin/env node
// Hook Type: PreToolUse (Edit|Write|Bash) - Verify-Only Clone Write Protection
//
// 制度背景（2026-07-03 新增）：
// 磁碟上有兩份 clone：
//   - Dev:    C:\Users\Bandai\Desktop\ALL PROJECT\Agent-hub  （Agent 工作區）
//   - Verify: C:\Users\Bandai\Desktop\AgentHub\Agent-hub     （老闆驗證用，只由老闆 git pull）
// CLAUDE.md 一直用文字規則禁止 Agent 寫入 Verify clone，但文字規則對弱模型不可靠。
// 本 hook 把規則變成硬約束（harness 原則 2：用工具強制不靠 prompt）。
//
// 判定：
// - Edit/Write：file_path 落在 Verify clone → deny
// - Bash：命令字串引用 Verify clone 路徑且含寫入動詞 → deny（純讀 cat/ls/diff/grep 放行）

const fs = require('fs');
const path = require('path');

// 同時涵蓋 Windows 反斜線、正斜線、Git Bash /c/ 格式
const VERIFY_CLONE_RE = /(?:[A-Za-z]:[\\/]|\/[a-z]\/)Users[\\/]Bandai[\\/]Desktop[\\/]AgentHub\b/i;

const WRITE_VERBS_RE = new RegExp(
  [
    '\\brm\\b', '\\bcp\\b', '\\bmv\\b', '\\btouch\\b', '\\bmkdir\\b', '\\btee\\b',
    'sed\\s+-i', '\\bnpm\\b', '\\bnpx\\b', '\\bnode\\b',
    // 重導向只在「目標指向 verify clone」時算寫入——
    // `ls <verify路徑> 2>/dev/null` 的 stderr 重導向是唯讀操作，不可誤攔（2026-07-04 false positive 修正）
    '>>?\\s*"?[^>|;&\\n]*Desktop[\\\\/]+AgentHub',
    // git 後可能有 -C <path> 等參數，允許中間隔任意字元（對 verify clone 寧可過度攔截）
    'git\\b[^\\n]*?\\b(?:push|checkout|reset|merge|commit|add|rm|clean|stash|pull|rebase|apply)\\b'
  ].join('|')
);

function isVerifyCloneWrite(toolName, toolInput) {
  if (toolName === 'Edit' || toolName === 'Write') {
    return VERIFY_CLONE_RE.test(toolInput?.file_path || '');
  }
  if (toolName === 'Bash') {
    const cmd = toolInput?.command || '';
    return VERIFY_CLONE_RE.test(cmd) && WRITE_VERBS_RE.test(cmd);
  }
  return false;
}

function logHook(result, reason) {
  try { fs.mkdirSync('.claude', { recursive: true }); } catch {}
  const entry = JSON.stringify({
    hook: 'protect-verify-clone', type: 'PreToolUse',
    result, reason, ts: new Date().toISOString(),
    // 煙霧測試合成紀錄打標（見 stop-validator.js 同款註解）
    ...(process.env.AGENTHUB_HOOK_TEST === '1' ? { synthetic: true } : {})
  });
  try { fs.appendFileSync(path.join('.claude', 'hook-execution.jsonl'), entry + '\n'); } catch {}
}

function main() {
  let input = '';
  process.stdin.on('data', d => input += d);
  process.stdin.on('end', () => {
    let data;
    try { data = JSON.parse(input); } catch { process.exit(0); }

    if (isVerifyCloneWrite(data.tool_name, data.tool_input)) {
      logHook('blocked', `${data.tool_name} write to verify-only clone`);
      console.log(JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason:
            '禁止寫入 Verify-only clone（Desktop\\AgentHub\\Agent-hub）。' +
            '該副本只由老闆 git pull 同步。請在 Dev clone（ALL PROJECT\\Agent-hub）工作，' +
            'merge 回 main 後由老闆自行同步。'
        }
      }));
      process.exit(0);
    }

    process.exit(0); // 通過不記 log，避免高頻噪音
  });
}

if (require.main === module) main();
module.exports = { isVerifyCloneWrite, VERIFY_CLONE_RE };
