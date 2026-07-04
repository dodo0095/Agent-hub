#!/usr/bin/env node
// Hook 煙霧測試：把樣本 payload 餵給每個 hook，驗證 deny / pass / context 行為。
// 用法：node scripts/smoke-test-hooks.cjs
// 制度：修改任何 .claude/hooks/*.js 後必須跑本腳本 + npx vitest run tests/hooks/
const { execSync } = require('child_process');
const path = require('path');

const HOOKS = path.join(__dirname, '..', '.claude', 'hooks');
const VERIFY = ['C:', 'Users', 'Bandai', 'Desktop', 'AgentHub', 'Agent-hub'].join('\\');
const DEV = ['C:', 'Users', 'Bandai', 'Desktop', 'ALL PROJECT', 'Agent-hub'].join('\\');

const cases = [
  {
    name: 'g5: 無辜 grep 含 deploy 字串 → pass',
    hook: 'g5-pre-deploy.js',
    payload: { tool_name: 'Bash', tool_input: { command: 'grep -c g5-pre-deploy .claude/hook-execution.jsonl' } },
    expectDeny: false
  },
  {
    name: 'protect: Bash cp 到 verify clone → deny',
    hook: 'protect-verify-clone.js',
    payload: { tool_name: 'Bash', tool_input: { command: `cp out/main.js "${VERIFY}\\out\\"` } },
    expectDeny: true
  },
  {
    name: 'protect: Edit verify clone → deny',
    hook: 'protect-verify-clone.js',
    payload: { tool_name: 'Edit', tool_input: { file_path: `${VERIFY}\\CLAUDE.md` } },
    expectDeny: true
  },
  {
    name: 'protect: Edit dev clone → pass',
    hook: 'protect-verify-clone.js',
    payload: { tool_name: 'Edit', tool_input: { file_path: `${DEV}\\src\\main.ts` } },
    expectDeny: false
  },
  {
    name: 'g4: 編輯 preload.ts → IPC 四方提醒',
    hook: 'g4-knowledge-check.js',
    payload: { tool_response: { filePath: `${DEV}\\electron\\preload.ts` } },
    expectContext: 'IPC 四方同步'
  },
  {
    name: 'stop: 遞迴保護 → 直接退出',
    hook: 'stop-validator.js',
    payload: { stop_hook_active: true },
    expectDeny: false
  },
  {
    name: 'forbidden: --no-verify → deny',
    hook: 'forbidden-commands.js',
    payload: { tool_name: 'Bash', tool_input: { command: 'git commit --no-verify -m x' } },
    expectDeny: true
  },
  {
    name: 'session-start: 注入決策表摘要 + 踩坑快速參考',
    hook: 'session-start-context.js',
    payload: { source: 'startup' },
    expectDeny: false,
    expectContext: '決策表核心摘要'
  }
];

let failed = 0;
for (const c of cases) {
  let out = '';
  try {
    out = execSync(`node "${path.join(HOOKS, c.hook)}"`, {
      input: JSON.stringify(c.payload), encoding: 'utf8', timeout: 30000
    });
  } catch (e) {
    out = (e.stdout || '') + (e.stderr || '');
  }
  const denied = /"permissionDecision":\s*"deny"/.test(out);
  let ok = true;
  if (typeof c.expectDeny === 'boolean' && denied !== c.expectDeny) ok = false;
  if (c.expectContext && !out.includes(c.expectContext)) ok = false;
  console.log(`${ok ? '✅' : '❌'} ${c.name}`);
  if (!ok) { failed++; console.log(`   output: ${out.slice(0, 300)}`); }
}
console.log(failed === 0 ? '\nALL SMOKE TESTS PASSED' : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
