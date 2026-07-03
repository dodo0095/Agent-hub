// PM-009 修復驗證：g5-pre-deploy hook 的部署指令判定
// 制度要求：新增/修改 hook 攔截邏輯時，必須附帶 false-positive 測試清單。
import { describe, it, expect } from 'vitest';
// @ts-expect-error — hook 是 CommonJS 純 JS，無型別宣告
import { isDeployCommand } from '../../.claude/hooks/g5-pre-deploy.js';

describe('g5-pre-deploy isDeployCommand', () => {
  describe('false positives（曾被舊 regex 誤攔的無辜指令，必須放行）', () => {
    const innocent = [
      'sed -i "s/foo/bar/" .claude/commands/pre-deploy.md',
      'cat release-notes.md',
      'grep deploy .claude/hook-execution.jsonl',
      'grep -c \'"hook":"g5-pre-deploy"\' .claude/hook-execution.jsonl',
      'cd deployments && ls',
      'git log --grep publish',
      'git add docs/deploy-guide.md && git commit -m "docs: deploy guide"',
      'for f in pre-deploy.md task-done.md; do sed -i "/disable/d" "$f"; done',
      'ls .knowledge/company/sop/deployment.md',
      'echo "npm run deployment steps documented"',
      'node scripts/verify-release-notes.js',
      'git checkout -b feature/deploy-button',
    ];
    for (const cmd of innocent) {
      it(`放行: ${cmd.slice(0, 60)}`, () => {
        expect(isDeployCommand(cmd)).toBe(false);
      });
    }
  });

  describe('true positives（真正的部署指令，必須攔下檢查）', () => {
    const deploys = [
      'npm run deploy',
      'npm run deploy:prod',
      'pnpm run deploy',
      'yarn deploy',
      'npm publish',
      'npm publish --access public',
      'vercel --prod',
      'vercel deploy',
      'docker push registry.example.com/agenthub:latest',
      'gh release create v1.2.0 --notes "release"',
      'firebase deploy --only hosting',
      'netlify deploy --prod',
      'npx electron-builder --win --publish always',
      'cd /app && npm run deploy',
      'npm run build && npm publish',
    ];
    for (const cmd of deploys) {
      it(`攔下: ${cmd.slice(0, 60)}`, () => {
        expect(isDeployCommand(cmd)).toBe(true);
      });
    }
  });
});
