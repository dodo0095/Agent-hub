// Verify-only clone 保護 hook 的判定測試（含 false-positive 清單，制度要求）
import { describe, it, expect } from 'vitest';
// @ts-expect-error — hook 是 CommonJS 純 JS，無型別宣告
import { isVerifyCloneWrite } from '../../.claude/hooks/protect-verify-clone.js';

const V = 'C:\\Users\\Bandai\\Desktop\\AgentHub\\Agent-hub';
const VPOSIX = '/c/Users/Bandai/Desktop/AgentHub/Agent-hub';
const DEV = 'C:\\Users\\Bandai\\Desktop\\ALL PROJECT\\Agent-hub';

describe('protect-verify-clone isVerifyCloneWrite', () => {
  describe('Edit/Write 到 Verify clone → 攔下', () => {
    it('Edit windows path', () => {
      expect(isVerifyCloneWrite('Edit', { file_path: `${V}\\CLAUDE.md` })).toBe(true);
    });
    it('Write posix path', () => {
      expect(isVerifyCloneWrite('Write', { file_path: `${VPOSIX}/src/main.ts` })).toBe(true);
    });
  });

  describe('Edit/Write 到 Dev clone → 放行', () => {
    it('Edit dev clone', () => {
      expect(isVerifyCloneWrite('Edit', { file_path: `${DEV}\\src\\main.ts` })).toBe(false);
    });
    it('Write dev clone posix', () => {
      expect(
        isVerifyCloneWrite('Write', { file_path: '/c/Users/Bandai/Desktop/ALL PROJECT/Agent-hub/a.ts' })
      ).toBe(false);
    });
  });

  describe('Bash 寫入 Verify clone → 攔下', () => {
    const writes = [
      `cp out/main.js "${VPOSIX}/out/main.js"`,
      `rm -rf "${VPOSIX}/node_modules"`,
      `sed -i 's/a/b/' "${VPOSIX}/CLAUDE.md"`,
      `echo fix > "${VPOSIX}/README.md"`,
      `git -C "${VPOSIX}" checkout main`,
      `git -C "${VPOSIX}" pull`,
      `cd "${VPOSIX}" && npm install && npm run build`,
    ];
    for (const cmd of writes) {
      it(`攔下: ${cmd.slice(0, 55)}`, () => {
        expect(isVerifyCloneWrite('Bash', { command: cmd })).toBe(true);
      });
    }
  });

  describe('Bash 純讀 Verify clone 或不相干指令 → 放行', () => {
    const reads = [
      `ls "${VPOSIX}"`,
      `cat "${VPOSIX}/CLAUDE.md"`,
      `diff "${VPOSIX}/README.md" README.md`,
      `grep -r "statusLine" "${VPOSIX}/.claude"`,
      'npm run build', // dev clone 的操作，不含 verify 路徑
      `git -C "${DEV}" push origin main`,
    ];
    for (const cmd of reads) {
      it(`放行: ${cmd.slice(0, 55)}`, () => {
        expect(isVerifyCloneWrite('Bash', { command: cmd })).toBe(false);
      });
    }
  });
});
