#!/usr/bin/env node
// Hook Type: PostToolUse (Edit) - Knowledge Doc Sync Reminder
// Converted from g4-knowledge-check.sh for Windows compatibility

const fs = require('fs');
const path = require('path');

function logHook(result, reason) {
  try { fs.mkdirSync('.claude', { recursive: true }); } catch {}
  const entry = JSON.stringify({
    hook: 'g4-knowledge-check', type: 'PostToolUse',
    result, reason, ts: new Date().toISOString()
  });
  fs.appendFileSync(path.join('.claude', 'hook-execution.jsonl'), entry + '\n');
}

let input = '';
process.stdin.on('data', d => input += d);
process.stdin.on('end', () => {
  let data;
  try { data = JSON.parse(input); } catch { process.exit(0); }

  const filePath = data.tool_response?.filePath || data.tool_input?.file_path || '';

  // If editing a .knowledge/ file, no reminder needed
  if (/[/\\]\.knowledge[/\\]/.test(filePath) || filePath.startsWith('.knowledge/')) {
    logHook('passed', 'knowledge file edit');
    process.exit(0);
  }

  // IPC 四方同步檢查（PM-002 預防措施，2026-07-03 落地）：
  // 動到 IPC 鏈任何一環，提醒四方檔案清單，缺一不可
  const IPC_CHAIN = [
    'electron/types/ipc.ts',
    'electron/preload.ts',
    'src/composables/useIpc.ts',
    'src/env.d.ts'
  ];
  const normalized = filePath.replace(/\\/g, '/');
  const touchedIpc = IPC_CHAIN.find(p => normalized.endsWith(p));
  if (touchedIpc) {
    const others = IPC_CHAIN.filter(p => p !== touchedIpc);
    logHook('warned', `IPC chain file changed: ${touchedIpc}`);
    console.log(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        additionalContext:
          `⚠️ IPC 四方同步（PM-002）: 你修改了 ${touchedIpc}。` +
          `新增/修改 IPC 通道時，以下檔案必須同步更新，缺一會 runtime 崩潰：${others.join(', ')}。` +
          `請逐一確認後再繼續。`
      }
    }));
    process.exit(0);
  }

  // Only trigger for architecture-critical directories
  if (!/electron[/\\](services|ipc|migrations|types)[/\\]/.test(filePath)) {
    logHook('passed', 'non-critical path');
    process.exit(0);
  }

  const filename = path.basename(filePath);
  logHook('warned', 'architecture file changed');
  console.log(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PostToolUse',
      additionalContext: `⚠️ G4 知識同步提醒: 修改了 ${filename}，請確認是否需要更新 .knowledge/ 文件 (architecture.md, coding-standards.md)`
    }
  }));
  process.exit(0);
});
