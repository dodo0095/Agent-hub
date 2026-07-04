# AgentHub — Agent 指南（索引）

> 本文件是地圖，不是百科全書。詳細規範見索引指向的 .knowledge/ 文件。
> **所有 Agent 執行任務前必須先閱讀本文件，再依索引查閱對應文件。**


## 執行環境
- OS: Windows 11，無 WSL
- Shell: bash (Git Bash)，但 cmd.exe、python3、findstr、PowerShell 都不可用
- Python: C:\Users\Bandai\anaconda3\python.exe（Anaconda）
- Node.js: C:\Program Files\nodejs\node.exe
- 所有 Python 指令請用完整路徑或直接 `python`（不是 python3）
- 不要使用 findstr，改用 grep
- **工作目錄規則**：本專案在磁碟上有兩份 clone，用途嚴格分開，詳見「開發流程」段落。**Agent 一律在 `ALL PROJECT\Agent-hub\` 做修正與測試，禁止寫入 `AgentHub\Agent-hub\`。**

---

## 專案簡介

- **專案名稱**: AgentHub (Maestro v2)
- **類型**: Electron 桌面應用（AI Agent 團隊管理平台）
- **核心價值**: 用 Harness（Skill + Hook + FileWatcher）驅動虛擬開發公司，GUI 只做監控和 3 個操作
- **目標用戶**: 老闆（一人公司創辦人）
- **開發平台**: Windows 11

---

## 最高原則（4 條致命規則）

1. **文件就是法律** — 程式碼必須與規範文件一致，不一致以文件為準。
   → 完整 8 條規則見 `.knowledge/doc-governance.md`

2. **IPC 四方同步** — `ipc.ts` → `preload.ts` → `useIpc.ts` → `env.d.ts` 缺一不可。
   → 詳見 `.knowledge/architecture.md`「IPC 三方一致規則」

3. **不確定就去讀，不要猜** — 不得憑空想像任何資料結構或 API 格式。
   → 真相來源表見 `.knowledge/coding-standards.md`「禁止憑空想像規則」＋ `.knowledge/decision-tables.md` 表 4

4. **完成 = 證據** — 宣告完成前跑 `node scripts/preflight.cjs` 並貼輸出；證據等級查 `.knowledge/decision-tables.md` 表 1。
   → 需要「判斷」的時刻（除錯熔斷、升級、警報回應）一律先查決策表，不靠感覺

> ※ 危險指令已由 PreToolUse Hook 強制攔截（kill-port / --no-verify / force push main），見 `.claude/settings.json`

---

## 開發流程

> ⚠️ 本機磁碟上有兩份 clone，用途嚴格分開，**Agent 不可寫錯邊**。

| 路徑 | 角色 | 分支 | Agent 可否寫入 |
|------|------|------|---------------|
| `C:\Users\Bandai\Desktop\ALL PROJECT\Agent-hub\` | **Dev / Canonical** — 所有修正、測試、Sprint 工作都在這 | feature 分支（如 `agent/tech-lead/sprint-N/Tn`），merge 回 `main` | ✅ 是 |
| `C:\Users\Bandai\Desktop\AgentHub\Agent-hub\` | **Verify-only** — 老闆執行確認用的乾淨副本 | `main` | ❌ 否（由老闆自行 git pull 同步） |

**工作流程**：
1. Agent 在 `ALL PROJECT\Agent-hub\` 開分支 → 寫程式 → 測試 → commit → 推上去 → merge 回 `main`
2. 老闆在 `AgentHub\Agent-hub\` 執行 `git pull` → 在乾淨副本上跑驗證

**禁止**：
- Agent 直接編輯 `AgentHub\Agent-hub\` 任何檔案（包含 hotfix）
- 兩份檔案用 `cp` / Windows 檔總管手動同步
- 在 `AgentHub\Agent-hub\` 上跑 `npm install` 以外的寫操作

**Agent 自我檢查**：每次 Bash / Read / Edit 前先 `pwd`，若落在 `AgentHub\Agent-hub\` 立刻 `cd "C:\Users\Bandai\Desktop\ALL PROJECT\Agent-hub"`。

> 兩份不是 git worktree，是兩個獨立 clone，**沒有共用 .git**，所以一邊改不會自動到另一邊。

---

## 常用指令

```bash
npm run dev          # 啟動開發模式
npm run test         # 單元測試
npm run lint         # ESLint 檢查
npm run typecheck    # TypeScript 型別檢查
npm run build        # 打包
node scripts/preflight.cjs   # 完成證據產生器（/task-done 前必跑）
```

> **修改 `.claude/hooks/*.js` 的鐵律**（PM-009/PM-013）：攔截邏輯必須抽成可 export 函數並在 `tests/hooks/` 加 false-positive 測試；改完必跑 `npx vitest run tests/hooks/` + `node scripts/smoke-test-hooks.cjs`。hook 內呼叫 npm/git 一律用完整路徑（hook 環境 PATH 沒有 npm）。

---

## 專案文件索引

### 專案級規範（.knowledge/）

| 文件 | 用途 | 版本 |
|------|------|------|
| `.knowledge/decision-tables.md` | **決策表：證據等級、除錯熔斷、升級界線、警報回應**（判斷前先查） | v1.0 |
| `.knowledge/project-overview.md` | 專案概述、目標、技術棧、v1→v2 變更摘要 | v1.1 |
| `.knowledge/architecture.md` | 系統架構、服務清單、IPC 架構、三方一致規則 | v1.1 |
| `.knowledge/directory-structure.md` | 目錄結構詳細說明 | v1.0 |
| `.knowledge/coding-standards.md` | 編碼規範、命名、Commit 紀律、依賴規則、禁止憑空想像 | v1.1 |
| `.knowledge/testing-standards.md` | 測試策略與規範 | v1.0 |
| `.knowledge/quality-checklist.md` | G0-G6 品質檢查清單 | v1.0 |
| `.knowledge/postmortem-log.md` | 踩坑快速參考 + 歷史紀錄 | v1.1 |
| `.knowledge/doc-governance.md` | 文件治理 8 條完整規則 | v1.0 |
| `.knowledge/team-hierarchy.md` | 團隊架構、指揮鏈、Sprint 概覽 | v1.0 |

### 學術研究部門（.knowledge/academic/）

> Sprint 4 新增：academic-research 部門，服務東吳大學資料科學系教授完成四條學術工作流程。

| 文件 | 用途 | 版本 |
|------|------|------|
| `.knowledge/academic/agent-prompts.md` | 7 位學術 Agent System Prompt | v1.0 |
| `.knowledge/academic/venue-list.md` | 期刊 + 研討會清單（含金融科技強化）| v1.1 |
| `.knowledge/academic/scholar-profile.md` | 老闆學者檔案、自引清單 | v1.0 |
| `.knowledge/academic/sop-journal.md` | 期刊投稿完整 SOP | v1.0 |
| `.knowledge/academic/sop-conference.md` | 研討會論文 SOP | v1.0 |
| `.knowledge/academic/sop-peer-review.md` | 論文審稿 SOP | v1.0 |
| `.knowledge/academic/sop-nstc-grant.md` | 國科會計畫申請 SOP | v1.0 |

### 學術 Skill 規範（.knowledge/specs/）

| 文件 | 用途 |
|------|------|
| `.knowledge/specs/api-design.md` | Skill 命名規範、frontmatter 格式 |
| `.knowledge/specs/data-model.md` | Agent-Skill 綁定表 |
| `.knowledge/specs/feature-spec.md` | 四條工作流程功能規格 |

### 公司規範（.knowledge/company/）

| 文件 | 用途 |
|------|------|
| `.knowledge/company/sop/sprint-planning.md` | Sprint 規劃 SOP v4.1 |
| `.knowledge/company/sop/code-review.md` | 程式碼審查 SOP |
| `.knowledge/company/standards/coding-standards.md` | 公司編碼標準 |
| `.knowledge/company/standards/api-standards.md` | 公司 API 標準 |
| `.knowledge/company/standards/quality-checklist.md` | 公司品質檢查清單 |
| `.knowledge/company/standards/project-rules.md` | 子專案共用開發規則 |
| `.knowledge/company/standards/team-workflow.md` | 子專案共用團隊流程 |
| `.knowledge/company/templates/sprint-proposal.md.template` | Sprint 提案書範本 |
| `.knowledge/company/templates/dev-plan.md.template` | 開發計畫書範本 |
| `.knowledge/company/templates/internal-review.md.template` | 內部審查報告範本 |
| `.knowledge/company/templates/decision-tables.md.template` | 決策表範本（判斷力機械化，配 SessionStart 注入 hook） |
| `.knowledge/company/hook-templates/session-start-context.js.template` | SessionStart 教訓注入 hook 範本 |

