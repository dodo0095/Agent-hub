# Sprint 4 — Skill 命名與介面規範

> 版本: v2.0 | Sprint 4 建立、Sprint 7 擴充（ARS 整合）| 最後更新: 2026-09-28
> 範圍: `academic-research` 部門新增的 13 個 Skills 命名與呼叫介面

## 概述

Sprint 4 無新增 IPC / REST API。本文件定義 **Skill 檔案命名骨架** 與 **Agent → Skill 呼叫規範**，作為 Code Review 對規範的比對依據。

---

## 1. Skill 檔案命名規範

### 1.1 目錄位置

所有新增 Skill 一律放置於：
```
.claude/commands/{skill-name}.md
```

### 1.2 命名規則

- 小寫 + kebab-case（`lit-review.md`，非 `LitReview.md`）
- 禁止與既有指令衝突（如 `review.md` 已佔用，故用 `peer-review.md`）
- 學術類 Skill 若與通用指令同名，加前綴或後綴避免衝突

### 1.3 本 Sprint 新增清單（13 個）

| 原 Skill 名 | 本專案命名 | 來源 |
|-------------|-----------|------|
| scientific-writing | `academic-writing.md` | claude-scientific-skills |
| literature-review | `lit-review.md` | claude-scientific-skills |
| citation-management | `cite-manage.md` | claude-scientific-skills |
| statistical-analysis | `stat-analysis.md` | claude-scientific-skills |
| scientific-critical-thinking | `critical-thinking.md` | claude-scientific-skills |
| scientific-schematics | `schematics.md` | claude-scientific-skills |
| venue-templates | `venue-format.md` | claude-scientific-skills |
| scientific-slides | `research-slides.md` | claude-scientific-skills |
| pptx-posters | `research-poster.md` | claude-scientific-skills |
| peer-review | `peer-review.md` | claude-scientific-skills |
| scholar-evaluation | `scholar-eval.md` | claude-scientific-skills |
| research-grants | `grant-writing.md` | claude-scientific-skills |
| hypothesis-generation | `hypothesis.md` | claude-scientific-skills |
| **nstc-grant** ⭐ | `nstc-grant.md` | **自建（已存在）** |

---

## 2. Skill Frontmatter 規範

每個 Skill 檔案開頭 YAML frontmatter 必須包含：

```yaml
---
name: {skill-name}
description: {一句話功能描述（繁體中文）}
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
---
```

- `name`: 必須與檔名一致（去掉 .md）
- `description`: 繁體中文，≤ 80 字
- `allowed-tools`: 明確列出允許使用的工具，禁止 `*`

---

## 3. Agent → Skill 呼叫關係

參見 `.knowledge/specs/data-model.md` 第 2 節「Agent-Skill 綁定表」。

---

## 4. 回傳格式（Skill 產出規範）

Skill 執行完成後的產出必須符合：

| Skill 類別 | 產出格式 | 存放位置 |
|-----------|---------|---------|
| 論文撰寫類 | Markdown（IMRAD 結構） | `.outputs/papers/{topic}/` |
| 文獻搜尋類 | Markdown 表格 + DOI 清單 | `.outputs/papers/{topic}/refs.md` |
| 投影片/海報 | PPTX | `.outputs/papers/{topic}/slides.pptx` |
| 審稿報告 | Markdown（含評分） | `.outputs/reviews/{paper-id}.md` |
| 國科會計畫 | Markdown（CM01~CM12 格式） | `.outputs/grants/{proposal-id}/` |

> ⚠️ `.outputs/` 為本 Sprint 新增目錄，需加入 `.gitignore`（敏感：內含尚未發表論文）。

---

## 5. 錯誤處理

| 錯誤類型 | Skill 行為 |
|---------|-----------|
| DOI 驗證失敗 | 標記 `[UNVERIFIED]`，不阻擋流程，回報 research-director |
| 文獻搜尋 0 筆結果 | 要求 literature-scout 放寬關鍵字，最多重試 3 次 |
| 產出含 bullet points（論文類） | Skill 自檢失敗，自動要求 paper-writer 重寫 |
| 國科會格式違規 | nstc-grant Skill 抛出 `FormatError`，交 grant-writer 修正 |

---

## 6. Sprint 7 — ARS 整合介面（v2.0 新增）

> 依據：`proposal/tech-decision-ars-integration.md`（D1-A、D2-A）、`proposal/sprint7-dev-plan.md`

### 6.1 設定值

| key | 範圍 | 值 | 存取方式 |
|-----|------|----|---------|
| `ars.plugin-dir` | 全域（非專案層級） | ARS 根目錄絕對路徑（含 `.claude-plugin/plugin.json` 的那層） | 既有 IPC `settings:get` / `settings:update`，**不新增通道** |

### 6.2 Spawn 參數契約（`buildClaudeArgs`）

| 條件 | 行為 |
|------|------|
| agent.department === `academic-publication`（一般啟動或 resume） | 依序：讀 `ars.plugin-dir`（trim、去除首尾成對雙引號）→ `validateArsPluginDir()` → 檢查互動模式 → `args.push('--plugin-dir', <path>)`。一般啟動時此檢查在任何寫檔之前執行 |
| 其他部門 | 參數與 Sprint 7 前**完全相同**（不讀設定、不驗證、不加參數） |
| 判斷依據 | 用 department，不寫死 agent id |
| 找出 agent（resume） | `isResume`：`claude_sessions.agent_id`（依 `resumeSessionId`）。`isDirectResume`：`params.agentId` 非空則用之；否則以 `resumeConversationId` 查 `claude_sessions` 中 `agent_id` 有效（非 null／空／`(resumed)`）的最早一筆。查不到或 DB 例外 → 視為非出版部，不拋錯 |

### 6.3 驗證器

```typescript
// electron/utils/ars-validator.ts
export const ARS_REQUIRED_FILES = [
  '.claude-plugin/plugin.json',
  'skills/academic-paper/SKILL.md',
  'skills/academic-paper-reviewer/SKILL.md',
  'skills/academic-pipeline/SKILL.md',
  'skills/deep-research/SKILL.md',
] as const;
export interface ArsValidationResult { ok: boolean; missing: string[] }
export function validateArsPluginDir(dir: string): ArsValidationResult;
```

- 路徑不存在 → `{ ok: false, missing: [全部 ARS_REQUIRED_FILES] }`
- `skills/<name>` 是檔案而非資料夾（zip 解壓的 symlink stub，PM-015）→ 對應 `SKILL.md` 列入 `missing`
- 只檢查「存在且為檔案」（同名資料夾不算），不解析內容

### 6.4 錯誤碼

| 錯誤碼 | 觸發條件 | 訊息須包含 |
|--------|---------|-----------|
| `ARS_PATH_NOT_SET` | `ars.plugin-dir` 未設定、空字串或純空白；或讀取設定時 DB 例外 | 到「設定」填寫 ARS 路徑的提示；DB 例外時附原錯誤訊息 |
| `ARS_INSTALL_INCOMPLETE` | 驗證器 `ok === false` | 缺少的檔案清單；「若為 zip 下載，請把 skills/ 內的 stub 檔換成同名資料夾，或改用 git clone」 |
| `ARS_REQUIRES_INTERACTIVE` | 出版部 agent 以非互動模式（`interactive === false`）啟動 | 「ARS 檢查點必須由老闆回覆，出版部只能以互動模式啟動」 |

錯誤以 `Error` 拋出，`message` 以錯誤碼開頭（例：`ARS_PATH_NOT_SET: ...`），session 不得被建立。
