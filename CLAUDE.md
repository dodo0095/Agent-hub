# AgentHub — Agent 指南（索引）

> 本文件是地圖，不是百科全書。詳細規範見索引指向的 .knowledge/ 文件。
> **所有 Agent 執行任務前必須先閱讀本文件，再依索引查閱對應文件。**

## 執行環境
- OS: Windows 11，無 WSL；Shell: bash (Git Bash)。cmd.exe、python3、findstr、PowerShell 不可用
- Python: `C:\Users\Bandai\anaconda3\python.exe`（用 `python` 不是 `python3`）；Node: `C:\Program Files\nodejs\node.exe`
- 不要用 findstr，改用 grep

## 專案簡介
- **AgentHub (Maestro v2)** — Electron 桌面應用，AI Agent 團隊管理平台
- 核心價值: 用 Harness（Skill + Hook + FileWatcher）驅動虛擬開發公司，GUI 只做監控和 3 個操作
- 用戶: 老闆（一人公司創辦人）

## 最高原則（3 條致命規則）

1. **文件就是法律** — 程式碼必須與規範文件一致，不一致以文件為準 → `.knowledge/doc-governance.md`
2. **IPC 四方同步** — `ipc.ts` → `preload.ts` → `useIpc.ts` → `env.d.ts` 缺一不可 → `.knowledge/architecture.md`
3. **不確定就去讀，不要猜** — 不得憑空想像資料結構或 API 格式 → `.knowledge/coding-standards.md`

> ※ 硬約束由 Hook 強制（見 `.claude/settings.json`）：kill-port / --no-verify / force push main（forbidden-commands）、寫入 Verify clone（protect-verify-clone）、部署前 typecheck+build（g5）、Stop 時 lint+typecheck（stop-validator）

## 兩份 Clone（獨立 repo，非 worktree）

| 路徑 | 角色 | Agent 可否寫入 |
|------|------|:--:|
| `ALL PROJECT\Agent-hub\` | **Dev** — 所有開發、測試、commit 都在這；feature 分支 merge 回 main | ✅ |
| `Desktop\AgentHub\Agent-hub\` | **Verify-only** — 老闆 `git pull` 驗證用 | ❌（hook 硬擋） |

流程：Agent 在 Dev 開分支（`agent/<id>/...`，base main）→ 測試 → commit → merge main → push → 老闆在 Verify pull。

## 常用指令

```bash
npm run dev / test / lint / typecheck / build
node scripts/smoke-test-hooks.cjs   # 修改 hook 後必跑
```

> **修改 `.claude/hooks/*.js` 鐵律**（PM-009/013）：攔截邏輯抽成可 export 函數＋`tests/hooks/` false-positive 測試；改完跑 hook 測試＋煙霧測試；hook 內 npm/git 用完整路徑（hook 環境 PATH 沒有 npm）。

## 專案文件索引

### 專案級規範（.knowledge/）

| 文件 | 用途 |
|------|------|
| `.knowledge/project-overview.md` | 專案概述、目標、技術棧、v1→v2 變更摘要 |
| `.knowledge/architecture.md` | 系統架構、服務清單、IPC 規則、Cost Tracking、Worktree 隔離 |
| `.knowledge/directory-structure.md` | 目錄結構詳細說明 |
| `.knowledge/coding-standards.md` | 編碼規範、命名、Commit 紀律、禁止憑空想像 |
| `.knowledge/testing-standards.md` | 測試策略與規範 |
| `.knowledge/quality-checklist.md` | G0-G6 品質檢查清單 |
| `.knowledge/postmortem-log.md` | **踩坑快速參考（必讀）** + 歷史紀錄 PM-001~013 |
| `.knowledge/doc-governance.md` | 文件治理 8 條完整規則 |
| `.knowledge/team-hierarchy.md` | 團隊架構、指揮鏈、Sprint 概覽 |
| `.knowledge/company-rules.md` | 公司共用規則（文件層級、命名骨架、依賴規則） |
| `.knowledge/team-workflow.md` | 公司共用流程（Sprint、Gate、Review、上線/回滾） |
| `.knowledge/design-system.md` | UI 設計系統 token 與元件規範 |
| `.knowledge/postmortem-common.md` | 跨專案共通踩坑 |

### 學術研究部門（.knowledge/academic/ + .knowledge/specs/）

| 文件 | 用途 |
|------|------|
| `academic/agent-prompts.md` | 7 位學術 Agent System Prompt |
| `academic/venue-list.md` | 期刊 + 研討會清單 |
| `academic/scholar-profile.md` | 老闆學者檔案、自引清單 |
| `academic/sop-{journal,conference,peer-review,nstc-grant}.md` | 四條學術工作流程 SOP |
| `specs/api-design.md` | Skill 命名規範、frontmatter 格式 |
| `specs/data-model.md` | Agent-Skill 綁定表 |
| `specs/feature-spec.md` | 四條工作流程功能規格 |

### 公司規範（.knowledge/company/）

| 文件 | 用途 |
|------|------|
| `company/sop/{sprint-planning,code-review}.md` | Sprint 規劃 / Code Review SOP |
| `company/standards/*.md` | 公司編碼/API/品質標準、子專案共用規則與流程 |
| `company/templates/*.template` | Sprint 提案書 / 開發計畫書 / 內部審查報告範本 |
