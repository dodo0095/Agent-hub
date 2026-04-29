#!/usr/bin/env node
// Hook Type: PreToolUse (Edit) - Design Consistency Reminder
// Converted from g1-design-check.sh for Windows compatibility

const fs = require('fs');
const path = require('path');

function logHook(result, reason) {
  try { fs.mkdirSync('.claude', { recursive: true }); } catch {}
  const entry = JSON.stringify({
    hook: 'g1-design-check', type: 'PreToolUse',
    result, reason, ts: new Date().toISOString()
  });
  fs.appendFileSync(path.join('.claude', 'hook-execution.jsonl'), entry + '\n');
}

let input = '';
process.stdin.on('data', d => input += d);
process.stdin.on('end', () => {
  let data;
  try { data = JSON.parse(input); } catch { process.exit(0); }

  const filePath = data.tool_input?.file_path || '';

  // Only trigger for .vue files
  if (!filePath.endsWith('.vue')) {
    logHook('passed', 'non-vue file skipped');
    process.exit(0);
  }

  const filename = path.basename(filePath);
  const page = filename
    .replace(/\.vue$/, '')
    .replace(/View$/, '')
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .toLowerCase();

  const searchDirs = ['docs/design', 'proposal/design', '.knowledge/design'];
  let mockupFound = '';

  for (const dir of searchDirs) {
    try {
      const files = fs.readdirSync(dir);
      const match = files.find(f => f.startsWith(`mockup-${page}`) || f.startsWith(page));
      if (match) { mockupFound = path.join(dir, match); break; }
    } catch {}
  }

  if (mockupFound) {
    logHook('warned', 'design mockup found, check required');
    console.log(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        additionalContext: `⚠️ G1 設計一致性: 編輯 ${filename}，找到設計稿 ${mockupFound}，請先確認設計規範 (I = Blocker)`
      }
    }));
  } else {
    logHook('passed', 'no mockup found');
    console.log(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        additionalContext: `✅ G1 通過，編輯 ${filename}，建議在 docs/design/ 建立 mockup-${page}* 設計稿`
      }
    }));
  }
  process.exit(0);
});
