---
name: harness-audit
description: Periodic Harness health audit based on 7 design principles
allowed-tools: Read, Glob, Grep, Bash
---

# Harness 健康審計

週期性檢查專案 Harness（CLAUDE.md + Hook + Skill + Knowledge）的健康狀態。

## 使用方式
```
/harness-audit
```

## 參數
無（操作當前專案）

## 檢查項目（七大原則）

### 原則 1: 上下文架構（給地圖不給百科全書）
- [ ] CLAUDE.md 行數 ≤ 100（超過 = 警告）
- [ ] CLAUDE.md 有文件索引且索引完整
- [ ] .knowledge/ 文件都在索引中登記
- [ ] SessionStart 注入鏈完好：`.claude/hooks/session-start-context.js` 已在 settings.json 註冊；postmortem-log.md 有 `QUICKREF:START/END` 標記、decision-tables.md 有 `INJECT:START/END` 標記；實跑 `node .claude/hooks/session-start-context.js < /dev/null` 有輸出 additionalContext
- [ ] 注入段沒有膨脹（hook log 中 injected chars 未逼近 6000 上限）

### 原則 2: 架構約束（用工具強制不靠 prompt）
- [ ] 掃描 CLAUDE.md 中的「禁止」「不得」等文字規則
- [ ] 檢查是否有對應 Hook 強制（.claude/settings.json）
- [ ] 未被 Hook 覆蓋的文字規則列出建議
- [ ] 決策表覆蓋：`.knowledge/decision-tables.md` 存在且在 CLAUDE.md 索引；最近的踩坑（postmortem 新條目）若含「判斷類」教訓，已改寫進對應決策表
- [ ] `scripts/preflight.cjs` 存在且實跑 exit 0/1 行為正常（証據制度的機械底座）

### 原則 3: 知識層級（公司 vs 專案）
- [ ] .knowledge/company-rules.md 存在
- [ ] .knowledge/team-workflow.md 存在
- [ ] 專案級規範與公司級不衝突

### 原則 4: 技能即流程（Skill 覆蓋）
- [ ] .claude/skills/ 目錄存在
- [ ] 掃描已部署的 Skill 數量
- [ ] 列出未部署但可用的公司 Skill

### 原則 5: Hook 健康
- [ ] .claude/settings.json 存在且 JSON 合法
- [ ] Stop hook 存在
- [ ] PreToolUse hook 存在（forbidden-commands）
- [ ] Hook 腳本檔案存在且可執行

### 原則 6: 文件新鮮度
- [ ] .knowledge/ 下各文件最後修改日期
- [ ] 超過 30 天未更新的文件標記為「可能過時」

### 原則 7: 警報有效性（2026-07-03 新增，源自 PM-013）

> 一個永遠響的警報和一個永遠不響的警報一樣沒用——前者教 agent 忽略紅燈，後者給人虛假安全感。

- [ ] 統計 `.claude/hook-execution.jsonl` 各 hook 的 blocked / passed / warned 次數（先排除煙霧測試的合成紀錄）：
  ```
  grep -v '"synthetic":true' .claude/hook-execution.jsonl | grep -o '"hook":"[a-z0-9-]*","type":"[A-Za-z]*","result":"[a-z]*"' | sort | uniq -c
  ```
- [ ] 任何 hook 的 block 率 = 100%（從未 pass）→ **失效警報**，最高優先修復（歷史案例：stop-validator 曾 blocked 175 / passed 0）
- [ ] 任何「會攔截」的 hook block 率 = 0% 且樣本 > 200 → 檢查是否形同虛設或 regex 永不匹配
- [ ] 抽查最近 5 筆 blocked 紀錄，確認是真違規而非 false positive（歷史案例：PM-009 g5 regex 過寬）
- [ ] hook 內部執行的指令（npm / git）是否用完整路徑（hook 環境 PATH 沒有 npm，裸呼叫 = 必失敗被誤判）

### 原則 8: 整體評分
- 每個原則 0-2 分（0=缺失, 1=部分, 2=完善）
- 總分 /16，≥12 = 健康，8-11 = 需改善，<8 = 警告

## 輸出格式

```
# Harness 健康審計報告

**專案**: {project-name}
**日期**: {today}
**總分**: {score}/16

## 評分明細
| 原則 | 分數 | 說明 |
|------|------|------|
| 1. 上下文架構 | {0-2} | {detail} |
| 2. 架構約束 | {0-2} | {detail} |
| 3. 知識層級 | {0-2} | {detail} |
| 4. 技能覆蓋 | {0-2} | {detail} |
| 5. Hook 健康 | {0-2} | {detail} |
| 6. 文件新鮮度 | {0-2} | {detail} |
| 7. 警報有效性 | {0-2} | {detail} |
| 8. 整體完整性 | {0-2} | {detail} |

## 行動項目
1. {highest priority action}
2. {second priority action}
...
```
