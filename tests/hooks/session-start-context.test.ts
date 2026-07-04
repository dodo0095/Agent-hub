// SessionStart 教訓注入 hook 的判定測試（制度要求：hook 邏輯可測，見 decision-tables.md 表 7）
import { describe, it, expect } from 'vitest';
// @ts-expect-error — hook 是 CommonJS 純 JS，無型別宣告
import { extractBetween, buildAdditionalContext, MAX_INJECT_CHARS } from '../../.claude/hooks/session-start-context.js';

describe('session-start-context extractBetween', () => {
  it('抽出標記之間的內容並 trim', () => {
    const doc = '前言\n<!-- A -->\n  內容一\n內容二  \n<!-- B -->\n後記';
    expect(extractBetween(doc, '<!-- A -->', '<!-- B -->')).toBe('內容一\n內容二');
  });

  it('缺 start 標記 → null', () => {
    expect(extractBetween('內容 <!-- B -->', '<!-- A -->', '<!-- B -->')).toBeNull();
  });

  it('缺 end 標記 → null', () => {
    expect(extractBetween('<!-- A --> 內容', '<!-- A -->', '<!-- B -->')).toBeNull();
  });

  it('標記之間為空白 → null（不注入空段）', () => {
    expect(extractBetween('<!-- A -->\n   \n<!-- B -->', '<!-- A -->', '<!-- B -->')).toBeNull();
  });

  it('end 標記出現在 start 之前 → null（不倒抽）', () => {
    expect(extractBetween('<!-- B -->x<!-- A -->', '<!-- A -->', '<!-- B -->')).toBeNull();
  });

  it('非字串輸入（檔案讀取失敗）→ null 不 throw', () => {
    expect(extractBetween(null, '<!-- A -->', '<!-- B -->')).toBeNull();
  });
});

describe('session-start-context buildAdditionalContext', () => {
  it('兩段都有 → 決策表在前、快速參考在後、含開場自檢', () => {
    const ctx = buildAdditionalContext({ quickref: '| 場景 | 規則 |', decision: '1. 完成 = 證據' });
    expect(ctx).toContain('決策表核心摘要');
    expect(ctx).toContain('踩坑快速參考');
    expect(ctx.indexOf('決策表核心摘要')).toBeLessThan(ctx.indexOf('踩坑快速參考'));
    expect(ctx).toContain('preflight.cjs');
  });

  it('只有一段也照樣注入', () => {
    const ctx = buildAdditionalContext({ quickref: '| 表 |', decision: null });
    expect(ctx).toContain('踩坑快速參考');
    expect(ctx).not.toContain('決策表核心摘要');
  });

  it('兩段都沒有 → null（hook 靜默退出，不注入空殼）', () => {
    expect(buildAdditionalContext({ quickref: null, decision: null })).toBeNull();
  });

  it('超長內容被截斷並附膨脹警告（context 預算保護）', () => {
    const ctx = buildAdditionalContext({ quickref: 'x'.repeat(MAX_INJECT_CHARS * 2), decision: null });
    expect(ctx.length).toBeLessThan(MAX_INJECT_CHARS + 200);
    expect(ctx).toContain('被截斷');
  });
});
